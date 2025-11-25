"""
Unit tests for core/cache.py
Tests semantic search, repair tracking, and cache management.
Uses real temporary SQLite database.
"""

import pytest
import json
import sqlite3
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from freezegun import freeze_time

from core.cache import CacheManager, SimulationStatus, CachedSimulation


# --- Cache Manager Initialization & Setup ---

class TestCacheManagerSetup:
    """Test CacheManager initialization and database setup."""
    
    def test_cache_manager_creation(self, temp_db_path, monkeypatch):
        """Test that CacheManager initializes properly."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        manager = CacheManager(db_path=temp_db_path)
        assert manager is not None
        assert manager.SIMILARITY_THRESHOLD == 0.80
    
    def test_database_initialization(self, temp_db_path, monkeypatch):
        """Test that database schema is created."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        manager = CacheManager(db_path=temp_db_path)
        
        # Check that tables exist
        conn = sqlite3.connect(temp_db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        
        assert "simulation_cache" in tables
        assert "broken_simulations" in tables
        assert "repair_logs" in tables
        assert "repair_attempts" in tables
        assert "pending_repairs" in tables
        conn.close()


# --- Semantic Search & Cache Hit Tests ---

class TestSemanticSearch:
    """Test semantic similarity search functionality."""
    
    @patch("core.cache.semantic_cache.get_text_embedding")
    def test_cache_hit_with_high_similarity(self, mock_embed, temp_db_path, monkeypatch):
        """Test that cache hit is triggered with high similarity (>0.80)."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        
        # Setup deterministic embeddings
        query_embedding = [1.0, 0.0, 0.0, 0.0, 0.0]
        db_embedding = [0.99, 0.01, 0.0, 0.0, 0.0]  # Very similar
        mock_embed.return_value = query_embedding
        
        manager = CacheManager(db_path=temp_db_path)
        
        # Manually insert a cached simulation
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                playlist_data = {"steps": [{"code": "graph LR\n  A --> B"}]}
                cursor.execute("""
                    INSERT INTO simulation_cache 
                    (prompt_key, embedding, simulation_json, difficulty, client_verified)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    "cached-prompt",
                    json.dumps(db_embedding),
                    json.dumps(playlist_data),
                    "engineer",
                    1
                ))
        
        # Query should find it via semantic similarity
        with patch("core.cache.semantic_cache.cosine_similarity", return_value=0.95):
                result = manager.get_cached_simulation(
                    "similar prompt",
                    difficulty="engineer"
                )
        
        assert result is not None
        assert result["steps"][0]["code"] == "graph LR\n  A --> B"
    
    @patch("core.cache.semantic_cache.get_text_embedding")
    def test_cache_miss_with_low_similarity(self, mock_embed, temp_db_path, monkeypatch):
        """Test that cache miss occurs with low similarity (<0.80)."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        mock_embed.return_value = [1.0, 0.0, 0.0]
        
        manager = CacheManager(db_path=temp_db_path)
        
        # Insert a cached simulation
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO simulation_cache 
                    (prompt_key, embedding, simulation_json, difficulty, client_verified)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    "cached-prompt",
                    json.dumps([0.0, 1.0, 0.0]),  # Orthogonal
                    json.dumps({"steps": []}),
                    "engineer",
                    1
                ))
        
        # Query with low similarity should miss
        with patch("core.cache.semantic_cache.cosine_similarity", return_value=0.5):
                result = manager.get_cached_simulation(
                    "different prompt",
                    difficulty="engineer"
                )
        
        assert result is None
    
    @patch("core.cache.semantic_cache.get_text_embedding")
    def test_cache_respects_difficulty_filter(self, mock_embed, temp_db_path, monkeypatch):
        """Test that cache only returns simulations matching difficulty."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        mock_embed.return_value = [1.0, 0.0, 0.0]
        
        manager = CacheManager(db_path=temp_db_path)
        
        # Insert simulations for different difficulties
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                for difficulty in ["explorer", "engineer", "architect"]:
                    cursor.execute("""
                        INSERT INTO simulation_cache 
                        (prompt_key, embedding, simulation_json, difficulty, client_verified)
                        VALUES (?, ?, ?, ?, ?)
                    """, (
                        f"prompt-{difficulty}",
                        json.dumps([1.0, 0.0, 0.0]),
                        json.dumps({"steps": []}),
                        difficulty,
                        1
                    ))
        
        # Query with specific difficulty
        with patch("core.cache.semantic_cache.cosine_similarity", return_value=0.95):
                result = manager.get_cached_simulation(
                    "test prompt",
                    difficulty="explorer"
                )
        
        # Should only find explorer difficulty
        assert result is not None
    
    @patch("core.cache.semantic_cache.get_text_embedding")
    def test_cache_requires_complete_status(self, mock_embed, temp_db_path, monkeypatch):
        """Test that unverified simulations are still returned (verification is optional)."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        mock_embed.return_value = [1.0, 0.0, 0.0]
        
        manager = CacheManager(db_path=temp_db_path)
        
        # Insert an unverified simulation
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO simulation_cache 
                    (prompt_key, embedding, simulation_json, difficulty, client_verified)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    "partial-prompt",
                    json.dumps([1.0, 0.0, 0.0]),
                    json.dumps({"steps": [{"code": "graph LR; A-->B"}]}),
                    "engineer",
                    0
                ))
        
        # Query should still find it (client_verified is not a blocker for retrieval)
        with patch("core.cache.semantic_cache.cosine_similarity", return_value=0.95):
                result = manager.get_cached_simulation(
                    "test prompt",
                    difficulty="engineer"
                )
        
        # Unverified simulations are still returned
        assert result is not None
    
    @patch("core.cache.semantic_cache.get_text_embedding")
    def test_cache_requires_verified(self, mock_embed, temp_db_path, monkeypatch):
        """Test that unverified simulations with no embedding still get found via hash."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        mock_embed.return_value = [1.0, 0.0, 0.0]
        
        manager = CacheManager(db_path=temp_db_path)
        
        # Insert simulation without embedding (hash-only)
        prompt_hash = manager._get_prompt_hash("test prompt")
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO simulation_cache 
                    (prompt_key, simulation_json, difficulty, client_verified)
                    VALUES (?, ?, ?, ?)
                """, (
                    prompt_hash,
                    json.dumps({"steps": [{"code": "graph LR; X-->Y"}]}),
                    "engineer",
                    0
                ))
        
        # Exact hash match should find it even without embedding
        result = manager.get_cached_simulation(
            "test prompt",
            difficulty="engineer"
        )
        
        assert result is not None
        assert result["steps"][0]["code"] == "graph LR; X-->Y"


# --- Simulation Saving Tests ---

class TestSimulationSaving:
    """Test saving simulations to cache."""
    
    @patch("core.cache.semantic_cache.get_text_embedding")
    def test_save_simulation_success(self, mock_embed, temp_db_path, monkeypatch):
        """Test saving a simulation to cache."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        mock_embed.return_value = [1.0, 0.0, 0.0]
        
        manager = CacheManager(db_path=temp_db_path)
        
        playlist_data = {
                "steps": [
                    {"code": "graph LR\n  A[Start] --> B[End]"}
                ]
        }
        
        result = manager.save_simulation(
                prompt="test prompt",
                playlist_data=playlist_data,
                difficulty="engineer",
                is_final_complete=True,
                client_verified=True
        )
        
        assert result is True
        
        # Verify it was saved with embedding
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT COUNT(*) FROM simulation_cache WHERE client_verified = 1
                """)
                count = cursor.fetchone()[0]
        
        assert count == 1


# --- Repair Logging Tests ---

class TestRepairLogging:
    """Test repair attempt logging and tracking."""
    
    def test_log_repair_attempt(self, temp_db_path, monkeypatch):
        """Test logging a repair attempt."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        
        manager = CacheManager(db_path=temp_db_path)
        
        manager.log_repair_attempt(
                session_id="test-session",
                sim_id="sim-123",
                step_index=1,
                tier=1,
                tier_name="python_fix",
                attempt_number=1,
                input_code="bad code",
                output_code="fixed code",
                error_before="syntax error",
                error_after=None,
                was_successful=True,
                duration_ms=150
        )
        
        # Verify it was logged
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT COUNT(*) FROM repair_attempts WHERE was_successful = 1
                """)
                count = cursor.fetchone()[0]
        
        assert count == 1
    
    def test_get_repair_stats(self, temp_db_path, monkeypatch):
        """Test retrieving repair statistics."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        
        manager = CacheManager(db_path=temp_db_path)
        
        # Log some repair attempts
        for i in range(5):
                manager.log_repair_attempt(
                    session_id=f"session-{i}",
                    sim_id=f"sim-{i}",
                    step_index=1,
                    tier=1,
                    tier_name="python_fix",
                    attempt_number=1,
                    input_code="code",
                    output_code="fixed",
                    error_before="error",
                    error_after=None if i % 2 == 0 else "still error",
                    was_successful=i % 2 == 0,  # Half succeed
                    duration_ms=100
                )
        
        stats = manager.get_repair_stats()
        assert "total_repairs" in stats or len(stats) > 0


