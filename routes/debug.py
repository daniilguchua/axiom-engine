# routes/debug.py
"""
Debug endpoints for development and troubleshooting.
Includes GHOST Repair System - Sanitizer Tournament endpoints.
"""

import logging

from flask import Blueprint, jsonify, request

from core.config import get_cache_manager
from core.cache import DB_PATH
from core.repair_tester import RepairTester
from core.utils import sanitize_mermaid_code

logger = logging.getLogger(__name__)

debug_bp = Blueprint('debug', __name__)
repair_tester = RepairTester()


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

# =============================================================================
# GHOST REPAIR SYSTEM - Sanitizer Tournament
# =============================================================================

@debug_bp.route('/debug/capture-raw', methods=['POST'])
def capture_raw_output():
    """
    Capture raw LLM output for testing through all 5 pipelines.

    Expected JSON:
    {
        "raw_mermaid": "flowchart LR;...",
        "session_id": "optional",
        "sim_id": "optional",
        "step_index": 0,
        "prompt": "optional"
    }

    Returns:
    {
        "test_id": 123,
        "pipelines": {
            "raw": "...",           # Raw output unchanged
            "python": "...",         # After Python sanitizer
            "mermaidjs": "...",      # Will be processed client-side
            "python_then_js": "...", # Python sanitizer output (JS fixer applied client-side)
            "js_then_python": "..."  # Will be processed client-side then sanitized
        }
    }
    """
    try:
        data = request.get_json()

        if not data or 'raw_mermaid' not in data:
            return jsonify({"error": "Missing raw_mermaid in request"}), 400

        raw_mermaid = data['raw_mermaid']
        session_id = data.get('session_id')
        sim_id = data.get('sim_id')
        step_index = data.get('step_index')
        prompt = data.get('prompt')

        # Apply Python sanitizer
        python_sanitized = sanitize_mermaid_code(raw_mermaid)

        # DEBUG: Check newline conversion
        raw_newlines = raw_mermaid.count('\n')
        raw_escaped = raw_mermaid.count('\\n')
        python_newlines = python_sanitized.count('\n')
        python_escaped = python_sanitized.count('\\n')

        logger.info(f"[GHOST] Captured raw output ({len(raw_mermaid)} chars)")
        logger.info(f"[GHOST DEBUG] Raw: {raw_newlines} real newlines, {raw_escaped} escaped \\n")
        logger.info(f"[GHOST DEBUG] Python sanitized: {python_newlines} real newlines, {python_escaped} escaped \\n")

        # Return all pipeline inputs to client for testing
        return jsonify({
            "success": True,
            "raw_mermaid": raw_mermaid,
            "pipelines": {
                "raw": raw_mermaid,
                "python": python_sanitized,
                "mermaidjs": raw_mermaid,  # Client will apply JS fixer
                "python_then_js": python_sanitized,  # Client will apply JS fixer to this
                "js_then_python": raw_mermaid  # Client will apply JS fixer then send back for Python sanitizer
            },
            "metadata": {
                "session_id": session_id,
                "sim_id": sim_id,
                "step_index": step_index,
                "prompt": prompt
            }
        })

    except Exception as e:
        logger.error(f"[GHOST] Error capturing raw output: {e}")
        return jsonify({"error": str(e)}), 500


