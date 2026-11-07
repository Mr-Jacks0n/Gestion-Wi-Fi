"""
APScheduler — periodic background tasks.
Started alongside the FastAPI application.
"""

import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_daily_report() -> None:
    """Generate and send the daily internal report notification."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        from app.services.automation_service import generate_daily_internal_report_notification
        generate_daily_internal_report_notification(db)
        logger.info("[Scheduler] Rapport journalier interne généré avec succès.")
    except Exception as exc:
        logger.error(f"[Scheduler] Erreur rapport journalier : {exc}", exc_info=True)
    finally:
        db.close()


def _run_credit_alerts() -> None:
    """Send alerts for overdue unpaid credit sales."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        from app.services.automation_service import check_overdue_credits
        count = check_overdue_credits(db)
        if count:
            logger.info(f"[Scheduler] {count} alerte(s) crédit impayé envoyée(s).")
    except Exception as exc:
        logger.error(f"[Scheduler] Erreur alertes crédit : {exc}", exc_info=True)
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    """Start the background scheduler with all periodic tasks."""
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone="UTC")

    # Rapport journalier interne — tous les jours à 23h00 UTC
    _scheduler.add_job(
        _run_daily_report,
        trigger=CronTrigger(hour=23, minute=0),
        id="daily_report",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # Alertes crédits impayés — tous les jours à 08h00 UTC
    _scheduler.add_job(
        _run_credit_alerts,
        trigger=CronTrigger(hour=8, minute=0),
        id="credit_alerts",
        replace_existing=True,
        misfire_grace_time=300,
    )

    _scheduler.start()
    logger.info("[Scheduler] Démarré — rapport journalier (23h UTC) + alertes crédit (08h UTC).")
    return _scheduler


def stop_scheduler() -> None:
    """Stop the scheduler gracefully."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Arrêté.")
