from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.logging import logger
from app.core.errors import FridayAIException, friday_exception_handler
from app.api.v1.health import router as health_router
from app.api.v1.chat import router as chat_router
from app.api.v1.documents import router as documents_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"🌌 F.R.I.D.A.Y. AI Intelligence Service initialized on {settings.HOST}:{settings.PORT}")
    yield
    logger.info("F.R.I.D.A.Y. AI service gracefully stopped.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS Middleware (only allowing internal API and Frontend origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Exception handlers
app.add_exception_handler(FridayAIException, friday_exception_handler)

# Route mounting
app.include_router(health_router, prefix="/v1/health", tags=["Health"])
app.include_router(chat_router, prefix="/v1/chat", tags=["Chat"])
app.include_router(documents_router, prefix="/v1/documents", tags=["Documents"])

