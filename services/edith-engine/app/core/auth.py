import hmac
from fastapi import Header
from app.core.config import settings
from app.core.errors import UnauthorizedInternalCallerException


def verify_internal_caller(
    x_internal_service_token: str | None = Header(default=None, alias="X-Internal-Service-Token"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    """Enforce trusted internal gateway callers and require an authenticated user ID."""
    if settings.REQUIRE_INTERNAL_AUTH:
        expected = settings.INTERNAL_SERVICE_SECRET.encode("utf-8")
        provided = (x_internal_service_token or "").encode("utf-8")
        if not x_internal_service_token or not hmac.compare_digest(provided, expected):
            raise UnauthorizedInternalCallerException(
                "Missing or invalid internal service token."
            )

    clean_user_id = (x_user_id or "").strip()
    if not clean_user_id:
        raise UnauthorizedInternalCallerException("Missing authenticated X-User-Id header.")

    return clean_user_id

