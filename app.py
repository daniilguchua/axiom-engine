import os
import logging
import json
import requests
import fitz  # PyMuPDF
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from bs4 import BeautifulSoup
import io
import time
import random

# --- AI & LangChain ---
import google.generativeai as genai
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# --- CONFIGURATION ---
logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)

# API KEY SETUP
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    # For local dev, you might want to hardcode or use a .env file
    # raise ValueError("CRITICAL: GEMINI_API_KEY environment variable not set.")
    print("WARNING: GEMINI_API_KEY not found in environment.")

genai.configure(api_key=api_key)

# EMBEDDINGS SETUP
try:
    embeddings_model = GoogleGenerativeAIEmbeddings(
        model="models/embedding-001",
        google_api_key=api_key
    )
except Exception as e:
    logging.error(f"Embeddings Init Failed: {e}")
    embeddings_model = None

# GLOBAL STATE (In-Memory DB)
DB = {
    "vector_store": None,
    "filename": None,
    "chat_history": [],
    "full_text": ""
}

# --- CORE LOGIC ---

def extract_text_from_pdf(stream, filename):
    """Extracts text from PDF stream with page metadata."""
    pages = []
    metas = []
    try:
        stream.seek(0)
        doc = fitz.open(stream=stream.read(), filetype="pdf")
        for i, page in enumerate(doc):
            text = page.get_text()
            if text.strip():
                pages.append(text)
                metas.append({"source": filename, "page": i + 1})
        return pages, metas, len(doc)
    except Exception as e:
        logging.error(f"PDF Error: {e}")
        return [], [], 0

def extract_text_from_url(url):
    """Scrapes text from a URL."""
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, 'html.parser')
        # Cleanup
        for tag in soup(["script", "style", "nav", "footer", "iframe"]):
            tag.decompose()
        text = soup.get_text(separator=' ', strip=True)
        return [text], [{"source": url}]
    except Exception as e:
        logging.error(f"URL Error: {e}")
        return [], []

def build_vector_index(texts, metas):
    """Creates FAISS vector store."""
    if not texts: return None, 0
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    docs = splitter.create_documents(texts, metadatas=metas)
    if not docs: return None, 0
    
    store = FAISS.from_documents(docs, embeddings_model) 
    return store, len(docs)

# --- ENDPOINTS ---

@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        "loaded": bool(DB["vector_store"]),
        "file": DB["filename"] or "None"
    })

@app.route('/reset', methods=['POST'])
def reset():
    """Wipes chat history but keeps the document."""
    DB["chat_history"] = []
    return jsonify({"status": "Memory Purged"}), 200

@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files: return jsonify({"error": "No file"}), 400
    f = request.files['file']
    
    texts, metas, p_count = extract_text_from_pdf(f.stream, f.filename)
    if not texts: return jsonify({"error": "Empty or unreadable PDF"}), 400

    DB["full_text"] = " ".join(texts)
    DB["vector_store"], chunks = build_vector_index(texts, metas)
    DB["filename"] = f.filename
    DB["chat_history"] = [] # Reset chat on new file
    
    return jsonify({"filename": f.filename, "pages": p_count, "chunks": chunks}), 200

