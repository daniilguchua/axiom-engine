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

console.log("🔥 V3.0 LOADED - SMASH FIX INCLUDED 🔥");

// client.js



// ==========================================

// 1. GLOBAL CONFIG & STATE

// ==========================================



window.appMode = 'LOBBY';

window.isProcessing = false;

window.lastBotMessageDiv = null; // TRACKS THE "SCREEN" TO UPDATE

window.isSimulationUpdate = false; // TRACKS IF WE SHOULD APPEND OR OVERWRITE

window.repairAttempts = 0; // PREVENTS INFINITE LOOPS

window.isRepairing = false;

window.simulationPlaylist = [];

window.currentStepIndex = 0;



const API_URL = 'http://127.0.0.1:5000';



mermaid.initialize({

startOnLoad: false,

securityLevel: 'loose',

theme: 'base',

themeVariables: {

background: 'transparent',

mainBkg: 'transparent',


primaryColor: 'rgba(255, 255, 255, 0.05)',

primaryTextColor: '#ffffff',

primaryBorderColor: '#00f3ff',

lineColor: '#00f3ff',

clusterBkg: 'transparent',

clusterBorder: 'none',


fontFamily: 'JetBrains Mono',

fontSize: '10px',

nodePadding: '12px', // Give text room to breathe

edgeLabelBackground: '#030305'

},

flowchart: {

curve: 'linear',

htmlLabels: true,

useMaxWidth: true,

rankSpacing: 80,

nodeSpacing: 40

}

});



// ==========================================

// 2. DOM ELEMENTS

// ==========================================



// Creates standard references to my HTML elements so that javascript can manipulate them (hide/show panels, update text)

const lobbyPanel = document.getElementById('lobby-panel');

const chatPanel = document.getElementById('chat-panel');

const historyDiv = document.getElementById('chat-history');

const userInput = document.getElementById('user-input');

const statusText = document.getElementById('status-text');

const statusDot = document.getElementById('status-dot');

const container = document.getElementById('app-container');

const disconnectBtn = document.getElementById('btn-disconnect');

const lobbyInput = document.getElementById('lobby-input');

const lobbyBtn = document.getElementById('lobby-btn');

const urlInputContainer = document.getElementById('url-input-container');

const lobbyEnhanceBtn = document.getElementById('lobby-enhance-btn');



// ==========================================

// 3. INTERACTION LOGIC (Clicks & Inputs)

// ==========================================

// Function: This is the most innovative part of your frontend. When Mermaid renders a graph, you attach click listeners to the nodes.

// Input Nodes: If a node says "INSERT" or "SEARCH," it prompts the user for a value (e.g., "What number do you want to insert into the B-Tree?").



//Control Nodes: If a node is CMD_NEXT, it triggers the next step.



//Logic: It constructs a hidden message (EXECUTE_SIMULATION_STEP...) and sends it to the AI.



