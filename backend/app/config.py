"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


# Secret keys whose presence means "not configured" — fail fast at startup.
FORBIDDEN_SECRET_KEYS = {
    "",
    "change-me-in-production-use-openssl-rand-hex-32",
    "change-me-in-production-use-a-long-random-string",
}


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Adven's Manager"
    APP_VERSION: str = "1.1.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql://advens:[REDACTED]@localhost:5432/advens_manager"

    # JWT
    # NOTE: aucune valeur par défaut exploitable. Une clé secrète réelle
    # (openssl rand -hex 32) DOIT être fournie via la variable d'environnement,
    # sinon `get_settings()` refuse de démarrer (voir validator ci-dessous).
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # CORS — liste d'origines autorisées, séparées par des virgules.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost"

    # File uploads
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024  # 5MB

    # Mode "programme installé" (install-ubuntu.sh) :
    # - FRONTEND_DIST_DIR  : si défini, le backend sert le build du frontend
    #   (une seule porte http://<IP-LAN>:8000 pour PC et smartphones).
    # - DOCS_ENABLED=false : masque /docs et /openapi.json sur le LAN.
    # - APP_PORT           : port public annoncé dans le QR smartphone.
    FRONTEND_DIST_DIR: str | None = None
    DOCS_ENABLED: bool = True
    APP_PORT: int = 8000

    # Initial admin
    INITIAL_ADMIN_USERNAME: str = "admin"
    INITIAL_ADMIN_PASSWORD: str = "admin123"
    INITIAL_ADMIN_PHONE: str = "+225 0000000000"

    # Automation defaults (overridable from DB settings)
    AUTO_RESUPPLY_THRESHOLD: int = 3
    AUTO_RESUPPLY_QUANTITY: int = 10
    AUTO_APPROVE_MAX_QUANTITY: int = 20
    CREDIT_ALERT_DAYS: int = 3

    # Celery + Redis
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"
    REDIS_URL: str = "redis://redis:6379/2"

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    _settings = Settings()

    hardening_min_length = 32
    if (
        not _settings.SECRET_KEY
        or len(_settings.SECRET_KEY) < hardening_min_length
        or _settings.SECRET_KEY in FORBIDDEN_SECRET_KEYS
    ):
        raise RuntimeError(
            "SECRET_KEY est absente, trop courte (<32 caractères) ou égale à "
            "la valeur par défaut connue. Générez-en une sécurisée, ex.:\n"
            "  export SECRET_KEY=$(openssl rand -hex 32)"
        )

    return _settings
