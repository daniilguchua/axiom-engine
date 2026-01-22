// client.js

/* ==========================================================================
   SECTION 1: GLOBAL STATE & CONFIGURATION
   ========================================================================== */

let currentSessionId = 'user_' + Date.now();
const API_URL = 'http://127.0.0.1:5000';

window.appMode = 'LOBBY';
window.isProcessing = false;
window.lastBotMessageDiv = null; 
window.isSimulationUpdate = false; 
window.repairAttempts = 0; 
window.isRepairing = false;
window.simulationStore = {};
window.simulationState = {};
window.currentStepIndex = 0;
window.activeSimId = null;
window.lastUserMessage = null;

window.validatedSteps = new Set();

window.lastWorkingMermaid = {};

const DEFAULT_MERMAID_TEMPLATE = `flowchart LR
subgraph INIT["Initialization"]
    direction TB
    start(["Start"])
    config["Configuration"]
    start --> config
end
subgraph PROCESS["Processing"]
    direction TB
    step1["Step 1"]
    step2["Step 2"]
    step1 --> step2
end
subgraph OUTPUT["Result"]
    direction TB
    result(["Output"])
end
INIT --> PROCESS
PROCESS --> OUTPUT
classDef active fill:#bc13fe,stroke:#fff,stroke-width:2px,color:#fff;
classDef process fill:#001a33,stroke:#00aaff,stroke-width:2px,color:#fff;
classDef data fill:#003311,stroke:#00ff9f,stroke-width:2px,color:#fff;
class start,result data;
class step1,step2,config process;
class PROCESS active;`;

/* ==========================================================================
   SECTION 2: LIBRARY INITIALIZATION
   ========================================================================== */

mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
        background: 'transparent',
        mainBkg: 'transparent',
        primaryColor: '#000000',      
        primaryTextColor: '#ffffff',
        primaryBorderColor: '#00f3ff',
        lineColor: '#00f3ff',
        
        clusterBkg: 'transparent', 
        clusterBorder: '#bc13fe',
        
        fontFamily: 'JetBrains Mono',
        fontSize: '12px',             
        nodePadding: '16px',          
        edgeLabelBackground: '#030305'
    },
    flowchart: {
        curve: 'linear',
        htmlLabels: true,
        useMaxWidth: false,
        rankSpacing: 80,
        nodeSpacing: 60,
        padding: 20 
    }
});


/* ==========================================================================
   SECTION 3: DOM ELEMENT REFERENCES
   ========================================================================== */
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
const lobbyEnhanceBtn = document.getElementById('lobby-enhance-btn');


/* ==========================================================================
   SECTION 4: CORE CONTROLLERS (The Brains)
   ========================================================================== */

window.mermaidNodeClick = function (nodeId, wrapperElement) {
    if (!nodeId || window.isProcessing) return;
    const cleanId = nodeId.trim();
    console.log("Clicked Node:", cleanId);

    if (wrapperElement) {
        const parentMsg = wrapperElement.closest('.msg.model');
        if (parentMsg) {
            window.lastBotMessageDiv = parentMsg;
            console.log("🎯 Context Restored to Simulation Container via Node Click");
        }
    }
    // ---------------------

    const triggerSimulationUpdate = (msg) => {
        window.isProcessing = true;
        
        // Add visual feedback to the wrapper
        if (wrapperElement) {
            wrapperElement.style.opacity = '1';
            wrapperElement.style.pointerEvents = 'none';
            const hudContent = wrapperElement.querySelector('.hud-content');
            if (hudContent) hudContent.innerHTML = `<span style="color:var(--accent-cyan)">Processing Simulation Step...</span>`;
        }
        
        window.isSimulationUpdate = true; 
        userInput.value = msg;
        sendMessage();
    };

    const inputKeywords = ['INSERT', 'ADD', 'SEARCH', 'DELETE', 'FIND', 'INPUT', 'UPDATE'];
    const isInputNode = inputKeywords.some(keyword => cleanId.toUpperCase().includes(keyword));
    
    if (isInputNode && !cleanId.includes('CMD_')) {
        const userValue = prompt(`Enter value for ${cleanId}:`);
        if (userValue === null) return;
        triggerSimulationUpdate(`EXECUTE_SIMULATION_STEP: User clicked control node "${cleanId}" and provided the INPUT VALUE: "${userValue}". Based on this input, generate the NEXT logical state.`);
        return;
    }
    
    if (cleanId === 'CMD_NEXT') {
        const nextIndex = window.currentStepIndex + 1;
        if (nextIndex < window.simulationPlaylist.length) {
            renderPlaylistStep(nextIndex);
            return;
        }
        triggerSimulationUpdate(`(Calculating Steps ${nextIndex}-${nextIndex + 2}...)`);
        
        const lastStepData = window.simulationPlaylist[window.currentStepIndex];
        const continuePrompt = `
COMMAND: CONTINUE_SIMULATION
CURRENT_STATE_CONTEXT:
- Last Step Index: ${lastStepData.step}
- Last Data Snapshot: ${lastStepData.data_table}
- Last Logic: ${lastStepData.instruction}
TASK: Generate NEXT 3 steps.`;
        sendMessage(continuePrompt);
        return;
    }
    
    if (cleanId === 'CMD_PREV') {
        if (window.simulationPlaylist.length > 0) {
            renderPlaylistStep(window.currentStepIndex - 1);
            return;
        }
    }
    
    const prompt = `Elaborate on the element "${cleanId}" in the context of the current diagram. Keep it concise.`;
    window.isSimulationUpdate = false; 
    appendMessage('user', `System Command: Inspect "${cleanId}"`);
    userInput.value = prompt;
    sendMessage();
};