window.mermaidNodeClick = function(nodeId, wrapperElement) {

// 0. SAFETY CHECKS

if (!nodeId || window.isProcessing) return;

const cleanId = nodeId.trim();

console.log("Clicked:", cleanId);



// CHECK: ARE WE IN CINEMA MODE?

const isCinema = wrapperElement && wrapperElement.classList.contains('fullscreen');



// --- HELPER: RESTORED "DIM & UPDATE" LOGIC ---

const triggerSimulationUpdate = (msg) => {

window.isProcessing = true;



// 1. Locate the Chat Bubble to update

// If we are in Cinema Mode (teleported to body), we can't find .closest('.msg.model').

// So we fallback to the very last message in the history.

let botMsg = null;

if (wrapperElement.parentElement === document.body) {

const allMsgs = document.querySelectorAll('.msg.model');

botMsg = allMsgs[allMsgs.length - 1];

} else {

botMsg = wrapperElement.closest('.msg.model');

}


window.lastBotMessageDiv = botMsg;



// 2. Visual Freeze (The "Dimming" Effect)

if (wrapperElement) {

wrapperElement.style.opacity = '1';

wrapperElement.style.pointerEvents = 'none';

wrapperElement.style.transition = 'opacity 0.2s';


// If in cinema mode, also show processing in HUD

const hudContent = wrapperElement.querySelector('.hud-content');

if(hudContent) hudContent.innerHTML = `<span style="color:var(--accent-cyan)">Processing Simulation Step...</span>`;

}



userInput.value = msg;

sendMessage();

};



// 1. LOGIC A: DATA INPUT (Insert, Search, Delete)

// If the node implies user input, ask for it.

const inputKeywords = ['INSERT', 'ADD', 'SEARCH', 'DELETE', 'FIND', 'INPUT', 'UPDATE'];

const isInputNode = inputKeywords.some(keyword => cleanId.toUpperCase().includes(keyword));



if (isInputNode && !cleanId.includes('CMD_')) {

const userValue = prompt(`Enter value for ${cleanId}:`);

if (userValue === null) return;

triggerSimulationUpdate(`EXECUTE_SIMULATION_STEP: User clicked control node "${cleanId}" and provided the INPUT VALUE: "${userValue}". Based on this input, generate the NEXT logical state.`);

return;

}



// LOGIC B: PLAYLIST NAVIGATION

// LOGIC B: PLAYLIST NAVIGATION

if (cleanId === 'CMD_NEXT') {

const nextIndex = window.currentStepIndex + 1;



// SCENARIO 1: The step exists in memory (Instant)

if (nextIndex < window.simulationPlaylist.length) {

renderPlaylistStep(nextIndex);

return;

}



// SCENARIO 2: We reached the end. FETCH MORE.

// Lock UI and show feedback

triggerSimulationUpdate(`(Calculating Steps ${nextIndex}-${nextIndex+2}...)`);


// Grab the LAST KNOWN STATE (The Table & Description) so the AI knows where to pick up

const lastStepData = window.simulationPlaylist[window.currentStepIndex];


// Construct the Context Prompt

const continuePrompt = `

COMMAND: CONTINUE_SIMULATION


CURRENT_STATE_CONTEXT:

- Last Step Index: ${lastStepData.step}

- Last Data Snapshot: ${lastStepData.data_table}

- Last Logic: ${lastStepData.instruction}



TASK:

Generate the NEXT 3 steps (Steps ${nextIndex}, ${nextIndex+1}, ${nextIndex+2}).

Return strictly in the JSON Playlist format.

`;


sendMessage(continuePrompt);

return;

}



if (cleanId === 'CMD_PREV') {

if (window.simulationPlaylist.length > 0) {

renderPlaylistStep(window.currentStepIndex - 1);

return;

}

}



// 3. LOGIC C: INSPECTION (Standard Data Nodes) -> NEW MESSAGE / HUD

// Inspection should NOT wipe the graph, it should explain it.


const prompt = `Elaborate on the element "${cleanId}" in the context of the current diagram. Keep it concise.`;



if (isCinema) {

// --- CINEMA MODE: SHOW IN HUD ---

const hud = wrapperElement.querySelector('.explanation-hud');

const hudContent = wrapperElement.querySelector('.hud-content');


if(hud && hudContent) {

hud.classList.add('active'); // Reveal HUD

hudContent.innerHTML = `<span style="color:#00f3ff; animation:blink 1s infinite;">Analyzing Node: ${cleanId}...</span>`;

sendHudMessage(prompt, hudContent);

}

} else {

// --- STANDARD MODE: ADD NEW CHAT BUBBLE ---

// We explicitly turn OFF simulation update so this creates a new bubble

window.isSimulationUpdate = false;

appendMessage('user', `System Command: Inspect "${cleanId}"`);

userInput.value = prompt;

sendMessage();

}

};



// ==========================================

// 4. MESSAGING LOGIC

// ==========================================



// ==========================================

// 4. MESSAGING LOGIC (WITH JSON AUTO-REPAIR)

// ==========================================



