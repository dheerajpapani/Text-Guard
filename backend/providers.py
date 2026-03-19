import json
import re
from typing import Any, Optional

from config import (
    APP_ENV,
    DEFAULT_WORKSPACE_ID,
    GROQ_API_KEY,
    GROQ_MODEL,
    HF_API_TOKEN,
    HF_MODEL,
    LOG,
    LOG_ALL_DECISIONS,
    MONGO_COLLECTION,
    MONGO_DB,
    MONGO_POLICY_COLLECTION,
    MONGO_TEST_CASES_COLLECTION,
    MONGO_URI,
    mask_uri,
)
from rules import LABEL_TO_CATEGORY, empty_categories

try:
    from bson import ObjectId
except Exception:
    ObjectId = None

try:
    from pymongo import MongoClient
    from pymongo.collection import ReturnDocument
except Exception:
    MongoClient = None
    ReturnDocument = None

try:
    from groq import Groq
except Exception:
    Groq = None

try:
    import requests
except Exception:
    requests = None


groq_client = None
if GROQ_API_KEY and Groq is not None:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        LOG.info("Groq client created.")
    except Exception as exc:
        LOG.warning("Failed to create Groq client: %s", exc)
else:
    if GROQ_API_KEY:
        LOG.warning("Groq package not installed; GROQ_API_KEY ignored.")
    else:
        LOG.info("GROQ_API_KEY not set; Groq disabled.")


mongo_client = None
if MONGO_URI and MongoClient is not None:
    try:
        mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
        mongo_client.server_info()
        LOG.info("Connected to MongoDB (masked): %s", mask_uri(MONGO_URI))
    except Exception as exc:
        LOG.warning("MongoDB connection failed: %s. Masked URI: %s", exc, mask_uri(MONGO_URI))
        mongo_client = None
else:
    if MONGO_URI:
        LOG.warning("pymongo not installed; MONGO_URI ignored.")
    else:
        LOG.info("No Mongo URI provided; Mongo logging disabled.")


def provider_status() -> dict[str, bool]:
    return {
        "groq": groq_client is not None,
        "huggingface": bool(HF_API_TOKEN),
        "mongo": mongo_client is not None,
    }


def parse_llm_payload(payload: Any) -> tuple[dict[str, float], Optional[str]]:
    if not isinstance(payload, dict):
        return empty_categories(), None

    categories = empty_categories()
    raw_categories = payload.get("categories")
    if isinstance(raw_categories, dict):
        for key, value in raw_categories.items():
            normalized = LABEL_TO_CATEGORY.get(str(key).strip().lower())
            if normalized is None:
                continue
            try:
                categories[normalized] = max(categories[normalized], float(value))
            except Exception:
                continue

    label = payload.get("label")
    score = payload.get("score")
    normalized_label = LABEL_TO_CATEGORY.get(str(label).strip().lower()) if label else None
    if normalized_label is not None:
        try:
            categories[normalized_label] = max(categories[normalized_label], float(score))
        except Exception:
            pass

    matched_seed = payload.get("matched_seed")
    return categories, matched_seed if isinstance(matched_seed, str) else None


def call_hf_inference(prompt: str, model: str, token: str, max_tokens: int = 180, temperature: float = 0.0) -> dict[str, Any]:
    if not requests:
        raise RuntimeError("requests not available in environment")

    response = requests.post(
        f"https://api-inference.huggingface.co/models/{model}",
        headers={"Authorization": f"Bearer {token}"},
        json={"inputs": prompt, "parameters": {"max_new_tokens": max_tokens, "temperature": temperature}},
        timeout=60,
    )
    if response.status_code != 200:
        raise RuntimeError(f"HuggingFace API returned {response.status_code}: {response.text}")

    data = response.json()
    if isinstance(data, list) and data and isinstance(data[0], dict) and "generated_text" in data[0]:
        text = data[0]["generated_text"]
    elif isinstance(data, dict) and "generated_text" in data:
        text = data["generated_text"]
    else:
        text = str(data)

    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise RuntimeError("HuggingFace response was not valid JSON")
        return json.loads(match.group(0))


def run_llm_moderation(text: str) -> tuple[dict[str, float], Optional[str], str, Optional[str]]:
    prompt = (
        "You are a content moderation system. "
        "Detect direct abuse, obfuscated abuse, spaced-out slurs, misspelled threats, manipulative coercion, scam pressure, and attempts to evade moderation. "
        "Treat disguised spellings like 'k y s', 'p0rn', '1d10t', or symbol swaps as meaningful if the intent is clear. "
        "Return only valid JSON with keys: "
        "'score' (0.0-1.0), 'label' (hate|harassment|sexual|violence|self_harm|spam|other), "
        "'matched_seed' (string or null), and 'categories' (object with the same labels and scores 0.0-1.0). "
        f'Message: """{text}"""'
    )

    if groq_client is not None:
        response = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a precise JSON-only moderation assistant."},
                {"role": "user", "content": prompt},
            ],
            model=GROQ_MODEL,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        llm_text = None
        if getattr(response, "choices", None):
            choice = response.choices[0]
            message = getattr(choice, "message", None)
            if message is not None:
                llm_text = getattr(message, "content", None) or (message.get("content") if isinstance(message, dict) else None)
            if llm_text is None:
                llm_text = getattr(choice, "text", None) or (choice.get("text") if isinstance(choice, dict) else None)
        payload = json.loads(llm_text) if isinstance(llm_text, str) else llm_text
        categories, matched_seed = parse_llm_payload(payload)
        return categories, matched_seed, "groq", GROQ_MODEL

    if HF_API_TOKEN:
        payload = call_hf_inference(prompt, HF_MODEL, HF_API_TOKEN)
        categories, matched_seed = parse_llm_payload(payload)
        return categories, matched_seed, "huggingface", HF_MODEL

    return empty_categories(), None, "none", None