window.handleSimNav = function (simId, action, btnElement) {
    if (window.isProcessing) return;

    // 1. Find the Container relative to the button
    // This ensures we always update the RIGHT graph (Neural Net vs Dijkstra)
    let targetContainer = null;
    if (btnElement) {
        const parentMsg = btnElement.closest('.msg.model');
        if (parentMsg) {
            targetContainer = parentMsg.querySelector('.msg-body');
        }
    }

    // 2. Get Data & Current Index
    const playlist = window.simulationStore[simId];
    if (!playlist) return;

    // Default to 0 if we haven't tracked this sim yet
    let currentIndex = window.simulationState[simId] || 0;

    // 3. Logic
    if (action === 'PREV') {
        if (currentIndex > 0) {
            renderPlaylistStep(simId, currentIndex - 1, targetContainer);
        }
    }
    else if (action === 'RESET') {
        renderPlaylistStep(simId, 0, targetContainer);
    }
    else if (action === 'NEXT') {
        if (currentIndex + 1 < playlist.length) {
            renderPlaylistStep(simId, currentIndex + 1, targetContainer);
        }
    }
    else if (action === 'GENERATE_MORE') {
         const lastStepData = playlist[playlist.length - 1];
         window.activeSimId = simId; 
         
         // Set Global Update Flag (So sendMessage knows to append, not create new)
         window.isSimulationUpdate = true;
         // Set Global Target (So sendMessage knows WHERE to append)
         if (targetContainer) {
             window.lastBotMessageDiv = targetContainer.closest('.msg.model');
         }

         if (targetContainer) {
             // 1. Find the Graph Frame specifically (so we only dim the graph)
             const graphFrame = targetContainer.querySelector('.graph-frame');
             
             // Fallback to the whole container if for some reason graph frame is missing
             const loadTarget = graphFrame || targetContainer;

             const loader = document.createElement('div');
             loader.className = 'generation-loader';

             loader.style.cssText = `
                position: absolute; 
                top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0, 0, 0, 0.85);             /* Deep dimming */
                backdrop-filter: blur(3px);                  /* Blur the graph behind it */
                display: flex; 
                justify-content: center; 
                align-items: center; 
                z-index: 100;
                border-radius: 4px;                          /* Match graph corners */
             `;
             
             loader.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size: 24px; animation: spin 1s linear infinite; margin-bottom: 10px;">⟳</div>
                    <span style="
                        font-family: 'JetBrains Mono', monospace; 
                        color: #00f3ff; 
                        font-weight: bold; 
                        text-shadow: 0 0 10px rgba(0, 243, 255, 0.8);
                        letter-spacing: 1px;
                    ">EXPANDING SIMULATION...</span>
                </div>
             `;
             
             // Ensure the target handles absolute positioning (graph-frame already does, but just in case)
             if (getComputedStyle(loadTarget).position === 'static') loadTarget.style.position = 'relative';
             
             loadTarget.appendChild(loader);
         }
         // ---------------------------------
         
         const continuePrompt = `
COMMAND: CONTINUE_SIMULATION
CURRENT_STATE_CONTEXT:
- Last Step Index: ${lastStepData.step}
- Last Data Snapshot: ${lastStepData.data_table}
- Last Logic: ${lastStepData.instruction}
- Last Graph Code: 
\`\`\`mermaid
${lastStepData.mermaid}
\`\`\`
TASK: Generate NEXT 3 steps.`;
         
         sendMessage(continuePrompt);
    }
};

/* ==========================================================================
   SECTION 5: API COMMUNICATION
   ========================================================================== */

/**
 * Sends a message to the AXIOM backend and handles the response.
 * 
 * @param {string|null} overrideText - Optional text to send instead of input field
 * @returns {Promise<void>}
 * 
 * Flow:
 * 1. Validate input
 * 2. Create/update UI elements
 * 3. Stream response from server
 * 4. Detect response type (JSON playlist vs text)
 * 5. Parse and render appropriately
 * 6. Handle errors gracefully
 */
async function sendMessage(overrideText = null) {
    // FIX: Check if overrideText is a String. 
    // If it's an Event (from a click) or null, ignore it and use the input value.
    const isStringArg = typeof overrideText === 'string';
    const text = isStringArg ? overrideText : userInput.value.trim();
    
    if (!text) return;
    
    // Track for retry functionality
    window.lastUserMessage = text;
    
    userInput.value = '';

    // Determine if we're updating an existing simulation or creating new message
    let targetElement;
    let isUpdateMode = window.isSimulationUpdate && window.lastBotMessageDiv;

    if (isUpdateMode) {
        // Update existing simulation container
        targetElement = window.lastBotMessageDiv.querySelector('.msg-body');
        targetElement.style.opacity = '1';
    } else {
        // Create new message bubbles
        appendMessage('user', text);
        const botContent = appendMessage('model', ' ');
        targetElement = botContent.parentElement;
        window.lastBotMessageDiv = botContent.closest('.msg.model');
        
        // Show loading state
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
        // =====================================================================
        // STREAMING REQUEST
        // =====================================================================
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: text,
                session_id: currentSessionId 
            })
        });

        if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        
        // Stream the response
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
        }

        // =====================================================================
        // RESPONSE TYPE DETECTION
        // =====================================================================
        
        // More robust detection - check for key structural elements
        const hasPlaylistMarker = fullText.includes('"type"') && fullText.includes('simulation_playlist');
        const hasStepStructure = fullText.includes('"step"') && 
                                  fullText.includes('"instruction"') && 
                                  fullText.includes('"mermaid"');
        
        const isJsonResponse = hasPlaylistMarker || hasStepStructure;

        // =====================================================================
        // JSON SIMULATION RESPONSE HANDLING
        // =====================================================================
        
        if (isJsonResponse) {
            let parsed = null;
            
            try {
                // Step 1: Extract JSON from markdown code blocks if present
                let cleanJson = fullText.trim();
                const codeBlockMatch = fullText.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlockMatch) {
                    cleanJson = codeBlockMatch[1].trim();
                }
                
                // Step 2: Repair common LLM JSON errors
                cleanJson = repairLLMJson(cleanJson);
                
                // Step 3: Try parsing
                try {
                    parsed = JSON.parse(cleanJson);
                } catch (parseErr) {
                    console.warn("Initial JSON parse failed, attempting deeper repair...", parseErr.message);
                    
                    // Attempt to fix unescaped quotes in mermaid strings
                    // This regex finds mermaid fields and properly escapes their content
                    cleanJson = cleanJson.replace(
                        /"mermaid"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"(?:data_table|step|instruction|is_final))/g,
                        (match, content) => {
                            const escaped = content
                                .replace(/\\/g, '\\\\')
                                .replace(/"/g, '\\"')
                                .replace(/\n/g, '\\n');
                            return `"mermaid": "${escaped}"`;
                        }
                    );
                    
                    parsed = JSON.parse(cleanJson);
                }
                
                // Step 4: Validate structure and extract steps
                let newSteps = [];
                if (Array.isArray(parsed)) {
                    newSteps = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    if (Array.isArray(parsed.steps)) {
                        newSteps = parsed.steps;
                    } else if (typeof parsed.step !== 'undefined' && parsed.instruction) {
                        // Single step object
                        newSteps = [parsed];
                    }
                }
                
                // Step 5: Validate we have usable steps
                if (newSteps.length === 0) {
                    throw new Error("No valid steps found in parsed JSON");
                }
                
                // Validate each step has required fields
                for (let i = 0; i < newSteps.length; i++) {
                    const step = newSteps[i];
                    if (typeof step.step === 'undefined') {
                        console.warn(`Step ${i} missing 'step' field, adding it`);
                        step.step = i;
                    }
                    if (!step.instruction) {
                        console.warn(`Step ${i} missing 'instruction' field`);
                        step.instruction = "Step " + step.step;
                    }
                    if (!step.mermaid) {
                        console.warn(`Step ${i} missing 'mermaid' field`);
                        throw new Error(`Step ${i} missing required 'mermaid' field`);
                    }
                }
                
                // Step 6: Determine simulation scope
                let simId = window.activeSimId;
                const isNewSimulation = newSteps.length > 0 && newSteps[0].step === 0;
                
                if (isNewSimulation) {
                    // Brand new simulation
                    simId = 'sim_' + Date.now();
                    window.activeSimId = simId;
                    window.simulationStore[simId] = [];
                    window.simulationState[simId] = 0;
                    window.validatedSteps = new Set();
                    window.lastWorkingMermaid[simId] = null;
                    console.log("🆕 NEW SIMULATION:", simId);
                } else if (!simId) {
                    // Continuation but no active sim - create fallback scope
                    simId = 'sim_cont_' + Date.now();
                    window.activeSimId = simId;
                    window.simulationStore[simId] = [];
                    window.simulationState[simId] = 0;
                    window.validatedSteps = new Set();
                    window.lastWorkingMermaid[simId] = null;
                    console.log("🔄 CONTINUATION (new scope):", simId);
                }
                
                // Step 7: Merge steps into store
                if (isNewSimulation) {
                    window.simulationStore[simId] = newSteps;
                } else {
                    // For continuation, append new steps
                    window.simulationStore[simId] = window.simulationStore[simId].concat(newSteps);
                }
                
                console.log(`📊 Simulation ${simId}: ${window.simulationStore[simId].length} total steps`);
                
                // Step 8: Calculate which index to render
                // Use array index, not step.step value (they may not match)
                const startIndex = isNewSimulation ? 0 : window.simulationStore[simId].length - newSteps.length;
                
                // Step 9: Remove loading overlay if present
                const loader = targetElement.querySelector('.generation-loader');
                if (loader) loader.remove();
                
                const axiomLoader = targetElement.querySelector('.axiom-loader');
                if (axiomLoader) axiomLoader.remove();
                
                // Step 10: Render the FIRST of the new steps
                await renderPlaylistStep(simId, startIndex, targetElement);
                
                
                
                return; // CRITICAL: Exit here to prevent falling through to markdown
                
            } catch (jsonErr) {
                console.error("❌ JSON Processing Failed:", jsonErr.message);
                console.log("Raw text (first 500 chars):", fullText.substring(0, 500));
                
                // Show error to user instead of rendering raw JSON as markdown
                targetElement.innerHTML = `
                    <div class="parse-error" style="
                        background: rgba(255,60,60,0.1);
                        border: 1px solid #ff4444;
                        border-left: 3px solid #ff4444;
                        border-radius: 8px;
                        padding: 20px;
                        margin: 10px 0;
                        font-family: 'JetBrains Mono', monospace;
                    ">
                        <h3 style="color: #ff6666; margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 1.2em;">⚠️</span> Response Parse Error
                        </h3>
                        <p style="color: #ffaaaa; margin: 0 0 15px 0; line-height: 1.5;">
                            The simulation data couldn't be parsed. This usually means the AI 
                            generated malformed JSON. Error: <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px;">${escapeHtml(jsonErr.message)}</code>
                        </p>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button onclick="retryLastMessage()" style="
                                background: linear-gradient(135deg, #ff4444, #cc3333);
                                color: white;
                                border: none;
                                padding: 10px 20px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-family: inherit;
                                font-weight: bold;
                                transition: transform 0.1s;
                            " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                                🔄 Retry Request
                            </button>
                            <button onclick="this.closest('.parse-error').querySelector('details').open = true" style="
                                background: transparent;
                                color: #888;
                                border: 1px solid #444;
                                padding: 10px 20px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-family: inherit;
                            ">
                                View Raw Response
                            </button>
                        </div>
                        <details style="margin-top: 15px;">
                            <summary style="color: #666; cursor: pointer; padding: 5px 0;">Raw Response Data</summary>
                            <pre style="
                                background: rgba(0,0,0,0.4);
                                padding: 15px;
                                margin-top: 10px;
                                overflow-x: auto;
                                font-size: 0.75em;
                                color: #888;
                                max-height: 300px;
                                overflow-y: auto;
                                border-radius: 4px;
                                border: 1px solid #333;
                            ">${escapeHtml(fullText.substring(0, 3000))}${fullText.length > 3000 ? '\n\n... [truncated]' : ''}</pre>
                        </details>
                    </div>`;
                targetElement.style.opacity = '1';
                
                
                
                return; // Don't fall through to markdown rendering
            }
        }

        // =====================================================================
        // STANDARD TEXT/MARKDOWN RESPONSE
        // =====================================================================
        
        // Only reached for non-JSON responses (explanations, Q&A, etc.)
        targetElement.innerHTML = marked.parse(fullText);
        
        // Process any mermaid diagrams in the markdown
        await fixMermaid(targetElement);
        
        targetElement.style.opacity = '1';
        historyDiv.scrollTop = historyDiv.scrollHeight;
        
        

    } catch (e) {
        console.error("sendMessage error:", e);
        targetElement.innerHTML = `
            <div style="
                background: rgba(255,0,0,0.1);
                border: 1px solid #ff4444;
                border-radius: 8px;
                padding: 20px;
            ">
                <strong style="color: #ff6666;">⚠️ SYSTEM ERROR</strong>
                <p style="color: #ffaaaa; margin: 10px 0 0 0;">${escapeHtml(e.message)}</p>
                <button onclick="retryLastMessage()" style="
                    margin-top: 15px;
                    background: #ff4444;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                ">🔄 Retry</button>
            </div>`;
        targetElement.style.opacity = '1';
    } finally {
        window.isProcessing = false;
        window.isSimulationUpdate = false;
    }
}