async function sendMessage() {

const text = userInput.value.trim();

if (!text) return;

userInput.value = '';



let targetElement;

let isUpdateMode = window.isSimulationUpdate && window.lastBotMessageDiv;



if (isUpdateMode) {

targetElement = window.lastBotMessageDiv.querySelector('.msg-body');

targetElement.style.opacity = '0.5';

} else {
    appendMessage('user', text);
    
    // 1. Create an empty bubble first
    const botContent = appendMessage('model', ' '); 
    targetElement = botContent.parentElement; 
    window.lastBotMessageDiv = botContent.closest('.msg.model');

    // 2. Inject the Loader HTML directly
    targetElement.innerHTML = `
        <div class="axiom-loader">
            <div class="loader-spinner"></div>
            <div class="loader-content">
                <div class="loader-text">COMPUTING VECTORS...</div>
                <div class="loader-bar-bg"><div class="loader-bar-fill"></div></div>
            </div>
        </div>`;
}



window.isProcessing = true;



try {

const res = await fetch(`${API_URL}/chat`, {

method: 'POST', headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({ message: text })

});



const reader = res.body.getReader();

const decoder = new TextDecoder();

let fullText = "";



while (true) {

const { done, value } = await reader.read();

if (done) break;

fullText += decoder.decode(value, { stream: true });

}



// 1. DETECT JSON PLAYLIST

if (fullText.includes('"type": "simulation_playlist"')) {

try {

let cleanJson = fullText;



// STRATEGY A: Code Block Extraction

const codeBlockMatch = fullText.match(/```json([\s\S]*?)```/);

if (codeBlockMatch) {

cleanJson = codeBlockMatch[1];

}

// STRATEGY B: Raw JSON Extraction

else {

const firstBrace = fullText.indexOf('{');

const lastBrace = fullText.lastIndexOf('}');

if (firstBrace !== -1 && lastBrace !== -1) {

cleanJson = fullText.substring(firstBrace, lastBrace + 1);

}

}



// --- THE REPAIR SYSTEM ---

let data;

try {

data = JSON.parse(cleanJson.trim());

} catch (jsonErr) {

console.warn("⚠️ JSON Parse Failed. Attempting Auto-Repair...", jsonErr);


// REPAIR 1: Escape unescaped double quotes inside the mermaid string

// This regex finds the "mermaid" value and replaces " inside it with '

cleanJson = cleanJson.replace(/"mermaid":\s*"([\s\S]*?)"(?=,\s*")/g, (match, content) => {

// Replace internal double quotes with single quotes

const safeContent = content.replace(/"/g, "'");

return `"mermaid": "${safeContent}"`;

});



// Try parsing again

data = JSON.parse(cleanJson.trim());

console.log("✅ Auto-Repair Successful");

}

// -------------------------



if (data.steps && data.steps.length > 0) {

if (data.summary) {

targetElement.innerHTML = marked.parse(data.summary);

window.lastBotMessageDiv = null;

}



const firstNewStep = data.steps[0].step;


if (firstNewStep === 0) {

console.log("📼 NEW PLAYLIST STARTED");

window.simulationPlaylist = data.steps;

renderPlaylistStep(0);

} else {

console.log(`📼 APPENDING STEPS ${firstNewStep} to ${data.steps[data.steps.length-1].step}`);

window.simulationPlaylist = window.simulationPlaylist.concat(data.steps);

renderPlaylistStep(firstNewStep);

}

return;

}

} catch (e) {

console.error("JSON PARSE FATAL ERROR:", e);

// Fallback: Render text if JSON fails completely

targetElement.innerHTML = `<div style="color:red; border:1px solid red; padding:10px;">SYSTEM PARSE ERROR: ${e.message}</div>` + marked.parse(fullText);

return;

}

}


// 2. RENDER STANDARD MARKDOWN

targetElement.innerHTML = marked.parse(fullText);

await fixMermaid(targetElement);

targetElement.style.opacity = '1';

historyDiv.scrollTop = historyDiv.scrollHeight;



} catch (e) {

console.error(e);

targetElement.innerHTML = "<strong>SYSTEM ERROR.</strong>";

targetElement.style.opacity = '1';

} finally {

window.isProcessing = false;

window.isSimulationUpdate = false;

}

}



// ==========================================

// 5. RENDERING (STABLE FORCE-EXIT + SYNTAX PATCH)

// ==========================================

// HELPER: The Multi-Pass Sanitizer

// HELPER: The Multi-Pass Sanitizer

// HELPER: The Multi-Pass Sanitizer

function sanitizeMermaidString(raw) {
    let clean = raw
        // 1. Strip Markdown Wrappers
        .replace(/^mermaid\s*/i, '')
        .replace(/```mermaid/g, '').replace(/```/g, '')
        .trim();

    // 2. CRITICAL: Fix "Unquoted Subgraphs" with special chars
    // Detects: subgraph Left Subtree (< 50)
    // Converts to: subgraph subgraph_123 ["Left Subtree (< 50)"]
    clean = clean.replace(/subgraph\s+([^\n\[]+?)(?=\s*[\n;])/gi, (match, rawTitle) => {
        const safeId = "subgraph_" + Math.floor(Math.random() * 10000);
        const cleanTitle = rawTitle.trim();
        return `subgraph ${safeId} ["${cleanTitle}"]`;
    });

    // 3. Fix "Command Smashing" (The Quote-Semicolon Trap)
    // Inserts a newline after a semicolon ONLY IF that semicolon is followed by a command keyword
    // and NOT inside a quote.
    const keyCommands = "subgraph|end|direction|classDef|linkStyle|style|click";
    const smashRegex = new RegExp(`(];|\\);|\\w;)\\s*(${keyCommands})`, "gi");
    clean = clean.replace(smashRegex, '$1\n$2');

    // 4. CRITICAL FIX: Aggressive "Direction" Splitter
    // Detects "direction TDW_ih" and converts to "direction TD\nW_ih"
    // The previous regex missed cases where the node ID started immediately after the direction
    clean = clean.replace(/(direction\s+[A-Z]{2})([^\s;])/gi, '$1\n$2');
    clean = clean.replace(/(direction\s+[A-Z]{2})([^\s;])/gi, '$1\n$2');
    
    // 4b. Also fix if there is a semicolon smashed: "direction TD;NodeA"
    clean = clean.replace(/(direction\s+[A-Z]{2});/gi, '$1\n');

    // 5. General Semicolon-to-Newline expander
    // This Regex splits semicolons that are NOT inside double quotes.
    // It creates the "forced newline" structure Mermaid demands.
    clean = clean.replace(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ';\n');

    // 6. Final Polish (Arrays, bullets, lingering garbage)
    clean = clean
        .replace(/(\["|\[\s*)\s*[-*]\s+/g, '$1• ') // Convert markdown lists to bullets
        .replace(/\\"/g, "'") // Convert escaped quotes to single quotes for safety
        .replace(/""/g, "'")  // Fix double-double quotes
        .replace(/\n\s*\n/g, '\n'); // Remove empty lines

    // 7. Auto-Header
    if (!clean.includes('graph ') && !clean.includes('sequence') && !clean.includes('stateDiagram')) {
        clean = 'graph LR\n' + clean;
    }

    return clean;
}

async function fixMermaid(container) {

const codes = container.querySelectorAll('pre code');


// 1. FORCE EXIT FULL SCREEN (Cleanup)

const oldWrappers = document.querySelectorAll('body > .mermaid-wrapper.fullscreen');

if (oldWrappers.length > 0) {

oldWrappers.forEach(w => w.remove());

window.isCinemaMode = false;

}



for (const codeBlock of codes) {

let rawGraph = codeBlock.textContent;

const isMermaid = codeBlock.classList.contains('language-mermaid') ||

rawGraph.includes('graph TD') || rawGraph.includes('graph LR') ||

rawGraph.includes('sequenceDiagram');



if (isMermaid) {

const preElement = codeBlock.parentElement;



// --- SURGICAL PARSE ---

const cleanGraph = sanitizeMermaidString(rawGraph);

// ----------------------



// 3. BUILD DOM (PRESERVED "CINEMA MODE" ARCHITECTURE)

const wrapperId = 'wrapper-' + Date.now();

const graphWrapper = document.createElement('div');

graphWrapper.className = 'mermaid-wrapper';

graphWrapper.id = wrapperId;



const graphDiv = document.createElement('div');

graphDiv.className = 'mermaid';

graphDiv.id = 'mermaid-' + Date.now();

graphDiv.textContent = cleanGraph;





// ... HUD (PRESERVED) ...

const hudDiv = document.createElement('div');

hudDiv.className = 'explanation-hud';

hudDiv.id = `hud-${graphDiv.id}`;

hudDiv.innerHTML = `

<div class="hud-title">SYSTEM ANALYSIS</div>

<div class="hud-content">

<div id="node-details-${graphDiv.id}" style="margin-top:15px; border-top:1px solid rgba(0,243,255,0.2); padding-top:10px;">

<p style="opacity:0.7; font-style:italic;">Select a node to inspect details...</p>

</div>

</div>

`;



graphWrapper.appendChild(graphDiv);

graphWrapper.appendChild(hudDiv);

preElement.replaceWith(graphWrapper);



// 4. SCROLL HANDLING

graphWrapper.addEventListener('wheel', (e) => {

const isOverHud = e.target.closest('.explanation-hud');

if (graphWrapper.matches(':hover') && !isOverHud) { e.preventDefault(); }

}, { passive: false });



// 5. RENDER EXECUTION

try {

await new Promise(r => setTimeout(r, 50));

await mermaid.init(undefined, graphDiv);

window.repairAttempts = 0;



// --- SVG PAN ZOOM & CLICK LISTENERS (PRESERVED) ---

setTimeout(() => {

const svg = graphDiv.querySelector('svg');
        if(svg) {
            
            // 1. FORCE WIDTH (Fixes the shrink-wrap issue)
            svg.style.width = "100%";
            svg.style.height = "auto";
            svg.style.maxWidth = "none";
            svg.style.minHeight = "500px"; // Gives it space vertically

            // 2. SIMPLE CLICK LISTENERS (No physics, no flying)
            svg.querySelectorAll('.node').forEach(node => {
                node.style.cursor = "pointer";
                
                // Clear any old physics listeners that might be sticking around
                node.onmouseenter = null;
                node.onmouseleave = null;

                node.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    
                    const rawId = node.id;
                    const idParts = rawId.split('-');
                    // Robust ID extraction
                    let cleanId = idParts.find(p => isNaN(p) && p !== 'flowchart' && p !== 'graph' && p.length > 1);
                    if (!cleanId) cleanId = node.textContent.trim();
                    
                    window.mermaidNodeClick(cleanId, graphWrapper);
                };
            });
        }
    }, 200);

} catch (renderErr) {

handleError(graphWrapper, cleanGraph, renderErr.message);

}

}

}

}

// --- HELPER: VISUAL CONFIRMATION TOAST ---

// (Ensure this is in your script file, outside the function)

function showToast(msg) {

let toast = document.getElementById('ghost-toast');

if (!toast) {

toast = document.createElement('div');

toast.id = 'ghost-toast';

Object.assign(toast.style, {

position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',

background: 'rgba(0, 243, 255, 0.2)', color: '#fff', border: '1px solid #00f3ff',

padding: '10px 20px', borderRadius: '4px', fontFamily: 'monospace',

zIndex: '10000', backdropFilter: 'blur(5px)', boxShadow: '0 0 20px rgba(0,243,255,0.4)',

transition: 'all 0.3s ease', opacity: '0'

});

document.body.appendChild(toast);

}

toast.innerText = msg;

toast.style.opacity = '1';

toast.style.transform = 'translateX(-50%) translateY(0)';


setTimeout(() => {

toast.style.opacity = '0';

toast.style.transform = 'translateX(-50%) translateY(10px)';

}, 2000);

}



// ==========================================

// 6. AUTO-REPAIR LOGIC

// ==========================================



function handleError(wrapperElement, badCode, errorMsg) {

// 1. LIMIT CHECK: Stop infinite loops immediately

if (window.repairAttempts >= 3) {

console.error("☠️ REPAIR LIMIT REACHED");

wrapperElement.innerHTML = `

<div style="border:1px solid #ff4444; background: rgba(50,0,0,0.5); padding:15px; border-radius:8px; color:#ff4444; font-family:monospace; font-size:12px;">

<strong>SYSTEM FAILURE:</strong> Auto-Repair Failed.<br>

<div style="margin-top:10px; opacity:0.8; white-space:pre-wrap;">${errorMsg}</div>

<div style="margin-top:10px; border-top:1px solid #ff4444; padding-top:5px;">RAW CODE:</div>

<pre style="font-size:10px; color:#aaa;">${badCode.replace(/</g, '&lt;')}</pre>

</div>`;

window.repairAttempts = 0; // Reset for next time

window.isRepairing = false;

return;

}



window.repairAttempts++;

console.log(`🚑 REPAIR ATTEMPT ${window.repairAttempts}/3`);



// 2. SHOW UI FEEDBACK

// We clear the broken graph and show a pulsing repair badge

wrapperElement.innerHTML = `

<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; border:1px dashed #00f3ff; border-radius:8px; color:#00f3ff; font-family:monospace; animation: blink 1.5s infinite;">

<div style="font-size:24px; margin-bottom:10px;">⚡</div>

<div>DETECTING SYNTAX FAULT...</div>

<div style="font-size:10px; opacity:0.7; margin-top:5px;">Attempt ${window.repairAttempts}/3</div>

</div>`;



// 3. TRIGGER REPAIR

triggerAutoRepair(badCode, errorMsg, wrapperElement);

}



async function triggerAutoRepair(badCode, errorMsg, wrapperElement) {
    if (window.isRepairing) return;
    window.isRepairing = true;

    // --- STRONGER REPAIR PROMPT ---
    const repairPrompt = `
    SYSTEM ALERT: MERMAID RENDERING FAILED.
    
    The parser reported this error:
    "${errorMsg}"
    
    It is likely due to "Command Smashing" (missing newlines).
    
    BAD CODE SNAPSHOT:
    \`\`\`mermaid
    ${badCode}
    \`\`\`
    
    **YOUR TASK:**
    1.  Look for patterns like \`Node[Label]classDef\` and CHANGE them to:
        Node[Label]
        classDef
    2.  Ensure every \`classDef\`, \`style\`, and \`linkStyle\` is on its OWN line.
    3.  Ensure the graph declaration (e.g., \`graph TD OR LR\`) is followed by a newline.
    
    **OUTPUT ONLY THE RAW MERMAID CODE. NO MARKDOWN. NO JSON.**
    `;

    try {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: repairPrompt })
        });



// Read stream

const reader = res.body.getReader();

const decoder = new TextDecoder();

let fullText = "";

while (true) {

const { done, value } = await reader.read();

if (done) break;

fullText += decoder.decode(value, { stream: true });

}



// 5. SANITIZE THE REPAIR

// Even if the AI fixes it, we run it through our client-side sanitizer

// to catch any lingering formatting issues (like the Semicolon Smash).

let fixedCode = fullText

.replace(/```mermaid/g, '') // Strip markdown if AI ignored rules

.replace(/```/g, '')

.trim();


fixedCode = sanitizeMermaidString(fixedCode);



console.log("🩹 APPLYING FIX:", fixedCode.substring(0, 50) + "...");



// 6. RE-RENDER (MANUAL INJECTION)

// We do NOT call fixMermaid() again to avoid recursion loops.

// We manually rebuild the div and ask Mermaid to render it.


const newGraphId = 'mermaid-' + Date.now();


// Restore standard layout inside the wrapper

wrapperElement.innerHTML = `

<div class="mermaid" id="${newGraphId}">${fixedCode}</div>

<div class="explanation-hud" id="hud-${newGraphId}" style="display:none;">

<div class="hud-content"></div>

</div>

`;



const graphDiv = document.getElementById(newGraphId);


// Attempt Render

await mermaid.init(undefined, graphDiv);


// 7. SUCCESS: RE-ATTACH LISTENERS

// If we reached here, Mermaid didn't throw an error.

window.repairAttempts = 0;

window.isRepairing = false;


// Re-attach click logic to the new SVG

const svg = graphDiv.querySelector('svg');

if (svg) {

svg.style.width = "100%";

svg.style.height = "auto";

svg.style.maxWidth = "600px";


svg.querySelectorAll('.node').forEach(node => {

node.style.cursor = "pointer";

node.onclick = (e) => {

e.preventDefault(); e.stopPropagation();

const rawId = node.id;

const idParts = rawId.split('-');

let cleanId = idParts.find(p => isNaN(p) && p.length > 1);

if (!cleanId) cleanId = node.textContent.trim();

window.mermaidNodeClick(cleanId, wrapperElement);

};

});

}



} catch (e) {

console.error("Repair Failed Again:", e);

window.isRepairing = false;

// This will trigger the next attempt (up to 3)

handleError(wrapperElement, badCode, e.message);

}

}

// ==========================================

// 7. UTILITIES

// ==========================================



function appendMessage(role, text) {

const div = document.createElement('div');

div.className = `msg ${role}`;

const content = document.createElement('div');

content.className = 'content';



if(role === 'model') {

content.innerHTML = `<div class="msg-header"><span>AXIOM // SYSTEM</span></div><div class="msg-body"><span class="stream-text">${marked.parse(text)}</span></div>`;
} else {

content.innerHTML = marked.parse(text);

}

div.appendChild(content);

historyDiv.appendChild(div);

historyDiv.scrollTop = historyDiv.scrollHeight;

if(role === 'model') return content.querySelector('.stream-text');

return content;

}



function activateChatMode(initialMsg) {
    if(urlInputContainer) urlInputContainer.style.display = 'none';

    window.appMode = 'CHAT';
    lobbyPanel.style.opacity = '0';
    lobbyPanel.style.pointerEvents = 'none';

    setTimeout(() => {
        lobbyPanel.classList.add('hidden');
        container.classList.add('mode-focus');
        disconnectBtn.style.display = 'block';
        chatPanel.style.display = 'flex';
        setTimeout(() => { chatPanel.style.opacity = '1'; }, 50);
    }, 500);

    // UPDATED TEXT
    statusText.innerText = "ENGINE ONLINE"; 
    statusDot.classList.add('active');

    setTimeout(() => {
        if(initialMsg) {
            appendMessage('model', `### CONTEXT LOADED\n${initialMsg}`);
        } else {
            appendMessage('model', `### AXIOM ENGINE v1.2\n**Ready for input.** Define simulation parameters.`);
        }
    }, 250);
}


function disconnect() {

window.appMode = 'LOBBY';

window.isProcessing = false;

window.lastBotMessageDiv = null;

lobbyInput.value = '';

chatPanel.style.opacity = '0';

setTimeout(() => {

chatPanel.style.display = 'none';

container.classList.remove('mode-focus');

disconnectBtn.style.display = 'none';

lobbyPanel.classList.remove('hidden');

lobbyPanel.style.pointerEvents = 'all';

setTimeout(() => { lobbyPanel.style.opacity = '1'; }, 50);

}, 500);

statusText.innerText = "IDLE";

statusDot.classList.remove('active');

}



function handleLobbyInit() {

const val = lobbyInput.value;

if(!val) return;

activateChatMode();

setTimeout(() => { userInput.value = val; sendMessage(); }, 800);

}



// ==========================================

// 8. EVENT LISTENERS

// ==========================================



if(lobbyBtn) lobbyBtn.addEventListener('click', handleLobbyInit);
if(lobbyInput) lobbyInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleLobbyInit(); } });

