"""
AXIOM Engine - Configuration and Manager Initialization
Central configuration module to avoid circular imports.
"""

import logging
import os

from google import genai

from core.cache import DB_PATH, CacheManager
from core.session import SessionManager
from core.utils import get_api_key

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

genai_client = None
api_key = None


def init_api_key():
    """Initialize the Gemini API key and create client. Call once at startup."""
    global genai_client, api_key
    try:
        api_key = get_api_key()
        genai_client = genai.Client(api_key=api_key)
        logger.info("[OK] Gemini API configured successfully")
    except OSError as e:
        logger.error(f"[ERROR] {e}")
        api_key = None
        genai_client = None


def get_genai_client():
    """Get the initialized Gemini client."""
    return genai_client


def get_configured_api_key():
    """Get the configured API key (may be None if not configured)."""
    return api_key


session_manager = None
cache_manager = None


def init_managers():
    """Initialize the session and cache managers. Call once at startup."""
    global session_manager, cache_manager
    session_manager = SessionManager(ttl_minutes=60)
    cache_manager = CacheManager(db_path=DB_PATH)
    logger.info("[OK] Managers initialized")


def get_session_manager() -> SessionManager:
    """Get the session manager instance."""
    if session_manager is None:
        raise RuntimeError("SessionManager not initialized. Call init_managers() first.")
    return session_manager


def get_cache_manager() -> CacheManager:
    """Get the cache manager instance."""
    if cache_manager is None:
        raise RuntimeError("CacheManager not initialized. Call init_managers() first.")
    return cache_manager


def get_cors_config():
    """Get CORS configuration from environment."""
    return {
        r"/*": {
            "origins": os.environ.get("ALLOWED_ORIGINS", "*").split(","),
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"],
        }
    }


def init_all():
    """Initialize all configuration. Call once at app startup."""
    init_api_key()
    init_managers()
