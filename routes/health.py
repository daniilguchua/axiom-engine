"""
Health and status endpoints.
"""

from flask import Blueprint, jsonify

from core.config import get_cache_manager, get_configured_api_key, get_session_manager

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "api_configured": bool(get_configured_api_key()), "version": "1.3.0"})


@health_bp.route("/status", methods=["GET"])
def status():
    """Get current system status and metrics."""
    session_metrics = get_session_manager().get_metrics()
    cache_metrics = get_cache_manager().get_cache_stats()

    return jsonify(
        {"sessions": session_metrics, "cache": cache_metrics, "api_configured": bool(get_configured_api_key())}
    )