@app.route('/fetch-url', methods=['POST'])
def fetch_url():
    data = request.get_json()
    url = data.get('url')
    if not url: return jsonify({"error": "Missing URL"}), 400
    
    texts, metas = extract_text_from_url(url)
    if not texts: return jsonify({"error": "Could not parse URL"}), 400
    
    DB["full_text"] = texts[0]
    DB["vector_store"], chunks = build_vector_index(texts, metas)
    DB["filename"] = url
    DB["chat_history"] = []
    
    return jsonify({"filename": url, "chunks": chunks}), 200

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_msg = data.get("message", "")

    if "step" in user_msg.lower() or "simulate" in user_msg.lower():
        user_msg += "\n\n[SYSTEM NOTE: Output VALID Mermaid.js. Do NOT escape brackets `\\[`. Use raw `[`.]"
    
    # 1. RETRIEVAL
    context = ""
    sources = []
    if DB["vector_store"]:
        retriever = DB["vector_store"].as_retriever(search_kwargs={"k": 4})
        docs = retriever.invoke(user_msg)
        context = "\n\n".join([d.page_content for d in docs])
        seen = set()
        for d in docs:
            key = f"{d.metadata.get('source')}-{d.metadata.get('page', '')}"
            if key not in seen:
                sources.append(d.metadata)
                seen.add(key)

    # 2. PROMPT ENGINEERING
    history_str = "\n".join([f"{m['role']}: {m['content']}" for m in DB["chat_history"]])
    
    # This Prompt is optimized for the Cyberpunk/Technical aesthetic
   # =========================================================
    #  GHOST SYSTEM PROMPT // VERSION: STABLE_V4
    # =========================================================
    # =========================================================
    #  GHOST SYSTEM PROMPT
    # =========================================================
    system_prompt = """

        ### 1. THE SYNTAX FIREWALL (VIOLATION = SYSTEM CRASH)
        You MUST obey these formatting rules:

        1.  **NO INNER BRACKETS:** Use `( )` inside text, NOT `[ ]`.
        2.  **NO NESTED QUOTES:** Use single quotes `'` inside labels.
        3.  **NO SPACES IN IDs:** Use `NodeA`, not `Node A`.
        4.  **NO LITERAL NEWLINES:** Use `<br/>`.
        5.  **ALWAYS END LINES WITH SEMICOLONS (;)**
        6.  **SUBGRAPH TITLES:** Must use `[ ]`.
        7.  **NO MARKDOWN LISTS (CRITICAL):**
            * **NEVER** use `- Item` or `* Item` inside a node.
            * Mermaid WILL CRASH if you do this.
            * **CORRECT:** `Node["List:<br/>• Item 1<br/>• Item 2"]`
            * **INCORRECT:** `Node["List:\n- Item 1"]`
            
        **IDENTITY:**
        You are **GHOST**, an elite Computer Science Professor. You are also a professional in many academic fields.  You create **High-Fidelity Educational Simulations** and graphs to explain 
        complex topics. 
        
        **MISSION:**
        Teach complex concepts using **Interactive Visualizations** and explanations (if visualizations are not required).
        Remember you are an educational leader and professor. Be creative.  

        **CORE DIRECTIVES:**
        1. **General Assistance:** Answer questions, debug code, and explain concepts clearly and concisely.
        2. **Tone:** Precise, technical, futuristic, and terse. Avoid fluff.
        3. ** Formatting:** Use Markdown for code blocks, bold text for emphasis, and lists for structured data.

        ---
        ### 1. THE PEDAGOGY PROTOCOL
        1. **Explain:** Explaining the concept clearly.
        2. **Visualize:** Generate the simulation graph.
        3. **Data (Hybrid Layer):** If the topic involves numbers (Routing Tables, DB Schemas, Memory Stacks, etc), output a **Markdown Table** immediately after the graph.
        4. **Summarize:** Wrap-up key points.

        ---
        ### 2. THE VISUAL TEMPLATE (MANDATORY)
        If the user asks to "Simulate", "Run", or "Step Through", you **MUST** use this exact Mermaid structure.
        
        **CUSTOMIZATION RULES:**
        - You **MUST** keep the `subgraph` structure (VisualLayer, ExplanationLayer, ControlLayer).
        - You **SHOULD** change the Hex Codes in `classDef` to match the topic (e.g., use Green for biology, Blue for data). Be educational and creative.
        
            **VISUAL STANDARDS (LET IT BREATHE):**
        1.  **NO RIGID SIZES:**
            -   Do **NOT** force pixel widths (e.g., `width:400px`) inside HTML labels.
            -   Let the graph layout engine calculate the perfect size based on the text.

        2.      **THE "GLASS" HUD:**
            -   Use this wrapper for explanations, the Status/Log node, and any lists or data structures needed for algorithms. **keep it flexible** AND format the text elegantly.
            -   `StatusNode["<div style='padding:15px; background:rgba(0,0,0,0.5); border:1px solid #00f3ff; color:white;'>**STEP LOG:**<br/>...content...</div>"]`

        3.  **DYNAMIC STYLING:**
            -   **Active Node:** Bright/Neon (e.g., `fill:#bc13fe`).
            -   **Path:** Use `linkStyle` to highlight the current wire.
            -   **Theme:** Adapt to the topic (Biology = Organic shapes, CS = Geometric).

        **MODE B: STANDARD DIAGRAMS (Static)**
        - Use for "Show", "Map", "Chart", "Explain structure", "Sequence", "Compare".
        - **Tools:** `sequenceDiagram`, `classDiagram`, `erDiagram`, `stateDiagram-v2`, `graph LR`/`TD`.
        - **Constraint:** Subgraph IDs must have NO SPACES. 

        **MODE C: INTERACTIVE SIMULATION (HYBRID ALLOWED)**
        1.  **STATE:** Output ONLY the current step. STOP after the graph.
        2.  **HYBRID DATA:** You are encouraged to place a **Markdown Table** in the text (outside the graph) to show changing data values (like Distance Tables or Memory Stacks, or any needed statistics for the).
        3.  **CONTROLS:** Always include `CMD_NEXT` and `CMD_RESET` and 'CMD_BACK'.

        ---
        ### 3. SYNTAX SAFETY
        1.  **NO MARKDOWN LISTS:** Use `<br/>• Item`.
        2.  **SUBGRAPH TITLES:** Must use quotes: `subgraph ID ["Title"]`.
        3.  **NO INNER BRACKETS:** `Array(i)`, NOT `Array[i]`.   
        
        """
    full_prompt = f"""
    {system_prompt}
    
    **CONTEXT FROM KNOWLEDGE BASE:**
    {context if context else "No document loaded. Answer from general knowledge."}
    
    **HISTORY:**
    {history_str}
    
    **USER:** {user_msg}
    """

    # 3. GENERATION STREAM
    def generate():
        # 1. DETECT: Is this a hidden simulation command?
        # We check 'user_msg' because that holds the raw text "EXECUTE_SIMULATION_STEP..."
        is_sim_update = "EXECUTE_SIMULATION_STEP" in user_msg

        # --- THE REST IS THE SAME ---
        model = genai.GenerativeModel('gemini-2.5-pro')
        stream = model.generate_content(full_prompt, stream=True)
        
        full_response = ""
        for chunk in stream:
            if chunk.text:
                full_response += chunk.text
                yield chunk.text
        
        # Update History
        DB["chat_history"].append({"role": "user", "content": user_msg})
        DB["chat_history"].append({"role": "model", "content": full_response})
        
        # Send Sources
        if sources:
             yield f"\n\n**SOURCES:**\n"
             for s in sources:
                 yield f"- {s.get('source')} (Page {s.get('page')})\n"

    return Response(generate(), mimetype='text/plain')


