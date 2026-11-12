import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.agent import router as agent_router
from app.api.v1.health import router as health_router
from app.core.config import settings
from app.core.errors import (
    EdithEngineException,
    PayloadTooLargeException,
    edith_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import logger, request_id_var


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info(
        "%s v%s ready on %s:%s",
        settings.APP_NAME,
        settings.VERSION,
        settings.HOST,
        settings.PORT,
    )
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="E.D.I.T.H. Autonomous Developer Agent Engine",
    lifespan=lifespan,
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    req_id = (request.headers.get("x-request-id") or "").strip() or f"req_{uuid.uuid4().hex[:12]}"
    token = request_id_var.set(req_id)

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.MAX_PAYLOAD_BYTES:
                err = PayloadTooLargeException(settings.MAX_PAYLOAD_BYTES)
                response = JSONResponse(
                    status_code=err.status_code,
                    content={
                        "status": "error",
                        "statusCode": err.status_code,
                        "errorCode": err.error_code,
                        "message": err.message,
                        "requestId": req_id,
                    },
                )
                response.headers["X-Request-Id"] = req_id
                request_id_var.reset(token)
                return response
        except ValueError:
            pass

    try:
        response = await call_next(request)
        response.headers["X-Request-Id"] = req_id
        return response
    finally:
        request_id_var.reset(token)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Internal-Service-Token", "X-User-Id", "X-Request-Id"],
)

app.add_exception_handler(EdithEngineException, edith_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health_router, prefix="/v1")
app.include_router(agent_router, prefix="/v1/agent")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=not settings.is_production)