@debug_bp.route('/debug/log-test-results', methods=['POST'])
def log_test_results():
    """
    Log the results of testing through all 5 pipelines.

    Expected JSON:
    {
        "raw_mermaid": "...",
        "session_id": "optional",
        "sim_id": "optional",
        "step_index": 0,
        "prompt": "optional",
        "test_results": {
            "raw": {"output": "...", "error": "...", "rendered": false},
            "python": {"output": "...", "error": "...", "rendered": true},
            "mermaidjs": {"output": "...", "error": "...", "rendered": true},
            "python_then_js": {"output": "...", "error": "...", "rendered": true},
            "js_then_python": {"output": "...", "error": "...", "rendered": true}
        }
    }

    Returns:
    {
        "test_id": 123,
        "best_method": "PYTHON"
    }
    """
    try:
        data = request.get_json()

        if not data or 'raw_mermaid' not in data or 'test_results' not in data:
            return jsonify({"error": "Missing required fields"}), 400

        raw_mermaid = data['raw_mermaid']
        test_results = data['test_results']
        session_id = data.get('session_id')
        sim_id = data.get('sim_id')
        step_index = data.get('step_index')
        prompt = data.get('prompt')

        # DEBUG: Check what we're receiving from client
        python_output = test_results.get('python', {}).get('output', '')
        python_newlines = python_output.count('\n')
        python_escaped = python_output.count('\\n')
        logger.info(f"[GHOST DEBUG] Received from client - Python output: {python_newlines} real newlines, {python_escaped} escaped \\n")

        # Log to database
        test_id = repair_tester.log_test(
            raw_mermaid=raw_mermaid,
            session_id=session_id,
            sim_id=sim_id,
            step_index=step_index,
            prompt=prompt,
            test_results=test_results
        )

        best_method = repair_tester._determine_best_method(test_results)

        logger.info(f"[GHOST] Logged test #{test_id}, best method: {best_method}")

        return jsonify({
            "success": True,
            "test_id": test_id,
            "best_method": best_method
        })

    except Exception as e:
        logger.error(f"[GHOST] Error logging test results: {e}")
        return jsonify({"error": str(e)}), 500


@debug_bp.route('/debug/apply-python-sanitizer', methods=['POST'])
def apply_python_sanitizer():
    """
    Apply Python sanitizer to code (used for js_then_python pipeline).

    Expected JSON:
    {
        "code": "flowchart LR;..."
    }

    Returns:
    {
        "sanitized": "flowchart LR;..."
    }
    """
    try:
        data = request.get_json()

        if not data or 'code' not in data:
            return jsonify({"error": "Missing code in request"}), 400

        code = data['code']
        sanitized = sanitize_mermaid_code(code)

        return jsonify({
            "success": True,
            "sanitized": sanitized
        })

    except Exception as e:
        logger.error(f"[GHOST] Error applying Python sanitizer: {e}")
        return jsonify({"error": str(e)}), 500


@debug_bp.route('/debug/recent-tests', methods=['GET'])
def get_recent_tests():
    """
    Get recent test results.

    Query params:
    - limit: number of tests to return (default 50)

    Returns:
    {
        "tests": [...]
    }
    """
    try:
        limit = int(request.args.get('limit', 50))
        tests = repair_tester.get_recent_tests(limit=limit)

        return jsonify({
            "success": True,
            "tests": tests
        })

    except Exception as e:
        logger.error(f"[GHOST] Error fetching recent tests: {e}")
        return jsonify({"error": str(e)}), 500


@debug_bp.route('/debug/stats', methods=['GET'])
def get_stats():
    """
    Get statistics about test results.

    Query params:
    - days: number of days to include (default 7)

    Returns:
    {
        "raw_success": 10,
        "python_success": 45,
        "mermaidjs_success": 38,
        "python_then_js_success": 47,
        "js_then_python_success": 42,
        "total_tests": 50,
        "best_method_distribution": {
            "PYTHON_THEN_JS": 20,
            "PYTHON": 15,
            ...
        }
    }
    """
    try:
        days = int(request.args.get('days', 7))
        stats = repair_tester.get_stats(days=days)

        return jsonify({
            "success": True,
            **stats
        })

    except Exception as e:
        logger.error(f"[GHOST] Error fetching stats: {e}")
        return jsonify({"error": str(e)}), 500


@debug_bp.route('/debug/clear-test-database', methods=['POST'])
def clear_test_database():
    """
    Clear all test records from repair_tests database.
    WARNING: This is destructive and cannot be undone!
    """
    try:
        with repair_tester._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM repair_tests")
            deleted = cursor.rowcount
            conn.commit()

        logger.warning(f"🗑️ Cleared {deleted} test records from repair_tests database")

        return jsonify({
            "success": True,
            "deleted": deleted
        })

    except Exception as e:
        logger.error(f"[GHOST] Error clearing test database: {e}")
        return jsonify({"error": str(e)}), 500