/**
 * Retry the last failed message
 */
function retryLastMessage() {
    if (window.lastUserMessage) {
        console.log("🔄 Retrying:", window.lastUserMessage.substring(0, 50) + "...");
        userInput.value = window.lastUserMessage;
        sendMessage();
    } else {
        showToast("No message to retry");
    }
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function sendFeedback(rating, btnElement) {
    // 1. Visual Feedback (Instant)
    const parent = btnElement.parentElement;
    parent.innerHTML = rating === 1 ? 
        `<span style="color:#00ff9f; font-weight:bold; font-size:1.2rem;">✓</span>` : 
        `<span style="color:#ff003c; font-weight:bold; font-size:1.2rem;">✕</span>`;

    // 2. Send to Server
    try {
        await fetch(`${API_URL}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rating: rating,
                session_id: currentSessionId
            })
        });
        console.log("Feedback sent:", rating);
    } catch (e) {
        console.error("Vote failed", e);
    }
}




/* ==========================================================================
   SECTION 6: RENDERING & MERMAID
   ========================================================================== */
async function renderPlaylistStep(simId, index, targetElement = null) {

    const playlist = window.simulationStore[simId];
    if (!playlist || index < 0 || index >= playlist.length) return;

    window.simulationState[simId] = index;

    const stepData = playlist[index];
    const isLastKnownStep = index === playlist.length - 1;
    const prevDisabled = index === 0 ? 'disabled' : '';
    const isAlgorithmComplete = stepData.is_final === true;
    
    let nextButtonHtml = '';
    
    if (!isLastKnownStep) {
        nextButtonHtml = `<button onclick="handleSimNav('${simId}', 'NEXT', this)" class="btn-sim">NEXT ></button>`;
    } else if (isAlgorithmComplete) {
        nextButtonHtml = `<button class="btn-sim" disabled style="opacity: 0.5; cursor: default;">✓ COMPLETE</button>`;
    } else {
        nextButtonHtml = `<button onclick="handleSimNav('${simId}', 'GENERATE_MORE', this)" class="btn-sim">GENERATE NEXT >></button>`;
    }

    let feedbackHtml = '';
    if (isAlgorithmComplete) {
        feedbackHtml = `
        <div class="feedback-dock">
            <button onclick="sendFeedback(1, this)" class="btn-icon" title="Good">👍</button>
            <button onclick="sendFeedback(-1, this)" class="btn-icon" title="Bad">👎</button>
        </div>`;
    }

    const htmlContent = `
    <div class="simulation-container" style="display:flex; flex-direction:column; gap:10px;">
        <div class="simulation-header" style="border-left: 3px solid #bc13fe; padding-left: 10px; margin-bottom: 5px;">
            ${marked.parse(stepData.instruction)}
        </div>
        
        <div class="graph-frame" style="position: relative;">
            <pre><code class="language-mermaid">${stepData.mermaid}</code></pre>
            ${feedbackHtml}
        </div>
        
        <div class="sim-controls" style="display:flex; justify-content:space-between; margin-top:5px;">
            <div>
                <button onclick="handleSimNav('${simId}', 'PREV', this)" ${prevDisabled} class="btn-sim">&lt; PREV</button>
                <button onclick="handleSimNav('${simId}', 'RESET', this)" class="btn-sim reset-btn">⟲ RESET</button>
            </div>
            ${nextButtonHtml}
        </div>

        <div class="simulation-data" style="background:rgba(0,0,0,0.2); padding:10px; border-radius:4px; font-size:0.9em; overflow-x:auto;">
            ${stepData.data_table}
        </div>
    </div>`;
    
    if (!targetElement && window.lastBotMessageDiv) {
        targetElement = window.lastBotMessageDiv.querySelector('.msg-body');
    }

    if (targetElement) {
        targetElement.innerHTML = htmlContent;
        
        // =====================================================
        // THIS IS THE CRITICAL FIX - pass simId and index!
        // =====================================================
        await fixMermaid(targetElement, simId, index);
        
        targetElement.style.opacity = '1';
        
        if (targetElement.closest('.msg.model') === window.lastBotMessageDiv && index === 0) {
            window.lastBotMessageDiv.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }
}



function sanitizeMermaidString(raw) {
    if (!raw || typeof raw !== 'string') return 'flowchart LR\nA["Empty"]';
    
    console.log("🧹 SANITIZER INPUT:", raw.substring(0, 200) + "...");
    
    let clean = raw;
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: UNESCAPE & NORMALIZE
    // ═══════════════════════════════════════════════════════════════
    
    // Convert escaped newlines to real newlines
    clean = clean.replace(/\\n/g, "\n");
    
    // Normalize quotes
    clean = clean.replace(/[""]/g, '"').replace(/['']/g, "'");
    
    // Remove markdown code block wrappers
    clean = clean.replace(/^```mermaid\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    clean = clean.trim();

    // ═══════════════════════════════════════════════════════════════
// EMERGENCY FIX: BRACKET CORRUPTION & UNICODE GARBAGE
// ═══════════════════════════════════════════════════════════════

// FIX 1: Mixed bracket shapes [{"text"}] or [{text}] → ["text"]
    clean = clean.replace(/\[\s*\{+"?([^"}\]]*)"?\}+\s*\]/g, '["$1"]');

// FIX 2: All unicode fractions (there are many variants)
    clean = clean.replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, function(m) {
        const map = {'½':'1/2','¼':'1/4','¾':'3/4','⅓':'1/3','⅔':'2/3','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8'};
        return map[m] || m;
    });

// FIX 3: Unicode fraction slash (⁄) to regular slash
    clean = clean.replace(/⁄/g, '/');

// FIX 4: Remove ALL garbage unicode that breaks mermaid
    clean = clean.replace(/[ﬂﬁ¶°§©®™•·²³¹⁰⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/g, '');

// FIX 5: Broken ampersands (keep only valid HTML entities)
    clean = clean.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, ' and ');

// FIX 6: Double/nested brackets
    clean = clean.replace(/\[\[+/g, '[');
    clean = clean.replace(/\]\]+/g, ']');
    clean = clean.replace(/\{\{+/g, '{');
    clean = clean.replace(/\}\}+/g, '}');
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: PROTECT STRING LITERALS (MASKING)
    // ═══════════════════════════════════════════════════════════════
    
    const tokenMap = new Map();
    let tokenCounter = 0;
    
    // Mask all quoted strings to protect them during transformations
    clean = clean.replace(/"([^"]*?)"/g, (match, content) => {
        // Fix common issues inside strings
        let fixed = content
            // Convert markdown lists to bullet points
            .replace(/\n\s*[-*]\s+/g, "<br/>• ")
            .replace(/^[-*]\s+/, "• ")
            // Convert remaining newlines to <br/>
            .replace(/\n/g, "<br/>")
            // Escape parentheses (Mermaid interprets them as shapes)
            .replace(/\(/g, "&#40;")
            .replace(/\)/g, "&#41;")
            // Remove any remaining problematic characters
            .replace(/[[\]]/g, "");
        
        const token = `__STR_${tokenCounter++}__`;
        tokenMap.set(token, `"${fixed}"`);
        return token;
    });
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: FIX GRAPH DECLARATION
    // ═══════════════════════════════════════════════════════════════
    
    // Force flowchart LR if no valid declaration
    if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie)/im.test(clean)) {
        clean = "flowchart LR\n" + clean;
    }
    
    // Normalize graph direction to LR
    clean = clean.replace(/^(graph|flowchart)\s+(TD|TB|RL|BT)/im, "$1 LR");
    
    // Ensure newline after graph declaration
    clean = clean.replace(/^((?:graph|flowchart)\s+LR)([^\n])/im, "$1\n$2");
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: FIX STRUCTURAL ISSUES
    // ═══════════════════════════════════════════════════════════════
    
    // Fix "endsubgraph" → "end"
    clean = clean.replace(/endsubgraph/gi, "end");
    
    // Fix smashed "end" (e.g., "]end" → "]\nend")
    clean = clean.replace(/([\]\)\}>])\s*end/gi, "$1\nend");
    
    // Fix smashed keywords after brackets
    clean = clean.replace(/([\]\)\}>])\s*(subgraph|class|classDef|style|linkStyle)/gi, "$1\n$2");
    
    // Ensure subgraph has newline after title
    clean = clean.replace(/(subgraph\s+\w+(?:\s*\[.*?\])?)\s*([A-Za-z])/gi, "$1\n$2");
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: FIX ARROWS
    // ═══════════════════════════════════════════════════════════════
    
    // Fix hybrid arrows (-- label ==> or == label -->)
    clean = clean.replace(/--\s*(__STR_\d+__)\s*==>/g, "== $1 ==>");
    clean = clean.replace(/==\s*(__STR_\d+__)\s*-->/g, "-- $1 -->");
    
    // Fix arrows without spaces
    clean = clean.replace(/(\w)(-->|==>|-.->)(\w)/g, "$1 $2 $3");
    
    // Fix malformed circle arrows
    clean = clean.replace(/--o/g, "-->");
    clean = clean.replace(/o--/g, "-->");
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 6: FIX CLASSDEFS & STYLES
    // ═══════════════════════════════════════════════════════════════
    
    // Extract all classDefs for hoisting to end
    const classDefs = [];
    clean = clean.replace(/^\s*classDef\s+.+$/gm, (match) => {
        let def = match.trim();
        // Ensure proper CSS syntax
        def = def.replace(/stroke-width\s*(?!:)/gi, "stroke-width:");
        def = def.replace(/stroke-dasharray\s+(\d+)/gi, "stroke-dasharray:$1");
        // Ensure semicolon at end
        if (!def.endsWith(';')) def += ';';
        classDefs.push(def);
        return '';
    });
    
    clean = clean.replace(/^\s*class\s+([A-Za-z0-9_,\s]+)\s+(\w+)\s*;?$/gm, (match, nodes, className) => {
    // "class A, B, C active;" → "class A active;\nclass B active;\nclass C active;"
    const nodeList = nodes.split(',').map(n => n.trim()).filter(n => n);
    return nodeList.map(n => `class ${n} ${className};`).join('\n');
});
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 7: FIX CSS-LIKE PROPERTIES
    // ═══════════════════════════════════════════════════════════════
    
    // Fix orphaned stroke-width
    clean = clean.replace(/stroke-width\s*(?:;|$)/gi, "stroke-width:2px;");
    
    // Fix colors without hash
    clean = clean.replace(/(fill|stroke|color):\s*([0-9a-fA-F]{6})(?![0-9a-fA-F])/gi, "$1:#$2");
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 8: ENSURE SEMICOLONS & LINE BREAKS
    // ═══════════════════════════════════════════════════════════════
    
    // Split into lines for processing
    let lines = clean.split('\n').map(l => l.trim()).filter(l => l);
    
    lines = lines.map(line => {
        // Skip certain lines
        if (/^(flowchart|graph|subgraph|end|direction)/i.test(line)) {
            return line;
        }
        // Add semicolon if missing (for nodes, links, class, style)
        if (!line.endsWith(';') && !line.endsWith('{')) {
            return line + ';';
        }
        return line;
    });
    
    clean = lines.join('\n');
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 9: UNMASK STRINGS & APPEND CLASSDEFS
    // ═══════════════════════════════════════════════════════════════
    
    // Restore masked strings
    tokenMap.forEach((val, key) => {
        clean = clean.replace(new RegExp(key, 'g'), val);
    });
    
    // Append hoisted classDefs at the end
    if (classDefs.length > 0) {
        clean += '\n' + [...new Set(classDefs)].join('\n');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 10: FINAL CLEANUP
    // ═══════════════════════════════════════════════════════════════
    
    // Remove double semicolons
    clean = clean.replace(/;+/g, ';');
    
    // Remove empty lines
    clean = clean.split('\n').filter(l => l.trim()).join('\n');
    
    console.log("🧹 SANITIZER OUTPUT:", clean.substring(0, 200) + "...");
    
    return clean;
}

