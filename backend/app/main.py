"""Adven's Manager — FastAPI application entry point."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database import engine, SessionLocal, Base
from app.models import *  # noqa: F401, F403 — import all models to register them
from app.core.security import hash_password
from app.core.rate_limiting import limiter, rate_limit_error_handler

settings = get_settings()


def seed_initial_data():
    """Create initial admin account and default payment methods if they don't exist."""
    from app.models.user import User, UserRole
    from app.models.payment_method import PaymentMethod
    from app.models.subscription_type import SubscriptionType

    db = SessionLocal()
    try:
        # Create admin user
        admin = db.query(User).filter(User.username == settings.INITIAL_ADMIN_USERNAME).first()
        if not admin:
            admin = User(
                username=settings.INITIAL_ADMIN_USERNAME,
                full_name="Administrateur",
                phone=settings.INITIAL_ADMIN_PHONE,
                password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD),
                role=UserRole.ADMIN,
            )
            db.add(admin)
            print(f"✅ Compte admin créé: {settings.INITIAL_ADMIN_USERNAME}")

        # Default payment methods
        for name in ["Espèces", "Wave", "Crédit"]:
            existing = db.query(PaymentMethod).filter(PaymentMethod.name == name).first()
            if not existing:
                method = PaymentMethod(name=name, is_active=True)
                db.add(method)
                print(f"✅ Moyen de paiement créé: {name}")

        # Default subscription types
        defaults = [
            ("24 Heures", 24, 1000),
            ("7 Jours", 168, 3000),
            ("30 Jours", 720, 10000),
        ]
        for name, hours, price in defaults:
            existing = db.query(SubscriptionType).filter(SubscriptionType.name == name).first()
            if not existing:
                st = SubscriptionType(name=name, duration_hours=hours, price=price)
                db.add(st)
                print(f"✅ Type d'abonnement créé: {name} — {price} FCFA")

        # Cleanup unused default types
        from app.models.ticket import Ticket
        for name in ["1 Heure", "3 Heures"]:
            st = db.query(SubscriptionType).filter(SubscriptionType.name == name).first()
            if st:
                has_tickets = db.query(Ticket).filter(Ticket.subscription_type_id == st.id).first() is not None
                if not has_tickets:
                    db.delete(st)
                    print(f"🧹 Type d'abonnement nettoyé: {name}")

        db.commit()
    finally:
        db.close()


def seed_automation_settings():
    """Seed default automation settings into DB if they don't exist yet."""
    from app.models.automation_setting import AutomationSetting
    defaults = [
        ("AUTO_RESUPPLY_THRESHOLD", "3", "Seuil stock vendeur (réappro auto)", "Nombre de tickets en-dessous duquel une demande est créée automatiquement."),
        ("AUTO_RESUPPLY_QUANTITY", "10", "Quantité demandée (réappro auto)", "Nombre de tickets demandés lors d'une demande automatique."),
        ("AUTO_APPROVE_MAX_QUANTITY", "20", "Max tickets pour approbation auto", "Les demandes ≤ cette valeur sont approuvées automatiquement si stock suffisant."),
        ("CREDIT_ALERT_DAYS", "3", "Délai alerte crédit impayé (jours)", "Nombre de jours avant qu'un crédit impayé génère une alerte."),
    ]
    db = SessionLocal()
    try:
        for key, value, label, description in defaults:
            existing = db.query(AutomationSetting).filter(AutomationSetting.key == key).first()
            if not existing:
                db.add(AutomationSetting(key=key, value=value, label=label, description=description))
        db.commit()
    finally:
        db.close()


def cleanup_admin_assigned_tickets():
    """Move any ASSIGNED tickets assigned to administrators back to central stock (AVAILABLE)."""
    from app.models.user import User, UserRole
    from app.models.ticket import Ticket, TicketStatus
    
    db = SessionLocal()
    try:
        admin_ids = [u.id for u in db.query(User).filter(User.role == UserRole.ADMIN).all()]
        if admin_ids:
            updated_count = db.query(Ticket).filter(
                Ticket.assigned_to.in_(admin_ids),
                Ticket.status == TicketStatus.ASSIGNED
            ).update(
                {
                    Ticket.status: TicketStatus.AVAILABLE,
                    Ticket.assigned_to: None,
                    Ticket.assigned_at: None
                },
                synchronize_session=False
            )
            if updated_count > 0:
                db.commit()
                print(f"🧹 Déplacement de {updated_count} ticket(s) assignés aux admins vers le stock central.")
    except Exception as e:
        print(f"❌ Erreur lors du nettoyage des tickets admins: {e}")
    finally:
        db.close()

def drop_sales_ticket_id_unique_constraint():
    """Drops the unique constraint on sales(ticket_id) if it exists, to allow cancelled ticket resale."""
    db = SessionLocal()
    try:
        from sqlalchemy import text
        db.execute(text("ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_ticket_id_key"))
        db.commit()
        print("✅ Contrainte d'unicité sales_ticket_id_key supprimée de la base de données")
    except Exception as e:
        print(f"❌ Erreur lors de la suppression de la contrainte sales_ticket_id_key: {e}")
    finally:
        db.close()