@app.route('/enhance-prompt', methods=['POST'])
def enhance():
    data = request.get_json()
    msg = data.get("message", "")
    
    # We simply detect if it's a simulation request or a general question
    is_simulation = any(k in msg.lower() for k in ["simulate", "simulation", "step", "interactive", "run", "show me"])

    # --- THE COSTARA METHOD ---
    meta_prompt = f"""
    You are a Prompt Architect. Use the **COSTARA Method** to rewrite the user's request: "{msg}".

    **GOAL:** Create a clear, specific prompt that will make GHOST generate a high-quality interactive diagram or simulation.

    **RULES:**
    1. **DO NOT** output the simulation yourself.
    2. **DO NOT** output JSON, Protocol Headers, or "BEGIN_PAYLOAD".
    3. **OUTPUT ONLY** the rewriten text prompt. Nothing else.
    **C - CONTEXT:** The user is interacting with "GHOST", a High-Fidelity Educational Simulation Engine using Mermaid.js.
    **O - OBJECTIVE:** Create a specific, step-by-step interactive simulation instruction.
    **S - STYLE:** Visually stunning, distinct, and super educational.  Add elements that will help with the educational aspect 
    **T - TONE:** Precise, Technical, and Commanding.
    **A - AUDIENCE:** The GHOST Backend AI (which requires strict syntax compliance).
    **R - RULES (CRITICAL):** 1. Demand **Custom Styling**: "Use `classDef` to distinguish Active, Visited, and Future nodes."
        2. Demand **Flow Highlighting**: "Use `linkStyle` to highlight the active path."
        3. Demand **Interaction**: "Include `CMD_NEXT` and `CMD_RESET` nodes."
        4. Demand **Safety**: "No spaces in IDs, No literal newlines."
    **A - ACTION:** Write the final optimized prompt for GHOST.

    **OUTPUT:** Return ONLY the refined prompt text.
    """

    if not is_simulation:
        # Simpler COSTARA for non-simulation questions
        meta_prompt = f"""
        Use the COSTARA method to enhance this question: "{msg}".
        **C:** User needs technical explanation. **O:** Provide clear, formatted answer. **S:** Cyberpunk/Technical. **T:** Professional. **A:** GHOST AI. **R:** Use Markdown headers and code blocks. **A:** Rewrite the prompt.
        """
    
    try:
        model = genai.GenerativeModel('gemini-2.5-flash') 
        res = model.generate_content(meta_prompt)
        clean_text = res.text.strip().replace('```markdown', '').replace('```', '').strip()
        return jsonify({"enhanced_prompt": clean_text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/analyze-tone', methods=['POST'])
def analyze():
    if not DB["full_text"]: return jsonify({"error": "No text"}), 400
    
    sample = DB["full_text"][:15000]
    prompt = f"""
    Analyze the tone and sentiment of this text.
    Return JSON: {{ "tone": "...", "sentiment": "...", "complexity": "...", "rationale": "..." }}
    Text: {sample}
    """
    model = genai.GenerativeModel('gemini-2.5-pro', generation_config={"response_mime_type": "application/json"})
    res = model.generate_content(prompt)
    return Response(res.text, mimetype='application/json')

@app.route('/summarize', methods=['POST'])
def summarize():
    if not DB["full_text"]: return jsonify({"error": "No text"}), 400
    
    prompt = f"""
    Create a structured Executive Summary of the following text.
    Use ### Headers for sections like "Overview", "Key Points", and "Conclusion".
    Text: {DB["full_text"][:30000]}
    """
    def generate():
        model = genai.GenerativeModel('gemini-2.5-pro')
        stream = model.generate_content(prompt, stream=True)
        for chunk in stream:
            if chunk.text: yield chunk.text
            
    return Response(generate(), mimetype='text/plain')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

# export GEMINI_API_KEY="AIzaSyAhhGZ57rVCarxPyY7euD7yP3Ev0Eqz71Q"
# flask --app app.py run --debug