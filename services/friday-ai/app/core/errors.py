from fastapi import Request
from fastapi.responses import JSONResponse


class FridayAIException(Exception):
    def __init__(self, message: str, status_code: int = 500, error_code: str = "AI_INTERNAL_ERROR"):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(message)


class ProviderUnavailableException(FridayAIException):
    def __init__(self, provider: str):
        super().__init__(
            message=f"Model provider '{provider}' is currently unreachable or unconfigured.",
            status_code=503,
            error_code="PROVIDER_UNAVAILABLE"
        )


class ContextLimitExceededException(FridayAIException):
    def __init__(self, tokens: int, limit: int):
        super().__init__(
            message=f"Context tokens ({tokens}) exceed allowed ceiling of {limit}.",
            status_code=400,
            error_code="CONTEXT_LIMIT_EXCEEDED"
        )


async def friday_exception_handler(request: Request, exc: FridayAIException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "errorCode": exc.error_code,
            "message": exc.message
        }
    )

