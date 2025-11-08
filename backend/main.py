# backend/main.py
import os
import json
import time
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Best-effort optional imports
try:
    from dotenv import load_dotenv, find_dotenv
except Exception:
    def load_dotenv(path=None): pass
    def find_dotenv(usecwd=True): return None

try:
    from pymongo import MongoClient, errors as pymongo_errors
except Exception:
    MongoClient = None
    pymongo_errors = None

# Groq is optional; if not installed the server still runs
try:
    from groq import Groq
except Exception:
    Groq = None

# HTTP fallback (Hugging Face)
try:
    import requests
except Exception:
    requests = None

# ----------------- Config & env -----------------
env_path = find_dotenv(usecwd=True)
if env_path:
    load_dotenv(env_path)

PORT = int(os.getenv("PORT", os.getenv("RENDER_PORT", 8088)))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
MONGO_DB = os.getenv("MONGODB_DB", "textsense")
MONGO_COLLECTION = os.getenv("MONGODB_COLLECTION", "serve_logs")
MOCK_MODE = os.getenv("MOCK_MODE", "0")
HF_API_TOKEN = os.getenv("HF_API_TOKEN")
HF_MODEL = os.getenv("HF_MODEL", "google/flan-t5-small")

# Thresholds
BLOCK_THRESHOLD = float(os.getenv("BLOCK_THRESHOLD", 0.80))
REVIEW_THRESHOLD = float(os.getenv("REVIEW_THRESHOLD", 0.45))

# Logging
logging.basicConfig(level=logging.INFO)
LOG = logging.getLogger("textsense")

def _mask_uri(uri: Optional[str], keep: int = 6) -> Optional[str]:
    if not uri:
        return None
    if len(uri) <= (keep * 2):
        return uri[:keep] + "..." + uri[-keep:]
    return uri[:keep] + "..." + uri[-keep:]

# ----------------- App -----------------
app = FastAPI(title="TextSense / moderation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ModerateRequest(BaseModel):
    text: str
    mode: str = "comment"

# ----------------- Optional clients -----------------
groq_client = None
if GROQ_API_KEY and Groq is not None:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        LOG.info("Groq client created.")
    except Exception as e:
        LOG.warning("Failed to create Groq client: %s", e)
else:
    if GROQ_API_KEY:
        LOG.warning("Groq package not installed; GROQ_API_KEY ignored.")
    else:
        LOG.info("GROQ_API_KEY not set; Groq disabled.")

# Mongo client (optional & defensive)
mongo_client = None
if MONGO_URI and MongoClient is not None:
    try:
        mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
        mongo_client.server_info()  # quick check
        LOG.info("Connected to MongoDB (masked): %s", _mask_uri(MONGO_URI))
    except Exception as e:
        LOG.warning("MongoDB connection failed: %s. Masked URI: %s", e, _mask_uri(MONGO_URI))
        mongo_client = None
else:
    if MONGO_URI:
        LOG.warning("pymongo not installed; MONGO_URI ignored.")
    else:
        LOG.info("No Mongo URI provided; Mongo logging disabled.")

# ----------------- Helpers -----------------
def log_to_mongo(log_data: dict):
    # Only log 'block' actions (per your earlier request)
    try:
        if mongo_client is None:
            LOG.debug("Skipping mongo log (no mongo client).")
            return
        if log_data.get("action") != "block":
            LOG.debug("Skipping mongo log (action != block).")
            return
        db = mongo_client[MONGO_DB]
        coll = db[MONGO_COLLECTION]
        coll.insert_one(log_data)
        LOG.debug("Inserted log to Mongo.")
    except Exception as e:
        LOG.warning("Failed to write log to Mongo: %s", e)

def call_hf_inference(prompt: str, model: str, token: str, max_tokens: int = 150, temperature: float = 0.7) -> str:
    if not requests:
        raise RuntimeError("requests not available in environment")
    url = f"https://api-inference.huggingface.co/models/{model}"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"inputs": prompt, "parameters": {"max_new_tokens": int(max_tokens), "temperature": float(temperature)}}
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"HuggingFace API returned {resp.status_code}: {resp.text}")
    data = resp.json()
    # common shapes
    if isinstance(data, list) and data and isinstance(data[0], dict) and "generated_text" in data[0]:
        return data[0]["generated_text"]
    if isinstance(data, dict) and "generated_text" in data:
        return data["generated_text"]
    return str(data)

# ----------------- Endpoints -----------------
@app.get("/health")
def health():
    return {
        "ok": True,
        "groq_configured": groq_client is not None,
        "mongo_configured": mongo_client is not None,
        "hf_token_set": bool(HF_API_TOKEN),
        "mock_mode": MOCK_MODE == "1",
        "time_utc": time.time(),
    }

@app.get("/_debug_env")
def debug_env():
    return {
        "mongo_present": bool(MONGO_URI),
        "mongo_masked": _mask_uri(MONGO_URI),
        "groq_present": bool(GROQ_API_KEY),
        "hf_present": bool(HF_API_TOKEN),
    }

