import hmac
from typing import Optional
from fastapi import Header
from app.core.config import settings
from app.core.errors import UnauthorizedInternalCallerException


async def verify_internal_caller(
    x_internal_service_token: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None)
) -> str:
    """
    Validates that requests originate from an authorized internal service (Node API)
    using constant-time comparison and returns the scoped caller user ID when supplied.
    """
    if settings.REQUIRE_INTERNAL_AUTH:
        if not x_internal_service_token or not hmac.compare_digest(
            x_internal_service_token,
            settings.INTERNAL_SERVICE_SECRET
        ):
            raise UnauthorizedInternalCallerException()

    if not x_user_id or not x_user_id.strip():
        raise UnauthorizedInternalCallerException("Scoped user identity header (X-User-Id) is required.")

    return x_user_id.strip()

