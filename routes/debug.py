"""
Debug endpoints for development and troubleshooting.
Includes repair system sanitizer tournament endpoints.
"""

import logging
import sqlite3

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
            SELECT prompt_key, difficulty, client_verified, 
                   embedding IS NOT NULL as has_embedding, created_at
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

    logger.warning("[CLEANUP] Cache cleared via debug endpoint")
    return jsonify({"status": "cleared"})

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

        logger.info(f"[DEBUG] Captured raw output ({len(raw_mermaid)} chars)")
        logger.info(f"[DEBUG] Raw: {raw_newlines} real newlines, {raw_escaped} escaped \\n")
        logger.info(f"[DEBUG] Python sanitized: {python_newlines} real newlines, {python_escaped} escaped \\n")

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
        logger.error(f"[DEBUG] Error capturing raw output: {e}")
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
        logger.info(f"[DEBUG] Received from client - Python output: {python_newlines} real newlines, {python_escaped} escaped \\n")

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

        logger.info(f"[DEBUG] Logged test #{test_id}, best method: {best_method}")

        return jsonify({
            "success": True,
            "test_id": test_id,
            "best_method": best_method
        })

    except Exception as e:
        logger.error(f"[DEBUG] Error logging test results: {e}")
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
        logger.error(f"[DEBUG] Error applying Python sanitizer: {e}")
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
        logger.error(f"[DEBUG] Error fetching recent tests: {e}")
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
        logger.error(f"[DEBUG] Error fetching stats: {e}")
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

        logger.warning(f"[CLEANUP] Cleared {deleted} test records from repair_tests database")

        return jsonify({
            "success": True,
            "deleted": deleted
        })

    except Exception as e:
        logger.error(f"[DEBUG] Error clearing test database: {e}")
        return jsonify({"error": str(e)}), 500


