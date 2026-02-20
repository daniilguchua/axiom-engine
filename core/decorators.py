"""
Middleware and route decorators for the AXIOM Engine.
"""

import time
from functools import wraps

from flask import g, jsonify, request


def require_api_key(api_key):
    """
    Factory that creates a decorator to ensure API key is configured.

    Args:
        api_key: The API key to check (passed from config)
    """

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not api_key:
                return jsonify({"error": "Server misconfigured: GEMINI_API_KEY not set"}), 503
            return f(*args, **kwargs)

        return decorated

    return decorator


def require_configured_api_key(f):
    """
    Simplified decorator that checks if API key is configured.
    Imports get_configured_api_key to avoid requiring it as a parameter.
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        from core.config import get_configured_api_key

        if not get_configured_api_key():
            return jsonify({"error": "Server misconfigured: GEMINI_API_KEY not set"}), 503
        return f(*args, **kwargs)

    return decorated


def validate_session(f):
    """Decorator to validate and extract session_id."""

    @wraps(f)
    def decorated(*args, **kwargs):
        # Import here to avoid circular imports
        from core.utils import InputValidator

        # Try to get session_id from X-Session-ID header first, then JSON body or form data
        session_id = request.headers.get("X-Session-ID")

        if not session_id:
            if request.is_json:
                session_id = request.get_json().get("session_id")
            else:
                session_id = request.form.get("session_id")

        # Reject if no session provided (don't auto-generate)
        if not session_id:
            return jsonify({"error": "Session ID required (X-Session-ID header or session_id field)"}), 401

        # Validate format
        if not InputValidator.validate_session_id(session_id):
            return jsonify({"error": "Invalid session_id format"}), 401

        g.session_id = session_id
        return f(*args, **kwargs)

    return decorated


def rate_limit(max_requests: int = 60, window_seconds: int = 60):
    """Simple in-memory rate limiting decorator."""
    requests_log = {}

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            # Use IP + session as key
            client_key = f"{request.remote_addr}_{g.get('session_id', 'anon')}"
            now = time.time()

            # Clean old entries
            requests_log[client_key] = [t for t in requests_log.get(client_key, []) if now - t < window_seconds]

            if len(requests_log.get(client_key, [])) >= max_requests:
                return jsonify({"error": "Rate limit exceeded. Please slow down."}), 429

            requests_log.setdefault(client_key, []).append(now)
            return f(*args, **kwargs)

        return decorated

    return decorator
