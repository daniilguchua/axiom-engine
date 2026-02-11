# utils.py
"""
Utility functions for PDF processing, vector indexing, and Mermaid sanitization.
"""

import logging
import re
import os
from typing import List, Tuple, Optional, Any

import fitz  # PyMuPDF
import requests
from bs4 import BeautifulSoup
import numpy as np

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
import google.generativeai as genai

logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

def get_api_key() -> str:
    """Get the Gemini API key from environment with validation."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GEMINI_API_KEY environment variable not set. "
            "Please set it before running the application."
        )
    return api_key


# ============================================================================
# PDF & URL EXTRACTION
# ============================================================================

def extract_text_from_pdf(
    stream, 
    filename: str
) -> Tuple[List[str], List[dict], int]:
    """
    Extract text content from a PDF file.
    
    Args:
        stream: File stream object
        filename: Name of the file (for metadata)
        
    Returns:
        Tuple of (page_texts, metadata_list, page_count)
    """
    pages, metas = [], []
    try:
        stream.seek(0)
        doc = fitz.open(stream=stream.read(), filetype="pdf")
        
        for i, page in enumerate(doc):
            text = page.get_text()
            if text.strip():
                # Basic text cleaning
                cleaned = _clean_pdf_text(text)
                pages.append(cleaned)
                metas.append({
                    "source": filename, 
                    "page": i + 1,
                    "char_count": len(cleaned)
                })
        
        logger.info(f"📄 Extracted {len(pages)} pages from {filename}")
        return pages, metas, len(doc)
        
    except Exception as e:
        logger.error(f"PDF extraction error for {filename}: {e}")
        return [], [], 0


def _clean_pdf_text(text: str) -> str:
    """Clean extracted PDF text."""
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove null bytes
    text = text.replace('\x00', '')
    return text.strip()


def extract_text_from_url(url: str) -> Tuple[List[str], List[dict]]:
    """
    Scrape text content from a URL.
    
    Args:
        url: The URL to scrape
        
    Returns:
        Tuple of (text_list, metadata_list)
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.content, 'html.parser')
        
        # Remove non-content elements
        for tag in soup(["script", "style", "nav", "footer", "iframe", "header", "aside"]):
            tag.decompose()
        
        text = soup.get_text(separator=' ', strip=True)
        
        # Basic cleaning
        text = re.sub(r'\s+', ' ', text)
        
        logger.info(f"🌐 Extracted {len(text)} chars from {url}")
        return [text], [{"source": url}]
        
    except requests.RequestException as e:
        logger.error(f"URL extraction error for {url}: {e}")
        return [], []


# ============================================================================
# VECTOR INDEX
# ============================================================================

def build_vector_index(
    texts: List[str], 
    metas: List[dict],
    chunk_size: int = 1000,
    chunk_overlap: int = 100
) -> Tuple[Optional[Any], int]:
    """
    Build a FAISS vector index from text documents.
    
    Args:
        texts: List of text strings
        metas: List of metadata dicts
        chunk_size: Size of text chunks
        chunk_overlap: Overlap between chunks
        
    Returns:
        Tuple of (vector_store, chunk_count)
    """
    if not texts:
        return None, 0
    
    try:
        api_key = get_api_key()
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=api_key
        )
        
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        
        docs = splitter.create_documents(texts, metadatas=metas)
        vector_store = FAISS.from_documents(docs, embeddings)
        
        logger.info(f"🔢 Built vector index with {len(docs)} chunks")
        return vector_store, len(docs)
        
    except Exception as e:
        logger.error(f"Vector store error: {e}")
        return None, 0


# ============================================================================
# EMBEDDINGS
# ============================================================================

def get_text_embedding(text: str) -> Optional[List[float]]:
    """
    Generate a vector embedding for text using Gemini.
    
    Args:
        text: The text to embed
        
    Returns:
        List of floats representing the embedding, or None on error
    """
    if not text or not text.strip():
        return None
    
    try:
        api_key = get_api_key()
        genai.configure(api_key=api_key)

        
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type="retrieval_query"
        )
        return result['embedding']
        
    except Exception as e:
        logger.error(f"Embedding generation error: {e}")
        return None


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """
    Calculate cosine similarity between two vectors.
    
    Args:
        vec_a: First vector
        vec_b: Second vector
        
    Returns:
        Similarity score between 0 and 1
    """
    if not vec_a or not vec_b:
        return 0.0
    
    a = np.array(vec_a)
    b = np.array(vec_b)
    
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return float(np.dot(a, b) / (norm_a * norm_b))


