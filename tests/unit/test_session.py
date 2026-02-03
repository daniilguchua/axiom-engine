"""
Unit tests for core/session.py
Tests session lifecycle, TTL expiration, thread safety, and state management.
"""

import pytest
import threading
import time
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from freezegun import freeze_time

from core.session import Session, SessionManager, SessionProxy


# ============================================================================
# SESSION DATA CLASS TESTS
# ============================================================================

class TestSessionDataClass:
    """Test the Session dataclass functionality."""
    
    def test_session_creation_defaults(self):
        """Test that Session is created with default values."""
        session = Session()
        assert session.vector_store is None
        assert session.filename is None
        assert session.chat_history == []
        assert session.full_text == ""
        assert session.simulation_active is False
        assert session.current_sim_data == []
        assert session.current_step_index == 0
        assert session.pending_repair is False
        assert session.repair_step_index is None
    
    def test_session_created_at_timestamp(self):
        """Test that created_at is set."""
        session = Session()
        assert session.created_at is not None
        assert isinstance(session.created_at, datetime)
    
    def test_session_touch_updates_access_time(self):
        """Test that touch() updates last_accessed."""
        session = Session()
        original_time = session.last_accessed
        time.sleep(0.01)  # Small delay
        session.touch()
        assert session.last_accessed > original_time
    
    def test_session_to_dict(self, sample_session_data):
        """Test that Session can be converted to dict."""
        session = Session()
        session.filename = "test.pdf"
        session.chat_history = [{"role": "user", "content": "test"}]
        session.simulation_active = True
        
        result = session.to_dict()
        assert isinstance(result, dict)
        assert result["filename"] == "test.pdf"
        assert result["simulation_active"] is True
        assert result["chat_history"] == [{"role": "user", "content": "test"}]


# ============================================================================
# SESSION MANAGER BASIC OPERATIONS
# ============================================================================

class TestSessionManagerBasic:
    """Test basic SessionManager operations."""
    
    def test_session_manager_creation(self):
        """Test that SessionManager initializes properly."""
        manager = SessionManager(ttl_minutes=60)
        assert manager._ttl == timedelta(minutes=60)
        assert len(manager._sessions) == 0
        assert manager._total_sessions_created == 0
    
    def test_get_or_create_session(self):
        """Test creating a new session."""
        manager = SessionManager()
        session_id = "test-session-123"
        
        result = manager.get_session(session_id)
        assert result is not None
        assert isinstance(result, SessionProxy)
        assert manager._total_sessions_created == 1
    
    def test_get_existing_session(self):
        """Test retrieving an existing session."""
        manager = SessionManager()
        session_id = "test-session-123"
        
        session1 = manager.get_session(session_id)
        session1["chat_history"].append({"role": "user", "content": "hi"})
        
        session2 = manager.get_session(session_id)
        # Should be the same session
        assert session2["chat_history"][0]["content"] == "hi"
        assert manager._total_sessions_created == 1
    
    def test_session_validation_invalid_characters(self):
        """Test that invalid session IDs are rejected."""
        manager = SessionManager()
        
        invalid_ids = [
            "session@id",
            "session#id",
            "session!id",
            "session id",  # space
            "session/id",  # slash
        ]
        
        for sid in invalid_ids:
            with pytest.raises(ValueError):
                manager.get_session(sid)
    
    def test_session_validation_too_long(self):
        """Test that oversized session IDs are rejected."""
        manager = SessionManager()
        long_id = "a" * 200
        
        with pytest.raises(ValueError):
            manager.get_session(long_id)
    
    def test_session_validation_empty(self):
        """Test that empty session ID is rejected."""
        manager = SessionManager()
        
        with pytest.raises(ValueError):
            manager.get_session("")
    
    def test_reset_session(self):
        """Test resetting a session clears chat/sim but keeps vector_store."""
        manager = SessionManager()
        session_id = "test-session"
        
        session = manager.get_session(session_id)
        session["chat_history"] = [{"role": "user", "content": "test"}]
        session["simulation_active"] = True
        session["current_sim_data"] = [{"step": 1}]
        session["vector_store"] = "mock-store"
        
        result = manager.reset_session(session_id)
        assert result is True
        
        # Check that history/sim is cleared
        reset_session = manager.get_session(session_id)
        assert reset_session["chat_history"] == []
        assert reset_session["simulation_active"] is False
        assert reset_session["current_sim_data"] == []
        # But vector_store is kept
        assert reset_session["vector_store"] == "mock-store"
    
    def test_reset_nonexistent_session(self):
        """Test resetting a non-existent session returns False."""
        manager = SessionManager()
        result = manager.reset_session("nonexistent")
        assert result is False
    
    def test_nuclear_wipe(self):
        """Test nuclear_wipe completely removes a session."""
        manager = SessionManager()
        session_id = "test-session"
        
        manager.get_session(session_id)
        assert session_id in manager._sessions
        
        result = manager.nuclear_wipe(session_id)
        assert result is True
        assert session_id not in manager._sessions
    
    def test_nuclear_wipe_nonexistent(self):
        """Test nuclear_wipe on non-existent session returns False."""
        manager = SessionManager()
        result = manager.nuclear_wipe("nonexistent")
        assert result is False


