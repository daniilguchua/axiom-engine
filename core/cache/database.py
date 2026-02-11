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
    
    def __init__(self, db_path: str):
        """Initialize cache database."""
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.connection = sqlite3.connect(db_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
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
        """Initialize database schema with migrations."""
        cursor = self.connection.cursor()
        
        # ---- simulation_cache: create or migrate ----
        cursor.execute("PRAGMA table_info(simulation_cache)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if not columns:
            # Fresh database - create table from scratch
            cursor.execute("""
                CREATE TABLE simulation_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    prompt_key TEXT NOT NULL,
                    embedding TEXT,
                    difficulty TEXT NOT NULL,
                    simulation_json TEXT NOT NULL,
                    client_verified INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(prompt_key, difficulty)
                )
            """)
            logger.info("Created simulation_cache table")
        else:
            # Existing table - check if migration needed
            needs_sim_migration = False
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='simulation_cache'")
            create_sql = cursor.fetchone()[0]
            if 'embedding' not in columns:
                needs_sim_migration = True
            elif 'UNIQUE' in create_sql and '(prompt_key)' in create_sql:
                needs_sim_migration = True
            
            if needs_sim_migration:
                cursor.execute("ALTER TABLE simulation_cache RENAME TO simulation_cache_old")
                cursor.execute("""
                    CREATE TABLE simulation_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        prompt_key TEXT NOT NULL,
                        embedding TEXT,
                        difficulty TEXT NOT NULL,
                        simulation_json TEXT NOT NULL,
                        client_verified INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(prompt_key, difficulty)
                    )
                """)
                old_cols = [col[1] for col in cursor.execute("PRAGMA table_info(simulation_cache_old)").fetchall()]
                if 'embedding' in old_cols:
                    cursor.execute("""
                        INSERT INTO simulation_cache (prompt_key, embedding, difficulty, simulation_json, client_verified, created_at)
                        SELECT prompt_key, embedding, COALESCE(difficulty, 'explorer'), 
                               COALESCE(simulation_json, playlist_json, '{}'), 
                               COALESCE(client_verified, 0), created_at
                        FROM simulation_cache_old
                    """)
                else:
                    cursor.execute("""
                        INSERT INTO simulation_cache (prompt_key, difficulty, simulation_json, client_verified, created_at)
                        SELECT prompt_key, COALESCE(difficulty, 'explorer'), simulation_json, 
                               COALESCE(client_verified, 0), created_at
                        FROM simulation_cache_old
                    """)
                cursor.execute("DROP TABLE simulation_cache_old")
                logger.info("Migrated simulation_cache with embedding column")
        
        # ---- broken_simulations: create or migrate ----
        cursor.execute("PRAGMA table_info(broken_simulations)")
        columns = {col[1] for col in cursor.fetchall()}
        
        if not columns:
            # Fresh database - create table from scratch
            cursor.execute("""
                CREATE TABLE broken_simulations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    prompt_hash TEXT NOT NULL,
                    difficulty TEXT NOT NULL,
                    failure_reason TEXT,
                    failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    retry_count INTEGER DEFAULT 1,
                    last_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_permanently_broken INTEGER DEFAULT 0,
                    UNIQUE(prompt_hash, difficulty)
                )
            """)
            logger.info("Created broken_simulations table")
        else:
            # Existing table - check if migration needed
            needs_migration = False
            if 'difficulty' not in columns:
                needs_migration = True
            elif 'retry_count' not in columns:
                needs_migration = True
            else:
                cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='broken_simulations'")
                result = cursor.fetchone()
                if result and 'UNIQUE(prompt_hash)' in result[0]:
                    needs_migration = True
            
            if needs_migration:
                cursor.execute("ALTER TABLE broken_simulations RENAME TO broken_simulations_old")
                cursor.execute("""
                    CREATE TABLE broken_simulations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        prompt_hash TEXT NOT NULL,
                        difficulty TEXT NOT NULL,
                        failure_reason TEXT,
                        failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        retry_count INTEGER DEFAULT 1,
                        last_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        is_permanently_broken INTEGER DEFAULT 0,
                        UNIQUE(prompt_hash, difficulty)
                    )
                """)
                cursor.execute("""
                    INSERT INTO broken_simulations 
                    (prompt_hash, difficulty, failure_reason, failed_at, retry_count, last_retry_at, is_permanently_broken)
                    SELECT 
                        prompt_hash, 
                        COALESCE(difficulty, 'explorer'), 
                        failure_reason, 
                        failed_at,
                        1,
                        failed_at,
                        0
                    FROM broken_simulations_old
                """)
                cursor.execute("DROP TABLE broken_simulations_old")
                logger.info("Migrated broken_simulations table with retry tracking")
        
        # Create llm_diagnostics table if not exists
        cursor.execute("PRAGMA table_info(llm_diagnostics)")
        if not cursor.fetchall():
            cursor.execute("""
                CREATE TABLE llm_diagnostics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    difficulty TEXT,
                    llm_raw_response TEXT,
                    llm_response_length INTEGER,
                    llm_step_count INTEGER,
                    validation_input_count INTEGER,
                    validation_output_count INTEGER,
                    validation_warnings TEXT,
                    storage_before_json TEXT,
                    storage_after_json TEXT,
                    integrity_check_pass INTEGER,
                    integrity_error TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_llm_diagnostics_session 
                ON llm_diagnostics(session_id)
            """)
            logger.info("Created llm_diagnostics table")
        
        # Create repair_logs table if not exists
        cursor.execute("""
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create repair_attempts table if not exists
        cursor.execute("""
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create pending_repairs table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_repairs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                prompt_key TEXT,
                step_index INTEGER,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                UNIQUE(session_id, prompt_key, step_index)
            )
        """)
        
        # Create repair_stats table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS repair_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                tier1_python_success INTEGER DEFAULT 0,
                tier2_js_success INTEGER DEFAULT 0,
                tier3_llm_success INTEGER DEFAULT 0,
                total_failures INTEGER DEFAULT 0,
                total_attempts INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date)
            )
        """)
        
        # Create graph_dataset table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS graph_dataset (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mermaid_code TEXT NOT NULL,
                description_context TEXT,
                source_type TEXT DEFAULT 'simulation',
                was_repaired BOOLEAN DEFAULT 0,
                quality_score REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create feedback_logs table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS feedback_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                prompt TEXT,
                rating INTEGER,
                step_index INTEGER,
                comment TEXT,
                sim_data_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create raw_mermaid_logs table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS raw_mermaid_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                sim_id TEXT,
                step_index INTEGER,
                raw_mermaid_code TEXT,
                initial_render_success BOOLEAN DEFAULT 0,
                initial_error_msg TEXT,
                required_repair BOOLEAN DEFAULT 0,
                repair_tier TEXT,
                final_success BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Clean up junk data
        cursor.execute("""
            DELETE FROM simulation_cache 
            WHERE prompt_key IN ('cached-prompt', 'prompt-explorer', 'prompt-engineer', 'prompt-architect', 'partial-prompt', 'unverified-prompt', 'test-prompt')
        """)
        cursor.execute("DELETE FROM simulation_cache WHERE prompt_key LIKE 'User requested simulation%'")
        cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = 'e3b0c44298fc1c149afbf4c8996fb924'")
        cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = ''")
        
        self.connection.commit()    
    def save_llm_diagnostic(self, session_id, diagnostic_data):
        """
        Save LLM diagnostic information to database.
        
        Args:
            session_id: Session ID
            diagnostic_data: Dict with keys: mode, difficulty, llm_raw_response, 
                           llm_step_count, validation_input/output, validation_warnings,
                           storage_before_json, storage_after_json, integrity_check_pass, integrity_error
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO llm_diagnostics 
                (session_id, mode, difficulty, llm_raw_response, llm_response_length, llm_step_count,
                 validation_input_count, validation_output_count, validation_warnings,
                 storage_before_json, storage_after_json, integrity_check_pass, integrity_error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id,
                diagnostic_data.get('mode'),
                diagnostic_data.get('difficulty'),
                diagnostic_data.get('llm_raw_response', '')[:5000],  # First 5KB
                len(diagnostic_data.get('llm_raw_response', '')),
                diagnostic_data.get('llm_step_count', 0),
                diagnostic_data.get('validation_input_count', 0),
                diagnostic_data.get('validation_output_count', 0),
                diagnostic_data.get('validation_warnings', ''),
                diagnostic_data.get('storage_before_json', ''),
                diagnostic_data.get('storage_after_json', ''),
                1 if diagnostic_data.get('integrity_check_pass') else 0,
                diagnostic_data.get('integrity_error', '')
            ))
    
    def get_latest_diagnostics(self, session_id, limit=10):
        """Retrieve latest diagnostic records for a session."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM llm_diagnostics 
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (session_id, limit))
            return [dict(row) for row in cursor.fetchall()]