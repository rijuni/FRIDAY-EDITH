from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.core.logging import logger, request_id_var


class EdithEngineException(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: str = "EDITH_INTERNAL_ERROR",
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(self.message)


class UnauthorizedInternalCallerException(EdithEngineException):
    def __init__(self, message: str = "Unauthorized internal service caller"):
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="UNAUTHORIZED_INTERNAL_CALLER",
        )


class WorkspaceAccessDeniedException(EdithEngineException):
    def __init__(self, message: str = "Workspace path is outside configured allowlist"):
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="WORKSPACE_ACCESS_DENIED",
        )


class FileReadException(EdithEngineException):
    def __init__(self, message: str = "Unable to read requested workspace file", status_code: int = 400):
        super().__init__(
            message=message,
            status_code=status_code,
            error_code="FILE_READ_FAILED",
        )


class PatchApplyException(EdithEngineException):
    def __init__(self, message: str = "Failed to apply unified diff patch cleanly"):
        super().__init__(
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="PATCH_APPLY_FAILED",
        )


class PayloadTooLargeException(EdithEngineException):
    def __init__(self, max_bytes: int):
        super().__init__(
            message=f"Request payload exceeds maximum allowed size ({max_bytes} bytes).",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            error_code="PAYLOAD_TOO_LARGE",
        )


async def edith_exception_handler(request: Request, exc: EdithEngineException):
    req_id = request_id_var.get("-")
    logger.warning(f"EDITH error [{exc.error_code}]: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "statusCode": exc.status_code,
            "errorCode": exc.error_code,
            "message": exc.message,
            "requestId": req_id,
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    req_id = request_id_var.get("-")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "status": "fail",
            "statusCode": status.HTTP_422_UNPROCESSABLE_ENTITY,
            "errorCode": "VALIDATION_ERROR",
            "message": "Invalid request payload",
            "errors": exc.errors(),
            "requestId": req_id,
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    req_id = request_id_var.get("-")
    logger.error(f"Unhandled error in edith-engine: {type(exc).__name__}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "statusCode": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "errorCode": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected internal error occurred.",
            "requestId": req_id,
        },
    )

