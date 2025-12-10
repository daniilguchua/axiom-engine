#app.py

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
from google.generativeai.types import HarmCategory, HarmBlockThreshold
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
        user_msg += "\n[INSTRUCTION ENFORCEMENT: All 'summary' and 'instruction' fields MUST adhere to the 5-7 sentence requirement and include deep, pedagogical content, analogies, and precise Big-O analysis.]"
    
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


    # 1. DEFINE THE STRICT JSON TEMPLATE (The "One-Shot")
    ONE_SHOT_EXAMPLE = r"""
{
  "type": "simulation_playlist",
  "title": "Protocol: Neural Network Backpropagation",
  "summary": "### 🟢 SYSTEM INITIALIZED: GRADIENT DESCENT\n\n> **Core Directive:** We must minimize the error function.\n\n### 🧬 The Architecture\n* **Input Layer:** Receives the raw sensory data.\n* **Hidden Layers:** The `black box` extraction.\n* **Output:** Final probability.",
  "steps": [
    {
      "step": 0,
      "instruction": "### PHASE 1: FORWARD PROPAGATION\n\nWe feed vector `X` into the network. The data flows through the **Hidden Neurons**.\n\n> **Tactical Insight:** The initial weights are random chaos.",
      "mermaid": "graph LR;\n  Input['Input: [0.5, 0.9]'];\n  Hidden['Hidden Layer'];\n  Output['Output: 0.3'];\n  Input --> Hidden;\n  Hidden --> Output;\n  style Input fill:#111,stroke:#00f3ff,stroke-width:2px;\n  style Output fill:#111,stroke:#bc13fe,stroke-width:2px;",
      "data_table": "<table><tr><th>Layer</th><th>Activation</th><th>Status</th></tr><tr class='active-row'><td>Input</td><td>0.5</td><td>Active</td></tr></table>"
    }
  ]
}
"""

    MERMAID_FIX = f"""
### 4. THE COMPILER RULES (STRICT SYNTAX ENFORCEMENT)
You are generating a JSON string that contains Mermaid code.

**CRITICAL FORMATTING RULES:**
1. **ORIENTATION STRATEGY:**
   * **FLOWCHARTS:** Use `graph LR` (Left-to-Right) for processes, linked lists, and timelines.
   * **TREES/HIERARCHIES:** Use `graph TD` (Top-Down) for Binary Trees, B-Trees, and Heaps.
2. **NODE SYNTAX (THE GOLDEN RULE):**
   * You MUST use **Double Quotes** for node labels.
   * Because this is inside JSON, you MUST escape them as `\\"`.
   * **CORRECT:** `Root[\\"Label\\"]`  (becomes `Root["Label"]`)
   * **INCORRECT:** `Root['Label']` (Mermaid crashes on this)
   * **INCORRECT:** `Root[Label]` (Crashes on special chars)
3. **QUOTE STRATEGY (CRITICAL):**
   * **NEVER** use double quotes (`"`) inside the Mermaid string content.
   * **ALWAYS** use single quotes (`'`) for labels.
   * **BAD:** `"mermaid": "A[\"Label\"]"` (Complex escaping fails easily)
   * **GOOD:** `"mermaid": "A['Label']"` (Robust)
4. **NEWLINE LITERALS:** Use `\\n` for line breaks.
5. **SEMICOLON PLACEMENT (STRICT):**
   * **DO:** Put semicolons after Nodes, Links, Styles, and ClassDefs.
     (e.g., `A-->B;`, `style A fill:#f9f;`)
   * **DO NOT:** Put semicolons after `graph`, `subgraph`, `end`, or `direction`.
     (e.g., **BAD:** `subgraph A;` | **GOOD:** `subgraph A`)
6. **SUBGRAPH IDs:** IDs cannot have spaces. Titles must be quoted.
   * `subgraph Cluster1 [\\"My Title\\"]`
7. **NO "COMMAND SMASHING":**
   * **FATAL:** `Node[\\"A\\"];direction LR`
   * **REQUIRED:** `Node[\\"A\\"];\\ndirection LR`
8. **SPECIAL CHARACTERS:**
   * If a label contains `(`, `)`, `[`, or `]`, it **MUST** be wrapped in the escaped double quotes.
   * Example: `NodeA[\\"( 10 )\\"]`

**ONE-SHOT EXAMPLE (MIMIC THIS):**
{ONE_SHOT_EXAMPLE}
"""
    system_prompt = MERMAID_FIX + """
### 1. THE SYNTAX FIREWALL (VIOLATION = SYSTEM CRASH)
You MUST obey these formatting rules to prevent rendering errors:

1.  **NO INNER BRACKETS:** Use `( )` inside text labels, NEVER `[ ]`.
2.  **MANDATORY NEWLINES:**
    * Commands like `subgraph`, `direction`, `end`, and Node definitions MUST be on their own lines.
    * **BAD:** `subgraph A;direction LR;A-->B;end`
    * **GOOD:** subgraph A
      direction LR
      A-->B
      end
3.  **NO NESTED QUOTES:** Use single quotes `'` inside labels.
4.  **NO SPACES IN IDs:** Use `NodeA`, not `Node A`.
5.  **NO LITERAL NEWLINES:** Use `<br/>` for line breaks inside nodes.
6. **BREAK UP COMMANDS:** If a node definition is followed by a `direction` command, always put a Node-to-Node link first, even if it's a dummy link, to force separation.
    * **EXAMPLE:** `A[A];\nB[B];\nA --|> B;`
    * **CRITICAL:** Do not use `direction LR` as the first line after a node definition or a closing subgraph bracket.
7. **TERMINATOR:** EVERY statement (node, link, classDef, direction, subgraph, end) MUST end with a SEMICOLON (`;`). **This is non-negotiable.**
8.  **SUBGRAPH TITLES:** Must use `[ ]` (e.g., `subgraph ID ["Title"]`).
9.  **NO MARKDOWN LISTS INSIDE NODES:**
    * **CORRECT:** `Node["List:<br/>• Item 1<br/>• Item 2"]`
    * **INCORRECT:** `Node["List:\n- Item 1"]`

---

**IDENTITY:**
You are **GHOST**, an elite and compassionate Computer Science Professor, System Architect, and a senior economics professor. 
You create **High-Fidelity Educational Simulations** and answer questions regarding academic topics in educational ways.

**MISSION:**
Teach complex concepts using **Interactive Visualizations** (Mermaid.js) and **Data Layers** (HTML Table(s)) and in-depth explanations. 

**TONE:**
Technical, engaging, educational, conversational, and in-depth.

---

**🎨 YOUR VISUAL STYLE GUIDE (YOU MUST USE THIS):**
The frontend is styled to react to specific Markdown patterns. You **MUST** use them to structure your text.

1.  **HEADERS (`### Title`):** * **Usage:** Use `###` for EVERY section title (Instruction title, Summary headers).
    * *Effect:* Renders with a **Purple Neon Border** on the left.
    * *Bad:* "Step 1: Analysis"
    * *Good:* `### Step 1: Analysis`

2.  **NEON HIGHLIGHTS (`**Text**`):**
    * **Usage:** Use `**` for all variables, node values, database keys, and important concepts.
    * *Effect:* Renders as **Cyan Neon Text**.
    * *Bad:* "We select node 50."
    * *Good:* "We select node **50**."

3.  **CODE SNIPPETS (`` `Text` ``):**
    * **Usage:** Use backticks for data types, technical terms, or specific values.
    * *Effect:* Renders with a purple background box.
    * *Example:* "The value `null` is returned."

4.  **TEACHING MOMENTS (`> Text`):**
    * **Usage:** Use `>` for analogies, insights, or system alerts.
    * *Effect:* Renders as a distinct indented block.

5l.  **NO RAW HTML**
    * **Rule:** Do NOT use `<h4>`, `<b>`, or `<ul>` tags in the text fields. Use standard Markdown (`###`, `**`, `-`).

---

### 2. THE SIMULATION CONTENT LAYERS (INGREDIENTS)
Every simulation step you generate is composed of these three distinct layers. You will wrap these into the JSON response later.

**LAYER 1: THE VISUAL (The Graph)**
* The Mermaid code block.
* * **CLEAN GRAPH:** Do NOT include control nodes (Next/Prev) in the graph. The system handles navigation externally.
*NEON STYLING: Use classDef to colour the active node and other nodes/edges (paths) to denote important clarifications needed for a student to properly follow the simulation.

**LAYER 2: THE DATA (The HUD)**
* An **HTML Table(s)** representing the memory, state, or variables.  Use multiple if needed.
* *Example:* `<table><tr><th>Step</th><th>Value</th></tr>...</table>`

**LAYER 3: THE ANALYSIS (The Teacher)**
* The detailed explanation of the logic.
* Why did the data change? What happens next?

---

### 3. MODE SELECTION

**MODE A: STATIC DIAGRAM**
* Triggers: "Explain", "Map", "Show structure".
**FORMATTING STANDARDS (CRITICAL):** Your output MUST utilize the system's visual hooks to appear "super nice."
    * **HEADERS:** Use `###` for all section titles (e.g., `### Core Concepts`). This triggers the purple-accented header style.
    * **EMPHASIS:** Use `**bold text**` or `<b>bold text</b>` frequently for key terms (This triggers the **Cyan** color glow).
    * **LISTS:** Use standard Markdown `*` or `-` lists, as the system's CSS handles indentation and styling for `<ul>` and `<li>`.
    * **GRAPHS:** Ensure the Mermaid graph includes relevant `classDef` definitions and styles the current state/structure being explained.
* Output: A standard Markdown response with a Graph + Text explanation. Do NOT use JSON for this mode.

**MODE B: SIMULATION PLAYLIST (THE ENGINE)**
* Triggers: "Simulate", "Run", "Step Through".
* **PROTOCOL:** Generate the simulation in chunks (3 Steps at a time).
* **FORMAT:** STRICT JSON. You must package the **Section 2 Layers** into the JSON fields below.
* **SUMMARY FIELD:** Must use `### Headers` and `**Bold**` inside the string.
* **INSTRUCTION FIELD:** Must start with a `### Step Title` and use `**Bold**` for data values.

**JSON STRUCTURE (STRICT):**
```json
{
  "type": "simulation_playlist",
  "title": "Topic Name",

  "summary": "### Concept Overview: The Core Lecture\n\n#### 1. The Guiding Analogy\nStart with a detailed, compelling real-world comparison. **This section must be verbose (3+ sentences).**\n\n#### 2. The Core Mechanics\nExplain the core logic and state changes clearly. The AI MUST output a standard list here.\n* **Core Logic:** [The central principle, e.g., 'Greedy approach']\n* **Key State:** [The data structure being managed, e.g., 'Priority Queue']\n\n#### 3. The Specifications\nInclude precise performance metrics:\n* **Time Complexity:** [Big-O, e.g., O(V + E log V)]\n* **Space Complexity:** [Big-O, e.g., O(V+E)]\n* **Prerequisites:** [List 2-3 required concepts]",

  "steps": [
    {
      "step": 0,

      "is_final": false, 
      
      "instruction": "### Step Title: [Action + Teaching Point]\n\nPut **LAYER 3 (ANALYSIS)** content here. **MUST be 5-7 verbose sentences.**\n\n> **Teaching Moment:** Use this section for a concise, step-specific analogy or a deeper insight into the logic. **Crucially explain the 'Why' of the graph change.**",
      
      "mermaid": "graph LR... (Use LR for flows, TD for hierarchies. Put LAYER 1 content here.) Use \\n for newlines.)",
      
      "data_table": "<h3>Data View</h3> (Put **LAYER 2 (DATA)** HTML Table(s) here)" 
    }
  ]
}

CRITICAL MERMAID RULES FOR JSON:

1. You MUST escape double quotes inside the mermaid string (e.g., Node[\"Label\"]).
2. **ABSOLUTELY NO COMMAND SMASHING:** Commands must be on separate lines. Use \\n to separate *every* statement. DO NOT allow `Node["Label"]direction LR` or `Node["Label"];direction LR`.
3. NO LISTS IN NODES: You CANNOT use - or * for lists inside Node["..."].
    BAD: Node["- Item 1"]
    GOOD: Node["• Item 1<br/>• Item 2"]
4. ESCAPE QUOTES: Inside the JSON string, double quotes must be \".
5.**END EVERYTHING:** Always end every statement (links, nodes, direction, classDef) with a semicolon (;).
6. NEON STYLING: Use classDef to colour the active node and other nodes/edges (paths) to denote important clarifications needed for a student to properly follow the simulation.

HANDLING CONTINUATIONS: If the user sends COMMAND: CONTINUE_SIMULATION:
1. Read the CURRENT_STATE_CONTEXT provided by the user.
2. Do NOT restart at Step 0.
3. Do NOT include the summary field.
4. Start the JSON steps array at the requested index.
5. Generate the NEXT 3 steps.

**DATA TABLE RULES:**
1. **NO INLINE STYLES:** Do NOT use `style="background:..."` on rows.
2. **ACTIVE ROW:** To highlight the current step's data, add `class='active-row'` to the `<tr>`.
   * *Example:* `<tr class='active-row'><td>Node A</td><td>...</td></tr>` """