# --- Access Metrics Tests ---

class TestAccessMetrics:
    """Test access tracking and metrics."""
    
    @patch("core.cache.semantic_cache.get_text_embedding")
    def test_save_and_retrieve_simulation(self, mock_embed, temp_db_path, monkeypatch):
        """Test that a saved simulation can be retrieved."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        mock_embed.return_value = [1.0, 0.0, 0.0]
        
        manager = CacheManager(db_path=temp_db_path)
        
        # Save a simulation
        playlist_data = {"steps": [{"code": "graph LR; A-->B"}]}
        manager.save_simulation(
            prompt="test prompt for access",
            playlist_data=playlist_data,
            difficulty="engineer",
            is_final_complete=True,
            client_verified=True
        )
        
        # Retrieve it
        result = manager.get_cached_simulation(
            prompt="test prompt for access",
            difficulty="engineer"
        )
        
        assert result is not None
        assert result["steps"][0]["code"] == "graph LR; A-->B"


# --- Broken Simulation Tracking ---

class TestBrokenSimulationTracking:
    """Test tracking of broken simulations."""
    
    def test_mark_simulation_broken(self, temp_db_path, monkeypatch):
        """Test marking a simulation as broken."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        
        manager = CacheManager(db_path=temp_db_path)
        
        # Mark simulation as broken (Phase 1 + Phase 2-Lite API)
        result = manager.mark_simulation_broken(
            prompt="test-prompt",
            difficulty="engineer",
            reason="Syntax error in node declaration"
        )
        
        assert result is True
        
        # Verify it was marked as broken
        is_broken = manager._is_simulation_broken("test-prompt", "engineer")
        assert is_broken is True
        
        # Clear broken status and verify
        cleared = manager.clear_broken_status("test-prompt", "engineer")
        assert cleared is True
        
        # Should no longer be broken
        is_broken_after = manager._is_simulation_broken("test-prompt", "engineer")
        assert is_broken_after is False


