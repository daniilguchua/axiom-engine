"""
Session Management with TTL-based expiration and thread safety.
Prevents memory leaks from abandoned sessions.
"""

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Session:
    """Represents a single user session with metadata."""

    vector_store: Any = None
    filename: str | None = None
    chat_history: list = field(default_factory=list)
    full_text: str = ""
    simulation_active: bool = False
    current_sim_data: list = field(default_factory=list)
    current_step_index: int = 0

    created_at: datetime = field(default_factory=datetime.now)
    last_accessed: datetime = field(default_factory=datetime.now)
    pending_repair: bool = False
    repair_step_index: int | None = None

    def touch(self):
        """Update last accessed time."""
        self.last_accessed = datetime.now()

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (for backward compatibility)."""
        return {
            "vector_store": self.vector_store,
            "filename": self.filename,
            "chat_history": self.chat_history,
            "full_text": self.full_text,
            "simulation_active": self.simulation_active,
            "current_sim_data": self.current_sim_data,
            "current_step_index": self.current_step_index,
            "pending_repair": self.pending_repair,
            "repair_step_index": self.repair_step_index,
            "difficulty": getattr(self, "difficulty", "engineer"),
        }


class SessionManager:
    """
    Thread-safe session manager with automatic cleanup.

    Features:
    - TTL-based session expiration (prevents memory leaks)
    - Thread-safe operations
    - Automatic background cleanup
    - Metrics tracking
    """

    DEFAULT_TTL_MINUTES = 60  # Sessions expire after 1 hour of inactivity
    CLEANUP_INTERVAL_SECONDS = 300  # Run cleanup every 5 minutes
    MAX_SESSIONS = 1000  # Hard limit to prevent OOM

    def __init__(self, ttl_minutes: int = DEFAULT_TTL_MINUTES):
        self._sessions: dict[str, Session] = {}
        self._lock = threading.RLock()  # Reentrant lock for nested calls
        self._ttl = timedelta(minutes=ttl_minutes)

        # Metrics
        self._total_sessions_created = 0
        self._total_sessions_expired = 0

        # Start background cleanup thread
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True, name="SessionCleanup")
        self._cleanup_thread.start()
        logger.info(f"SessionManager initialized with TTL={ttl_minutes}min")

    def get_session(self, session_id: str) -> dict[str, Any]:
        """
        Retrieves a session or creates a new one if it doesn't exist.
        Returns a dict for backward compatibility with existing code.
        """
        if not self._validate_session_id(session_id):
            raise ValueError(f"Invalid session ID format: {session_id}")

        with self._lock:
            if session_id not in self._sessions:
                # Check capacity before creating new session
                if len(self._sessions) >= self.MAX_SESSIONS:
                    self._evict_oldest_session()

                self._sessions[session_id] = Session()
                self._total_sessions_created += 1
                logger.info(f"[NEW] Session created: {session_id[:16]}...")

            session = self._sessions[session_id]
            session.touch()

            # Return dict-like interface for backward compatibility
            return SessionProxy(session)

    def _validate_session_id(self, session_id: str) -> bool:
        """Validate session ID format to prevent injection attacks."""
        if not session_id or len(session_id) > 128:
            return False
        import re

        return bool(re.match(r"^[a-zA-Z0-9_-]+$", session_id))

    def reset_session(self, session_id: str) -> bool:
        """Clears chat/sim history but KEEPS the uploaded file (Vector Store)."""
        with self._lock:
            if session_id not in self._sessions:
                logger.warning(f"Reset requested for non-existent session: {session_id}")
                return False

            session = self._sessions[session_id]
            session.chat_history = []
            session.simulation_active = False
            session.current_sim_data = []
            session.current_step_index = 0
            session.pending_repair = False
            session.repair_step_index = None
            session.touch()

            logger.info(f"[RESET] Session reset: {session_id[:16]}...")
            return True

    def nuclear_wipe(self, session_id: str) -> bool:
        """Completely destroys the session (including the file)."""
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                logger.info(f"[WIPE] Session destroyed: {session_id[:16]}...")
                return True
            return False

    def set_repair_pending(self, session_id: str, step_index: int) -> None:
        """Mark that a step is currently being repaired (prevents caching)."""
        with self._lock:
            if session_id in self._sessions:
                session = self._sessions[session_id]
                session.pending_repair = True
                session.repair_step_index = step_index
                logger.debug(f"[REPAIR] Pending for session {session_id[:16]}..., step {step_index}")

    def clear_repair_pending(self, session_id: str) -> None:
        """Clear the repair pending flag after successful repair."""
        with self._lock:
            if session_id in self._sessions:
                session = self._sessions[session_id]
                session.pending_repair = False
                session.repair_step_index = None
                logger.debug(f"[OK] Repair cleared for session {session_id[:16]}...")

    def is_repair_pending(self, session_id: str) -> bool:
        """Check if a repair is currently in progress."""
        with self._lock:
            if session_id in self._sessions:
                return self._sessions[session_id].pending_repair
            return False

    def _evict_oldest_session(self) -> None:
        """Evict the least recently used session when at capacity."""
        if not self._sessions:
            return

        oldest_id = min(self._sessions.keys(), key=lambda k: self._sessions[k].last_accessed)
        del self._sessions[oldest_id]
        self._total_sessions_expired += 1
        logger.warning(f"[WARN] Evicted oldest session due to capacity: {oldest_id[:16]}...")

    def _cleanup_loop(self) -> None:
        """Background thread that periodically cleans up expired sessions."""
        while True:
            time.sleep(self.CLEANUP_INTERVAL_SECONDS)
            self._cleanup_expired()

    def _cleanup_expired(self) -> int:
        """Remove sessions that have exceeded their TTL."""
        now = datetime.now()
        expired_ids = []

        with self._lock:
            for session_id, session in self._sessions.items():
                if now - session.last_accessed > self._ttl:
                    expired_ids.append(session_id)

            for session_id in expired_ids:
                del self._sessions[session_id]
                self._total_sessions_expired += 1

        if expired_ids:
            logger.info(f"[CLEANUP] Removed {len(expired_ids)} expired sessions")

        return len(expired_ids)

    def get_metrics(self) -> dict[str, Any]:
        """Return session manager statistics."""
        with self._lock:
            active_count = len(self._sessions)
            oldest_age = None
            if self._sessions:
                oldest = min(s.created_at for s in self._sessions.values())
                oldest_age = (datetime.now() - oldest).total_seconds()

            return {
                "active_sessions": active_count,
                "total_created": self._total_sessions_created,
                "total_expired": self._total_sessions_expired,
                "oldest_session_age_seconds": oldest_age,
                "max_capacity": self.MAX_SESSIONS,
                "ttl_minutes": self._ttl.total_seconds() / 60,
            }


class SessionProxy(dict):
    """
    Dict-like wrapper around Session for backward compatibility.
    Allows existing code to use session['key'] syntax.
    """

    def __init__(self, session: Session):
        """Initialize proxy from a Session, populating the dict with session data."""
        self._session = session
        super().__init__(session.to_dict())

    def __setitem__(self, key: str, value: Any) -> None:
        """Set a value, syncing back to the underlying Session object."""
        super().__setitem__(key, value)
        if hasattr(self._session, key):
            setattr(self._session, key, value)

    def __getitem__(self, key: str) -> Any:
        """Get a value, always reading fresh from the Session object."""
        if hasattr(self._session, key):
            return getattr(self._session, key)
        return super().__getitem__(key)

    def get(self, key: str, default: Any = None) -> Any:
        """Get a value with a default fallback."""
        try:
            return self[key]
        except KeyError:
            return default

    def update(self, other: dict = None, **kwargs) -> None:
        """Update session with multiple values from a dict and/or keyword arguments."""
        if other:
            for k, v in other.items():
                self[k] = v
        for k, v in kwargs.items():
            self[k] = v
