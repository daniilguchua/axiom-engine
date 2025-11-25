"""
Repair Testing System - Tests LLM output through all sanitization pipelines.
Logs results to database for analysis.
"""

import sqlite3
import os
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Database path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(CURRENT_DIR, ".axiom_test_cache", "repair_tests.db")

class RepairTester:
    """Tests mermaid code through different sanitization pipelines."""

    def __init__(self):
        self._init_db()

    def _init_db(self):
        """Initialize the repair testing database."""
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

        with self._get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS repair_tests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    sim_id TEXT,
                    step_index INTEGER,
                    prompt TEXT,

                    -- Raw LLM output
                    raw_mermaid TEXT NOT NULL,
                    raw_error TEXT,
                    raw_rendered INTEGER DEFAULT 0,

                    -- Python sanitizer only
                    python_output TEXT,
                    python_error TEXT,
                    python_rendered INTEGER DEFAULT 0,

                    -- Mermaid.js fix only (client-side)
                    mermaidjs_output TEXT,
                    mermaidjs_error TEXT,
                    mermaidjs_rendered INTEGER DEFAULT 0,

                    -- Python then Mermaid.js
                    python_then_js_output TEXT,
                    python_then_js_error TEXT,
                    python_then_js_rendered INTEGER DEFAULT 0,

                    -- Mermaid.js then Python
                    js_then_python_output TEXT,
                    js_then_python_error TEXT,
                    js_then_python_rendered INTEGER DEFAULT 0,

                    -- Metadata
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    best_method TEXT
                )
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_repair_tests_session
                ON repair_tests(session_id)
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_repair_tests_created
                ON repair_tests(created_at DESC)
            """)

            conn.commit()
            logger.info(f"📊 Repair test database initialized at {DB_PATH}")

    @contextmanager
    def _get_connection(self):
        """Get a database connection with row factory."""
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def log_test(
        self,
        raw_mermaid: str,
        session_id: str = None,
        sim_id: str = None,
        step_index: int = None,
        prompt: str = None,
        test_results: Dict[str, Any] = None
    ) -> int:
        """
        Log a repair test to the database.

        Args:
            raw_mermaid: The raw LLM output
            session_id: Session ID
            sim_id: Simulation ID
            step_index: Step index
            prompt: The prompt used to generate this
            test_results: Dict with keys: raw, python, mermaidjs, python_then_js, js_then_python
                         Each value is a dict with: output, error, rendered

        Returns:
            Test ID
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Determine best method
            best_method = self._determine_best_method(test_results)

            cursor.execute("""
                INSERT INTO repair_tests (
                    session_id, sim_id, step_index, prompt,
                    raw_mermaid, raw_error, raw_rendered,
                    python_output, python_error, python_rendered,
                    mermaidjs_output, mermaidjs_error, mermaidjs_rendered,
                    python_then_js_output, python_then_js_error, python_then_js_rendered,
                    js_then_python_output, js_then_python_error, js_then_python_rendered,
                    best_method
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id, sim_id, step_index, prompt,
                raw_mermaid,
                test_results.get('raw', {}).get('error'),
                1 if test_results.get('raw', {}).get('rendered') else 0,
                test_results.get('python', {}).get('output'),
                test_results.get('python', {}).get('error'),
                1 if test_results.get('python', {}).get('rendered') else 0,
                test_results.get('mermaidjs', {}).get('output'),
                test_results.get('mermaidjs', {}).get('error'),
                1 if test_results.get('mermaidjs', {}).get('rendered') else 0,
                test_results.get('python_then_js', {}).get('output'),
                test_results.get('python_then_js', {}).get('error'),
                1 if test_results.get('python_then_js', {}).get('rendered') else 0,
                test_results.get('js_then_python', {}).get('output'),
                test_results.get('js_then_python', {}).get('error'),
                1 if test_results.get('js_then_python', {}).get('rendered') else 0,
                best_method
            ))

            conn.commit()
            test_id = cursor.lastrowid

            logger.info(f"[OK] Logged repair test #{test_id}, best method: {best_method}")
            return test_id

    def _determine_best_method(self, test_results: Dict[str, Any]) -> str:
        """Determine which sanitization method worked best."""
        if not test_results:
            return "NONE"

        # Priority order
        if test_results.get('raw', {}).get('rendered'):
            return "RAW"
        if test_results.get('python', {}).get('rendered'):
            return "PYTHON"
        if test_results.get('mermaidjs', {}).get('rendered'):
            return "MERMAIDJS"
        if test_results.get('python_then_js', {}).get('rendered'):
            return "PYTHON_THEN_JS"
        if test_results.get('js_then_python', {}).get('rendered'):
            return "JS_THEN_PYTHON"

        return "NONE"

    def get_recent_tests(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent repair tests."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM repair_tests
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))
            return [dict(row) for row in cursor.fetchall()]

    def get_stats(self, days: int = 7) -> Dict[str, Any]:
        """Get repair test statistics."""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Success rates by method
            cursor.execute("""
                SELECT
                    SUM(raw_rendered) as raw_success,
                    SUM(python_rendered) as python_success,
                    SUM(mermaidjs_rendered) as mermaidjs_success,
                    SUM(python_then_js_rendered) as python_then_js_success,
                    SUM(js_then_python_rendered) as js_then_python_success,
                    COUNT(*) as total_tests
                FROM repair_tests
                WHERE created_at >= datetime('now', ? || ' days')
            """, (f'-{days}',))

            stats = dict(cursor.fetchone())

            # Best method distribution
            cursor.execute("""
                SELECT best_method, COUNT(*) as count
                FROM repair_tests
                WHERE created_at >= datetime('now', ? || ' days')
                GROUP BY best_method
                ORDER BY count DESC
            """, (f'-{days}',))

            stats['best_method_distribution'] = {
                row['best_method']: row['count']
                for row in cursor.fetchall()
            }

            return stats
