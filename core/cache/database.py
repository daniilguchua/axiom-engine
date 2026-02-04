# core/cache/database.py
"""
Database connection and schema management for the cache system.
Handles SQLite connection pooling, WAL mode, and schema migrations.
"""

import sqlite3
import logging
import threading
import os
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Configuration
CURRENT_SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(CURRENT_SCRIPT_DIR, ".axiom_test_cache")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "axiom.db")


class CacheDatabase:
    """
    Thread-safe database manager for the cache system.
    Handles connection pooling and schema management.
    """
    
    def __init__(self, db_path=None):
        self._local = threading.local()
        self._pool_lock = threading.Lock()
        self.db_path = db_path or DB_PATH
        self._init_schema()
        logger.info(f"📂 CacheDatabase connected to: {self.db_path}")
    
    @contextmanager
    def get_connection(self):
        """Thread-safe connection management with WAL mode for better concurrency."""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=60.0)
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
    
    def _init_schema(self):
        """Initialize database schema with proper indices and migrations."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("PRAGMA journal_mode=WAL")
            logger.info(f"📂 Database journal mode: {cursor.fetchone()[0]}")
            
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
                            logger.info(f"📦 Migrated: Added column '{col_name}' to simulation_cache")
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
                        client_verified BOOLEAN DEFAULT 0,
                        difficulty TEXT DEFAULT 'engineer'
                    )
                ''')
            
            # Repair logs with success tracking
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
            
            # Granular repair attempt tracking
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
            
            # Repair summary stats
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

            # Raw mermaid tracking
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
            
            # Pending repairs tracking
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

            # Broken simulations tracking
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