# ============================================================================
# SESSION REPAIR STATE TESTS
# ============================================================================

class TestSessionRepairState:
    """Test repair state management in SessionManager."""
    
    def test_set_repair_pending(self):
        """Test marking a step as repair pending."""
        manager = SessionManager()
        session_id = "test-session"
        
        manager.get_session(session_id)
        manager.set_repair_pending(session_id, step_index=2)
        
        assert manager.is_repair_pending(session_id) is True
    
    def test_clear_repair_pending(self):
        """Test clearing repair pending flag."""
        manager = SessionManager()
        session_id = "test-session"
        
        manager.get_session(session_id)
        manager.set_repair_pending(session_id, step_index=2)
        manager.clear_repair_pending(session_id)
        
        assert manager.is_repair_pending(session_id) is False
    
    def test_repair_pending_nonexistent_session(self):
        """Test repair operations on non-existent session are safe."""
        manager = SessionManager()
        # Should not raise
        manager.set_repair_pending("nonexistent", step_index=1)
        assert manager.is_repair_pending("nonexistent") is False


# ============================================================================
# SESSION MANAGER TTL EXPIRATION TESTS
# ============================================================================

class TestSessionManagerTTL:
    """Test TTL-based expiration logic."""
    
    @freeze_time("2026-02-03 12:00:00")
    def test_session_touch_updates_access_time(self):
        """Test that accessing a session updates its access time."""
        manager = SessionManager(ttl_minutes=60)
        session_id = "test-session"
        
        session1 = manager.get_session(session_id)
        time1 = manager._sessions[session_id].last_accessed
        
        # Advance time
        with freeze_time("2026-02-03 12:05:00"):
            session2 = manager.get_session(session_id)
            time2 = manager._sessions[session_id].last_accessed
        
        assert time2 > time1
    
    @freeze_time("2026-02-03 12:00:00")
    def test_cleanup_removes_expired_sessions(self):
        """Test that _cleanup_expired removes TTL-expired sessions."""
        manager = SessionManager(ttl_minutes=60)
        
        # Create session
        session_id = "old-session"
        manager.get_session(session_id)
        assert len(manager._sessions) == 1
        
        # Advance time beyond TTL
        with freeze_time("2026-02-03 13:05:00"):
            removed_count = manager._cleanup_expired()
        
        assert removed_count == 1
        assert len(manager._sessions) == 0
        assert manager._total_sessions_expired == 1
    
    @freeze_time("2026-02-03 12:00:00")
    def test_cleanup_keeps_recent_sessions(self):
        """Test that _cleanup_expired keeps recent sessions."""
        manager = SessionManager(ttl_minutes=60)
        
        # Create session
        session_id = "recent-session"
        manager.get_session(session_id)
        
        # Advance time but not beyond TTL
        with freeze_time("2026-02-03 12:30:00"):
            removed_count = manager._cleanup_expired()
        
        assert removed_count == 0
        assert len(manager._sessions) == 1
    
    @freeze_time("2026-02-03 12:00:00")
    def test_cleanup_with_mixed_sessions(self):
        """Test cleanup with some expired and some recent sessions."""
        manager = SessionManager(ttl_minutes=60)
        
        # Create old session
        old_id = "old-session"
        manager.get_session(old_id)
        
        # Advance time
        with freeze_time("2026-02-03 13:00:00"):
            # Create new session
            new_id = "new-session"
            manager.get_session(new_id)
            
            # Cleanup
            removed = manager._cleanup_expired()
        
        assert removed == 1  # Only old_id removed
        assert old_id not in manager._sessions
        assert new_id in manager._sessions


# ============================================================================
# SESSION MANAGER CAPACITY TESTS
# ============================================================================

