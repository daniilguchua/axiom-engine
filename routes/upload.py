"""
File upload endpoint for PDF processing.
"""

import logging

from flask import Blueprint, request, jsonify, g

from core.config import get_session_manager
from core.decorators import validate_session, require_configured_api_key
from core.utils import extract_text_from_pdf, build_vector_index, InputValidator

logger = logging.getLogger(__name__)

upload_bp = Blueprint('upload', __name__)


@upload_bp.route('/upload', methods=['POST'])
@require_configured_api_key
@validate_session
def upload():
    """Handle PDF file uploads and build vector index."""
    # Validate content type
    content_type = request.content_type
    if content_type and 'multipart/form-data' not in content_type:
        return jsonify({"error": "Content-Type must be multipart/form-data"}), 415
    
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
        # Get session with proper error handling
        try:
            user_db = session_manager.get_session(session_id)
        except ValueError as e:
            logger.error(f"Invalid session: {e}")
            return jsonify({"error": "Invalid session ID"}), 401
        
        if user_db is None:
            logger.error(f"Session not found: {session_id}")
            return jsonify({"error": "Session not found"}), 401
        
        # Extract text from PDF
        texts, metas, page_count = extract_text_from_pdf(file.stream, safe_filename)
        
        if not texts:
            return jsonify({"error": "PDF is empty or unreadable"}), 400
        
        # Build vector index
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