# ============================================================================
# MERMAID SANITIZATION
# ============================================================================

import re

import re

import re

def sanitize_mermaid_code(mermaid_code: str) -> str:
    """
    Sanitize Mermaid diagram code to fix common LLM generation errors.
    Acts as a 'Syntax Firewall' before rendering.
    """
    if not mermaid_code:
        return ""
    
    code = mermaid_code

    # 0. CRITICAL: Convert literal "\n" strings to actual newlines
    # This prevents the "One Giant Line" bug
    code = code.replace('\\n', '\n')

    # 0b. CRITICAL: Convert escaped quotes from LLM responses
    # LLMs sometimes return \" instead of " in their JSON output
    code = code.replace('\\"', '"')

    # 1. Remove hanging backslashes (line continuations)
    code = code.replace('\\\n', '\n')
    
    # 2. Fix Double Escapes
    code = code.replace('\\"', '"').replace("\\'", "'")

    # 3. BASIC CLEANUP - Force horizontal layout
    code = re.sub(r'(graph|flowchart)\s+(TD|TB|BT|RL)\b', r'\1 LR', code, flags=re.IGNORECASE)
    code = re.sub(r'\b(TD|TB|BT|RL)\b(?=\s*[;\n])', 'LR', code, flags=re.IGNORECASE)

    # 4. FIX: Collapse "Spaced" Shape Definitions (The fix for your current error)
    # The LLM writes "A[ ("Label") ]" (Cylinder) or "B( ("Label") )" (Circle) with spaces.
    # We must collapse them to "A[(" and "B((" to be valid Mermaid.
    
    # Fix Cylinder: [ ( -> [(
    code = re.sub(r'\[\s+\(', '[(', code)
    # Fix Circle: ( ( -> ((
    code = re.sub(r'\(\s+\(', '((', code)
    # Fix Cylinder End: ) ] -> )]
    code = re.sub(r'\)\s+\]', ')]', code)
    # Fix Circle End: ) ) -> ))
    code = re.sub(r'\)\s+\)', '))', code)

    # 5. FIX: Malformed Subgraph Definitions (ONLY if truly malformed)
    # Valid: subgraph ID[Label] or subgraph ID
    # Invalid: subgraph ID["unclosed or subgraph ID garbage text
    # Strategy: Only strip if we detect unclosed quotes or invalid syntax
    # Otherwise, preserve the label

    # Fix only truly malformed subgraphs with unclosed quotes
    code = re.sub(r'(subgraph\s+[A-Za-z0-9_]+)\["([^"\]]*?)$', r'\1', code, flags=re.IGNORECASE | re.MULTILINE)

    # 6. FIX: Ensure Newline after Subgraph ID
    # Prevents "subgraph GRAPH A" (where A is a node) from merging
    code = re.sub(r'(subgraph\s+[A-Za-z0-9_]+)\s+(?=[A-Za-z])', r'\1\n', code)

    # 7. FIX: Unescaped quotes inside labels
    def fix_internal_quotes(match):
        content = match.group(1)
        clean_content = content.replace('"', "'")
        return f'["{clean_content}"]'
    code = re.sub(r'\["([^"]*?)"\]', fix_internal_quotes, code)

    # 8. FIX: Illegal markdown lists in nodes
    code = code.replace('["-', '["•').replace('\\n-', '\\n•')

    # 9. FIX: Missing semicolons after classDef
    code = re.sub(r'(classDef.*?[^;])(\n|$)', r'\1;\2', code)

    # 10. FIX: "Smashed" commands
    code = re.sub(r'([>])\s*([A-Z])', r'\1\n\2', code)
    code = re.sub(r'endsubgraph', 'end', code)

    # 11. FIX: Malformed stadium/cylinder shapes (Legacy fix)
    code = re.sub(r'\(\["(.*?)"\];', r'(["\1"]);', code)
    code = re.sub(r'\[\("(.*?)"\)\]', r'[("\1")]', code) 

    # 12. FIX: Mismatched brackets
    code = re.sub(r'\["([^"]*?)"\);', r'["\1"];', code)

    # 13. FIX: Run-on link statements
    code = re.sub(r';\s*([A-Za-z0-9_]+.*?-->)', r';\n\1', code)
    code = re.sub(r';\s*([A-Za-z0-9_]+.*?==>)', r';\n\1', code)

    # 14. FIX: Remove direction statements inside subgraphs
    code = re.sub(r'(subgraph\s+\w+(?:\s*\[.*?\])?)\s*\n\s*direction\s+(?:LR|RL|TB|TD|BT)\s*;?\s*\n', r'\1\n', code, flags=re.IGNORECASE)

    # 15. FIX: Join arrows broken across lines
    code = re.sub(r'(-->|==>|---|-\.->)\s*\n\s*(\w)', r'\1 \2', code)

    # 16. FIX: Empty arrow labels
    code = code.replace('-- "" -->', '-->').replace('-- "" ---', '---')

    # 17. FIX: Orphaned CSS properties
    code = re.sub(r'stroke-width\s*(?=;|\s*,|\s*$)', 'stroke-width:2px', code, flags=re.IGNORECASE)
    code = re.sub(r'stroke-dasharray\s+(\d+)', r'stroke-dasharray:\1', code, flags=re.IGNORECASE)

    # 18. FIX: Ensure proper spacing after graph declaration
    code = re.sub(r'(graph\s+(?:LR|TB|TD|RL|BT))([A-Za-z])', r'\1\n\2', code)

    # 19. FINAL CLEANUP: Double semicolons
    code = re.sub(r';+', ';', code)
    
    return code