// --- CHANGED: CARD 2 (QUICK SIMULATION) ---
// Focuses the text input instead of opening a URL bar
// --- CHANGED: CARD 2 (QUICK SIMULATION) ---
// Now toggles the Preset Menu
const cardSim = document.getElementById('card-sim');
const presetMenu = document.getElementById('quick-presets');

if(cardSim && presetMenu) {
    cardSim.addEventListener('click', () => {
        // Toggle the 'active' class to slide it open/closed
        const isActive = presetMenu.classList.contains('active');
        
        if (isActive) {
            presetMenu.classList.remove('active');
            cardSim.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        } else {
            presetMenu.classList.add('active');
            cardSim.style.borderColor = '#00f3ff'; // Keep card highlighted
        }
    });
}

// --- HANDLE PRESET CLICKS ---
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const prompt = e.target.getAttribute('data-prompt');
        
        // 1. Populate Input
        if(lobbyInput) lobbyInput.value = prompt;
        
        // 2. Hide Menu
        presetMenu.classList.remove('active');
        
        // 3. Launch
        handleLobbyInit();
    });
});

// --- CHANGED: CARD 1 (DEEP CONTEXT / UPLOAD) + SPINNER FIX ---
const cardContext = document.getElementById('card-context');
const fileInput = document.getElementById('file-upload');
const spinnerOverlay = document.getElementById('spin-pdf'); // The new spinner ID

