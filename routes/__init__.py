# routes/__init__.py
"""
Route registration for the AXIOM Engine.
"""

from routes.chat import chat_bp
from routes.debug import debug_bp
from routes.feedback import feedback_bp
from routes.health import health_bp
from routes.repair import repair_bp
from routes.session_routes import session_bp
from routes.upload import upload_bp
from routes.node_inspect import node_inspect_bp


def register_routes(app):
    """Register all route blueprints with the Flask app."""
    app.register_blueprint(chat_bp)
    app.register_blueprint(debug_bp)
    app.register_blueprint(feedback_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(repair_bp)
    app.register_blueprint(session_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(node_inspect_bp)