function repairLLMJson(rawString) {
    let clean = rawString.trim();

    // 1. Remove Markdown Code Blocks (if mistakenly included)
    clean = clean.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "");

    // 2. FIX: The "Single Quote Escape" Trap
    // JSON does not allow \' (it only allows \"). LLMs often screw this up.
    clean = clean.replace(/\\'/g, "'");

    // 3. FIX: The "Bad Escape" Trap (The specific error you saw)
    // Find backslashes that are NOT followed by valid JSON escape characters.
    // Double-escape them so they become literal backslashes.
    // Valid: " \ / b f n r t u
    clean = clean.replace(/\\(?![/u"\\bfnrt])/g, "\\\\");

    // 4. FIX: Double-Escaped Quotes (Recursive fix)
    // Sometimes LLMs give us \\" which breaks things.
    clean = clean.replace(/\\\\"/g, '\\"');

    return clean;
}

/* ==========================================================================
   SECTION 7: SELF-HEALING SYSTEM v2.0
   
   Architecture:
   1. Mermaid render fails
   2. DIAGNOSTIC phase - analyze the error
   3. LLM REPAIR phase - sequential attempts with exponential backoff
   4. VERIFICATION phase - test the fix
   5. FALLBACK phase - use previous working graph
   6. FATAL phase - show debug info
   ========================================================================== */

const RepairConfig = {
    MAX_ATTEMPTS: 3,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 8000,
    RENDER_TIMEOUT_MS: 5000
};

const RepairPhase = {
    DIAGNOSING: 'DIAGNOSING',
    CONTACTING_LLM: 'CONTACTING_LLM', 
    APPLYING_FIX: 'APPLYING_FIX',
    VERIFYING: 'VERIFYING',
    SUCCESS: 'SUCCESS',
    FALLBACK: 'FALLBACK',
    FATAL: 'FATAL'
};

// Global repair state
window.repairState = {
    isActive: false,
    phase: null,
    attempt: 0,
    startTime: null,
    wrapper: null,
    timerInterval: null
};

/* ==========================================================================
   MAIN ENTRY: fixMermaid
   ========================================================================== */
async function fixMermaid(container, simId = null, stepIndex = null) {
    console.log(`🔧 [fixMermaid] Called with simId=${simId}, stepIndex=${stepIndex}`);
    
    const codes = container.querySelectorAll('pre code');
    
    for (const codeBlock of codes) {
        const rawGraph = codeBlock.textContent;
        const isMermaid = codeBlock.classList.contains('language-mermaid') ||
            rawGraph.includes('graph TD') || rawGraph.includes('graph LR') ||
            rawGraph.includes('sequenceDiagram');

        if (!isMermaid) continue;

        const preElement = codeBlock.parentElement;
        const sanitizedGraph = sanitizeMermaidString(rawGraph);
        
        // Create the wrapper structure
        const wrapper = createGraphWrapper(simId, stepIndex);
        const graphDiv = createGraphDiv(sanitizedGraph);
        
        wrapper.appendChild(createOverlay());
        wrapper.appendChild(graphDiv);
        preElement.replaceWith(wrapper);

        // Attempt initial render
        const renderResult = await attemptRender(graphDiv, wrapper);
        
        if (renderResult.success) {
            console.log(`✅ [fixMermaid] Initial render successful`);
            onRenderSuccess(wrapper, graphDiv, sanitizedGraph, simId, stepIndex, false);
        } else {
            console.log(`❌ [fixMermaid] Initial render failed: ${renderResult.error}`);
            await startRepairProcess(wrapper, sanitizedGraph, renderResult.error, simId, stepIndex);
        }
    }
}

/* ==========================================================================
   WRAPPER & ELEMENT CREATION
   ========================================================================== */
function createGraphWrapper(simId, stepIndex) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-wrapper';
    wrapper.id = 'wrapper-' + Date.now();
    if (simId) wrapper.dataset.simId = simId;
    if (stepIndex !== null) wrapper.dataset.stepIndex = String(stepIndex);
    
    Object.assign(wrapper.style, {
        height: "500px", 
        width: "100%", 
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(0, 243, 255, 0.2)", 
        borderRadius: "8px",
        marginTop: "15px", 
        overflow: "hidden", 
        cursor: "grab", 
        position: "relative"
    });
    
    return wrapper;
}

function createGraphDiv(code) {
    const graphDiv = document.createElement('div');
    graphDiv.className = 'mermaid';
    graphDiv.id = 'mermaid-' + Date.now();
    graphDiv.textContent = code;
    Object.assign(graphDiv.style, {
        transformOrigin: "0 0",
        transition: "transform 0.05s linear",
        width: "100%",
        height: "100%"
    });
    return graphDiv;
}

function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'hud-overlay';
    overlay.innerHTML = `
        <div class="hud-text">Scroll • Pan • Click</div>
        <button class="graph-toggle-btn" onclick="toggleGraphTheme(this)">
            <span>☀</span> VIEW: BLUEPRINT
        </button>
    `;
    return overlay;
}

/* ==========================================================================
   RENDER ATTEMPT WITH TIMEOUT
   ========================================================================== */
async function attemptRender(graphDiv, wrapper) {
    try {
        await new Promise(r => setTimeout(r, 50));
        
        // Race between render and timeout
        const result = await Promise.race([
            mermaid.run({ nodes: [graphDiv] }).then(() => ({ success: true })),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Render timeout')), RepairConfig.RENDER_TIMEOUT_MS)
            )
        ]);
        
        return result;
    } catch (error) {
        return { success: false, error: error.message || 'Unknown render error' };
    }
}

/* ==========================================================================
   REPAIR PROCESS CONTROLLER
   ========================================================================== */
async function startRepairProcess(wrapper, badCode, errorMsg, simId, stepIndex) {
    // Prevent concurrent repairs
    if (window.repairState.isActive) {
        console.log(`⏳ [REPAIR] Already active, queuing...`);
        await waitForRepairComplete();
    }
    
    // Initialize repair state
    window.repairState = {
        isActive: true,
        phase: RepairPhase.DIAGNOSING,
        attempt: 0,
        startTime: Date.now(),
        wrapper: wrapper,
        timerInterval: null
    };
    
    // Gather context
    const context = getRepairContext(simId, stepIndex);
    const previousWorking = getLastWorkingGraph(simId, stepIndex);
    
    let currentCode = badCode;
    let currentError = errorMsg;
    
    // Show initial diagnostic phase
    renderRepairUI(wrapper, {
        phase: RepairPhase.DIAGNOSING,
        attempt: 0,
        error: currentError,
        code: currentCode
    });
    
    await delay(800); // Brief pause to show diagnostic phase
    
    // === MAIN REPAIR LOOP ===
    while (window.repairState.attempt < RepairConfig.MAX_ATTEMPTS) {
        window.repairState.attempt++;
        const attempt = window.repairState.attempt;
        
        console.log(`🔧 [REPAIR] === ATTEMPT ${attempt}/${RepairConfig.MAX_ATTEMPTS} ===`);
        
        // Update UI to show we're contacting LLM
        window.repairState.phase = RepairPhase.CONTACTING_LLM;
        renderRepairUI(wrapper, {
            phase: RepairPhase.CONTACTING_LLM,
            attempt: attempt,
            error: currentError,
            code: currentCode
        });
        
        try {
            // Call the repair server
            console.log(`📡 [REPAIR] Calling server...`);
            const serverResponse = await callRepairServerWithRetry(
                currentCode,
                currentError,
                context,
                stepIndex,
                attempt,
                previousWorking
            );
            
            if (!serverResponse.success) {
                throw new Error(serverResponse.error || 'Server returned failure');
            }
            
            const fixedCode = serverResponse.fixedCode;
            console.log(`📡 [REPAIR] Got fixed code (${fixedCode.length} chars)`);
            
            // Update UI to show we're applying the fix
            window.repairState.phase = RepairPhase.APPLYING_FIX;
            renderRepairUI(wrapper, {
                phase: RepairPhase.APPLYING_FIX,
                attempt: attempt,
                error: currentError,
                code: fixedCode
            });
            
            await delay(300);
            
            // Try to render the fixed code
            window.repairState.phase = RepairPhase.VERIFYING;
            renderRepairUI(wrapper, {
                phase: RepairPhase.VERIFYING,
                attempt: attempt,
                error: null,
                code: fixedCode
            });
            
            const verifyResult = await verifyFix(wrapper, fixedCode, simId, stepIndex);
            
            if (verifyResult.success) {
                // SUCCESS!
                console.log(`✅ [REPAIR] Attempt ${attempt} SUCCEEDED!`);
                window.repairState.phase = RepairPhase.SUCCESS;
                window.repairState.isActive = false;
                clearRepairTimer();
                
                showToast(`✓ Repaired on attempt ${attempt}/${RepairConfig.MAX_ATTEMPTS}`);
                return;
            }
            
            // Render failed
            console.log(`❌ [REPAIR] Attempt ${attempt} - fix didn't render: ${verifyResult.error}`);
            currentCode = fixedCode; // Use the "improved" code for next attempt
            currentError = verifyResult.error;
            
        } catch (error) {
            console.error(`❌ [REPAIR] Attempt ${attempt} error:`, error);
            currentError = error.message;
        }
        
        // Exponential backoff before next attempt
        if (window.repairState.attempt < RepairConfig.MAX_ATTEMPTS) {
            const backoffMs = Math.min(
                RepairConfig.BASE_DELAY_MS * Math.pow(2, attempt - 1),
                RepairConfig.MAX_DELAY_MS
            );
            console.log(`⏳ [REPAIR] Waiting ${backoffMs}ms before next attempt...`);
            
            renderRepairUI(wrapper, {
                phase: 'WAITING',
                attempt: attempt,
                error: currentError,
                code: currentCode,
                waitMs: backoffMs
            });
            
            await delay(backoffMs);
        }
    }
    
    // === ALL ATTEMPTS FAILED - TRY FALLBACK ===
    console.log(`🔄 [REPAIR] All ${RepairConfig.MAX_ATTEMPTS} attempts failed, trying fallback...`);
    
    if (previousWorking) {
        window.repairState.phase = RepairPhase.FALLBACK;
        renderRepairUI(wrapper, {
            phase: RepairPhase.FALLBACK,
            attempt: RepairConfig.MAX_ATTEMPTS,
            error: 'Attempting recovery with previous graph',
            code: previousWorking
        });
        
        const fallbackResult = await attemptFallbackRecovery(wrapper, previousWorking, simId, stepIndex, context);
        
        if (fallbackResult.success) {
            console.log(`✅ [REPAIR] Fallback succeeded!`);
            window.repairState.isActive = false;
            clearRepairTimer();
            showToast('Recovered using previous graph state');
            return;
        }
    }
    
    // === TOTAL FAILURE ===
    console.log(`💀 [REPAIR] All recovery options exhausted`);
    window.repairState.phase = RepairPhase.FATAL;
    window.repairState.isActive = false;
    clearRepairTimer();
    
    renderFatalError(wrapper, badCode, currentError, simId, stepIndex);
    reportFailureToServer(simId, stepIndex, badCode, currentError);
}

/* ==========================================================================
   SERVER COMMUNICATION
   ========================================================================== */
async function callRepairServerWithRetry(code, error, context, stepIndex, attemptNumber, previousWorking) {
    const startTime = Date.now();
    
    // First, verify the server is reachable
    try {
        const healthCheck = await fetch(`${API_URL}/health`, { 
            method: 'GET',
            signal: AbortSignal.timeout(90000)
        });
        if (!healthCheck.ok) {
            return { success: false, error: 'Server health check failed' };
        }
    } catch (e) {
        console.error(`📡 [REPAIR] Server unreachable:`, e);
        return { success: false, error: `Server unreachable: ${e.message}` };
    }
    
    // Now make the actual repair request
    try {
        console.log(`📡 [REPAIR] Sending repair request...`);
        
        const response = await fetch(`${API_URL}/repair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(100000), 
            body: JSON.stringify({
                code: code,
                error: error,
                context: context,
                step_index: stepIndex,
                attempt_number: attemptNumber,
                previous_working: previousWorking,
                session_id: currentSessionId
            })
        });
        
        const elapsed = Date.now() - startTime;
        console.log(`📡 [REPAIR] Response received in ${elapsed}ms, status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            return { success: false, error: `Server error ${response.status}: ${errorText}` };
        }
        
        const data = await response.json();
        
        if (data.error) {
            return { success: false, error: data.error };
        }
        
        if (!data.fixed_code || data.fixed_code.trim().length === 0) {
            return { success: false, error: 'Server returned empty fix' };
        }
        
        return { 
            success: true, 
            fixedCode: data.fixed_code,
            method: data.method,
            durationMs: elapsed
        };
        
    } catch (error) {
        console.error(`📡 [REPAIR] Request failed:`, error);
        return { success: false, error: `Request failed: ${error.message}` };
    }
}

/* ==========================================================================
   VERIFICATION
   ========================================================================== */
async function verifyFix(wrapper, fixedCode, simId, stepIndex) {
    // 1. Test in hidden container (safe - won't break UI)
    const testContainer = document.createElement('div');
    testContainer.style.cssText = 'position:absolute; visibility:hidden;';
    document.body.appendChild(testContainer);
    
    const testDiv = document.createElement('div');
    testDiv.className = 'mermaid';
    testDiv.textContent = fixedCode;
    testContainer.appendChild(testDiv);
    
    try {
        // 2. Try to render
        await mermaid.run({ nodes: [testDiv] });
        
        // 3. SUCCESS! Clean up test container
        testContainer.remove();
        
        // 4. Now render for real in the actual wrapper
        wrapper.innerHTML = '';
        const graphDiv = createGraphDiv(fixedCode);
        wrapper.appendChild(createOverlay());
        wrapper.appendChild(graphDiv);
        await mermaid.run({ nodes: [graphDiv] });
        
        // 5. Update the playlist with FIXED code (CRITICAL!)
        if (simId && window.simulationStore[simId]?.[stepIndex]) {
            window.simulationStore[simId][stepIndex].mermaid = fixedCode;
        }
        
        // 6. Track success, enable interactions
        onRenderSuccess(wrapper, graphDiv, fixedCode, simId, stepIndex, true);
        
        return { success: true };
        
    } catch (error) {
        testContainer.remove();
        return { success: false, error: error.message };
    }
}

/* ==========================================================================
   FALLBACK RECOVERY
   ========================================================================== */
async function attemptFallbackRecovery(wrapper, fallbackCode, simId, stepIndex, context) {
    try {
        // Ask LLM to adapt the previous graph for current context
        const response = await callRepairServerWithRetry(
            fallbackCode,
            'FALLBACK_REQUEST',
            context,
            stepIndex,
            0,
            null
        );
        
        const codeToTry = response.success ? response.fixedCode : fallbackCode;
        return await verifyFix(wrapper, codeToTry, simId, stepIndex);
        
    } catch (error) {
        // Last resort: try the raw fallback
        return await verifyFix(wrapper, fallbackCode, simId, stepIndex);
    }
}

/* ==========================================================================
   REPAIR UI RENDERING
   ========================================================================== */
function renderRepairUI(wrapper, state) {
    const { phase, attempt, error, code, waitMs } = state;
    
    // Clear any existing timer
    clearRepairTimer();
    
    const elapsedSec = ((Date.now() - window.repairState.startTime) / 1000).toFixed(1);
    const codePreview = (code || '').split('\n').slice(0, 6)
        .map(l => escapeHtml(l.substring(0, 60)))
        .join('\n');
    
    const phaseConfig = {
        [RepairPhase.DIAGNOSING]: {
            icon: '🔍',
            title: 'ANALYZING RENDER FAILURE',
            color: '#ff9f43',
            message: 'Diagnosing syntax issues...'
        },
        [RepairPhase.CONTACTING_LLM]: {
            icon: '📡',
            title: 'CONTACTING REPAIR LLM',
            color: '#00f3ff',
            message: 'Awaiting AI response...'
        },
        [RepairPhase.APPLYING_FIX]: {
            icon: '⚡',
            title: 'APPLYING FIX',
            color: '#bc13fe',
            message: 'Integrating corrected syntax...'
        },
        [RepairPhase.VERIFYING]: {
            icon: '✓',
            title: 'VERIFYING RENDER',
            color: '#00ff9f',
            message: 'Testing corrected graph...'
        },
        [RepairPhase.FALLBACK]: {
            icon: '🔄',
            title: 'FALLBACK RECOVERY',
            color: '#ffc107',
            message: 'Attempting recovery with previous state...'
        },
        'WAITING': {
            icon: '⏳',
            title: 'PREPARING RETRY',
            color: '#888',
            message: `Next attempt in <span id="countdown-val">${Math.ceil((waitMs || 1000) / 1000)}</span>s...`
        }
    };
    
    const config = phaseConfig[phase] || phaseConfig[RepairPhase.DIAGNOSING];
    
    wrapper.innerHTML = `
    <div class="repair-console" style="
        height: 100%;
        background: linear-gradient(180deg, rgba(5, 5, 15, 0.98) 0%, rgba(10, 5, 20, 0.95) 100%);
        border: 1px solid ${config.color}40;
        border-radius: 8px;
        font-family: 'JetBrains Mono', monospace;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    ">
        <!-- Header -->
        <div style="
            background: linear-gradient(90deg, ${config.color}20 0%, transparent 100%);
            border-bottom: 1px solid ${config.color}40;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.3em;">${config.icon}</span>
                <span style="color: ${config.color}; font-weight: bold; letter-spacing: 1px;">
                    ${config.title}
                </span>
            </div>
            <div style="display: flex; align-items: center; gap: 15px; font-size: 0.85em;">
                <span style="color: #666;">ATTEMPT</span>
                <span style="
                    color: ${config.color}; 
                    font-weight: bold;
                    background: ${config.color}20;
                    padding: 2px 8px;
                    border-radius: 4px;
                ">${attempt}/${RepairConfig.MAX_ATTEMPTS}</span>
            </div>
        </div>
        
        <!-- Status Area -->
        <div style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 15px;">
            
            <!-- Progress Indicator -->
            <div style="
                background: rgba(0,0,0,0.4);
                border: 1px solid ${config.color}30;
                border-radius: 6px;
                padding: 16px;
                display: flex;
                align-items: center;
                gap: 15px;
            ">
                <div class="repair-spinner" style="
                    width: 28px;
                    height: 28px;
                    border: 3px solid ${config.color}30;
                    border-top-color: ${config.color};
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    flex-shrink: 0;
                "></div>
                <div style="flex-grow: 1;">
                    <div style="color: #fff; font-size: 1em; margin-bottom: 4px;">
                        ${config.message}
                    </div>
                    <div id="repair-timer" style="color: #666; font-size: 0.8em;">
                        Elapsed: ${elapsedSec}s
                    </div>
                </div>
            </div>
            
            ${error ? `
            <!-- Error Display -->
            <div style="
                background: rgba(255, 60, 60, 0.1);
                border: 1px solid rgba(255, 60, 60, 0.3);
                border-left: 3px solid #ff3c3c;
                border-radius: 4px;
                padding: 12px;
            ">
                <div style="color: #ff6b6b; font-size: 0.75em; margin-bottom: 4px; text-transform: uppercase;">
                    Error Detected
                </div>
                <div style="color: #ffaaaa; font-size: 0.85em; word-break: break-word;">
                    ${escapeHtml(error.substring(0, 150))}${error.length > 150 ? '...' : ''}
                </div>
            </div>
            ` : ''}
            
            <!-- Code Preview -->
            <div style="
                flex-grow: 1;
                background: rgba(0,0,0,0.5);
                border: 1px solid #333;
                border-radius: 4px;
                padding: 12px;
                overflow: hidden;
            ">
                <div style="color: #555; font-size: 0.7em; margin-bottom: 8px; text-transform: uppercase;">
                    Code Under Repair
                </div>
                <pre style="
                    color: #666;
                    font-size: 0.75em;
                    margin: 0;
                    filter: blur(1px);
                    opacity: 0.6;
                    white-space: pre-wrap;
                    word-break: break-all;
                ">${codePreview}</pre>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="
            background: rgba(0,0,0,0.3);
            border-top: 1px solid #222;
            padding: 10px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.75em;
            color: #555;
        ">
            <span>AXIOM SELF-HEALING v2.0</span>
            <div style="display: flex; gap: 8px;">
                ${[1, 2, 3].map(n => `
                    <div style="
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: ${n <= attempt ? config.color : '#333'};
                        ${n === attempt ? `box-shadow: 0 0 8px ${config.color};` : ''}
                    "></div>
                `).join('')}
            </div>
        </div>
    </div>`;
    
    // Start the timer update
    startRepairTimer(wrapper);
}

function renderFatalError(wrapper, badCode, errorMsg, simId, stepIndex) {
    const lines = badCode.split('\n');
    const numberedCode = lines.slice(0, 20).map((line, i) =>
        `<div style="display:flex; gap: 10px;">
            <span style="color:#444; width:25px; text-align:right; flex-shrink:0;">${i + 1}</span>
            <span style="color:#888;">${escapeHtml(line)}</span>
         </div>`
    ).join('');
    
    wrapper.innerHTML = `
    <div style="
        height: 100%;
        background: linear-gradient(180deg, rgba(30, 5, 5, 0.98) 0%, rgba(15, 5, 10, 0.95) 100%);
        border: 1px solid #ff000050;
        border-radius: 8px;
        font-family: 'JetBrains Mono', monospace;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    ">
        <!-- Header -->
        <div style="
            background: linear-gradient(90deg, rgba(255,0,0,0.2) 0%, transparent 100%);
            border-bottom: 1px solid #ff000040;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.3em;">🛑</span>
                <span style="color: #ff4444; font-weight: bold; letter-spacing: 1px;">
                    RENDER FAILURE - UNRECOVERABLE
                </span>
            </div>
            <span style="color: #666; font-size: 0.8em;">
                ${RepairConfig.MAX_ATTEMPTS}/${RepairConfig.MAX_ATTEMPTS} ATTEMPTS EXHAUSTED
            </span>
        </div>
        
        <!-- Error -->
        <div style="padding: 16px; border-bottom: 1px solid #330000;">
            <div style="color: #ff6666; font-size: 0.75em; margin-bottom: 6px;">FINAL ERROR</div>
            <div style="color: #ffaaaa; font-size: 0.9em;">${escapeHtml(errorMsg)}</div>
        </div>
        
        <!-- Code -->
        <div style="flex-grow: 1; overflow-y: auto; padding: 16px; background: rgba(0,0,0,0.3);">
            <div style="color: #555; font-size: 0.7em; margin-bottom: 8px;">BROKEN CODE</div>
            <code style="font-size: 0.8em; display: block;">
                ${numberedCode}
                ${lines.length > 20 ? `<div style="color:#444; padding-top:8px;">... ${lines.length - 20} more lines</div>` : ''}
            </code>
        </div>
        
        <!-- Footer -->
        <div style="
            background: rgba(0,0,0,0.4);
            border-top: 1px solid #330000;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <span style="color: #666; font-size: 0.75em;">
                This error has been logged for analysis
            </span>
            <button onclick="this.closest('.mermaid-wrapper').remove()" style="
                background: transparent;
                border: 1px solid #ff4444;
                color: #ff4444;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-family: inherit;
                font-size: 0.8em;
            ">DISMISS</button>
        </div>
    </div>`;
}

/* ==========================================================================
   HELPER FUNCTIONS
   ========================================================================== */
function startRepairTimer(wrapper) {
    // Clear existing to prevent doubles
    if (window.repairState.timerInterval) clearInterval(window.repairState.timerInterval);

    window.repairState.timerInterval = setInterval(() => {
        // 1. Update Total Elapsed Time
        const timerEl = wrapper.querySelector('#repair-timer');
        if (timerEl && window.repairState.startTime) {
            const elapsed = ((Date.now() - window.repairState.startTime) / 1000).toFixed(1);
            timerEl.textContent = `Elapsed: ${elapsed}s`;
        }

        // 2. Update "Next Attempt" Countdown (The fix)
        const countdownEl = wrapper.querySelector('#countdown-val');
        if (countdownEl) {
            let val = parseInt(countdownEl.innerText);
            if (!isNaN(val) && val > 0) {
                // Only decrease if it's strictly greater than 0
                // We perform a check to ensure we don't update too fast visually
                // But simple decrement is usually fine for 100ms interval if we use a timestamp check
                // Simpler approach for 1s visual updates:
                
                // Get the wait time from the repair state (you might need to pass this or store it globally)
                // OR just decrement strictly every 10 calls (since interval is 100ms)
                
                // Hacky but reliable way for visual countdowns without complex state:
                // We rely on the fact that 'renderRepairUI' sets the initial integer.
                // We decrement it only if a second has actually passed.
                
                const now = Date.now();
                if (!window.repairState.lastTick || now - window.repairState.lastTick >= 1000) {
                    countdownEl.innerText = val - 1;
                    window.repairState.lastTick = now;
                }
            }
        }
    }, 100);
}

function clearRepairTimer() {
    if (window.repairState.timerInterval) {
        clearInterval(window.repairState.timerInterval);
        window.repairState.timerInterval = null;
    }
}

function waitForRepairComplete() {
    return new Promise(resolve => {
        const check = setInterval(() => {
            if (!window.repairState.isActive) {
                clearInterval(check);
                resolve();
            }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 60000);
    });
}

function getRepairContext(simId, stepIndex) {
    if (simId && window.simulationStore[simId]?.[stepIndex]) {
        return window.simulationStore[simId][stepIndex].instruction || "Algorithm visualization step";
    }
    return "Mermaid diagram";
}

function getLastWorkingGraph(simId, stepIndex) {
    // Priority 1: Last working graph for this simulation
    if (simId && window.lastWorkingMermaid[simId]) {
        return window.lastWorkingMermaid[simId];
    }
    
    // Priority 2: Previous step's mermaid (if not step 0)
    const playlist = window.simulationStore[simId];
    if (playlist && stepIndex > 0 && playlist[stepIndex - 1]?.mermaid) {
        return playlist[stepIndex - 1].mermaid;
    }
    
    // Priority 3: Any working graph from any simulation (recent)
    for (const sid of Object.keys(window.lastWorkingMermaid)) {
        if (window.lastWorkingMermaid[sid]) {
            console.log(`🔄 Using working graph from different simulation: ${sid}`);
            return window.lastWorkingMermaid[sid];
        }
    }
    
    // Priority 4: Default template for step 0 failures
    console.log("🔄 Using default mermaid template");
    return DEFAULT_MERMAID_TEMPLATE;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function reportFailureToServer(simId, stepIndex, code, error) {
    if (!simId) return;
    
    fetch(`${API_URL}/repair-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: currentSessionId,
            sim_id: simId,
            step_index: stepIndex,
            broken_code: code,
            final_error: error
        })
    }).catch(e => console.error('Failed to report:', e));
}

/* ==========================================================================
   SUCCESS HANDLER
   ========================================================================== */
function onRenderSuccess(wrapper, graphDiv, code, simId, stepIndex, wasRepaired = false) {
    // Track validation
    if (simId && stepIndex !== null) {
        const key = `${simId}_${stepIndex}`;
        window.validatedSteps.add(key);
        window.lastWorkingMermaid[simId] = code;
        
        console.log(`✅ [VALIDATE] Step ${stepIndex} validated for ${simId}`);
        
        const playlist = window.simulationStore[simId];
        if (playlist && playlist[stepIndex]?.is_final) {
            confirmSimulationComplete(simId);
        }
    }
    
    // Log for ML training
    logGraphToServer(code, simId, stepIndex, wasRepaired);
    
    // Attach interactions
    setTimeout(() => {
        const svg = graphDiv.querySelector('svg');
        if (svg) {
            svg.style.width = "100%";
            svg.style.height = "100%";
            svg.style.maxWidth = "none";
            setupZoomPan(wrapper, graphDiv);
            setupNodeClicks(svg, wrapper);
            attachNodePhysics(wrapper);
        }
    }, 200);
}

function logGraphToServer(code, simId, stepIndex, wasRepaired) {
    const context = simId && window.simulationStore[simId]?.[stepIndex]?.instruction || "Unknown";
    
    fetch(`${API_URL}/log-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mermaid_code: code,
            context: context,
            source: wasRepaired ? "repair_success" : "direct_render",
            was_repaired: wasRepaired,
            session_id: currentSessionId
        })
    }).catch(() => {}); // Silent fail - non-critical
}