if(cardContext && fileInput) {
    // 1. Click card -> Trigger hidden input
    cardContext.addEventListener('click', (e) => { 
        // Prevent triggering if clicking the spinner itself
        if(e.target.closest('#spin-pdf')) return;
        fileInput.click(); 
    });

    // 2. Handle File Selection
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0]; 
        if(!file) return;

        // SHOW SPINNER
        if(spinnerOverlay) spinnerOverlay.style.display = 'flex';

        const fd = new FormData(); 
        fd.append('file', file);

        try {
            const res = await fetch(`${API_URL}/upload`, { method:'POST', body: fd });
            const data = await res.json();
            
            // HIDE SPINNER
            if(spinnerOverlay) spinnerOverlay.style.display = 'none';
            
            activateChatMode(`**SYSTEM INGEST COMPLETE**\nTarget Data: _${data.filename}_`);
            
        } catch(e) { 
            console.error(e); 
            if(spinnerOverlay) spinnerOverlay.style.display = 'none';
            alert("INGEST FAILED: " + e.message);
        }
    });
}



async function sendHudMessage(text, targetElement) {

if (window.isProcessing) return;

window.isProcessing = true;



try {

const res = await fetch(`${API_URL}/chat`, {

method: 'POST', headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({ message: text })

});



const reader = res.body.getReader();

const decoder = new TextDecoder();

let fullText = "";



while (true) {

const { done, value } = await reader.read();

if (done) break;

const chunk = decoder.decode(value, { stream: true });

fullText += chunk;


// Real-time update in the HUD

targetElement.innerHTML = marked.parse(fullText);

}



} catch (e) {

targetElement.innerHTML = `<span style="color:red">DATA CORRUPTION: ${e.message}</span>`;

} finally {

window.isProcessing = false;

}

}

