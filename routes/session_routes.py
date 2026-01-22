# routes/session_routes.py
"""
Session management endpoints.
"""

import logging

from flask import Blueprint, request, jsonify, g

from core.config import get_session_manager
from core.decorators import validate_session

logger = logging.getLogger(__name__)

session_bp = Blueprint('session', __name__)


@session_bp.route('/reset', methods=['POST'])
@validate_session
def reset_endpoint():
    """Reset a session (clear history, keep vector store)."""
    session_id = g.session_id
    session_manager = get_session_manager()
    
    try:
        success = session_manager.reset_session(session_id)
        
        if success:
            logger.info(f"🧹 Session reset: {session_id[:16]}...")
            return jsonify({"status": "success"}), 200
        else:
            return jsonify({"status": "session_not_found"}), 404
            
    except Exception as e:
        logger.exception(f"Reset failed: {e}")
        return jsonify({"error": str(e)}), 500


@session_bp.route('/session/metrics', methods=['GET'])
def session_metrics():
    """Get session manager metrics."""
    session_manager = get_session_manager()
    return jsonify(session_manager.get_metrics())