@debug_bp.route('/debug/llm-diagnostics', methods=['GET'])
def llm_diagnostics():
    """
    Interactive HTML page showing LLM diagnostic information for a session.
    Displays raw LLM responses, validation flow, and database state changes.
    """
    import json

    session_id = request.args.get('session_id')
    if not session_id:
        return jsonify({"error": "session_id required"}), 400
    
    try:
        cache_manager = get_cache_manager()
        diagnostics = cache_manager._database.get_latest_diagnostics(session_id, limit=20)
        
        # Convert JSON strings back to dicts for display
        for diag in diagnostics:
            if diag.get('storage_before_json'):
                try:
                    diag['storage_before'] = json.loads(diag['storage_before_json'])
                except:
                    diag['storage_before'] = []
            if diag.get('storage_after_json'):
                try:
                    diag['storage_after'] = json.loads(diag['storage_after_json'])
                except:
                    diag['storage_after'] = []
            
            # Truncate raw LLM response for display
            if diag.get('llm_raw_response'):
                diag['llm_raw_preview'] = diag['llm_raw_response'][:500]
    except Exception as e:
        logger.error(f"Error retrieving diagnostics: {e}")
        diagnostics = []
    
    # Generate HTML page
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>LLM Diagnostics - Session {session_id[:16]}</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f5f5f5;
                margin: 0;
                padding: 20px;
            }}
            .container {{
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }}
            h1 {{
                color: #333;
                margin-top: 0;
            }}
            .session-info {{
                background: #f9f9f9;
                padding: 10px 15px;
                border-left: 4px solid #4CAF50;
                margin-bottom: 20px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12px;
            }}
            .diagnostic-entry {{
                border: 1px solid #ddd;
                margin-bottom: 20px;
                border-radius: 6px;
                overflow: hidden;
            }}
            .diagnostic-header {{
                background: #f0f7ff;
                padding: 15px;
                border-bottom: 1px solid #ddd;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }}
            .mode-badge {{
                display: inline-block;
                padding: 4px 12px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 12px;
                margin-right: 10px;
            }}
            .mode-badge.new {{
                background: #4CAF50;
                color: white;
            }}
            .mode-badge.continue {{
                background: #2196F3;
                color: white;
            }}
            .mode-badge.qa {{
                background: #FF9800;
                color: white;
            }}
            .timestamp {{
                color: #666;
                font-size: 12px;
            }}
            .diagnostic-body {{
                padding: 15px;
            }}
            .metric {{
                display: grid;
                grid-template-columns: 200px 1fr;
                gap: 15px;
                margin-bottom: 15px;
                padding: 10px;
                background: #fafafa;
                border-radius: 4px;
            }}
            .metric-label {{
                font-weight: bold;
                color: #333;
            }}
            .metric-value {{
                color: #666;
                font-family: monospace;
                font-size: 13px;
            }}
            .step-flow {{
                background: #e8f5e9;
                padding: 15px;
                border-radius: 4px;
                margin: 15px 0;
                font-family: monospace;
                font-size: 13px;
            }}
            .storage-state {{
                background: #f3e5f5;
                padding: 15px;
                border-radius: 4px;
                margin: 15px 0;
            }}
            .storage-label {{
                font-weight: bold;
                color: #7b1fa2;
                margin-bottom: 8px;
            }}
            .storage-items {{
                font-family: monospace;
                font-size: 12px;
                background: white;
                padding: 10px;
                border-radius: 3px;
                overflow-x: auto;
            }}
            .llm-response {{
                background: #fff3e0;
                padding: 15px;
                border-radius: 4px;
                margin: 15px 0;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                max-height: 400px;
                overflow-y: auto;
                border: 1px solid #ffe0b2;
            }}
            .success {{
                color: #4CAF50;
            }}
            .warning {{
                color: #FF9800;
            }}
            .error {{
                color: #f44336;
            }}
            .integrity-check {{
                padding: 10px 15px;
                border-radius: 4px;
                margin: 15px 0;
            }}
            .integrity-pass {{
                background: #c8e6c9;
                color: #2e7d32;
                border: 1px solid #81c784;
            }}
            .integrity-fail {{
                background: #ffcdd2;
                color: #c62828;
                border: 1px solid #ef5350;
            }}
            .empty-message {{
                text-align: center;
                color: #999;
                padding: 40px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔍 LLM Diagnostics Viewer</h1>
            <div class="session-info">
                Session ID: {session_id}
            </div>
            
            {''.join(f'''
            <div class="diagnostic-entry">
                <div class="diagnostic-header">
                    <div>
                        <span class="mode-badge {diag['mode'].split('_')[0].lower()}">
                            {diag['mode']}
                        </span>
                        <strong>{diag['difficulty']}</strong>
                    </div>
                    <div class="timestamp">{diag['created_at']}</div>
                </div>
                <div class="diagnostic-body">
                    <div class="step-flow">
                        <span class="{'success' if diag['validation_output_count'] == diag['validation_input_count'] else 'warning'}">
                            LLM generated: {diag['llm_step_count']} steps
                        </span>
                        → Validation: {diag['validation_input_count']} → {diag['validation_output_count']} steps
                        → Stored {diag['validation_output_count']} new step(s)
                    </div>
                    
                    <div class="metric">
                        <div class="metric-label">Storage Before:</div>
                        <div class="metric-value">{diag.get('storage_before_json', '[]')[:100]}...</div>
                    </div>
                    
                    <div class="metric">
                        <div class="metric-label">Storage After:</div>
                        <div class="metric-value">{diag.get('storage_after_json', '[]')[:100]}...</div>
                    </div>
                    
                    <div class="integrity-check {'integrity-pass' if diag['integrity_check_pass'] else 'integrity-fail'}">
                        {'✅ Integrity OK' if diag['integrity_check_pass'] else f'❌ Integrity Failed: {diag['integrity_error']}'}
                    </div>
                    
                    {'<div class="llm-response"><strong>Raw LLM Response (first 500 chars):</strong><pre>' + diag.get('llm_raw_preview', '(empty)').replace('<', '&lt;').replace('>', '&gt;') + '</pre></div>' if diag.get('llm_raw_preview') else ''}
                </div>
            </div>
            ''' for diag in diagnostics) if diagnostics else '<div class="empty-message">No diagnostics found for this session.</div>'}
        </div>
    </body>
    </html>
    """
    
    from flask import Response
    return Response(html, mimetype='text/html')


@debug_bp.route('/api/debug/repairs-detailed', methods=['GET'])
def get_repairs_detailed():
    """
    Get detailed repair test records from repair_tests.db for dashboard inspection.

    Query parameters:
    - days: Number of days to look back (default 7)
    - method: Filter by best method (RAW, PYTHON, MERMAIDJS, PYTHON_THEN_JS, JS_THEN_PYTHON, NONE)
    - status: Filter by status (success, failure, or empty for all)
    - limit: Max repairs to return (default 100, max 500)

    Returns:
    {
        "repairs": [
            {
                "id": 123,
                "created_at": "2024-01-15T10:30:00",
                "session_id": "session-abc",
                "sim_id": "sim-xyz",
                "step_index": 5,
                "best_method": "PYTHON_THEN_JS",
                "input_code": "... original mermaid ...",
                "output_code": "... selected best output ...",
                "error_before": "... error message ...",
                "error_after": null,
                "was_successful": true,
                "duration_ms": null
            }
        ],
        "trend": [
            {"date": "2024-01-10", "success_count": 42, "failure_count": 3},
            ...
        ]
    }
    """
    try:
        days = int(request.args.get('days', 7))
        method_filter = request.args.get('method', '').strip().upper()
        status_filter = request.args.get('status', '').strip()
        limit = min(int(request.args.get('limit', 100)), 500)

        query = """
            SELECT
                id, created_at, session_id, sim_id, step_index, prompt,
                raw_mermaid, raw_error, raw_rendered,
                python_output, python_error, python_rendered,
                mermaidjs_output, mermaidjs_error, mermaidjs_rendered,
                python_then_js_output, python_then_js_error, python_then_js_rendered,
                js_then_python_output, js_then_python_error, js_then_python_rendered,
                best_method
            FROM repair_tests
            WHERE datetime(created_at) > datetime('now', '-' || ? || ' days')
        """
        params = [days]

        if method_filter:
            query += " AND best_method = ?"
            params.append(method_filter)

        if status_filter == 'success':
            query += " AND best_method != 'NONE'"
        elif status_filter == 'failure':
            query += " AND best_method = 'NONE'"

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        with repair_tester._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()

        repairs = []
        for row in rows:
            best_method = (row['best_method'] or 'NONE').upper()
            raw_mermaid = row['raw_mermaid']
            raw_error = row['raw_error']
            python_output = row['python_output']
            python_error = row['python_error']
            mermaidjs_output = row['mermaidjs_output']
            mermaidjs_error = row['mermaidjs_error']
            python_then_js_output = row['python_then_js_output']
            python_then_js_error = row['python_then_js_error']
            js_then_python_output = row['js_then_python_output']
            js_then_python_error = row['js_then_python_error']

            output_code = {
                'RAW': raw_mermaid,
                'PYTHON': python_output,
                'MERMAIDJS': mermaidjs_output,
                'PYTHON_THEN_JS': python_then_js_output,
                'JS_THEN_PYTHON': js_then_python_output,
                'NONE': raw_mermaid
            }.get(best_method, raw_mermaid)

            error_after = {
                'RAW': raw_error,
                'PYTHON': python_error,
                'MERMAIDJS': mermaidjs_error,
                'PYTHON_THEN_JS': python_then_js_error,
                'JS_THEN_PYTHON': js_then_python_error,
                'NONE': raw_error
            }.get(best_method, raw_error)

            repairs.append({
                'id': row['id'],
                'created_at': row['created_at'],
                'session_id': row['session_id'],
                'sim_id': row['sim_id'],
                'step_index': row['step_index'],
                'best_method': best_method,
                'input_code': raw_mermaid,
                'output_code': output_code,
                'error_before': raw_error,
                'error_after': error_after,
                'was_successful': best_method != 'NONE',
                'duration_ms': None
            })

        trend_query = """
            SELECT
                DATE(created_at) as date,
                SUM(CASE WHEN best_method != 'NONE' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN best_method = 'NONE' THEN 1 ELSE 0 END) as failure_count,
                COUNT(*) as total_count
            FROM repair_tests
            WHERE datetime(created_at) > datetime('now', '-7 days')
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """

        with repair_tester._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(trend_query)
            trend = [dict(row) for row in cursor.fetchall()]

        return jsonify({
            "success": True,
            "repairs": repairs,
            "trend": trend
        })

    except Exception as e:
        logger.error(f"Error fetching detailed repairs: {e}")
        return jsonify({"error": str(e)}), 500