@app.post("/moderate")
def moderate(req: ModerateRequest):
    text = (req.text or "").strip()
    if text == "":
        return {"action": "allow", "score": 0.0, "reason": "empty_text", "matched_seed": None}

    # If mock mode enabled, return a deterministic mocked result
    if MOCK_MODE == "1":
        mocked = {"action": "allow", "score": 0.05, "reason": "mock", "matched_seed": None}
        return mocked

    # Build prompt for Groq (or generic LLM). Keep prompt concise and expect JSON
    prompt = (
        "You are a content-moderation assistant. "
        "Given the input message, return EXACTLY valid JSON with fields: "
        "'score' (0.0-1.0), 'label' (one of: rude|sexual|hate|harassment|other), "
        "'matched_seed' (offending token/phrase or null). Return JSON only.\n\n"
        f"Message:\n\"\"\"\n{text}\n\"\"\""
    )

    # 1) Try Groq if configured
    if groq_client is not None:
        try:
            resp = groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are a concise JSON-output content-moderation assistant."},
                    {"role": "user", "content": prompt},
                ],
                model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            # groq returns structured object; be flexible
            try:
                llm_text = None
                # try common access patterns
                if hasattr(resp, "choices") and resp.choices:
                    choice = resp.choices[0]
                    # many SDKs expose message.content
                    msg = getattr(choice, "message", None)
                    if msg is not None:
                        llm_text = getattr(msg, "content", None) or (msg.get("content") if isinstance(msg, dict) else None)
                    # fallback to text field
                    if llm_text is None:
                        llm_text = getattr(choice, "text", None) or (choice.get("text") if isinstance(choice, dict) else None)
                # If still None, stringify
                if llm_text is None:
                    llm_text = str(resp)
                llm_json = json.loads(llm_text) if isinstance(llm_text, str) else llm_text
            except Exception as e:
                LOG.warning("Failed to parse Groq response: %s", e)
                raise

            score = float(llm_json.get("score", 0.0))
            label = llm_json.get("label", "other")
            matched_seed = llm_json.get("matched_seed")
        except Exception as e:
            LOG.warning("Groq call failed: %s", e)
            # fall through to HF fallback if configured; else review
            score = None
            label = None
            matched_seed = None
    else:
        score = None
        label = None
        matched_seed = None

    # 2) If Groq didn't give a numeric score and HF token exists, try HF inference as fallback
    if score is None and HF_API_TOKEN:
        try:
            hf_out = call_hf_inference(prompt, HF_MODEL, HF_API_TOKEN, max_tokens=120, temperature=0.0)
            # attempt to parse json from HF output
            parsed = None
            try:
                parsed = json.loads(hf_out)
            except Exception:
                # try extracting first JSON substring
                import re
                m = re.search(r"\{.*\}", hf_out, flags=re.DOTALL)
                if m:
                    parsed = json.loads(m.group(0))
            if parsed:
                score = float(parsed.get("score", 0.0))
                label = parsed.get("label", "other")
                matched_seed = parsed.get("matched_seed")
            else:
                LOG.warning("HF fallback produced non-json output: %s", hf_out)
                score = 0.5
                label = "other"
                matched_seed = None
        except Exception as e:
            LOG.warning("HF fallback failed: %s", e)
            score = 0.5
            label = "other"
            matched_seed = None

    # 3) If still no score, default to review
    if score is None:
        score = 0.5
        label = "other"
        matched_seed = None

    # Determine action from thresholds
    if score >= BLOCK_THRESHOLD:
        action = "block"
    elif score >= REVIEW_THRESHOLD:
        action = "review"
    else:
        action = "allow"

    result = {"action": action, "score": score, "reason": f"llm_{label}", "matched_seed": matched_seed}

    # Log only blocks (function filters)
    try:
        log_doc = {"ts": int(time.time()), "raw": text, **result, "meta": {"provider": "groq" if groq_client is not None else "hf" if HF_API_TOKEN else "none"}}
        log_to_mongo(log_doc)
    except Exception as e:
        LOG.warning("Logging attempt failed: %s", e)

    return result

@app.get("/admin/logs")
def get_admin_logs(limit: int = 50):
    if mongo_client is None:
        raise HTTPException(status_code=500, detail="MongoDB not configured")
    try:
        db = mongo_client[MONGO_DB]
        cursor = db[MONGO_COLLECTION].find().sort("ts", -1).limit(int(limit))
        items = []
        for d in cursor:
            d["_id"] = str(d["_id"])
            items.append(d)
        return {"n": len(items), "results": items}
    except Exception as e:
        LOG.warning("Failed to fetch logs: %s", e)
        raise HTTPException(status_code=500, detail="Failed to fetch logs")

# ----------------- Run server (for local dev; Render uses Procfile or start command) -----------------
if __name__ == "__main__":
    LOG.info("Starting TextSense backend (local run). Port: %s", PORT)
    if not GROQ_API_KEY:
        LOG.warning("GROQ_API_KEY not set; Groq disabled.")
    if not MONGO_URI:
        LOG.info("MONGO_URI not set; Mongo logging disabled.")
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
