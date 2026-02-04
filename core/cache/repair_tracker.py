# core/cache/repair_tracker.py
"""
Repair tracking for broken simulations and pending repairs.
Manages simulation break state and repair workflow coordination.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class RepairTracker:
    """
    Tracks broken simulations and pending repairs.
    Prevents caching of broken content and coordinates repair workflow.
    """
    
    def __init__(self, database):
        """
        Initialize repair tracker with database connection.
        
        Args:
            database: CacheDatabase instance for DB operations
        """
        self.db = database
    
    def is_simulation_broken(self, prompt: str, max_age_hours: int = 24, get_hash_callback=None) -> bool:
        """
        Check if a simulation is marked as broken.
        Broken status expires after max_age_hours to allow retries.
        
        Args:
            prompt: The user prompt to check
            max_age_hours: Hours before broken status expires
            get_hash_callback: Callback to get prompt hash
            
        Returns:
            True if broken and not expired, False otherwise
        """
        if not get_hash_callback:
            return False
            
        prompt_hash = get_hash_callback(prompt)
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT created_at FROM broken_simulations 
                WHERE prompt_hash = ?
            """, (prompt_hash,))
            row = cursor.fetchone()
        
            if not row:
                return False
        
            # Check if the broken status has expired
            created_at = datetime.fromisoformat(row[0]) if isinstance(row[0], str) else row[0]
            age = datetime.now() - created_at
        
            if age.total_seconds() > max_age_hours * 3600:
                # Expired - clean it up
                cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = ?", (prompt_hash,))
                conn.commit()
                logger.info(f"🕐 Broken status expired for prompt hash {prompt_hash[:16]}...")
                return False
        
            return True
    
    def mark_simulation_broken(
        self,
        session_id: str,
        prompt_key: str,
        step_index: int,
        failure_reason: str = "Render failure after all repair attempts",
        get_hash_callback=None
    ) -> None:
        """
        Mark a simulation as broken for a specific session.
        Other sessions can still attempt the same prompt.
        
        Args:
            session_id: The session ID
            prompt_key: The prompt that failed
            step_index: Which step failed
            failure_reason: Description of failure
            get_hash_callback: Callback to get prompt hash
        """
        if not get_hash_callback:
            logger.error("Cannot mark broken: no hash callback provided")
            return
            
        clean_key = prompt_key.strip()
        prompt_hash = get_hash_callback(clean_key)
    
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            try:
                # Use session_id + prompt_hash as unique key
                cursor.execute("""
                    INSERT INTO broken_simulations 
                    (session_id, prompt_key, prompt_hash, failed_step_index, failure_reason, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(prompt_hash) DO UPDATE SET
                        session_id = excluded.session_id,
                        failed_step_index = excluded.failed_step_index,
                        failure_reason = excluded.failure_reason,
                        created_at = excluded.created_at
                """, (session_id, clean_key, prompt_hash, step_index, failure_reason, datetime.now()))
            
                # Also clear any pending repairs since we're giving up
                cursor.execute("""
                    UPDATE pending_repairs 
                    SET status = 'failed', resolved_at = ?
                    WHERE session_id = ? AND prompt_key = ? AND status = 'pending'
                """, (datetime.now(), session_id, clean_key))
            
                conn.commit()
                logger.warning(f"🚫 Simulation marked broken (session {session_id[:16]}...): '{clean_key[:40]}...' at step {step_index}")
            except Exception as e:
                logger.error(f"Failed to mark simulation broken: {e}")
    
    def clear_broken_status(self, prompt: str, get_hash_callback=None) -> bool:
        """
        Clear the broken status for a simulation (admin function).
        Use if the simulation has been fixed and should be re-cached.
        
        Args:
            prompt: The prompt to clear
            get_hash_callback: Callback to get prompt hash
            
        Returns:
            True if status was cleared, False otherwise
        """
        if not get_hash_callback:
            return False
            
        prompt_hash = get_hash_callback(prompt)
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = ?", (prompt_hash,))
            deleted = cursor.rowcount > 0
            if deleted:
                logger.info(f"✅ Broken status cleared for: '{prompt[:40]}...'")
            return deleted
    
    def mark_repair_pending(
        self,
        session_id: str,
        prompt_key: str,
        step_index: int
    ) -> None:
        """
        Mark that a step is being repaired (prevents caching).
        
        Args:
            session_id: The session ID
            prompt_key: The prompt being repaired
            step_index: Which step is being repaired
        """
        # Opportunistic cleanup: clear stale pending repairs before adding new one
        self.cleanup_stale_pending_repairs(max_age_minutes=15)

        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO pending_repairs (session_id, prompt_key, step_index, status, created_at)
                VALUES (?, ?, ?, 'pending', ?)
                ON CONFLICT(session_id, prompt_key, step_index) DO UPDATE SET
                    status = 'pending',
                    created_at = excluded.created_at,
                    resolved_at = NULL
            """, (session_id, prompt_key.strip(), step_index, datetime.now()))
            logger.debug(f"[REPAIR] Marked pending: session={session_id[:16]}..., step={step_index}")
    
    def mark_repair_resolved(
        self,
        session_id: str,
        prompt_key: str,
        step_index: int,
        success: bool = True
    ) -> None:
        """
        Mark a specific repair as resolved.
        
        Args:
            session_id: The session ID
            prompt_key: The prompt that was repaired
            step_index: Which step was repaired
            success: Whether repair was successful
        """
        status = 'resolved' if success else 'failed'
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE pending_repairs 
                SET status = ?, resolved_at = ?
                WHERE session_id = ? AND prompt_key = ? AND step_index = ?
            """, (status, datetime.now(), session_id, prompt_key.strip(), step_index))
            logger.debug(f"✅ Repair resolved: session={session_id[:16]}..., step={step_index}, success={success}")
    
    def clear_pending_repairs(
        self,
        session_id: str,
        prompt_key: str
    ) -> int:
        """
        Clear ALL pending repairs for a session/prompt.
        
        Called when client confirms all steps rendered successfully.
        Logic: If client rendered everything and called /confirm-complete,
        then any pending repairs must have worked.
        
        Args:
            session_id: The session ID
            prompt_key: The prompt to clear repairs for
            
        Returns:
            Number of repairs cleared
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE pending_repairs 
                SET status = 'resolved', resolved_at = ?
                WHERE session_id = ? AND prompt_key = ? AND status = 'pending'
            """, (datetime.now(), session_id, prompt_key.strip()))
            cleared = cursor.rowcount
            if cleared > 0:
                logger.info(f"✅ Cleared {cleared} pending repair(s) for '{prompt_key[:40]}...'")
            return cleared
    
    def clear_all_pending_repairs(self, session_id: str) -> int:
        """
        Clear ALL pending repair flags for a session (used on page refresh).
        
        Args:
            session_id: The session ID to clear
            
        Returns:
            Number of repairs cleared
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM pending_repairs
                WHERE session_id = ?
            """, (session_id,))
            count = cursor.rowcount
            conn.commit()
        return count
    
    def has_pending_repair(self, session_id: str, prompt_key: str) -> bool:
        """
        Check if there are any pending repairs for this session/prompt.
        
        Args:
            session_id: The session ID
            prompt_key: The prompt to check
            
        Returns:
            True if repairs are pending, False otherwise
        """
        # Opportunistic cleanup: clear stale pending repairs before checking
        self.cleanup_stale_pending_repairs(max_age_minutes=15)

        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) FROM pending_repairs
                WHERE session_id = ? AND prompt_key = ? AND status = 'pending'
            """, (session_id, prompt_key.strip()))
            count = cursor.fetchone()[0]
            return count > 0
    
    def get_pending_repairs(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Get all pending repairs for a session.
        
        Args:
            session_id: The session ID
            
        Returns:
            List of pending repair records
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT prompt_key, step_index, created_at
                FROM pending_repairs
                WHERE session_id = ? AND status = 'pending'
                ORDER BY created_at
            """, (session_id,))
            return [dict(row) for row in cursor.fetchall()]

    def cleanup_stale_pending_repairs(self, max_age_minutes: int = 15) -> int:
        """
        Clear pending repairs older than max_age_minutes.

        Rationale: If a repair has been "pending" for >15 minutes, either:
        1. The session died/crashed before calling /confirm-complete
        2. The repair genuinely failed but client never reported it
        3. The user abandoned the session

        In all cases, we should clear the pending status to avoid blocking cache.

        Args:
            max_age_minutes: Age threshold in minutes (default: 15)

        Returns:
            Number of stale repairs cleaned up
        """
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cutoff = datetime.now() - timedelta(minutes=max_age_minutes)

            cursor.execute("""
                UPDATE pending_repairs
                SET status = 'timeout', resolved_at = ?
                WHERE status = 'pending' AND created_at < ?
            """, (datetime.now(), cutoff))

            cleaned = cursor.rowcount
            if cleaned > 0:
                logger.info(f"🧹 Cleaned up {cleaned} stale pending repair(s) older than {max_age_minutes} minutes")
            return cleaned
