import os
import json
import logging
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq
from pymongo import MongoClient, errors

# --- 1. Load Config & Clients ---
load_dotenv()
PORT = int(os.getenv("PORT", 8088))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")

# Setup clients
app = FastAPI(title="Sentimod Backend")
groq_client = Groq(api_key=GROQ_API_KEY)

# Try to connect to Mongo
try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    mongo_client.server_info() # Test connection
    print("MongoDB connection successful.")
except errors.ServerSelectionTimeoutError:
    print(f"CRITICAL: MongoDB connection failed. Is your IP whitelisted in Atlas?")
    print(f"Using URI: {MONGO_URI[:30]}...") # Print partial URI for debugging
    mongo_client = None
except Exception as e:
    print(f"An error occurred connecting to MongoDB: {e}")
    mongo_client = None

# --- 2. Security: CORS ---
# Allows your frontend (on port 5173) to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", # Vite's default port
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. Thresholds (for AI's score) ---
BLOCK_THRESHOLD = 0.80
REVIEW_THRESHOLD = 0.45

# --- 4. MongoDB Logging Function ---
def log_to_mongo(log_data: dict):
    if not mongo_client:
        print("Skipping log: No MongoDB connection.")
        return

    # As requested: Only log if the action is 'block'
    if log_data.get("action") != "block":
        return

    try:
        db = mongo_client["sentimod"] # Database name
        collection = db["serve_logs"] # Collection name
        collection.insert_one(log_data)
    except Exception as e:
        print(f"Failed to log to MongoDB: {e}")

# --- 5. API Endpoints ---
class ModerateRequest(BaseModel):
    text: str
    mode: str = "comment"

@app.get("/")
def root():
    return {"service": "sentiimod-backend", "status": "ok"}

@app.post("/moderate")
async def moderate(req: ModerateRequest):
    text = req.text
    if not text.strip():
        return {"action": "allow", "score": 0.0, "reason": "empty_text", "matched_seed": None}

    # Step 1: No blocklist. Go directly to Groq AI.
    prompt = f"You are a content-moderation assistant. Given the input message (below), answer in EXACTLY valid JSON with three fields: \"score\" (a number from 0.0 to 1.0 for how likely the message is disallowed), \"label\" (one word: rude|sexual|hate|harassment|other), and \"matched_seed\" (the single offending token/phrase if you can identify it, or null). Do NOT return any extra text. Message:\n\n\"\"\"\n{text}\n\"\"\"\n\nReturn JSON only."

    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a concise JSON-output content-moderation assistant."},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant", # Fast, open-source model
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        
        # Step 2: Parse the AI's JSON response
        llm_text = chat_completion.choices[0].message.content
        llm_json = json.loads(llm_text)
        
        score = float(llm_json.get("score", 0.0))
        label = llm_json.get("label", "other")
        matched_seed = llm_json.get("matched_seed")
        reason = f"llm_{label}"

        # Step 3: Apply thresholds to the score
        if score >= BLOCK_THRESHOLD:
            action = "block"
        elif score >= REVIEW_THRESHOLD:
            action = "review"
        else:
            action = "allow"
            
        result = {"action": action, "score": score, "reason": reason, "matched_seed": matched_seed}

        # Step 4: Log to Mongo (function will check if it's 'block')
        log_to_mongo({ "ts": int(time.time()), "raw": text, **result, "meta": {"provider": "groq"}})
        
        return result

    except Exception as e:
        print(f"Groq API error or JSON parse error: {e}")
        # Fail-safe: if the AI fails, we default to "review"
        return {"action": "review", "score": 0.5, "reason": "ai_error", "matched_seed": None}


@app.get("/admin/logs")
async def get_admin_logs():
    if not mongo_client:
        raise HTTPException(status_code=500, detail="MongoDB not configured or connection failed")
    try:
        db = mongo_client["sentimod"]
        logs = db["serve_logs"].find().sort("ts", -1).limit(50)
        
        results = []
        for log in logs:
            log["_id"] = str(log["_id"]) # Convert ObjectId to string
            results.append(log)
        
        return {"results": results, "n": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch logs: {e}")

# --- 6. Run the Server ---
if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("uvicorn")
    
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not found in .env file. AI calls will fail.")
    if not MONGO_URI:
        logger.warning("MONGO_URI not found in .env file. Logging will be disabled.")
    
    logger.info(f"Starting Sentiimod backend on http://localhost:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)