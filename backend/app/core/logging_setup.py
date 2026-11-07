"""JSON logging and structured logs for centralized observability."""

import logging
import json
from pythonjsonlogger import jsonlogger
from app.config import get_settings

settings = get_settings()


def setup_logging():
    """Configure structured JSON logging."""
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # JSON formatter for machine parsing
    json_handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        '%(timestamp)s %(level)s %(name)s %(message)s %(extra_fields)s'
    )
    json_handler.setFormatter(formatter)
    logger.addHandler(json_handler)
    
    # Also add standard handler for readability
    std_handler = logging.StreamHandler()
    std_handler.setFormatter(
        logging.Formatter('[%(levelname)s] %(name)s - %(message)s')
    )
    logger.addHandler(std_handler)
    
    return logger