// Chat Controls

document.getElementById('btn-send').addEventListener('click', sendMessage);

userInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });

document.getElementById('btn-disconnect').addEventListener('click', disconnect);



document.getElementById('btn-reset').addEventListener('click', async () => {

await fetch(`${API_URL}/reset`, {method:'POST'});

historyDiv.innerHTML = '';

window.lastBotMessageDiv = null;

appendMessage('model', '### MEMORY PURGED\nSystem cache cleared.');

});



document.getElementById('btn-enhance').addEventListener('click', async () => {

const text = userInput.value.trim();

if (!text) { alert("Prompt needed."); return; }

const originalText = text;

userInput.value = "Enhancing..."; userInput.disabled = true;

try {

const res = await fetch(`${API_URL}/enhance-prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });

const data = await res.json();

userInput.value = data.enhanced_prompt || originalText;

} catch (e) { userInput.value = originalText; }

finally { userInput.disabled = false; userInput.focus(); }

});



document.getElementById('lobby-enhance-btn').addEventListener('click', async () => {

const text = lobbyInput.value.trim();

if (!text) { alert("Prompt needed."); return; }

const originalText = text;

lobbyInput.value = "Enhancing..."; userInput.disabled = true;

try {

const res = await fetch(`${API_URL}/enhance-prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });

const data = await res.json();

lobbyInput.value = data.enhanced_prompt || originalText;

} catch (e) { lobbyInput.value = originalText; }

finally { lobbyInput.disabled = false; lobbyInput.focus(); }

});