def save_event(event: dict[str, Any]) -> bool:
    if mongo_client is None:
        return False
    try:
        mongo_client[MONGO_DB][MONGO_COLLECTION].insert_one(event)
        return True
    except Exception as exc:
        LOG.warning("Failed to write log to Mongo: %s", exc)
        return False


def log_event(event: dict[str, Any]) -> bool:
    if not LOG_ALL_DECISIONS and event.get("action") != "block":
        return False
    return save_event(event)


def _matches_workspace(document: dict[str, Any], workspace_id: str) -> bool:
    stored = document.get("workspace_id")
    if stored:
        return stored == workspace_id
    return workspace_id == DEFAULT_WORKSPACE_ID


def fetch_events(limit: int = 50, action: Optional[str] = None, workspace_id: str = DEFAULT_WORKSPACE_ID) -> list[dict[str, Any]]:
    if mongo_client is None:
        raise RuntimeError("MongoDB not configured")

    query: dict[str, Any] = {}
    if action:
        query["action"] = action

    cursor = mongo_client[MONGO_DB][MONGO_COLLECTION].find(query).sort("ts", -1).limit(int(limit))
    items = []
    for item in cursor:
        if not _matches_workspace(item, workspace_id):
            continue
        item["_id"] = str(item["_id"])
        items.append(item)
    return items


def fetch_all_events(limit: int = 500, workspace_id: str = DEFAULT_WORKSPACE_ID) -> list[dict[str, Any]]:
    if mongo_client is None:
        raise RuntimeError("MongoDB not configured")

    cursor = mongo_client[MONGO_DB][MONGO_COLLECTION].find().sort("ts", -1).limit(int(limit))
    items = []
    for item in cursor:
        if not _matches_workspace(item, workspace_id):
            continue
        item["_id"] = str(item["_id"])
        items.append(item)
    return items


def update_event(event_id: str, updates: dict[str, Any], workspace_id: str = DEFAULT_WORKSPACE_ID) -> Optional[dict[str, Any]]:
    if mongo_client is None:
        raise RuntimeError("MongoDB not configured")
    if ObjectId is None or ReturnDocument is None:
        raise RuntimeError("bson/ObjectId not available")

    try:
        object_id = ObjectId(event_id)
    except Exception as exc:
        raise ValueError("Invalid event id") from exc

    payload = {"$set": updates}
    query: dict[str, Any] = {"_id": object_id}
    if workspace_id == DEFAULT_WORKSPACE_ID:
        query["$or"] = [{"workspace_id": workspace_id}, {"workspace_id": {"$exists": False}}]
    else:
        query["workspace_id"] = workspace_id

    result = mongo_client[MONGO_DB][MONGO_COLLECTION].find_one_and_update(
        query,
        payload,
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        return None
    result["_id"] = str(result["_id"])
    return result


def save_test_case(document: dict[str, Any]) -> Optional[dict[str, Any]]:
    if mongo_client is None:
        raise RuntimeError("MongoDB not configured")
    result = mongo_client[MONGO_DB][MONGO_TEST_CASES_COLLECTION].insert_one(document)
    saved = mongo_client[MONGO_DB][MONGO_TEST_CASES_COLLECTION].find_one({"_id": result.inserted_id})
    if saved is None:
        return None
    saved["_id"] = str(saved["_id"])
    return saved


def fetch_test_cases(limit: int = 100, workspace_id: str = DEFAULT_WORKSPACE_ID) -> list[dict[str, Any]]:
    if mongo_client is None:
        raise RuntimeError("MongoDB not configured")

    cursor = mongo_client[MONGO_DB][MONGO_TEST_CASES_COLLECTION].find().sort("created_at", -1).limit(int(limit))
    items = []
    for item in cursor:
        if not _matches_workspace(item, workspace_id):
            continue
        item["_id"] = str(item["_id"])
        items.append(item)
    return items


def fetch_policy_presets(workspace_id: str = DEFAULT_WORKSPACE_ID) -> list[dict[str, Any]]:
    if mongo_client is None:
        raise RuntimeError("MongoDB not configured")

    cursor = mongo_client[MONGO_DB][MONGO_POLICY_COLLECTION].find().sort("name", 1)
    items = []
    for item in cursor:
        if not _matches_workspace(item, workspace_id):
            continue
        item["_id"] = str(item["_id"])
        items.append(item)
    return items


def upsert_policy_preset(workspace_id: str, preset_id: str, document: dict[str, Any]) -> Optional[dict[str, Any]]:
    if mongo_client is None:
        raise RuntimeError("MongoDB not configured")

    result = mongo_client[MONGO_DB][MONGO_POLICY_COLLECTION].find_one_and_update(
        {"workspace_id": workspace_id, "preset_id": preset_id},
        {"$set": document},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        return None
    result["_id"] = str(result["_id"])
    return result


def debug_env_payload() -> dict[str, Any]:
    return {
        "mongo_present": bool(MONGO_URI),
        "mongo_masked": mask_uri(MONGO_URI),
        "groq_present": bool(GROQ_API_KEY),
        "hf_present": bool(HF_API_TOKEN),
        "environment": APP_ENV,
    }
