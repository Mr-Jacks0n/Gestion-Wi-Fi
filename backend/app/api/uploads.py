"""Authenticated file-serving for the uploads directory.

Remplace le montage StaticFiles public de /uploads : un fichier du
répertoire d'uploads (ex. QR Wave) ne s'obtient plus sans un JWT valide.
"""

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.config import get_settings
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])
settings = get_settings()

UPLOAD_ROOT = Path(settings.UPLOAD_DIR).resolve()

allowed_extensions = {".png", ".jpg", ".jpeg", ".webp"}


@router.get("/{file_path:path}")
def get_upload(
    file_path: str,
    current_user: User = Depends(get_current_user),
):
    """Serve un fichier du répertoire d'uploads (authentification requise)."""
    try:
        candidate = (UPLOAD_ROOT / file_path).resolve()
        candidate.relative_to(UPLOAD_ROOT)  # anti-traversée (.., symlink)
    except ValueError:
        raise HTTPException(status_code=400, detail="Chemin de fichier invalide")

    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable")

    if candidate.suffix.lower() not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Type de fichier non autorisé")

    media_type = mimetypes.types_map.get(candidate.suffix.lower(), "application/octet-stream")
    return FileResponse(
        path=str(candidate),
        media_type=media_type,
        headers={
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
        },
    )
