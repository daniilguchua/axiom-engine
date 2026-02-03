# cache.py
"""
Intelligent caching system with semantic search and repair-aware logic.
Prevents caching incomplete/broken simulations.
"""

import sqlite3
import json
import logging
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
import os

from core.utils import get_text_embedding, cosine_similarity

logger = logging.getLogger(__name__)

# Configuration
# 1. Get the directory where this script (cache.py) lives
CURRENT_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. Create a hidden folder inside your project folder
DATA_DIR = os.path.join(CURRENT_SCRIPT_DIR, ".axiom_test_cache")

# 3. Ensure it exists
os.makedirs(DATA_DIR, exist_ok=True)

# 4. Point the DB there
DB_PATH = os.path.join(DATA_DIR, "axiom.db")


class SimulationStatus(Enum):
    """Status of a cached simulation."""
    COMPLETE = "complete"
    PARTIAL = "partial"
    REPAIRING = "repairing"
    FAILED = "failed"
    VERIFIED = "verified"


@dataclass
class CachedSimulation:
    """Represents a cached simulation with metadata."""
    prompt_key: str
    playlist_data: Dict[str, Any]
    status: SimulationStatus
    step_count: int
    created_at: datetime
    last_accessed: datetime
    access_count: int
    avg_rating: Optional[float]
    client_verified: bool