def migrate_and_backfill_sales_snapshots():
    """Ensure sales table has historical snapshot columns and backfill existing sales."""
    from sqlalchemy import text
    from app.models.sale import Sale

    db = SessionLocal()
    try:
        for col_def in [
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS ticket_code VARCHAR(100);",
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS subscription_type_name VARCHAR(100);",
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS subscription_duration_hours INTEGER;",
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS batch_reference VARCHAR(50);",
            "ALTER TABLE sales ALTER COLUMN ticket_id DROP NOT NULL;",
        ]:
            try:
                db.execute(text(col_def))
            except Exception:
                pass
        db.commit()

        # Backfill existing sales missing ticket_code or snapshot data
        sales_to_fill = db.query(Sale).filter(
            (Sale.ticket_code == None) | (Sale.subscription_type_name == None)
        ).all()

        if sales_to_fill:
            for s in sales_to_fill:
                if s.ticket:
                    s.ticket_code = s.ticket.code
                    if s.ticket.subscription_type:
                        s.subscription_type_name = s.ticket.subscription_type.name
                        s.subscription_duration_hours = s.ticket.subscription_type.duration_hours
                    if s.ticket.batch:
                        s.batch_reference = s.ticket.batch.reference
            db.commit()
            print(f"✅ Snapshots d'historique de ventes mis à jour pour {len(sales_to_fill)} vente(s).")
    except Exception as e:
        print(f"⚠️ Note migration sales snapshots: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Create tables
    Base.metadata.create_all(bind=engine)
    print("✅ Base de données initialisée")

    # Create upload directory
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

    # Seed initial data
    seed_initial_data()
    seed_automation_settings()
    cleanup_admin_assigned_tickets()
    drop_sales_ticket_id_unique_constraint()
    migrate_and_backfill_sales_snapshots()

    # Merge existing duplicate client contacts on startup
    from app.services.sale_service import merge_existing_contacts
    db = SessionLocal()
    try:
        merge_existing_contacts(db)
        print("✅ Fusion et nettoyage des contacts clients terminés")
    except Exception as e:
        print(f"❌ Erreur lors de la fusion des contacts: {e}")
    finally:
        db.close()

    # Start background scheduler (periodic tasks)
    from app.scheduler import start_scheduler
    start_scheduler()
    print("✅ Scheduler démarré")

    yield

    from app.scheduler import stop_scheduler
    stop_scheduler()
    print("👋 Application arrêtée")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Application de gestion des tickets Wi-Fi pour Adven's Center",
    lifespan=lifespan,
    # Mode "programme installé" : l'API est exposée sur le LAN — on masque
    # la cartographie de l'API (/docs, /redoc, /openapi.json).
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
)

# Rate limiting
app.state.limiter = limiter
# Respect du réglage RATE_LIMIT_ENABLED (.env) — défaut True
limiter.enabled = settings.RATE_LIMIT_ENABLED
# Sans ce handler, chaque dépassement de limite remontait en 500 au lieu d'un 429 propre
app.add_exception_handler(RateLimitExceeded, rate_limit_error_handler)

# CORS — origines explicites (jamais "*" avec allow_credentials=True), sinon
# Starlette reflète l'origine de la requête et ouvre le CORS aux sites distants.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads served through the AUTHENTICATED router app.api.uploads
upload_path = Path(settings.UPLOAD_DIR)
upload_path.mkdir(parents=True, exist_ok=True)

# Register routers
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.tickets import router as tickets_router
from app.api.sales import router as sales_router
from app.api.resupply import router as resupply_router
from app.api.dashboard import router as dashboard_router
from app.api.reports import router as reports_router
from app.api.settings import router as settings_router
from app.api.expenses import router as expenses_router
from app.api.notifications import router as notifications_router
from app.api.automation import router as automation_router
from app.api.register_closures import router as register_closures_router
from app.api.uploads import router as uploads_router
from app.api.app_access import router as app_access_router

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(tickets_router)
app.include_router(sales_router)
app.include_router(resupply_router)
app.include_router(dashboard_router)
app.include_router(reports_router)
app.include_router(settings_router)
app.include_router(expenses_router)
app.include_router(notifications_router)
app.include_router(automation_router)
app.include_router(register_closures_router)
app.include_router(uploads_router)
app.include_router(app_access_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


# ─────────────────────────────────────────────────────────────────
# Frontend servi par l'API (mode "programme installé", une seule porte)
# DOIT rester enregistré en dernier : c'est le catch-all SPA qui ramasse
# uniquement les chemins non couverts par les routeurs /api/* ci-dessus.
# ─────────────────────────────────────────────────────────────────
_frontend_dist: Path | None = None
if settings.FRONTEND_DIST_DIR:
    _dist = Path(settings.FRONTEND_DIST_DIR)
    if _dist.exists():
        _frontend_dist = _dist.resolve()
    else:
        print(f"⚠️  FRONTEND_DIST_DIR introuvable : {_dist}")


def _register_frontend_static():
    if _frontend_dist is None:
        return

    from fastapi.responses import FileResponse
    from fastapi import Request

    index_html = _frontend_dist / "index.html"

    def _safe(rel: str) -> Path | None:
        try:
            candidate = (_frontend_dist / rel).resolve()
            candidate.relative_to(_frontend_dist)
        except ValueError:
            return None
        if candidate.is_file() and candidate != index_html:
            return candidate
        return None

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str, request: Request):
        # fichier statique (assets, icônes, sw.js…)
        static_file = _safe(full_path)
        if static_file:
            return FileResponse(
                path=str(static_file),
                headers={"Cache-Control": "public, max-age=3600"},
            )
        # routes SPA (/, /login, /settings/…) → index.html
        return FileResponse(path=str(index_html), media_type="text/html")


_register_frontend_static()

# QR smartphone dans le log de démarrage (mode installé uniquement)
if _frontend_dist is not None:
    try:
        from app.api.app_access import get_access_url, _qr_ascii

        _url = get_access_url()
        print("\n" + "═" * 50)
        print("  📱  ACCÈS SMARTPHONE — scannez ce QR")
        print(f"  ➜  {_url}")
        print("═" * 50)
        print(_qr_ascii(_url))
    except Exception as exc:  # pragma: no cover — jamais de crash pour un QR décoratif
        print(f"⚠️  QR smartphone non généré : {exc}")
