"""Settings API — payment methods, Wave config, file uploads."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.core.dependencies import get_current_admin_strict
from app.core.rate_limiting import limiter, RATE_LIMITS
from app.models.user import User
from app.models.payment_method import PaymentMethod
from app.schemas.report import PaymentMethodCreate, PaymentMethodUpdate, PaymentMethodResponse
from app.schemas.user import AuditLogResponse

router = APIRouter(prefix="/api/settings", tags=["Settings"])
settings = get_settings()


@router.get("/payment-methods", response_model=list[PaymentMethodResponse])
def list_payment_methods(
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """List all payment methods."""
    methods = db.query(PaymentMethod).order_by(PaymentMethod.name).all()
    return [PaymentMethodResponse.model_validate(m) for m in methods]


@router.post("/payment-methods", response_model=PaymentMethodResponse, status_code=201)
def create_payment_method(
    data: PaymentMethodCreate,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Create a payment method."""
    existing = db.query(PaymentMethod).filter(PaymentMethod.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce moyen de paiement existe déjà")

    method = PaymentMethod(
        name=data.name,
        is_active=data.is_active,
        wave_merchant_number=data.wave_merchant_number,
    )
    db.add(method)
    db.commit()
    db.refresh(method)
    return PaymentMethodResponse.model_validate(method)


@router.put("/payment-methods/{method_id}", response_model=PaymentMethodResponse)
def update_payment_method(
    method_id: int,
    data: PaymentMethodUpdate,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Update a payment method."""
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        raise HTTPException(status_code=404, detail="Moyen de paiement introuvable")

    if data.name is not None:
        method.name = data.name
    if data.is_active is not None:
        method.is_active = data.is_active
    if data.wave_merchant_number is not None:
        method.wave_merchant_number = data.wave_merchant_number

    db.commit()
    db.refresh(method)
    return PaymentMethodResponse.model_validate(method)


@router.delete("/payment-methods/{method_id}")
def delete_payment_method(
    method_id: int,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Delete a payment method."""
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        raise HTTPException(status_code=404, detail="Moyen de paiement introuvable")

    db.delete(method)
    db.commit()
    return {"message": f"Moyen de paiement '{method.name}' supprimé"}


@router.post("/payment-methods/{method_id}/upload-qr")
@limiter.limit(RATE_LIMITS["report"])
async def upload_wave_qr(
    request: Request,
    method_id: int,
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Upload a Wave QR code image for a payment method."""
    from PIL import Image
    import io

    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        raise HTTPException(status_code=404, detail="Moyen de paiement introuvable")

    # Vérification du contenu RÉEL (magic bytes) — le content_type du client
    # est falsifiable. Pillow décoder+réencoder garantit un fichier image
    # nettoyé de tout payload exotique (SVG avec script, polyglottes…).
    allowed_extensions = {".png", ".jpg", ".jpeg", ".webp"}
    original_ext = Path(file.filename or "img.png").suffix.lower()
    if original_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Extension non autorisée (PNG, JPG, WebP)")

    # Lecture limitée (taille vérifiée PENDANT la lecture, pas après)
    content = await file.read(settings.MAX_UPLOAD_SIZE + 1)
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5 Mo)")
    if not content:
        raise HTTPException(status_code=400, detail="Fichier vide")

    try:
        image = Image.open(io.BytesIO(content))
        image.verify()          # vérifie les magic bytes / l'intégrité
    except Exception:
        raise HTTPException(status_code=400, detail="Fichier image invalide ou corrompu")

    # verify() consomme le fichier : recharge puis réencode en PNG
    image = Image.open(io.BytesIO(content)).convert("RGB")
    re_encoded = io.BytesIO()
    image.save(re_encoded, format="PNG")
    content = re_encoded.getvalue()

    # Ensure upload directory exists
    upload_dir = Path(settings.UPLOAD_DIR) / "wave_qr"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Extension canonique (toujours .png après réencodage), nom généré par le serveur
    filename = f"wave_qr_{method_id}_{uuid.uuid4().hex[:8]}.png"
    file_path = upload_dir / filename

    with open(file_path, "wb") as f:
        f.write(content)

    # Update method
    method.wave_qr_image_path = str(file_path)
    db.commit()
    db.refresh(method)

    return {
        "message": "QR code Wave uploadé",
        "path": str(file_path),
    }


@router.get("/payment-methods/active", response_model=list[PaymentMethodResponse])
def list_active_payment_methods(
    db: Session = Depends(get_db),
):
    """List active payment methods (no auth required for sale form)."""
    methods = db.query(PaymentMethod).filter(PaymentMethod.is_active == True).all()
    return [PaymentMethodResponse.model_validate(m) for m in methods]


@router.get("/audit-logs", response_model=list[AuditLogResponse])
def list_audit_logs(
    current_user: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """List all audit logs for admin traceability."""
    from app.models.audit_log import AuditLog
    
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()
    result = []
    for log in logs:
        data = AuditLogResponse.model_validate(log)
        data.user_name = log.user.full_name if log.user else "Système"
        result.append(data)
    return result


@router.get("/backup")
@limiter.limit(RATE_LIMITS["report"])
def download_backup(
    request: Request,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Generate and download a custom SQL insert dump of the database."""
    from fastapi.responses import Response
    from sqlalchemy import select
    from datetime import datetime
    import io
    
    # Map table names to model classes for safe queries
    from app.models.user import User
    from app.models.payment_method import PaymentMethod
    from app.models.subscription_type import SubscriptionType
    from app.models.batch import Batch
    from app.models.ticket import Ticket
    from app.models.sale import Sale
    from app.models.expense import Expense
    from app.models.audit_log import AuditLog
    from app.models.resupply import ResupplyRequest

    model_mapping = {
        "users": User,
        "payment_methods": PaymentMethod,
        "subscription_types": SubscriptionType,
        "batches": Batch,
        "tickets": Ticket,
        "sales": Sale,
        "expenses": Expense,
        "audit_logs": AuditLog,
        "resupply_requests": ResupplyRequest,
    }
    
    out = io.StringIO()
    out.write("-- Adven's WiFi Database Dump\n")
    out.write(f"-- Generated on: {datetime.now().isoformat()}\n\n")
    
    # Disable foreign keys check
    out.write("SET session_replication_role = 'replica';\n\n")
    
    # Table orders for clean imports
    tables = ["users", "payment_methods", "subscription_types", "batches", "tickets", "sales", "expenses", "audit_logs", "resupply_requests"]
    
    for table_name in tables:
        out.write(f"-- Table: {table_name}\n")
        out.write(f"TRUNCATE TABLE {table_name} CASCADE;\n")
        
        # Get column names and rows
        try:
            model_cls = model_mapping[table_name]
            res = db.execute(select(model_cls.__table__))
            columns = res.keys()
            rows = res.fetchall()
            
            for row in rows:
                col_str = ", ".join(columns)
                vals = []
                for val in row:
                    if val is None:
                        vals.append("NULL")
                    elif isinstance(val, (int, float)):
                        vals.append(str(val))
                    elif isinstance(val, bool):
                        vals.append("true" if val else "false")
                    else:
                        # Escape single quotes
                        escaped = str(val).replace("'", "''")
                        vals.append(f"'{escaped}'")
                val_str = ", ".join(vals)
                sql_parts = ["INSERT INTO", table_name, f"({col_str})", "VALUES", f"({val_str});\n"]
                out.write(" ".join(sql_parts))
        except Exception as e:
            out.write(f"-- Error dumping {table_name}: {e}\n")
        out.write("\n")
        
    out.write("SET session_replication_role = 'origin';\n")
    
    buffer = io.BytesIO(out.getvalue().encode("utf-8"))
    
    # Log action
    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="setting.backup",
        entity_type="setting",
        entity_id=None,
        details={},
    )
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/sql",
        headers={"Content-Disposition": f'attachment; filename="backup_advens_{datetime.now().strftime("%Y%m%d_%H%M%S")}.sql"'}
    )
@router.post("/trigger-backup")
@limiter.limit(RATE_LIMITS["report"])
def trigger_backup(
    request: Request,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Trigger a manual background backup."""
    from app.services.backup_service import trigger_background_backup
    trigger_background_backup(trigger="manual_admin")
    return {"message": "Backup triggered successfully"}


# ─────────────────────────────────────────────────────────────
# Backup Management API
# ─────────────────────────────────────────────────────────────

@router.get("/backups")
def list_backups(
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """List all available backup files (admin only)."""
    from app.services.backup_service import BACKUP_DIR
    import time

    if not BACKUP_DIR.exists():
        return []

    files = []
    for f in sorted(BACKUP_DIR.glob("backup_*.json"), reverse=True):
        if f.is_file():
            stat = f.stat()
            files.append({
                "filename": f.name,
                "size_bytes": stat.st_size,
                "size_kb": round(stat.st_size / 1024, 1),
                "created_at": stat.st_mtime,
                "trigger": f.stem.replace("backup_", "").rsplit("_", 2)[0] if "_" in f.stem else "unknown",
            })
    return files


@router.get("/backups/download/{filename}")
def download_backup(
    filename: str,
    admin: User = Depends(get_current_admin_strict),
):
    """Download a specific backup file by filename (admin only)."""
    from app.services.backup_service import BACKUP_DIR

    # Security: only allow backup files, no path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")
    if not filename.startswith("backup_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Fichier non autorisé")

    filepath = BACKUP_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="Fichier de sauvegarde introuvable")

    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/backups/trigger")
@limiter.limit(RATE_LIMITS["report"])
def trigger_backup(
    request: Request,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Manually trigger a full database backup (admin only)."""
    from app.services.backup_service import generate_full_backup
    try:
        filepath = generate_full_backup(db, trigger="manuel")
        return {
            "message": "Sauvegarde générée avec succès",
            "filename": os.path.basename(filepath),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la sauvegarde : {str(e)}")


@router.delete("/backups/{filename}")
def delete_backup(
    filename: str,
    admin: User = Depends(get_current_admin_strict),
):
    """Delete a specific backup file (admin only)."""
    from app.services.backup_service import BACKUP_DIR

    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")
    if not filename.startswith("backup_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Fichier non autorisé")

    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable")

    try:
        os.remove(filepath)
        return {"message": f"Fichier '{filename}' supprimé"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