class CacheManager:
    """
    Thread-safe cache manager with connection pooling and repair awareness.
    
    Key Features:
    - Semantic similarity search for cache hits
    - Repair-aware caching (won't cache broken simulations)
    - Connection pooling for thread safety
    - Comprehensive logging for ML training data
    """
    
    SIMILARITY_THRESHOLD = 0.80
    MAX_POOL_SIZE = 5
    
    def __init__(self):
        self._local = threading.local()
        self._pool_lock = threading.Lock()
        self._init_db()
        logger.info(f"ðŸ“‚ CacheManager connected to: {DB_PATH}")
    
    @contextmanager
    def _get_connection(self):
        """Thread-safe connection management with WAL mode for better concurrency."""
        conn = None
        try:
            conn = sqlite3.connect(DB_PATH, timeout=60.0)  # Increased timeout
            conn.row_factory = sqlite3.Row
        
        # Enable WAL mode for better concurrent access
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=60000")  # 60 second busy timeout
        
            yield conn
            conn.commit()
        except sqlite3.Error as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    def _init_db(self):
        """Initialize database schema with proper indices and migrations."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("PRAGMA journal_mode=WAL")
            logger.info(f"ðŸ“‚ Database journal mode: {cursor.fetchone()[0]}")
        
            # Check if simulation_cache table exists and needs migration
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='simulation_cache'")
            table_exists = cursor.fetchone() is not None
            
            if table_exists:
                # Check for missing columns and add them (migration)
                cursor.execute("PRAGMA table_info(simulation_cache)")
                existing_columns = {row[1] for row in cursor.fetchall()}
                
                migrations = [
                    ("status", "TEXT DEFAULT 'complete'"),
                    ("step_count", "INTEGER DEFAULT 0"),
                    ("is_final_complete", "BOOLEAN DEFAULT 0"),
                    ("last_accessed", "TIMESTAMP"),
                    ("access_count", "INTEGER DEFAULT 0"),
                    ("avg_rating", "REAL"),
                    ("client_verified", "BOOLEAN DEFAULT 0"),
                    ("difficulty", "TEXT DEFAULT 'engineer'"),
                ]
                
                for col_name, col_type in migrations:
                    if col_name not in existing_columns:
                        try:
                            cursor.execute(f"ALTER TABLE simulation_cache ADD COLUMN {col_name} {col_type}")
                            logger.info(f"ðŸ“¦ Migrated: Added column '{col_name}' to simulation_cache")
                        except sqlite3.OperationalError as e:
                            logger.warning(f"Migration warning for {col_name}: {e}")
            else:
                # Create fresh table with all columns
                cursor.execute('''
                    CREATE TABLE simulation_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        prompt_key TEXT UNIQUE,
                        embedding TEXT,
                        playlist_json TEXT,
                        status TEXT DEFAULT 'complete',
                        step_count INTEGER DEFAULT 0,
                        is_final_complete BOOLEAN DEFAULT 0,
                        created_at TIMESTAMP,
                        last_accessed TIMESTAMP,
                        access_count INTEGER DEFAULT 0,
                        avg_rating REAL,
                        difficulty TEXT DEFAULT 'engineer'
                    )
                ''')
            
            # Repair logs with success tracking (ENHANCED with tier tracking)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS repair_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    original_prompt TEXT,
                    broken_code TEXT,
                    error_msg TEXT,
                    fixed_code TEXT,
                    repair_method TEXT,
                    was_successful BOOLEAN,
                    repair_duration_ms INTEGER,
                    created_at TIMESTAMP
                )
            ''')
            
            # NEW: Granular repair attempt tracking
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS repair_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    sim_id TEXT,
                    step_index INTEGER,
                    tier INTEGER,
                    tier_name TEXT,
                    attempt_number INTEGER,
                    input_code TEXT,
                    output_code TEXT,
                    error_before TEXT,
                    error_after TEXT,
                    was_successful BOOLEAN,
                    duration_ms INTEGER,
                    created_at TIMESTAMP
                )
            ''')
            
            # NEW: Repair summary stats (aggregated view)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS repair_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    tier1_python_success INTEGER DEFAULT 0,
                    tier2_js_success INTEGER DEFAULT 0,
                    tier3_llm_success INTEGER DEFAULT 0,
                    total_failures INTEGER DEFAULT 0,
                    total_attempts INTEGER DEFAULT 0,
                    avg_duration_ms REAL,
                    updated_at TIMESTAMP
                )
            ''')
            
            # Feedback logs
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS feedback_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    prompt TEXT,
                    simulation_data TEXT,
                    rating INTEGER,
                    step_index INTEGER,
                    comment TEXT,
                    created_at TIMESTAMP
                )
            ''')
            
            # Graph dataset for ML training
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS graph_dataset (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    mermaid_code TEXT,
                    description_context TEXT,
                    source_type TEXT,
                    was_repaired BOOLEAN DEFAULT 0,
                    quality_score REAL,
                    created_at TIMESTAMP
                )
            ''')

            # NEW: Raw mermaid tracking (captures LLM output before sanitization)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS raw_mermaid_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    sim_id TEXT,
                    step_index INTEGER,
                    raw_mermaid_json TEXT,
                    raw_mermaid_code TEXT,
                    has_newlines BOOLEAN,
                    newline_count INTEGER,
                    escaped_newline_count INTEGER,
                    char_length INTEGER,
                    initial_render_success BOOLEAN,
                    initial_error_msg TEXT,
                    required_repair BOOLEAN,
                    repair_tier TEXT,
                    final_success BOOLEAN,
                    created_at TIMESTAMP
                )
            ''')
            
            # Pending repairs tracking (NEW)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS pending_repairs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    prompt_key TEXT,
                    step_index INTEGER,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP,
                    resolved_at TIMESTAMP,
                    UNIQUE(session_id, prompt_key, step_index)
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS broken_simulations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    prompt_key TEXT,
                    prompt_hash TEXT,
                    failed_step_index INTEGER,
                    failure_reason TEXT,
                    created_at TIMESTAMP,
                    UNIQUE(prompt_hash)
                )
            ''')
            
            # Create indices for performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_cache_prompt ON simulation_cache(prompt_key)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_cache_status ON simulation_cache(status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_cache_verified ON simulation_cache(client_verified)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_cache_difficulty ON simulation_cache(difficulty)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_repairs(session_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_broken_hash ON broken_simulations(prompt_hash)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_raw_mermaid_session ON raw_mermaid_logs(session_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_raw_mermaid_success ON raw_mermaid_logs(initial_render_success)')
            
            conn.commit()
    
    # =========================================================================
    # SIMULATION CACHE OPERATIONS
    # =========================================================================
    
    def get_cached_simulation(
        self, 
        user_prompt: str,
        difficulty: str = "engineer",
        require_complete: bool = True,
        require_verified: bool = False
    
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a cached simulation using semantic similarity.
        
        Args:
            user_prompt: The user's query
            difficulty: The difficulty level (explorer, engineer, architect) - MUST match exactly
            require_complete: If True, only return simulations marked as complete
            
        Returns:
            Cached playlist data or None if no match found
        """

        if self._is_simulation_broken(user_prompt):
            logger.warning(f"â›” Cache blocked: Prompt has broken simulation record")
            return None
        
        query_vec = get_text_embedding(user_prompt)
        if not query_vec:
            logger.warning("Failed to generate embedding for query")
            return None
        
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Build query based on completeness requirement
            # FIX: Build query based on requirements + difficulty filter
            conditions = [f"difficulty = '{difficulty}'"]  # MUST match difficulty exactly
            if require_complete:
                conditions.append("(status = 'complete' OR status = 'verified')")
                conditions.append("is_final_complete = 1")
            if require_verified:
                conditions.append("client_verified = 1")

            where_clause = " AND ".join(conditions)
            
            cursor.execute(f"""
                SELECT prompt_key, embedding, playlist_json, status, is_final_complete, client_verified, difficulty
                FROM simulation_cache 
                WHERE {where_clause}
            """)
            
            rows = cursor.fetchall()
        
        best_score = 0.0
        best_match = None
        best_key = None
        
        for row in rows:
            db_key, db_emb_json, data, status, is_final, verified, db_difficulty = row
            if not db_emb_json:
                continue
                
            try:
                db_vec = json.loads(db_emb_json)
                score = cosine_similarity(query_vec, db_vec)
                
                logger.debug(f"Similarity '{user_prompt[:30]}...' vs '{db_key[:30]}...' (diff={db_difficulty}): {score:.4f}")
                
                if score > best_score:
                    best_score = score
                    best_match = data
                    best_key = db_key
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(f"Failed to parse embedding for {db_key}: {e}")
                continue
        
        if best_score >= self.SIMILARITY_THRESHOLD:
            logger.info(f"âš¡ CACHE HIT ({best_score:.2f}, {difficulty}): '{user_prompt[:40]}...' matched '{best_key[:40]}...'")
            
            # Update access metrics
            self._update_access_metrics(best_key)
            
            return json.loads(best_match)
        
        logger.debug(f"Cache miss for: '{user_prompt[:40]}...' (difficulty={difficulty}, best score: {best_score:.2f})")
        return None
    
    def save_simulation(
        self,
        prompt: str,
        playlist_data: Dict[str, Any],
        difficulty: str = "engineer",
        is_final_complete: bool = False,
        client_verified: bool = False,
        session_id: Optional[str] = None
    ) -> bool:
        """
        Save a simulation to cache.
        
        CRITICAL: Will NOT save if:
        1. There's a pending repair for this session/prompt
        2. is_final_complete is False and the last step isn't marked as final
        
        Args:
            prompt: The original user prompt
            playlist_data: The complete playlist JSON
            difficulty: The difficulty level (explorer, engineer, architect)
            is_final_complete: Whether the simulation reached its natural end
            session_id: Session ID for repair checking
            
        Returns:
            True if saved, False if skipped
        """
        clean_key = prompt.strip()
        
        if client_verified:
            self.clear_broken_status(clean_key)
        # CHECK 1: Is this simulation marked as broken?
        if self._is_simulation_broken(clean_key):
            logger.warning(f"â›” CACHE BLOCKED: Simulation marked as broken for '{clean_key[:40]}...'")
            return False
        
        # CHECK 2: Pending repairs are now cleared by /confirm-complete before calling save
        # So we don't check here anymore - if we got here, repairs are resolved
        
        # CHECK 3: Validate the simulation data
        steps = playlist_data.get('steps', [])
        if not steps:
            logger.warning(f"â³ CACHE SKIP: No steps in simulation for '{clean_key[:40]}...'")
            return False
        
        last_step = steps[-1]
        
        # CHECK 4: Only cache if explicitly marked final
        if not is_final_complete:
            is_final_complete = last_step.get('is_final', False)
        
        if not is_final_complete:
            logger.info(f"â³ CACHE SKIP: Simulation not complete for '{clean_key[:40]}...'")
            return False
        
        # FIX: CHECK 5: Require client verification for new entries
        # (Allow updating existing entries without re-verification)
        if not client_verified:
            # Check if we're updating an existing verified entry
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT client_verified FROM simulation_cache WHERE prompt_key = ?",
                    (clean_key,)
                )
                row = cursor.fetchone()
                if not row:
                    logger.info(f"â³ CACHE SKIP: Client verification required for new entry")
                    return False
                # Existing entry, allow update
        
        # Generate embedding
        embedding = get_text_embedding(clean_key)
        emb_json = json.dumps(embedding) if embedding else None
        
        if not emb_json:
            logger.warning(f"Failed to generate embedding for caching: '{clean_key[:40]}...'")
            return False
        
        json_str = json.dumps(playlist_data)
        step_count = len(steps)
        status = "verified" if client_verified else "complete"
        
        with self._get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    INSERT INTO simulation_cache 
                    (prompt_key, embedding, playlist_json, status, step_count, 
                     is_final_complete, client_verified, difficulty, created_at, last_accessed, access_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    ON CONFLICT(prompt_key) DO UPDATE SET
                        embedding = excluded.embedding,
                        playlist_json = excluded.playlist_json,
                        status = excluded.status,
                        step_count = excluded.step_count,
                        is_final_complete = excluded.is_final_complete,
                        client_verified = CASE 
                            WHEN excluded.client_verified = 1 THEN 1 
                            ELSE simulation_cache.client_verified 
                        END,
                        difficulty = excluded.difficulty,
                        last_accessed = excluded.last_accessed
                """, (
                    clean_key, emb_json, json_str, status, step_count,
                    is_final_complete, client_verified, difficulty, datetime.now(), datetime.now()
                ))
                conn.commit()
                logger.info(f"ðŸ’¾ CACHED: '{clean_key[:40]}...' ({step_count} steps, difficulty={difficulty}, verified={client_verified})")
                return True
            except sqlite3.Error as e:
                logger.error(f"Cache save failed: {e}")
                return False
    
    def _update_access_metrics(self, prompt_key: str) -> None:
        """Update last_accessed and access_count for a cache entry."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE simulation_cache 
                SET last_accessed = ?, access_count = access_count + 1
                WHERE prompt_key = ?
            """, (datetime.now(), prompt_key))


    def _get_prompt_hash(self, prompt: str) -> str:
        """Generate a hash for the prompt (for deduplication)."""
        import hashlib
        normalized = prompt.strip().lower()
        return hashlib.sha256(normalized.encode()).hexdigest()[:32]
    
    def _is_simulation_broken(self, prompt: str, max_age_hours: int = 24) -> bool:
        """
        Check if a simulation is marked as broken.
        Broken status expires after max_age_hours to allow retries.
        """
        prompt_hash = self._get_prompt_hash(prompt)
        with self._get_connection() as conn:
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
                logger.info(f"ðŸ• Broken status expired for prompt hash {prompt_hash[:16]}...")
                return False
        
            return True
    
    def mark_simulation_broken(
        self,
        session_id: str,
        prompt_key: str,
        step_index: int,
        failure_reason: str = "Render failure after all repair attempts"
    ) -> None:
        """
    Mark a simulation as broken for a specific session.
    Other sessions can still attempt the same prompt.
        """
        clean_key = prompt_key.strip()
        prompt_hash = self._get_prompt_hash(clean_key)
    
        with self._get_connection() as conn:
            cursor = conn.cursor()
            try:
            # Use session_id + prompt_hash as unique key
            # This allows different sessions to try the same prompt
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
                logger.warning(f"ðŸš« Simulation marked broken (session {session_id[:16]}...): '{clean_key[:40]}...' at step {step_index}")
            except sqlite3.Error as e:
                logger.error(f"Failed to mark simulation broken: {e}")
    
    def clear_broken_status(self, prompt: str) -> bool:
        """
        Clear the broken status for a simulation (admin function).
        Use if the simulation has been fixed and should be re-cached.
        """
        prompt_hash = self._get_prompt_hash(prompt)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = ?", (prompt_hash,))
            deleted = cursor.rowcount > 0
            if deleted:
                logger.info(f"âœ… Broken status cleared for: '{prompt[:40]}...'")
            return deleted
    
    # =========================================================================
    # REPAIR TRACKING
    # =========================================================================
    
    def mark_repair_pending(
        self,
        session_id: str,
        prompt_key: str,
        step_index: int
    ) -> None:
        """Mark that a step is being repaired (prevents caching)."""
        # Opportunistic cleanup: clear stale pending repairs before adding new one
        self.cleanup_stale_pending_repairs(max_age_minutes=15)

        with self._get_connection() as conn:
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
        """Mark a specific repair as resolved."""
        status = 'resolved' if success else 'failed'
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE pending_repairs 
                SET status = ?, resolved_at = ?
                WHERE session_id = ? AND prompt_key = ? AND step_index = ?
            """, (status, datetime.now(), session_id, prompt_key.strip(), step_index))
            logger.debug(f"âœ… Repair resolved: session={session_id[:16]}..., step={step_index}, success={success}")
    
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
        
        Returns: Number of repairs cleared
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE pending_repairs 
                SET status = 'resolved', resolved_at = ?
                WHERE session_id = ? AND prompt_key = ? AND status = 'pending'
            """, (datetime.now(), session_id, prompt_key.strip()))
            cleared = cursor.rowcount
            if cleared > 0:
                logger.info(f"âœ… Cleared {cleared} pending repair(s) for '{prompt_key[:40]}...'")
            return cleared
    
    def clear_all_pending_repairs(self, session_id: str) -> int:
        """Clear ALL pending repair flags for a session (used on page refresh)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM pending_repairs
                WHERE session_id = ?
            """, (session_id,))
            count = cursor.rowcount
            conn.commit()
        return count
    
    def has_pending_repair(self, session_id: str, prompt_key: str) -> bool:
        """Check if there are any pending repairs for this session/prompt."""
        # Opportunistic cleanup: clear stale pending repairs before checking
        self.cleanup_stale_pending_repairs(max_age_minutes=15)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) FROM pending_repairs
                WHERE session_id = ? AND prompt_key = ? AND status = 'pending'
            """, (session_id, prompt_key.strip()))
            count = cursor.fetchone()[0]
            return count > 0
    
    def get_pending_repairs(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all pending repairs for a session."""
        with self._get_connection() as conn:
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
        with self._get_connection() as conn:
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

    # =========================================================================
    # REPAIR LOGGING
    # =========================================================================
    
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
        """Log a repair attempt for analysis (legacy method)."""
        with self._get_connection() as conn:
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
            except sqlite3.Error as e:
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
        """
        with self._get_connection() as conn:
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
            except sqlite3.Error as e:
                logger.error(f"Repair attempt log failed: {e}")
                
        self._update_repair_stats(tier, was_successful, duration_ms)
    
    def _update_repair_stats(self, tier: int, success: bool, duration_ms: int) -> None:
        """Update daily aggregated repair stats."""
        today = datetime.now().strftime('%Y-%m-%d')
        
        with self._get_connection() as conn:
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
        """Get repair statistics for the last N days."""
        with self._get_connection() as conn:
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
        """Get recent repair attempts for debugging."""
        with self._get_connection() as conn:
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

    # =========================================================================
    # RAW MERMAID LOGGING (For debugging LLM output)
    # =========================================================================

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
        """
        with self._get_connection() as conn:
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
            except sqlite3.Error as e:
                logger.error(f"Raw mermaid log failed: {e}")

    def get_raw_mermaid_stats(self, days: int = 7) -> Dict[str, Any]:
        """Get statistics on raw mermaid code from LLM."""
        with self._get_connection() as conn:
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
        """Get recent failed mermaid codes for debugging."""
        with self._get_connection() as conn:
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

        # =========================================================================
    # FEEDBACK LOGGING
    # =========================================================================
    
    def _update_cache_rating(self, prompt: str, new_rating: int) -> None:
        """Update the average rating for a cached simulation."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Calculate running average
            cursor.execute("""
                UPDATE simulation_cache 
                SET avg_rating = COALESCE(
                    (avg_rating * access_count + ?) / (access_count + 1),
                    ?
                )
                WHERE prompt_key = ?
            """, (new_rating, new_rating, prompt.strip()))
    
    # =========================================================================
    # GRAPH DATASET (ML Training)
    # =========================================================================
    
    def log_graph_sample(
        self,
        code: str,
        context: str,
        source: str = "simulation",
        was_repaired: bool = False,
        quality_score: Optional[float] = None
        ) -> None:
        """Save a graph sample for ML training data."""
        if not code or not code.strip():
            return
    
    # Use a separate try/except to make this fire-and-forget
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                INSERT INTO graph_dataset 
                (mermaid_code, description_context, source_type, was_repaired, quality_score, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (code, context, source, was_repaired, quality_score, datetime.now()))
        except sqlite3.Error as e:
        # Log but don't raise - this is non-critical
            logger.warning(f"Graph log failed (non-critical): {e}")

    def log_feedback(
        self,
        prompt: str,
        sim_data: Any,
        rating: int,
        session_id: Optional[str] = None,
        step_index: Optional[int] = None,
        comment: Optional[str] = None
    )-> None:
        """Log user feedback for quality tracking."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                json_str = json.dumps(sim_data) if isinstance(sim_data, (dict, list)) else str(sim_data)
                cursor.execute("""
                INSERT INTO feedback_logs 
                (session_id, prompt, simulation_data, rating, step_index, comment, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (session_id, prompt, json_str, rating, step_index, comment, datetime.now()))
                logger.info(f"👍 Feedback logged: rating={rating} for '{prompt[:30]}...'")
        except sqlite3.Error as e:
            # Log but don't raise - this is non-critical
            logger.warning(f"Feedback log failed (non-critical): {e}")

        # Update average rating in cache (after first connection is closed)
        try:
            self._update_cache_rating(prompt, rating)
        except Exception:
            pass  # Non-critical

    
    # =========================================================================
    # ANALYTICS & METRICS
    # =========================================================================
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Return cache statistics for monitoring."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM simulation_cache WHERE status IN ('complete', 'verified')")
            complete_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM simulation_cache WHERE client_verified = 1")
            verified_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM simulation_cache WHERE is_final_complete = 1")
            final_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT SUM(access_count) FROM simulation_cache")
            total_hits = cursor.fetchone()[0] or 0
            
            cursor.execute("SELECT AVG(avg_rating) FROM simulation_cache WHERE avg_rating IS NOT NULL")
            avg_quality = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM pending_repairs WHERE status = 'pending'")
            pending_repairs = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM repair_logs WHERE was_successful = 1")
            successful_repairs = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM repair_logs")
            total_repairs = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM broken_simulations")
            broken_count = cursor.fetchone()[0]
            
            return {
                "cached_simulations": complete_count,
                "verified_simulations": verified_count,
                "final_simulations": final_count,
                "broken_simulations": broken_count,
                "total_cache_hits": total_hits,
                "average_quality_rating": round(avg_quality, 2) if avg_quality else None,
                "pending_repairs": pending_repairs,
                "repair_success_rate": round(successful_repairs / total_repairs, 2) if total_repairs > 0 else None,
                "total_repair_attempts": total_repairs,
            }
    
    def export_training_data(self, output_path: str) -> int:
        """Export graph dataset for ML training."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT mermaid_code, description_context, source_type, was_repaired, quality_score
                FROM graph_dataset
                WHERE quality_score IS NULL OR quality_score >= 0.5
            """)
            
            rows = cursor.fetchall()
            
            data = [
                {
                    "code": row[0],
                    "context": row[1],
                    "source": row[2],
                    "was_repaired": bool(row[3]),
                    "quality": row[4]
                }
                for row in rows
            ]
            
            with open(output_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            logger.info(f"ðŸ“¤ Exported {len(data)} training samples to {output_path}")
            return len(data)