import logging
import os
from typing import Optional

try:
    from dotenv import find_dotenv, load_dotenv
except Exception:
    def load_dotenv(path=None):
        return None

    def find_dotenv(usecwd=True):
        return None


env_path = find_dotenv(usecwd=True)
if env_path:
    load_dotenv(env_path)


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


def mask_uri(uri: Optional[str], keep: int = 6) -> Optional[str]:
    if not uri:
        return None
    if len(uri) <= keep * 2:
        return uri[:keep] + "..." + uri[-keep:]
    return uri[:keep] + "..." + uri[-keep:]


PORT = int(os.getenv("PORT", os.getenv("RENDER_PORT", 8088)))
APP_ENV = os.getenv("APP_ENV", "development")
APP_NAME = os.getenv("APP_NAME", "Text Guard")
APP_VERSION = os.getenv("APP_VERSION", "0.1.0")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
HF_API_TOKEN = os.getenv("HF_API_TOKEN")
HF_MODEL = os.getenv("HF_MODEL", "google/flan-t5-small")

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
MONGO_DB = os.getenv("MONGODB_DB", "text_guard")
MONGO_COLLECTION = os.getenv("MONGODB_COLLECTION", "moderation_events")
MONGO_TEST_CASES_COLLECTION = os.getenv("MONGODB_TEST_CASES_COLLECTION", "saved_test_cases")
MONGO_POLICY_COLLECTION = os.getenv("MONGODB_POLICY_COLLECTION", "policy_presets")

MOCK_MODE = env_flag("MOCK_MODE", False)
ENABLE_DEBUG_ENV = env_flag("ENABLE_DEBUG_ENV", False)
LOG_ALL_DECISIONS = env_flag("LOG_ALL_DECISIONS", True)
CORS_ORIGINS = env_list("CORS_ORIGINS", ["http://localhost:5173", "http://127.0.0.1:5173"])
DEFAULT_WORKSPACE_ID = os.getenv("DEFAULT_WORKSPACE_ID", "default")
WORKSPACE_SHARED_KEY = os.getenv("WORKSPACE_SHARED_KEY", "")

BLOCK_THRESHOLD = float(os.getenv("BLOCK_THRESHOLD", 0.85))
REVIEW_THRESHOLD = float(os.getenv("REVIEW_THRESHOLD", 0.45))

logging.basicConfig(level=logging.INFO)
LOG = logging.getLogger("text_guard")
