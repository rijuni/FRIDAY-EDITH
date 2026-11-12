import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import logger, request_id_var
from app.core.errors import (
    FridayAIException,
    friday_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler
)
from app.api.v1.health import router as health_router
from app.api.v1.chat import router as chat_router
from app.api.v1.documents import router as documents_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"F.R.I.D.A.Y. AI Intelligence Service initialized on {settings.HOST}:{settings.PORT}")
    yield
    logger.info("F.R.I.D.A.Y. AI service gracefully stopped.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)


@app.middleware("http")
async def request_context_and_limits_middleware(request: Request, call_next):
    incoming_req_id = request.headers.get("x-request-id")
    req_id = (
        incoming_req_id.strip()[:64]
        if incoming_req_id and incoming_req_id.strip()
        else str(uuid.uuid4())
    )
    token = request_id_var.set(req_id)

    try:
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit():
            limit = (
                settings.MAX_UPLOAD_SIZE_BYTES
                if request.url.path.startswith("/v1/documents")
                else settings.MAX_JSON_BODY_BYTES
            )
            if int(content_length) > limit:
                return JSONResponse(
                    status_code=413,
                    content={
                        "status": "error",
                        "errorCode": "PAYLOAD_TOO_LARGE",
                        "message": f"Request payload exceeds ceiling of {limit} bytes.",
                        "requestId": req_id
                    }
                )

        response = await call_next(request)
        response.headers["X-Request-Id"] = req_id
        return response
    finally:
        request_id_var.reset(token)


# CORS Middleware (allowing configured internal API origins only)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Internal-Service-Token", "X-Request-Id", "X-User-Id"]
)

# Typed Exception handlers
app.add_exception_handler(FridayAIException, friday_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Route mounting
app.include_router(health_router, prefix="/v1/health", tags=["Health"])
app.include_router(chat_router, prefix="/v1/chat", tags=["Chat"])
app.include_router(documents_router, prefix="/v1/documents", tags=["Documents"])

