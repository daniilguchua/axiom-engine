# RAG Document-Chat Project (Step 2 - Complete)

This is the complete, functional full-stack Retrieval-Augmented Generation (RAG) application.

It uses a Flask (Python) backend and a vanilla HTML/JS/Tailwind frontend. The backend uses the **Google Gemini API** for generation and **FAISS** (a vector store) for retrieval.

## How to Run This Project in VS Code

### 1. 🛑 CRITICAL: Set Your API Key

This project will not run without a Google Gemini API key.

1.  **Get Your Key:** Go to Google AI Studio ([https://aistudio.google.com/](https://aistudio.google.com/)) and create an API key.
2.  **Set the Environment Variable:** You must set this key in the terminal you use to run the backend.

    * **On macOS/Linux:**
        ```bash
        export GEMINI_API_KEY="YOUR_API_KEY_HERE"
        ```
    * **On Windows (PowerShell):**
        ```bash
        $env:GEMINI_API_KEY="YOUR_API_KEY_HERE"
        ```
    * **On Windows (Command Prompt):**
        ```bash
        set GEMINI_API_KEY=YOUR_API_KEY_HERE
        ```
    **Important:** You must set this variable *in the same terminal* where you will run Flask, *before* you run it.

### 2. Project Setup (Backend)

1.  **Open Project in VS Code:** Open the `rag-chat-project` folder in VS Code.
2.  **Open the VS Code Terminal:** Go to `Terminal` > `New Terminal`.
3.  **Create a Python Virtual Environment:**
    ```bash
    # On macOS/Linux
    python3 -m venv venv
    
    # On Windows
    python -m venv venv
    ```
4.  **Activate the Virtual Environment:**
    * **On macOS/Linux:**
        ```bash
        source venv/bin/activate
        ```
    * **On Windows (PowerShell):**
        ```bash
        .\venv\Scripts\Activate.ps1
        ```
    Your terminal prompt should now show `(venv)`.

5.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
    (This will take a minute. It's installing `faiss-cpu`, `langchain`, `google-generativeai`, etc.)

6.  **Run the Backend (Flask):**
    * *First, set your API key in this terminal (see Step 1)!*
    * Then, run Flask:
    ```bash
    flask --app app.py run --debug
    ```
    Your backend is now running at `http://127.0.0.1:5000`. Leave this terminal open.

### 3. Launch the Frontend

1.  **Open a *Second* Terminal:** Click the "+" icon in the VS Code terminal panel.
2.  **Install Live Server:** If you haven't already, install the "Live Server" extension (by Ritwick Dey).
3.  **Start the Frontend:**
    * Right-click the `index.html` file in the VS Code explorer.
    * Select **"Open with Live Server"**.

### 4. Use the App!

Your browser will open to `http://127.0.0.1:5500` (or a similar port).

1.  Upload a PDF file. It will now take a bit longer to process as it's creating the vector index.
2.  The chat box will appear.
3.  Ask a question! You will get a real answer from the Gemini API, based on the content of your document.