from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.qwen_realtime import router as qwen_realtime_router
from app.routes import router
from app.streaming import router as streaming_router


def create_app() -> FastAPI:
    app = FastAPI(title="AI Speaking Coach Backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    app.include_router(qwen_realtime_router)
    app.include_router(streaming_router)

    return app