async function renderPlaylistStep(index) {

if (index < 0 || index >= window.simulationPlaylist.length) return;


window.currentStepIndex = index;

const stepData = window.simulationPlaylist[index];


// --- DETERMINISTIC BUTTON LOGIC ---

const isLastKnownStep = index === window.simulationPlaylist.length - 1;

const prevDisabled = index === 0 ? 'disabled' : '';


// TRUST THE BACKEND SIGNAL

// If the AI says "is_final": true, we are done. No guessing.

const isAlgorithmComplete = stepData.is_final === true;



let nextButtonHtml = '';



if (!isLastKnownStep) {

// SCENARIO 1: HISTORY MODE (User went back)

// Action: Just go to the next slide in memory.

nextButtonHtml = `<button onclick="handleSimNav('NEXT')" class="btn-sim">NEXT ></button>`;


} else if (isAlgorithmComplete) {

// SCENARIO 2: TRULY FINISHED (Backend confirmed)

// Action: Dead button, distinct visual style.

nextButtonHtml = `<button class="btn-sim" disabled style="color: #00f3ff; opacity: 0.5; cursor: default; border: 1px solid rgba(0, 243, 255, 0.1);">✓ SIMULATION COMPLETE</button>`;


} else {

// SCENARIO 3: GENERATE MORE (Not finished yet)

// Action: Trigger the AI fetch.

nextButtonHtml = `<button onclick="handleSimNav('NEXT')" class="btn-sim">GENERATE NEXT >></button>`;

}

// ----------------------------------


const htmlContent = `

<div class="simulation-header">

${marked.parse(stepData.instruction)}

</div>


<pre><code class="language-mermaid">${stepData.mermaid}</code></pre>



<div class="sim-controls">

<button onclick="handleSimNav('PREV')" ${prevDisabled} class="btn-sim">&lt; PREV</button>

<button onclick="handleSimNav('RESET')" class="btn-sim reset-btn">⟲ RESET</button>

${nextButtonHtml}

</div>


<div class="simulation-data">

${stepData.data_table}

</div>

`;



if (!window.lastBotMessageDiv) {

appendMessage('model', 'Initializing Simulation...');

window.lastBotMessageDiv = document.querySelector('.msg.model:last-child');

}


const contentDiv = window.lastBotMessageDiv.querySelector('.msg-body');

contentDiv.innerHTML = htmlContent;


await fixMermaid(contentDiv);

contentDiv.style.opacity = '1';


console.log(`⏩ PLAYING STEP ${index} (Final: ${isAlgorithmComplete})`);

}



