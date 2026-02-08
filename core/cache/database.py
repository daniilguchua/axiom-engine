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
        
        # Check if we need to migrate simulation_cache to composite key
        cursor.execute("PRAGMA table_info(simulation_cache)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'prompt_key' in columns:
            # Check if old UNIQUE constraint exists (single column)
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='simulation_cache'")
            create_sql = cursor.fetchone()[0]
            
            if 'UNIQUE' in create_sql and '(prompt_key)' in create_sql:
                # Migrate to composite key
                cursor.execute("ALTER TABLE simulation_cache RENAME TO simulation_cache_old")
                cursor.execute("""
                    CREATE TABLE simulation_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        prompt_key TEXT NOT NULL,
                        difficulty TEXT NOT NULL,
                        simulation_json TEXT NOT NULL,
                        client_verified INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(prompt_key, difficulty)
                    )
                """)
                cursor.execute("""
                    INSERT INTO simulation_cache (prompt_key, difficulty, simulation_json, client_verified, created_at)
                    SELECT prompt_key, COALESCE(difficulty, 'explorer'), simulation_json, client_verified, created_at
                    FROM simulation_cache_old
                """)
                cursor.execute("DROP TABLE simulation_cache_old")
        
        # Check if broken_simulations needs difficulty column
        cursor.execute("PRAGMA table_info(broken_simulations)")
        columns = {col[1] for col in cursor.fetchall()}
        
        if 'difficulty' not in columns:
            # Add difficulty column and migrate to composite key
            cursor.execute("ALTER TABLE broken_simulations RENAME TO broken_simulations_old")
            cursor.execute("""
                CREATE TABLE broken_simulations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    prompt_hash TEXT NOT NULL,
                    difficulty TEXT NOT NULL,
                    failure_reason TEXT,
                    failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(prompt_hash, difficulty)
                )
            """)
            cursor.execute("""
                INSERT INTO broken_simulations (prompt_hash, difficulty, failure_reason, failed_at)
                SELECT prompt_hash, 'explorer', failure_reason, failed_at
                FROM broken_simulations_old
            """)
            cursor.execute("DROP TABLE broken_simulations_old")
        else:
            # Check if old single-column UNIQUE exists
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='broken_simulations'")
            result = cursor.fetchone()
            if result and 'UNIQUE(prompt_hash)' in result[0]:
                cursor.execute("ALTER TABLE broken_simulations RENAME TO broken_simulations_old")
                cursor.execute("""
                    CREATE TABLE broken_simulations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        prompt_hash TEXT NOT NULL,
                        difficulty TEXT NOT NULL,
                        failure_reason TEXT,
                        failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(prompt_hash, difficulty)
                    )
                """)
                cursor.execute("""
                    INSERT INTO broken_simulations (prompt_hash, difficulty, failure_reason, failed_at)
                    SELECT prompt_hash, COALESCE(difficulty, 'explorer'), failure_reason, failed_at
                    FROM broken_simulations_old
                """)
                cursor.execute("DROP TABLE broken_simulations_old")
        
        # Clean up junk data
        cursor.execute("""
            DELETE FROM simulation_cache 
            WHERE prompt_key IN ('cached-prompt', 'prompt-explorer', 'prompt-engineer', 'prompt-architect', 'partial-prompt', 'unverified-prompt', 'test-prompt')
        """)
        cursor.execute("DELETE FROM simulation_cache WHERE prompt_key LIKE 'User requested simulation%'")
        cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = 'e3b0c44298fc1c149afbf4c8996fb924'")
        cursor.execute("DELETE FROM broken_simulations WHERE prompt_hash = ''")
        
        self.connection.commit()
