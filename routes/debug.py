# routes/debug.py
"""
Debug endpoints for development and troubleshooting.
"""

import logging

from flask import Blueprint, jsonify

from core.config import get_cache_manager
from core.cache import DB_PATH

logger = logging.getLogger(__name__)

debug_bp = Blueprint('debug', __name__)


@debug_bp.route('/debug/cache', methods=['GET'])
def debug_cache():
    """View cache contents for debugging."""
    cache_manager = get_cache_manager()
    stats = cache_manager.get_cache_stats()
    
    with cache_manager._get_connection() as conn:
        cursor = conn.cursor()
        
        # Recent cached simulations
        cursor.execute("""
            SELECT prompt_key, status, step_count, client_verified, access_count, created_at
            FROM simulation_cache
            ORDER BY created_at DESC
            LIMIT 10
        """)
        cached = [dict(row) for row in cursor.fetchall()]
        
        # Recent repairs
        cursor.execute("""
            SELECT repair_method, was_successful, repair_duration_ms, created_at
            FROM repair_logs
            ORDER BY created_at DESC
            LIMIT 10
        """)
        repairs = [dict(row) for row in cursor.fetchall()]
        
        # Recent graphs
        cursor.execute("""
            SELECT source_type, was_repaired, created_at
            FROM graph_dataset
            ORDER BY created_at DESC
            LIMIT 10
        """)
        graphs = [dict(row) for row in cursor.fetchall()]
    
    return jsonify({
        "stats": stats,
        "recent_cached": cached,
        "recent_repairs": repairs,
        "recent_graphs": graphs,
        "db_path": DB_PATH
    })


@debug_bp.route('/debug/cache/clear', methods=['POST'])
def debug_clear_cache():
    """Clear cache for testing (use carefully!)."""
    cache_manager = get_cache_manager()
    
    with cache_manager._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM simulation_cache")
        cursor.execute("DELETE FROM broken_simulations")
        cursor.execute("DELETE FROM pending_repairs")
        conn.commit()
    
    logger.warning("🗑️ Cache cleared via debug endpoint")
    return jsonify({"status": "cleared"})