"""App access API — smartphone access QR (mode "programme installé").

Exposé uniquement quand FRONTEND_DIST_DIR est configuré (le backend sert
alors le frontend lui-même) : un QR code scannable sur smartphone ouvre
http://<IP-LAN>:<port> directement dans le navigateur du téléphone.
"""

import io
import socket

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from app.config import get_settings
from app.core.dependencies import get_current_user
from app.core.rate_limiting import limiter, RATE_LIMITS
from app.models.user import User

router = APIRouter(prefix="/api/app", tags=["App access"])
settings = get_settings()


def _primary_lan_ip() -> str | None:
    """IP locale (192.168.x.x, 10.x.x.x… ) sans envoyer de paquet (UDP connect).

    Sans cache : au démarrage du service le réseau n'est pas toujours prêt
    (fallback 127.0.0.1 figé sinon). L'appel est un connect UDP local,
    coût négligeable.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(0)
            s.connect(("8.8.8.8", 53))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
            return None
    except Exception:
        return None


def get_access_url(request: Request | None = None) -> str:
    """URL smartphone : IP LAN détectée + port configuré (APP_PORT)."""
    ip = _primary_lan_ip()
    port = settings.APP_PORT
    if not ip and request is not None:
        # Fallback : on utilise l'hôte par lequel le client nous a atteint
        ip = request.client.host if request.client else "127.0.0.1"
    if not ip:
        ip = "127.0.0.1"
    return f"http://{ip}:{port}"


def _qr_png(data: str) -> bytes:
    import qrcode

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0b1220", back_color="#f4faf6")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _qr_ascii(data: str) -> str:
    import io

    import qrcode

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(data)
    qr.make(fit=True)
    buf = io.StringIO()
    qr.print_ascii(out=buf)
    return buf.getvalue()


@router.get("/access-url")
def get_access_url_endpoint(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """URL d'accès smartphone (http://<LAN>:<port>)."""
    _ = current_user
    if not settings.FRONTEND_DIST_DIR:
        raise HTTPException(status_code=404, detail="Frontend servi séparément")
    return {"url": get_access_url(request)}


@router.get("/access-qr")
@limiter.limit(RATE_LIMITS["general"])
def get_access_qr(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """PNG du QR code d'accès smartphone (authentifié, jamais public)."""
    _ = current_user
    if not settings.FRONTEND_DIST_DIR:
        raise HTTPException(status_code=404, detail="Frontend servi séparément")
    png = _qr_png(get_access_url(request))
    return Response(
        content=png,
        media_type="image/png",
        headers={"Content-Disposition": "inline; filename=acces-smartphone.png",
                 "Cache-Control": "no-store"},
    )