// Inject spinner CSS if not present
if (!document.getElementById('repair-system-css')) {
    const style = document.createElement('style');
    style.id = 'repair-system-css';
    style.textContent = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        .repair-console * {
            box-sizing: border-box;
        }
    `;
    document.head.appendChild(style);
}

/* ==========================================================================
   SECTION 8: PHYSICS & INTERACTION HELPERS
   ========================================================================== */


function setupZoomPan(wrapper, graphDiv) {
    let scale = 1, panning = false, pointX = 0, pointY = 0, start = { x: 0, y: 0 };
    
    wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xs = (mouseX - pointX) / scale;
        const ys = (mouseY - pointY) / scale;
        const delta = -e.deltaY;
        (delta > 0) ? (scale *= 1.1) : (scale /= 1.1);
        scale = Math.min(Math.max(1, scale), 5); 
        pointX = mouseX - xs * scale;
        pointY = mouseY - ys * scale;
        graphDiv.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
    });
    wrapper.addEventListener('mousedown', (e) => {
        if (e.target.closest('.node') || e.target.closest('.explanation-hud')) return;
        e.preventDefault();
        start = { x: e.clientX - pointX, y: e.clientY - pointY };
        panning = true;
        wrapper.style.cursor = "grabbing";
    });
    wrapper.addEventListener('mousemove', (e) => {
        if (!panning) return;
        e.preventDefault();
        pointX = e.clientX - start.x;
        pointY = e.clientY - start.y;
        graphDiv.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
    });
    wrapper.addEventListener('mouseup', () => { panning = false; wrapper.style.cursor = "grab"; });
    wrapper.addEventListener('mouseleave', () => { panning = false; wrapper.style.cursor = "grab"; });
}

function setupNodeClicks(svg, wrapper) {
    svg.querySelectorAll('.node').forEach(node => {
        node.style.cursor = "pointer";
        node.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const rawId = node.id;
            const idParts = rawId.split('-');
            let cleanId = idParts.find(p => isNaN(p) && p !== 'flowchart' && p !== 'graph' && p.length > 1);
            if (!cleanId) cleanId = node.textContent.trim();
            window.mermaidNodeClick(cleanId, wrapper);
        };
    });
}

function attachNodePhysics(wrapperElement) {
    try {
        if (!wrapperElement) return;

        const svg = wrapperElement.querySelector('svg');
        if (!svg) {
            console.warn("No SVG found - skipping physics");
            return;
        }
        const nodes = wrapperElement.querySelectorAll('.node');
        
        nodes.forEach(node => {
            // 1. Get the current position assigned by Mermaid
            const transformAttr = node.getAttribute('transform');
            // Valid formats: "translate(100, 200)" OR "translate(100 200)"
            
            if (transformAttr) {
                // 2. Robust Regex to catch both comma and space separators
                const match = transformAttr.match(/translate\(([-\d.]+)[, ]+([-\d.]+)\)/);
                
                if (match) {
                    const x = match[1];
                    const y = match[2];

                    // 3. Inject variables
                    node.style.setProperty('--d3-x', x + 'px');
                    node.style.setProperty('--d3-y', y + 'px');
                    
                    // 4. Mark as ready (Prevents CSS from acting too early)
                    node.classList.add('physics-ready');
                }
            }
        });
    } catch (e) {
        console.warn("Physics attach failed (Graph will still render, just no zoom):", e);
    }
}

function reattachGraphPhysics(graphDiv, wrapperElement) {
    setTimeout(() => {
        const svg = graphDiv.querySelector('svg');
        if (svg) {
            svg.style.width = "100%";
            svg.style.height = "100%";
            svg.querySelectorAll('.node').forEach(node => {
                node.style.cursor = "pointer";
                node.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const rawId = node.id;
                    const idParts = rawId.split('-');
                    let cleanId = idParts.find(p => isNaN(p) && p !== 'flowchart' && p.length > 1);
                    if (!cleanId) cleanId = node.textContent.trim();
                    window.mermaidNodeClick(cleanId, wrapperElement);
                };
            });
        }
    }, 200);
}

/* ==========================================================================
   SECTION 9: UI & EVENT HELPERS
   ========================================================================== */

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    const content = document.createElement('div');
    content.className = 'content';
    if (role === 'model') {
        content.innerHTML = `<div class="msg-header"><span>AXIOM // SYSTEM</span></div><div class="msg-body"><span class="stream-text">${marked.parse(text)}</span></div>`;
    } else {
        content.innerHTML = marked.parse(text);
    }
    div.appendChild(content);
    historyDiv.appendChild(div);
    historyDiv.scrollTop = historyDiv.scrollHeight;
    if (role === 'model') return content.querySelector('.stream-text');
    return content;
}

