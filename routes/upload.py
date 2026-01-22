# routes/upload.py
"""
File upload endpoint for PDF processing.
"""

import logging

from flask import Blueprint, request, jsonify, g

from core.config import get_configured_api_key, get_session_manager
from core.decorators import validate_session
from core.utils import extract_text_from_pdf, build_vector_index, InputValidator

logger = logging.getLogger(__name__)

upload_bp = Blueprint('upload', __name__)


def _require_api_key(f):
    """Local wrapper for require_api_key decorator."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_configured_api_key():
            return jsonify({
                "error": "Server misconfigured: GEMINI_API_KEY not set"
            }), 503
        return f(*args, **kwargs)
    return decorated


@upload_bp.route('/upload', methods=['POST'])
@_require_api_key
@validate_session
def upload():
    """Handle PDF file uploads and build vector index."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400
    
    # Validate and sanitize filename
    safe_filename = InputValidator.sanitize_filename(file.filename)
    
    if not safe_filename.lower().endswith('.pdf'):
        return jsonify({"error": "Only PDF files are supported"}), 400
    
    session_id = g.session_id
    session_manager = get_session_manager()
    
    try:
        # Extract text from PDF
        texts, metas, page_count = extract_text_from_pdf(file.stream, safe_filename)
        
        if not texts:
            return jsonify({"error": "PDF is empty or unreadable"}), 400
        
        # Build vector index
        user_db = session_manager.get_session(session_id)
        user_db["full_text"] = " ".join(texts)
        user_db["vector_store"], chunk_count = build_vector_index(texts, metas)
        user_db["filename"] = safe_filename
        user_db["chat_history"] = []
        
        logger.info(f"📄 Uploaded {safe_filename}: {page_count} pages, {chunk_count} chunks")
        
        return jsonify({
            "filename": safe_filename,
            "pages": page_count,
            "chunks": chunk_count,
            "session_id": session_id
        }), 200
        
    except Exception as e:
        logger.exception(f"Upload failed for {safe_filename}")
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500