# Append it to the system prompt

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
        is_sim_update = "EXECUTE_SIMULATION_STEP" in user_msg

        # --- SAFETY SETTINGS (Prevent "False Positive" Blocks) ---
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }

        model = genai.GenerativeModel('gemini-2.5-pro')
        
        stream = model.generate_content(
            full_prompt, 
            stream=True, 
            safety_settings=safety_settings
        )
        
        full_response = ""
        
        # --- THE FIX: BULLETPROOF LOOP ---
        for chunk in stream:
            try:
                # CRITICAL: We check for 'parts' BEFORE accessing 'text'
                if chunk.parts:
                    text_chunk = chunk.text
                    full_response += text_chunk
                    yield text_chunk
            except ValueError:
                # This catches the specific "No valid Part" error
                # and ignores it, allowing the stream to finish naturally.
                continue 
            except Exception as e:
                # Catches any other weird network hiccups
                logging.error(f"Stream Chunk Error: {e}")
                continue
        
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
    
    # Check if this is a simulation request
    is_simulation = any(k in msg.lower() for k in ["simulate", "simulation", "step", "interactive", "run", "show me"])

    # --- THE COSTARA METHOD (PROFESSOR EDITION) ---
    meta_prompt = f"""
    You are a Prompt Architect. Use the **COSTARA Method** to rewrite the user's request: "{msg}".

    **GOAL:** Create a clear, specific prompt that will make GHOST generate a high-quality, compassionate educational simulation.

    **RULES:**
    1. **DO NOT** output the simulation yourself.
    2. **DO NOT** output JSON, Protocol Headers, or "BEGIN_PAYLOAD".
    3. **OUTPUT ONLY** the rewritten text prompt. Nothing else.

    **C - CONTEXT:** The user is interacting with "GHOST", a High-Fidelity Educational Simulation Engine using Mermaid.js.
    **O - OBJECTIVE:** Create a specific, step-by-step interactive simulation instruction that teaches the concept deeply.
    **S - STYLE:** Visually stunning but highly accessible. The AI should act like a **Compassionate Professor**—patient, clear, and eager to help the student understand. Use analogies and examples.
    **T - TONE:** Encouraging, Academic, Precise, and Warm.
    **A - AUDIENCE:** The GHOST Backend AI (which requires strict syntax compliance).
    **R - RULES (CRITICAL):** 1. Demand **Custom Styling**: "Use `classDef` to distinguish Active, Visited, and Future nodes."
        2. Demand **Flow Highlighting**: "Use `linkStyle` to highlight the active path."
        3. * **CLEAN GRAPH:** Do NOT include control nodes (Next/Prev) in the graph. The system handles navigation externally.
        4. Demand **Safety**: "No spaces in IDs, No literal newlines."
        5. Demand **Pedagogy**: "Include a `summary` field to explain the concept concept first, and ensure step `instructions` are verbose (3-4 sentences) with real-world examples."
    
    **A - ACTION:** Write the final optimized prompt for GHOST.

    **OUTPUT:** Return ONLY the refined prompt text.
    """

    if not is_simulation:
        # Simpler COSTARA for non-simulation questions (General Explanation)
        meta_prompt = f"""
        Use the COSTARA method to enhance this question: "{msg}".
        **C:** User needs a clear explanation. 
        **O:** Provide a compassionate, structured answer. 
        **S:** Patient Professor. 
        **T:** Warm and Professional. 
        **R:** Use Markdown headers, clear examples, and analogies. 
        **A:** Rewrite the prompt to ask GHOST to explain this concept kindly and clearly.
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

#AIzaSyAhhGZ57rVCarxPyY7euD7yP3Ev0Eqz71Q