function activateChatMode(initialMsg) {
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
    statusText.innerText = "ENGINE ONLINE";
    statusDot.classList.add('active');
    setTimeout(() => {
        if (initialMsg) {
            appendMessage('model', `### CONTEXT LOADED\n${initialMsg}`);
        } else {
            appendMessage('model', `### AXIOM ENGINE v1.2\n**Ready for input.** Define simulation parameters.`);
        }
    }, 250);
}

function disconnect() {
    // 1. VISUAL: Reset the UI State
    window.appMode = 'LOBBY';
    window.isProcessing = false;
    window.lastBotMessageDiv = null;
    if(lobbyInput) lobbyInput.value = ''; // Clear lobby input
    
    // 2. BACKEND: Kill the memory (The "BOOM" happens here)
    if (currentSessionId) {
        console.log("💀 TERMINATING SESSION...");
        fetch(`${API_URL}/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: currentSessionId })
        }).catch(err => console.error("Reset Failed:", err));
    }

    // 3. ANIMATION: Transition back to Lobby
    chatPanel.style.opacity = '0';
    setTimeout(() => {
        chatPanel.style.display = 'none';
        // Clear the chat history DIV so old messages don't reappear
        historyDiv.innerHTML = ''; 
        
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
    if (!val) return;
    activateChatMode();
    setTimeout(() => { userInput.value = val; sendMessage(); }, 800);
}

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

window.toggleGraphTheme = function(btn) {
    // Find the wrapper (the parent of the HUD)
    const wrapper = btn.closest('.mermaid-wrapper');
    if (!wrapper) return;

    // Toggle the class
    wrapper.classList.toggle('light-mode');
    
    // Update Button Text
    const isLight = wrapper.classList.contains('light-mode');
    btn.innerText = isLight ? "☾ DARK" : "☀ LIGHT";
}

/* ==========================================================================
   SECTION 10: EVENT LISTENERS (INIT)
   ========================================================================== */

if (lobbyBtn) lobbyBtn.addEventListener('click', handleLobbyInit);
if (lobbyInput) lobbyInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleLobbyInit(); } });


const cardSim = document.getElementById('card-sim');
const presetMenu = document.getElementById('quick-presets');
if (cardSim && presetMenu) {
    cardSim.addEventListener('click', () => {
        const isActive = presetMenu.classList.contains('active');
        if (isActive) {
            presetMenu.classList.remove('active');
            cardSim.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        } else {
            presetMenu.classList.add('active');
            cardSim.style.borderColor = '#00f3ff'; 
        }
    });
}

document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const prompt = e.target.getAttribute('data-prompt');
        if (lobbyInput) lobbyInput.value = prompt;
        presetMenu.classList.remove('active');
        handleLobbyInit();
    });
});

const cardContext = document.getElementById('card-context');
const fileInput = document.getElementById('file-upload');
const spinnerOverlay = document.getElementById('spin-pdf'); 
if (cardContext && fileInput) {
    cardContext.addEventListener('click', (e) => {
        if (e.target.closest('#spin-pdf')) return;
        fileInput.click();
    });
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (spinnerOverlay) spinnerOverlay.style.display = 'flex';
        const fd = new FormData();
        fd.append('file', file);
        fd.append('session_id', currentSessionId);
        try {
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: fd });
            const data = await res.json();
            if (spinnerOverlay) spinnerOverlay.style.display = 'none';
            activateChatMode(`**SYSTEM INGEST COMPLETE**\nTarget Data: _${data.filename}_`);
        } catch (e) {
            console.error(e);
            if (spinnerOverlay) spinnerOverlay.style.display = 'none';
            alert("INGEST FAILED: " + e.message);
        }});
    }

document.getElementById('btn-send').addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
document.getElementById('btn-disconnect').addEventListener('click', disconnect);

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


/**
 * Called when all steps of a simulation have been successfully rendered.
 * Sends the (potentially repaired) steps to the server for caching.
 */
async function confirmSimulationComplete(simId) {
    const playlist = window.simulationStore[simId];
    if (!playlist || playlist.length === 0) {
        console.warn("No playlist to confirm");
        return;
    }
    
    const lastStep = playlist[playlist.length - 1];
    if (!lastStep.is_final) {
        console.log("Simulation not final, skipping confirmation");
        return;
    }
    
    console.log(`✅ Confirming simulation complete: ${simId} (${playlist.length} steps)`);
    
    try {
        const response = await fetch(`${API_URL}/confirm-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                sim_id: simId,
                step_count: playlist.length,
                steps: playlist  // Send the (potentially repaired) steps back
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'cached') {
            console.log(`💾 Simulation cached successfully: ${data.prompt}`);
            showToast('✓ Simulation saved to cache');
        } else if (data.status === 'skipped') {
            console.log(`⏭️ Cache skipped: ${data.reason}`);
        } else {
            console.warn('Cache response:', data);
        }
    } catch (err) {
        console.error('Failed to confirm simulation:', err);
    }
}

async function notifyRepairSuccess(simId, stepIndex) {
    try {
        await fetch(`${API_URL}/repair-success`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                sim_id: simId,
                step_index: stepIndex
            })
        });
    } catch (e) {
        console.warn('Failed to notify repair success:', e);
    }
}