"""
Backup service — automated database snapshots to JSON.
"""
import json
import logging
import os
import time
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import inspect

logger = logging.getLogger(__name__)

from app.models.user import User
from app.models.batch import Batch
from app.models.ticket import Ticket
from app.models.sale import Sale
from app.models.expense import Expense
from app.models.resupply import ResupplyRequest
from app.models.register_closure import RegisterClosure
from app.models.payment_method import PaymentMethod
from app.models.subscription_type import SubscriptionType
from app.models.automation_setting import AutomationSetting
from app.models.audit_log import AuditLog

BACKUP_DIR = Path("backups")

# Ensure the backup directory exists
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

def object_as_dict(obj):
    """Convert SQLAlchemy model instance to dictionary."""
    return {c.key: getattr(obj, c.key) for c in inspect(obj).mapper.column_attrs}

def generate_full_backup(db: Session, trigger: str = "manual") -> str:
    """
    Export all essential data to a JSON file and return the file path.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{trigger}_{timestamp}.json"
    filepath = BACKUP_DIR / filename

    data = {
        "metadata": {
            "trigger": trigger,
            "timestamp": datetime.now().isoformat(),
            "version": "1.0"
        },
        "users": [object_as_dict(u) for u in db.query(User).all()],
        "batches": [object_as_dict(b) for b in db.query(Batch).all()],
        "tickets": [object_as_dict(t) for t in db.query(Ticket).all()],
        "sales": [object_as_dict(s) for s in db.query(Sale).all()],
        "expenses": [object_as_dict(e) for e in db.query(Expense).all()],
        "resupply_requests": [object_as_dict(r) for r in db.query(ResupplyRequest).all()],
        "register_closures": [object_as_dict(c) for c in db.query(RegisterClosure).all()],
        "payment_methods": [object_as_dict(p) for p in db.query(PaymentMethod).all()],
        "subscription_types": [object_as_dict(s) for s in db.query(SubscriptionType).all()],
        "automation_settings": [object_as_dict(s) for s in db.query(AutomationSetting).all()],
        "audit_logs": [object_as_dict(a) for a in db.query(AuditLog).all()],
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, cls=CustomJSONEncoder, indent=2, ensure_ascii=False)
        
    cleanup_old_backups()
    
    return str(filepath)

def cleanup_old_backups(days: int = 30):
    """
    Delete backups older than the specified number of days.
    """
    if not BACKUP_DIR.exists():
        return
        
    now = time.time()
    for filepath in BACKUP_DIR.glob("backup_*.json"):
        if filepath.is_file():
            # Check file modification time
            if os.stat(filepath).st_mtime < now - days * 86400:
                try:
                    os.remove(filepath)
                except OSError as e:
                    logger.error(f"Failed to delete old backup {filepath}: {e}")

def trigger_background_backup(trigger: str = "auto"):
    """
    Helper to trigger a backup in a new thread to avoid blocking the main request.
    This creates its own DB session.
    """
    import threading
    from app.database import SessionLocal
    
    def run_backup():
        db = SessionLocal()
        try:
            generate_full_backup(db, trigger)
        except Exception as e:
            print(f"Background backup failed: {e}")
        finally:
            db.close()
            
    thread = threading.Thread(target=run_backup)
    thread.daemon = True
    thread.start()
