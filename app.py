# app.py
"""
AXIOM Engine - Educational Simulation Backend
Flask API server with RAG, streaming, and self-healing capabilities.

This is the main entry point that initializes the app and registers all routes.
"""

import os
import logging

from flask import Flask, jsonify
from flask_cors import CORS

from core.config import init_all, get_cors_config
from routes import register_routes

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# FLASK APP INITIALIZATION
# ============================================================================

app = Flask(__name__)

# CORS Configuration
CORS(app, resources=get_cors_config())

# Initialize API key and managers
init_all()

# Register all route blueprints
register_routes(app)


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": "Bad request", "details": str(e)}), 400


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(e):
    logger.exception("Internal server error")
    return jsonify({"error": "Internal server error"}), 500


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug,
        use_reloader=debug,
        threaded=True
    )