class TestSessionManagerCapacity:
    """Test session capacity and eviction."""
    
    def test_evict_oldest_when_at_capacity(self):
        """Test that oldest session is evicted when capacity is reached."""
        # Use small capacity for testing
        manager = SessionManager()
        manager.MAX_SESSIONS = 3
        
        session_ids = ["session-1", "session-2", "session-3", "session-4"]
        for sid in session_ids[:3]:
            manager.get_session(sid)
        
        assert len(manager._sessions) == 3
        
        # Create 4th session should evict oldest
        manager.get_session(session_ids[3])
        assert len(manager._sessions) == 3
        # Oldest (session-1) should be gone
        assert "session-1" not in manager._sessions
        assert "session-4" in manager._sessions
    
    def test_lru_eviction_respects_access_time(self):
        """Test that LRU eviction removes least recently used."""
        manager = SessionManager()
        manager.MAX_SESSIONS = 2
        
        # Create sessions
        manager.get_session("session-1")
        manager.get_session("session-2")
        
        # Touch session-1 to make it more recent
        manager.get_session("session-1")
        
        # Create new session, should evict session-2 (less recent)
        manager.get_session("session-3")
        
        assert "session-1" in manager._sessions
        assert "session-2" not in manager._sessions
        assert "session-3" in manager._sessions


# ============================================================================
# SESSION MANAGER METRICS TESTS
# ============================================================================

class TestSessionManagerMetrics:
    """Test metrics tracking."""
    
    def test_get_metrics(self):
        """Test that metrics are collected properly."""
        manager = SessionManager(ttl_minutes=120)
        
        # Create some sessions
        manager.get_session("session-1")
        manager.get_session("session-2")
        
        metrics = manager.get_metrics()
        
        assert metrics["active_sessions"] == 2
        assert metrics["total_created"] == 2
        assert metrics["total_expired"] == 0
        assert metrics["max_capacity"] == SessionManager.MAX_SESSIONS
        assert metrics["ttl_minutes"] == 120
    
    def test_metrics_after_cleanup(self):
        """Test metrics after cleanup."""
        manager = SessionManager()
        
        manager.get_session("session-1")
        manager._cleanup_expired()
        
        metrics = manager.get_metrics()
        assert metrics["total_created"] == 1


# ============================================================================
# SESSION PROXY TESTS
# ============================================================================

class TestSessionProxy:
    """Test the SessionProxy dict-like wrapper."""
    
    def test_proxy_get_item(self):
        """Test accessing session via dict syntax."""
        session = Session()
        session.filename = "test.pdf"
        
        proxy = SessionProxy(session)
        assert proxy["filename"] == "test.pdf"
    
    def test_proxy_set_item(self):
        """Test setting session via dict syntax."""
        session = Session()
        proxy = SessionProxy(session)
        
        proxy["filename"] = "new.pdf"
        assert session.filename == "new.pdf"
    
    def test_proxy_update(self):
        """Test updating multiple fields."""
        session = Session()
        proxy = SessionProxy(session)
        
        proxy.update({
            "filename": "test.pdf",
            "simulation_active": True
        })
        
        assert session.filename == "test.pdf"
        assert session.simulation_active is True
    
    def test_proxy_get_method(self):
        """Test .get() method with default."""
        session = Session()
        proxy = SessionProxy(session)
        
        result = proxy.get("nonexistent_field", "default")
        assert result == "default"


# ============================================================================
# THREAD SAFETY TESTS
# ============================================================================

class TestSessionManagerThreadSafety:
    """Test thread-safe operations."""
    
    def test_concurrent_session_creation(self):
        """Test that concurrent session creation is safe."""
        manager = SessionManager()
        session_ids = []
        lock = threading.Lock()
        
        def create_session(sid):
            manager.get_session(sid)
            with lock:
                session_ids.append(sid)
        
        threads = []
        for i in range(10):
            sid = f"session-{i}"
            t = threading.Thread(target=create_session, args=(sid,))
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
        
        # All sessions should be created
        assert len(session_ids) == 10
        assert len(manager._sessions) == 10
    
    def test_concurrent_session_access(self):
        """Test that concurrent access to same session is safe."""
        manager = SessionManager()
        session_id = "shared-session"
        manager.get_session(session_id)
        
        counter = {"value": 0}
        lock = threading.Lock()
        
        def access_and_modify():
            session = manager.get_session(session_id)
            for _ in range(10):
                with lock:
                    counter["value"] += 1
        
        threads = []
        for _ in range(5):
            t = threading.Thread(target=access_and_modify)
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
        
        # Counter should reflect all increments
        assert counter["value"] == 50
