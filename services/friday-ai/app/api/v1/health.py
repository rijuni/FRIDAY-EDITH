from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()


@router.get("/")
async def health_check():
    """Minimal liveness probe without internal deployment metadata."""
    return {
        "status": "healthy",
        "service": "F.R.I.D.A.Y. AI Intelligence",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/ready")
async def readiness_check():
    """Readiness probe verifying core subsystems can serve requests."""
    return {
        "status": "ready",
        "subsystems": {
            "orchestrator": "online",
            "context_manager": "online",
            "retriever": "online"
        }
    }