# ============================================================================
# INPUT VALIDATION (Security)
# ============================================================================

class InputValidator:
    """Validate and sanitize user inputs to prevent injection attacks."""
    
    # Patterns that could indicate prompt injection
    DANGEROUS_PATTERNS = [
        r'<\|',           # Common prompt delimiter
        r'\|>',           # Common prompt delimiter
        r'SYSTEM:',       # Role injection
        r'ASSISTANT:',    # Role injection
        r'Human:',        # Role injection
        r'<<SYS>>',       # Llama-style system tags
        r'\[INST\]',      # Instruction tags
        r'ignore previous',  # Injection attempt
        r'disregard.*instructions',  # Injection attempt
    ]
    
    MAX_MESSAGE_LENGTH = 10000
    MAX_SESSION_ID_LENGTH = 128
    SESSION_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')
    
    @classmethod
    def sanitize_message(cls, message: str) -> str:
        """
        Sanitize a user message by removing potential injection patterns.
        
        Args:
            message: Raw user message
            
        Returns:
            Sanitized message
        """
        if not message:
            return ""
        
        # Truncate if too long
        if len(message) > cls.MAX_MESSAGE_LENGTH:
            message = message[:cls.MAX_MESSAGE_LENGTH]
            logger.warning(f"Message truncated to {cls.MAX_MESSAGE_LENGTH} chars")
        
        # Remove dangerous patterns
        for pattern in cls.DANGEROUS_PATTERNS:
            message = re.sub(pattern, '', message, flags=re.IGNORECASE)
        
        return message.strip()
    
    @classmethod
    def validate_session_id(cls, session_id: str) -> bool:
        """
        Validate a session ID format.
        
        Args:
            session_id: The session ID to validate
            
        Returns:
            True if valid, False otherwise
        """
        if not session_id:
            return False
        if len(session_id) > cls.MAX_SESSION_ID_LENGTH:
            return False
        return bool(cls.SESSION_ID_PATTERN.match(session_id))
    
    @classmethod
    def sanitize_filename(cls, filename: str) -> str:
        """
        Sanitize a filename to prevent path traversal.
        
        Args:
            filename: Raw filename
            
        Returns:
            Safe filename
        """
        if not filename:
            return "unnamed"
        
        # Remove path separators and dangerous characters
        filename = os.path.basename(filename)
        filename = re.sub(r'[^\w\s.-]', '', filename)
        
        # Ensure it has an extension
        if '.' not in filename:
            filename += '.pdf'
        
        return filename[:255]  # Max filename length