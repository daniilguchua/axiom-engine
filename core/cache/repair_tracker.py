# core/cache/repair_tracker.py
"""
Repair tracking for broken simulations and pending repairs.
Manages simulation break state and repair workflow coordination.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List
import hashlib

logger = logging.getLogger(__name__)


class RepairTracker:
    """
    Tracks broken simulations and pending repairs.
    Prevents caching of broken content and coordinates repair workflow.
    
    Changes in Phase 1 + Phase 2-Lite:
    - Removed callback parameter (handles hashing internally)
    - Added retry count tracking
    - Distinguishes temporary vs permanent broken status
    - Smarter expiration logic based on retry attempts
    """
    
    MAX_RETRY_COUNT = 3  # After 3 failures, mark as permanently broken
    RETRY_COOLDOWN_HOURS = 24  # Wait 24 hours between retries
    
    def __init__(self, database):
        """
        Initialize repair tracker with database connection.
        
        Args:
            database: CacheDatabase instance for DB operations
        """
        self.db = database
        logger.info("🔧 RepairTracker initialized with smart retry logic")
    
    def _get_prompt_hash(self, prompt: str) -> str:
        """Generate consistent hash for prompt."""
        return hashlib.sha256(prompt.strip().lower().encode()).hexdigest()
    
    def is_simulation_broken(self, prompt: str, difficulty: str = "medium") -> bool:
        """
        Check if a simulation is marked as broken.
        
        Logic:
        - If permanently broken (retry_count >= MAX_RETRY_COUNT): return True
        - If temporarily broken but cooldown expired: return False (allow retry)
        - If temporarily broken within cooldown: return True
        
        Args:
            prompt: The user prompt to check
            difficulty: The difficulty level of the simulation
            
        Returns:
            True if broken and should not be cached/retrieved, False otherwise
        """
        prompt_hash = self._get_prompt_hash(prompt)
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT retry_count, last_retry_at, is_permanently_broken 
                FROM broken_simulations 
                WHERE prompt_hash = ? AND difficulty = ?
            """, (prompt_hash, difficulty))
            row = cursor.fetchone()
        
            if not row:
                return False
            
            retry_count, last_retry_str, is_permanently_broken = row
            
            # If permanently broken, always return True
            if is_permanently_broken:
                logger.debug(f"❌ Simulation permanently broken: {prompt[:40]}... (retries: {retry_count})")
                return True
            
            # Check if cooldown period has expired
            last_retry_at = datetime.fromisoformat(last_retry_str) if isinstance(last_retry_str, str) else last_retry_str
            age = datetime.now() - last_retry_at
            
            if age.total_seconds() > self.RETRY_COOLDOWN_HOURS * 3600:
                # Cooldown expired - allow retry by removing temporary broken status
                cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = ? AND difficulty = ?", 
                             (prompt_hash, difficulty))
                conn.commit()
                logger.info(f"🔄 Retry cooldown expired for: {prompt[:40]}... (attempt {retry_count}/{self.MAX_RETRY_COUNT})")
                return False
            
            # Still within cooldown - keep blocked
            hours_remaining = (self.RETRY_COOLDOWN_HOURS * 3600 - age.total_seconds()) / 3600
            logger.debug(f"⏳ Simulation in cooldown: {prompt[:40]}... ({hours_remaining:.1f}h remaining)")
            return True
    
    def mark_simulation_broken(
        self,
        prompt: str,
        difficulty: str,
        reason: str = ""
    ) -> bool:
        """
        Mark a simulation as broken with smart retry tracking.
        
        After MAX_RETRY_COUNT failures, marks as permanently broken.
        Otherwise increments retry count and updates last_retry_at.
        
        Args:
            prompt: The user prompt
            difficulty: The difficulty level
            reason: Description of failure
            
        Returns:
            True if marked broken, False otherwise
        """
        try:
            prompt_hash = self._get_prompt_hash(prompt)
            
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                
                # Check current retry count
                cursor.execute("""
                    SELECT retry_count FROM broken_simulations 
                    WHERE prompt_hash = ? AND difficulty = ?
                """, (prompt_hash, difficulty))
                row = cursor.fetchone()
                
                if row:
                    # Existing entry - increment retry count
                    current_retry_count = row[0]
                    new_retry_count = current_retry_count + 1
                    is_permanent = 1 if new_retry_count >= self.MAX_RETRY_COUNT else 0
                    
                    cursor.execute("""
                        UPDATE broken_simulations 
                        SET retry_count = ?,
                            last_retry_at = CURRENT_TIMESTAMP,
                            failure_reason = ?,
                            is_permanently_broken = ?
                        WHERE prompt_hash = ? AND difficulty = ?
                    """, (new_retry_count, reason, is_permanent, prompt_hash, difficulty))
                    
                    if is_permanent:
                        logger.warning(f"💀 PERMANENTLY BROKEN after {new_retry_count} attempts: {prompt[:40]}...")
                    else:
                        logger.warning(f"⚠️  Marked broken (attempt {new_retry_count}/{self.MAX_RETRY_COUNT}): {prompt[:40]}...")
                else:
                    # New entry - first failure
                    cursor.execute("""
                        INSERT INTO broken_simulations 
                        (prompt_hash, difficulty, failure_reason, retry_count, last_retry_at, is_permanently_broken)
                        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, 0)
                    """, (prompt_hash, difficulty, reason))
                    logger.warning(f"⚠️  Marked broken (attempt 1/{self.MAX_RETRY_COUNT}): {prompt[:40]}...")
                
                conn.commit()
                return True
                
        except Exception as e:
            logger.error(f"Error marking simulation broken: {e}")
            return False
    
    def clear_broken_status(self, prompt: str, difficulty: str = "medium") -> bool:
        """
        Clear the broken status for a simulation.
        
        Called when:
        1. Client successfully verifies the simulation (in confirm-complete)
        2. Admin manually clears the status
        
        This resets retry count and allows the simulation to be cached.
        
        Args:
            prompt: The prompt to clear
            difficulty: The difficulty level
            
        Returns:
            True if status was cleared, False otherwise
        """
        if not difficulty:
            return False
            
        prompt_hash = self._get_prompt_hash(prompt)
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = ? AND difficulty = ?", (prompt_hash, difficulty))
            deleted = cursor.rowcount > 0
            if deleted:
                logger.info(f"✅ Broken status cleared for: '{prompt[:40]}...' (difficulty={difficulty})")
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
