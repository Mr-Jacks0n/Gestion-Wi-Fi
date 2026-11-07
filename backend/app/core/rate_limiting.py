"""Rate limiting and circuit breaker for critical endpoints."""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse
from app.config import get_settings

settings = get_settings()

limiter = Limiter(key_func=get_remote_address)

async def rate_limit_error_handler(request: Request, exc: RateLimitExceeded):
    """Custom rate limit error response."""
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "detail": str(exc.detail),
            "retry_after": exc.detail.split("called ")[1].split(" times")[0] if "times" in exc.detail else "60"
        }
    )

# Presets for different endpoint types
RATE_LIMITS = {
    "auth": "5/minute",           # Strict: login attempts
    "payment": "20/minute",       # Moderate: payment operations
    "report": "10/minute",        # Moderate: report generation
    "general": "100/minute",      # Relaxed: general API
}
