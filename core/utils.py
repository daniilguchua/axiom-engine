"""
Utility functions for PDF processing, vector indexing, and Mermaid sanitization.
"""

import logging
import os
import re
from typing import Any

import fitz  # PyMuPDF
import numpy as np
import requests
from bs4 import BeautifulSoup
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)


def get_api_key() -> str:
    """Get the Gemini API key from environment with validation."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise OSError("GEMINI_API_KEY environment variable not set. Please set it before running the application.")
    return api_key


def extract_text_from_pdf(stream, filename: str) -> tuple[list[str], list[dict], int]:
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
                metas.append({"source": filename, "page": i + 1, "char_count": len(cleaned)})

        logger.info(f"[PDF] Extracted {len(pages)} pages from {filename}")
        return pages, metas, len(doc)

    except Exception as e:
        logger.error(f"PDF extraction error for {filename}: {e}")
        return [], [], 0


def _clean_pdf_text(text: str) -> str:
    """Clean extracted PDF text by collapsing whitespace and removing null bytes."""
    text = re.sub(r"\s+", " ", text)
    text = text.replace("\x00", "")
    return text.strip()


def extract_text_from_url(url: str) -> tuple[list[str], list[dict]]:
    """
    Scrape text content from a URL.

    Args:
        url: The URL to scrape

    Returns:
        Tuple of (text_list, metadata_list)
    """
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.content, "html.parser")

        # Remove non-content elements
        for tag in soup(["script", "style", "nav", "footer", "iframe", "header", "aside"]):
            tag.decompose()

        text = soup.get_text(separator=" ", strip=True)

        # Basic cleaning
        text = re.sub(r"\s+", " ", text)

        logger.info(f"[URL] Extracted {len(text)} chars from {url}")
        return [text], [{"source": url}]

    except requests.RequestException as e:
        logger.error(f"URL extraction error for {url}: {e}")
        return [], []


def build_vector_index(
    texts: list[str], metas: list[dict], chunk_size: int = 1000, chunk_overlap: int = 100
) -> tuple[Any | None, int]:
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
        embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001", google_api_key=api_key)

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        docs = splitter.create_documents(texts, metadatas=metas)
        vector_store = FAISS.from_documents(docs, embeddings)

        logger.info(f"[INDEX] Built vector index with {len(docs)} chunks")
        return vector_store, len(docs)

    except Exception as e:
        logger.error(f"Vector store error: {e}")
        return None, 0


def get_text_embedding(text: str) -> list[float] | None:
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
        embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001", google_api_key=api_key)
        result = embeddings.embed_query(text)
        return result

    except Exception as e:
        logger.error(f"Embedding generation error: {e}")
        return None


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
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


def sanitize_mermaid_code(mermaid_code: str) -> str:
    """
    Sanitize Mermaid diagram code to fix common LLM generation errors.

    Applies a series of regex-based transformations to fix issues like
    escaped newlines, double-escaped quotes, wrong graph directions,
    malformed shapes, and run-on statements. Acts as a 'Syntax Firewall'
    before rendering.

    Args:
        mermaid_code: Raw Mermaid diagram code from LLM output.

    Returns:
        Sanitized Mermaid code ready for rendering.
    """
    if not mermaid_code:
        return ""

    code = mermaid_code

    # Convert literal "\n" strings to actual newlines (prevents "One Giant Line" bug)
    code = code.replace("\\n", "\n")

    # Convert escaped quotes from LLM JSON output
    code = code.replace('\\"', '"')

    # Remove hanging backslashes (line continuations)
    code = code.replace("\\\n", "\n")

    # Fix remaining escaped quotes
    code = code.replace("\\'", "'")

    # Force horizontal layout
    code = re.sub(r"(graph|flowchart)\s+(TD|TB|BT|RL)\b", r"\1 LR", code, flags=re.IGNORECASE)
    code = re.sub(r"\b(TD|TB|BT|RL)\b(?=\s*[;\n])", "LR", code, flags=re.IGNORECASE)

    # Collapse spaced shape definitions: [ ( -> [(, ( ( -> ((, etc.
    code = re.sub(r"\[\s+\(", "[(", code)
    code = re.sub(r"\(\s+\(", "((", code)
    code = re.sub(r"\)\s+\]", ")]", code)
    code = re.sub(r"\)\s+\)", "))", code)

    # Fix malformed subgraphs with unclosed quotes
    code = re.sub(r'(subgraph\s+[A-Za-z0-9_]+)\["([^"\]]*?)$', r"\1", code, flags=re.IGNORECASE | re.MULTILINE)

    # Ensure newline after subgraph ID to prevent node merging
    code = re.sub(r"(subgraph\s+[A-Za-z0-9_]+)\s+(?=[A-Za-z])", r"\1\n", code)

    # Fix unescaped quotes inside labels
    def fix_internal_quotes(match):
        """Replace double quotes inside bracket-quoted labels with single quotes."""
        content = match.group(1)
        clean_content = content.replace('"', "'")
        return f'["{clean_content}"]'

    code = re.sub(r'\["([^"]*?)"\]', fix_internal_quotes, code)

    # Replace illegal markdown dashes in node labels with bullets
    code = code.replace('["-', '["•').replace("\\n-", "\\n•")

    # Ensure semicolons after classDef statements
    code = re.sub(r"(classDef.*?[^;])(\n|$)", r"\1;\2", code)

    # Split smashed commands and fix endsubgraph typo
    code = re.sub(r"([>])\s*([A-Z])", r"\1\n\2", code)
    code = re.sub(r"endsubgraph", "end", code)

    # Fix malformed stadium/cylinder shapes
    code = re.sub(r'\(\["(.*?)"\];', r'(["\1"]);', code)
    code = re.sub(r'\[\("(.*?)"\)\]', r'[("\1")]', code)

    # Fix mismatched closing brackets
    code = re.sub(r'\["([^"]*?)"\);', r'["\1"];', code)

    # Break run-on link statements onto separate lines
    code = re.sub(r";\s*([A-Za-z0-9_]+.*?-->)", r";\n\1", code)
    code = re.sub(r";\s*([A-Za-z0-9_]+.*?==>)", r";\n\1", code)

    # Remove direction statements inside subgraphs
    code = re.sub(
        r"(subgraph\s+\w+(?:\s*\[.*?\])?)\s*\n\s*direction\s+(?:LR|RL|TB|TD|BT)\s*;?\s*\n",
        r"\1\n",
        code,
        flags=re.IGNORECASE,
    )

    # Join arrows broken across lines
    code = re.sub(r"(-->|==>|---|-\.->)\s*\n\s*(\w)", r"\1 \2", code)

    # Remove empty arrow labels
    code = code.replace('-- "" -->', "-->").replace('-- "" ---', "---")

    # Fix orphaned CSS properties missing values
    code = re.sub(r"stroke-width\s*(?=;|\s*,|\s*$)", "stroke-width:2px", code, flags=re.IGNORECASE)
    code = re.sub(r"stroke-dasharray\s+(\d+)", r"stroke-dasharray:\1", code, flags=re.IGNORECASE)

    # Ensure proper spacing after graph declaration
    code = re.sub(r"(graph\s+(?:LR|TB|TD|RL|BT))([A-Za-z])", r"\1\n\2", code)

    # Collapse double semicolons
    code = re.sub(r";+", ";", code)

    return code


class InputValidator:
    """Validate and sanitize user inputs to prevent injection attacks."""

    # Patterns that could indicate prompt injection
    DANGEROUS_PATTERNS = [
        r"<\|",  # Common prompt delimiter
        r"\|>",  # Common prompt delimiter
        r"SYSTEM:",  # Role injection
        r"ASSISTANT:",  # Role injection
        r"Human:",  # Role injection
        r"<<SYS>>",  # Llama-style system tags
        r"\[INST\]",  # Instruction tags
        r"ignore previous",  # Injection attempt
        r"disregard.*instructions",  # Injection attempt
    ]

    MAX_MESSAGE_LENGTH = 10000
    MAX_SESSION_ID_LENGTH = 128
    SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")

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
            message = message[: cls.MAX_MESSAGE_LENGTH]
            logger.warning(f"Message truncated to {cls.MAX_MESSAGE_LENGTH} chars")

        # Remove dangerous patterns
        for pattern in cls.DANGEROUS_PATTERNS:
            message = re.sub(pattern, "", message, flags=re.IGNORECASE)

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
        filename = re.sub(r"[^\w\s.-]", "", filename)

        # Ensure it has an extension
        if "." not in filename:
            filename += ".pdf"

        return filename[:255]  # Max filename length
