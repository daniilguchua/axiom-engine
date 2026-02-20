"""
AXIOM Engine - Educational Simulation Backend
Flask API server with RAG, streaming, and self-healing capabilities.

This is the main entry point that initializes the app and registers all routes.
"""

import logging
import os
import time
import uuid

from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS

from core.config import get_cors_config, init_all
from routes import register_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB upload limit
CORS(app, resources=get_cors_config())
init_all()
register_routes(app)


@app.before_request
def before_request_logging():
    """Attach request ID and start timer for structured logging."""
    g.request_id = str(uuid.uuid4())[:8]
    g.start_time = time.time()


@app.after_request
def after_request_logging(response):
    """Log request method, path, status, and duration."""
    if not request.path.startswith("/static") and request.path != "/health":
        duration_ms = (time.time() - g.get("start_time", time.time())) * 1000
        logger.info(
            "[%s] %s %s → %s (%.0fms)",
            g.get("request_id", "-"),
            request.method,
            request.path,
            response.status_code,
            duration_ms,
        )
    return response


@app.route("/")
def serve_index():
    """Serve the main application page."""
    return send_from_directory(app.static_folder, "index.html")


@app.errorhandler(400)
def bad_request(e):
    """Handle 400 Bad Request errors."""
    return jsonify({"error": "Bad request", "details": str(e)}), 400


@app.errorhandler(404)
def not_found(e):
    """Handle 404 Not Found errors."""
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(413)
def request_entity_too_large(e):
    """Handle 413 Payload Too Large errors."""
    return jsonify({"error": "File too large. Maximum upload size is 16 MB."}), 413


@app.errorhandler(500)
def internal_error(e):
    """Handle 500 Internal Server errors."""
    logger.exception("Internal server error")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"

    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=debug, threaded=True)
