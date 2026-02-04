# core/cache/repair_logger.py
"""
Comprehensive logging for repair operations.
Tracks repair attempts, statistics, and raw mermaid code for ML training.
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class RepairLogger:
    """
    Logs repair attempts and statistics for analysis and ML training.
    Tracks tiered repair system performance.
    """
    
    def __init__(self, database):
        """
        Initialize repair logger with database connection.
        
        Args:
            database: CacheDatabase instance for DB operations
        """
        self.db = database
    
    def log_repair(
        self,
        repair_method: str,
        broken_code: str,
        error_msg: str,
        fixed_code: str,
        success: bool = True,
        session_id: Optional[str] = None,
        duration_ms: Optional[int] = None
    ) -> None:
        """
        Log a repair attempt for analysis (legacy method).
        
        Args:
            repair_method: Name of repair method used
            broken_code: Original broken code
            error_msg: Error message
            fixed_code: Repaired code
            success: Whether repair was successful
            session_id: Session ID if available
            duration_ms: Repair duration in milliseconds
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    INSERT INTO repair_logs 
                    (session_id, repair_method, broken_code, error_msg, fixed_code, 
                     was_successful, repair_duration_ms, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id, repair_method, broken_code, error_msg,
                    fixed_code, success, duration_ms, datetime.now()
                ))
                logger.info(f"[REPAIR] Logged: method={repair_method}, success={success}")
            except Exception as e:
                logger.error(f"Repair log failed: {e}")
    
    def log_repair_attempt(
        self,
        session_id: str,
        sim_id: str,
        step_index: int,
        tier: int,
        tier_name: str,
        attempt_number: int,
        input_code: str,
        output_code: str,
        error_before: str,
        error_after: Optional[str],
        was_successful: bool,
        duration_ms: int
    ) -> None:
        """
        Log a granular repair attempt with tier tracking.
        
        Tiers:
        - 1: Python sanitizer only (TIER1_PYTHON)
        - 2: Python + JS sanitizer (TIER2_PYTHON_JS)  
        - 3: LLM repair + Python sanitizer (TIER3_LLM_PYTHON)
        - 4: LLM repair + Python + JS sanitizer (TIER3_LLM_PYTHON_JS)
        
        Args:
            session_id: Session ID
            sim_id: Simulation ID
            step_index: Step number
            tier: Repair tier (1-4)
            tier_name: Human-readable tier name
            attempt_number: Attempt number within session
            input_code: Code before repair
            output_code: Code after repair
            error_before: Error message before repair
            error_after: Error message after repair (if failed)
            was_successful: Whether repair worked
            duration_ms: Time taken in milliseconds
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    INSERT INTO repair_attempts 
                    (session_id, sim_id, step_index, tier, tier_name, attempt_number,
                     input_code, output_code, error_before, error_after, 
                     was_successful, duration_ms, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id, sim_id, step_index, tier, tier_name, attempt_number,
                    input_code[:5000] if input_code else None, 
                    output_code[:5000] if output_code else None, 
                    error_before[:1000] if error_before else None, 
                    error_after[:1000] if error_after else None,
                    was_successful, duration_ms, datetime.now()
                ))

                status = "SUCCESS" if was_successful else "FAILED"
                logger.info(f"[REPAIR] {status}: tier={tier_name}, step={step_index}, duration={duration_ms}ms")
            except Exception as e:
                logger.error(f"Repair attempt log failed: {e}")
                
        self._update_repair_stats(tier, was_successful, duration_ms)
    
    def _update_repair_stats(self, tier: int, success: bool, duration_ms: int) -> None:
        """
        Update daily aggregated repair stats.
        
        Args:
            tier: Repair tier (1-4)
            success: Whether repair was successful
            duration_ms: Time taken
        """
        today = datetime.now().strftime('%Y-%m-%d')
        
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get or create today's row
            cursor.execute("SELECT id FROM repair_stats WHERE date = ?", (today,))
            row = cursor.fetchone()
            
            if not row:
                cursor.execute("""
                    INSERT INTO repair_stats (date, updated_at)
                    VALUES (?, ?)
                """, (today, datetime.now()))
            
            # Update the appropriate counter
            if success:
                if tier == 1:
                    cursor.execute("""
                        UPDATE repair_stats 
                        SET tier1_python_success = tier1_python_success + 1,
                            total_attempts = total_attempts + 1,
                            updated_at = ?
                        WHERE date = ?
                    """, (datetime.now(), today))
                elif tier == 2:
                    cursor.execute("""
                        UPDATE repair_stats 
                        SET tier2_js_success = tier2_js_success + 1,
                            total_attempts = total_attempts + 1,
                            updated_at = ?
                        WHERE date = ?
                    """, (datetime.now(), today))
                elif tier in (3, 4):
                    cursor.execute("""
                        UPDATE repair_stats 
                        SET tier3_llm_success = tier3_llm_success + 1,
                            total_attempts = total_attempts + 1,
                            updated_at = ?
                        WHERE date = ?
                    """, (datetime.now(), today))
            else:
                cursor.execute("""
                    UPDATE repair_stats 
                    SET total_failures = total_failures + 1,
                        total_attempts = total_attempts + 1,
                        updated_at = ?
                    WHERE date = ?
                """, (datetime.now(), today))
    
    def get_repair_stats(self, days: int = 7) -> Dict[str, Any]:
        """
        Get repair statistics for the last N days.
        
        Args:
            days: Number of days to look back
            
        Returns:
            Dictionary with repair statistics
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    SUM(tier1_python_success) as tier1,
                    SUM(tier2_js_success) as tier2,
                    SUM(tier3_llm_success) as tier3,
                    SUM(total_failures) as failures,
                    SUM(total_attempts) as total
                FROM repair_stats
                WHERE date >= date('now', ?)
            """, (f'-{days} days',))
            
            row = cursor.fetchone()
            
            if not row or not row[4]:
                return {
                    "tier1_python_fixes": 0,
                    "tier2_js_fixes": 0,
                    "tier3_llm_fixes": 0,
                    "total_failures": 0,
                    "total_attempts": 0,
                    "success_rate": 0,
                    "tier1_percentage": 0,
                    "tier2_percentage": 0,
                    "tier3_percentage": 0,
                    "days": days
                }
            
            total = row[4] or 1
            successes = (row[0] or 0) + (row[1] or 0) + (row[2] or 0)
            
            return {
                "tier1_python_fixes": row[0] or 0,
                "tier2_js_fixes": row[1] or 0,
                "tier3_llm_fixes": row[2] or 0,
                "total_failures": row[3] or 0,
                "total_attempts": total,
                "success_rate": round(successes / total * 100, 1) if total > 0 else 0,
                "tier1_percentage": round((row[0] or 0) / total * 100, 1) if total > 0 else 0,
                "tier2_percentage": round((row[1] or 0) / total * 100, 1) if total > 0 else 0,
                "tier3_percentage": round((row[2] or 0) / total * 100, 1) if total > 0 else 0,
                "days": days
            }
    
    def get_recent_repair_attempts(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get recent repair attempts for debugging.
        
        Args:
            limit: Maximum number of attempts to return
            
        Returns:
            List of recent repair attempts
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT tier_name, step_index, was_successful, duration_ms,
                       error_before, created_at
                FROM repair_attempts
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))

            return [
                {
                    "tier": row[0],
                    "step": row[1],
                    "success": bool(row[2]),
                    "duration_ms": row[3],
                    "error": row[4][:100] if row[4] else None,
                    "time": str(row[5])
                }
                for row in cursor.fetchall()
            ]

    def log_raw_mermaid(
        self,
        session_id: str,
        sim_id: str,
        step_index: int,
        raw_mermaid_code: str,
        initial_render_success: bool = False,
        initial_error_msg: Optional[str] = None,
        required_repair: bool = False,
        repair_tier: Optional[str] = None,
        final_success: bool = False
    ) -> None:
        """
        Log raw mermaid code from LLM for analysis.

        This captures the mermaid field BEFORE any sanitization or repair,
        allowing us to diagnose where errors originate.
        
        Args:
            session_id: Session ID
            sim_id: Simulation ID
            step_index: Step number
            raw_mermaid_code: Raw code from LLM
            initial_render_success: Whether it rendered without fixes
            initial_error_msg: Error message if initial render failed
            required_repair: Whether repair was needed
            repair_tier: Which repair tier was used
            final_success: Whether it ultimately worked
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            try:
                # Analyze the raw code
                has_newlines = '\n' in raw_mermaid_code
                newline_count = raw_mermaid_code.count('\n')
                escaped_newline_count = raw_mermaid_code.count('\\n')
                char_length = len(raw_mermaid_code)

                cursor.execute("""
                    INSERT INTO raw_mermaid_logs
                    (session_id, sim_id, step_index, raw_mermaid_code,
                     has_newlines, newline_count, escaped_newline_count, char_length,
                     initial_render_success, initial_error_msg, required_repair,
                     repair_tier, final_success, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id, sim_id, step_index, raw_mermaid_code,
                    has_newlines, newline_count, escaped_newline_count, char_length,
                    initial_render_success, initial_error_msg, required_repair,
                    repair_tier, final_success, datetime.now()
                ))

                logger.info(f"📝 Logged raw mermaid: step={step_index}, newlines={newline_count}, success={initial_render_success}")
            except Exception as e:
                logger.error(f"Raw mermaid log failed: {e}")

    def get_raw_mermaid_stats(self, days: int = 7) -> Dict[str, Any]:
        """
        Get statistics on raw mermaid code from LLM.
        
        Args:
            days: Number of days to look back
            
        Returns:
            Dictionary with mermaid code statistics
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()

            # Get overall stats
            cursor.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN initial_render_success = 1 THEN 1 ELSE 0 END) as immediate_success,
                    SUM(CASE WHEN required_repair = 1 THEN 1 ELSE 0 END) as needed_repair,
                    SUM(CASE WHEN final_success = 1 THEN 1 ELSE 0 END) as final_success,
                    SUM(CASE WHEN has_newlines = 0 THEN 1 ELSE 0 END) as missing_newlines,
                    AVG(newline_count) as avg_newlines,
                    AVG(char_length) as avg_length
                FROM raw_mermaid_logs
                WHERE created_at >= date('now', ?)
            """, (f'-{days} days',))

            row = cursor.fetchone()

            if not row or not row[0]:
                return {
                    "total": 0,
                    "immediate_success_rate": 0,
                    "repair_rate": 0,
                    "final_success_rate": 0,
                    "missing_newlines_rate": 0,
                    "avg_newlines": 0,
                    "avg_length": 0
                }

            total = row[0]

            return {
                "total": total,
                "immediate_success": row[1],
                "needed_repair": row[2],
                "final_success": row[3],
                "missing_newlines": row[4],
                "immediate_success_rate": round((row[1] or 0) / total * 100, 1),
                "repair_rate": round((row[2] or 0) / total * 100, 1),
                "final_success_rate": round((row[3] or 0) / total * 100, 1),
                "missing_newlines_rate": round((row[4] or 0) / total * 100, 1),
                "avg_newlines": round(row[5] or 0, 1),
                "avg_length": round(row[6] or 0, 0),
                "days": days
            }

    def get_failed_raw_mermaid(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get recent failed mermaid codes for debugging.
        
        Args:
            limit: Maximum number of failures to return
            
        Returns:
            List of failed mermaid code samples
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT step_index, raw_mermaid_code, initial_error_msg,
                       has_newlines, newline_count, repair_tier, final_success, created_at
                FROM raw_mermaid_logs
                WHERE initial_render_success = 0
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))

            return [
                {
                    "step": row[0],
                    "code": row[1][:300] + "..." if len(row[1]) > 300 else row[1],
                    "error": row[2],
                    "has_newlines": bool(row[3]),
                    "newline_count": row[4],
                    "repair_tier": row[5],
                    "final_success": bool(row[6]),
                    "time": str(row[7])
                }
                for row in cursor.fetchall()
            ]