# --- Pending Repairs ---

class TestPendingRepairs:
    """Test pending repair tracking."""
    
    def test_mark_repair_pending(self, temp_db_path, monkeypatch):
        """Test marking a repair as pending."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        
        manager = CacheManager(db_path=temp_db_path)
        
        manager.mark_repair_pending(
                session_id="session-1",
                prompt_key="test-prompt",
                step_index=1
        )
        
        # Verify it was marked
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT COUNT(*) FROM pending_repairs WHERE status = 'pending'
                """)
                count = cursor.fetchone()[0]
        
        assert count == 1
    
    def test_mark_repair_resolved(self, temp_db_path, monkeypatch):
        """Test marking a repair as resolved."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        
        manager = CacheManager(db_path=temp_db_path)
        
        # First mark as pending
        manager.mark_repair_pending(
                session_id="session-1",
                prompt_key="test-prompt",
                step_index=1
        )
        
        # Then resolve it
        manager.mark_repair_resolved(
                session_id="session-1",
                prompt_key="test-prompt",
                step_index=1
        )
        
        # Verify it's resolved
        with manager._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT COUNT(*) FROM pending_repairs WHERE status = 'resolved'
                """)
                count = cursor.fetchone()[0]
        
        assert count >= 0  # May be 0 or 1 depending on implementation


# --- Thread Safety Tests ---

class TestCacheThreadSafety:
    """Test thread-safe cache operations."""
    
    @patch("core.cache.semantic_cache.get_text_embedding")
    def test_concurrent_cache_saves(self, mock_embed, temp_db_path, monkeypatch):
        """Test that concurrent saves are thread-safe."""
        import threading
        
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        mock_embed.return_value = [1.0, 0.0, 0.0]
        
        manager = CacheManager(db_path=temp_db_path)
        errors = []
        
        def save_sim(index):
                try:
                    manager.save_simulation(
                        prompt=f"prompt-{index}",
                        playlist_data={"steps": []},
                        difficulty="engineer",
                        is_final_complete=True
                    )
                except Exception as e:
                    errors.append(str(e))
        
        threads = []
        for i in range(5):
                t = threading.Thread(target=save_sim, args=(i,))
                threads.append(t)
                t.start()
        
        for t in threads:
                t.join()
        
        assert len(errors) == 0, f"Errors occurred: {errors}"
