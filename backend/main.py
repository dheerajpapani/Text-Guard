from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import APP_NAME, APP_VERSION, CORS_ORIGINS, LOG, PORT
from routes import router


app = FastAPI(title=APP_NAME, version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


if __name__ == "__main__":
    LOG.info("Starting %s backend on port %s", APP_NAME, PORT)
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
