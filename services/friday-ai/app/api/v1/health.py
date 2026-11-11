from fastapi import APIRouter
from datetime import datetime, timezone
from app.core.config import settings

router = APIRouter()


@router.get("/")
async def health_check():
    return {
        "status": "healthy",
        "service": "F.R.I.D.A.Y. AI Intelligence",
        "version": settings.VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/ready")
async def readiness_check():
    return {
        "status": "ready",
        "subsystems": {
            "orchestrator": "online",
            "context_manager": "online",
            "retriever": "online"
        }
    }