// ==========================================

// SIMULATION CONTROLLER (STATIC BUTTONS)

// ==========================================

// ==========================================

// SIMULATION CONTROLLER (NO DIMMING + OVERLAY)

// ==========================================

window.handleSimNav = function(action) {

if (window.isProcessing) return;



if (action === 'PREV') {

if (window.currentStepIndex > 0) {

renderPlaylistStep(window.currentStepIndex - 1);

}

}

else if (action === 'RESET') {

renderPlaylistStep(0);

}

else if (action === 'NEXT') {

const nextIndex = window.currentStepIndex + 1;



// SCENARIO 1: Step exists in memory

if (nextIndex < window.simulationPlaylist.length) {

renderPlaylistStep(nextIndex);

}

// SCENARIO 2: Fetch more steps

else {

const lastStepData = window.simulationPlaylist[window.currentStepIndex];


// 1. ACTIVATE UPDATE MODE

window.isSimulationUpdate = true;


if (!window.lastBotMessageDiv) {

const allMsgs = document.querySelectorAll('.msg.model');

if (allMsgs.length > 0) window.lastBotMessageDiv = allMsgs[allMsgs.length - 1];

}



// 2. INJECT "GENERATING" OVERLAY (NO DIMMING)

if (window.lastBotMessageDiv) {

const body = window.lastBotMessageDiv.querySelector('.msg-body');

if (body) {


// Create the Floating System Badge

const loader = document.createElement('div');

loader.id = "sim-loader";

loader.style.cssText = `

position: absolute;

top: 50%; left: 50%; transform: translate(-50%, -50%);

background: rgba(0, 0, 0, 0.9);

border: 1px solid #00f3ff;

color: #00f3ff;

padding: 15px 30px;

border-radius: 4px;

font-family: 'JetBrains Mono', monospace;

box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);

z-index: 1000;

display: flex; align-items: center; gap: 10px;

`;

loader.innerHTML = `<span class="blink">⚡</span> GENERATING NEXT STEPS...`;


// Ensure positioning works

if (getComputedStyle(body).position === 'static') body.style.position = 'relative';

body.appendChild(loader);

}

}



const continuePrompt = `

COMMAND: CONTINUE_SIMULATION

CURRENT_STATE_CONTEXT:

- Last Step Index: ${lastStepData.step}

- Last Data Snapshot: ${lastStepData.data_table}

- Last Logic: ${lastStepData.instruction}



TASK:

Generate the NEXT 3 steps.

Return strictly in the JSON Playlist format.

`;


const input = document.getElementById('user-input');

input.value = continuePrompt;

document.getElementById('btn-send').click();

}

}

};