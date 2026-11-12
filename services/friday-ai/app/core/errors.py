from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.core.logging import logger, request_id_var


class FridayAIException(Exception):
    def __init__(self, message: str, status_code: int = 500, error_code: str = "AI_INTERNAL_ERROR"):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(message)


class UnauthorizedInternalCallerException(FridayAIException):
    def __init__(self, message: str = "Invalid or missing internal service credentials."):
        super().__init__(
            message=message,
            status_code=401,
            error_code="UNAUTHORIZED_INTERNAL_CALLER"
        )


class ProviderUnavailableException(FridayAIException):
    def __init__(self, provider: str):
        super().__init__(
            message=f"Model provider '{provider}' is currently unreachable or unconfigured.",
            status_code=503,
            error_code="PROVIDER_UNAVAILABLE"
        )


class ProviderTimeoutException(FridayAIException):
    def __init__(self, provider: str):
        super().__init__(
            message=f"Model provider '{provider}' timed out while generating a response.",
            status_code=504,
            error_code="PROVIDER_TIMEOUT"
        )


class ContextLimitExceededException(FridayAIException):
    def __init__(self, tokens: int, limit: int):
        super().__init__(
            message=f"Context tokens ({tokens}) exceed allowed ceiling of {limit}.",
            status_code=400,
            error_code="CONTEXT_LIMIT_EXCEEDED"
        )


class UnsupportedDocumentFormatException(FridayAIException):
    def __init__(self, message: str):
        super().__init__(
            message=message,
            status_code=400,
            error_code="UNSUPPORTED_DOCUMENT_FORMAT"
        )


class DocumentTooLargeException(FridayAIException):
    def __init__(self, max_bytes: int):
        super().__init__(
            message=f"Uploaded document exceeds maximum allowed size of {max_bytes} bytes.",
            status_code=413,
            error_code="DOCUMENT_TOO_LARGE"
        )


async def friday_exception_handler(request: Request, exc: FridayAIException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "errorCode": exc.error_code,
            "message": exc.message,
            "requestId": request_id_var.get("-")
        }
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "errorCode": "VALIDATION_ERROR",
            "message": "Invalid request payload",
            "requestId": request_id_var.get("-")
        }
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled internal error during request processing")
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "errorCode": "AI_INTERNAL_ERROR",
            "message": "Internal AI service failure",
            "requestId": request_id_var.get("-")
        }
    )

