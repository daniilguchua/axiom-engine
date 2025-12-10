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
        fontSize: '12px',
        nodePadding: '12px', // Give text room to breathe
        edgeLabelBackground: '#030305'
    },
    flowchart: {
        curve: 'linear',
        htmlLabels: true,
        useMaxWidth: true,

        defaultRenderer: 'elk',
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
        const botDiv = appendMessage('model', 'Processing...');
        targetElement = botDiv.parentElement;
        window.lastBotMessageDiv = botDiv.closest('.msg.model');
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

                // ============================================================
                // 🛡️ THE PRE-PARSER (Fixes "Bad Escaped Character")
                // ============================================================
                
                // 1. Fix the "Bad Backslash" (The exact error you are seeing)
                // JSON only allows \", \\, \/, \b, \f, \n, \r, \t. 
                // The AI often writes \( or \- or \.. We must double-escape these to save the JSON.
                // REGEX EXPLANATION: Find a backslash NOT followed by a valid JSON escape char.
                cleanJson = cleanJson.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");

                // 2. Fix Newlines inside strings (AI often puts real line breaks in "summary")
                cleanJson = cleanJson.replace(/([^\\])"\n/g, '$1" ');

                // 3. Fix Mermaid "Quote Hell"
                // We find the "mermaid" field and normalize quotes inside it.
                cleanJson = cleanJson.replace(/"mermaid":\s*"([\s\S]*?)"(?=,\s*")/g, (match, content) => {
                    // Temporarily replace \" with a placeholder to protect valid escapes
                    let safe = content.replace(/\\"/g, "@@QUOTE@@");
                    
                    // Now, any remaining " is a BAD double quote (syntax error). Turn it to '
                    safe = safe.replace(/"/g, "'");
                    
                    // Restore the valid escaped quotes
                    safe = safe.replace(/@@QUOTE@@/g, '\\"');
                    
                    return `"mermaid": "${safe}"`;
                });
                // ============================================================

                let data;
                try {
                    data = JSON.parse(cleanJson.trim());
                } catch (jsonErr) {
                    console.warn("⚠️ JSON Parse Failed. Trying Nuclear Cleanup...", jsonErr);
                    // Last Resort: Remove ALL control characters except newlines
                    cleanJson = cleanJson.replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, ""); 
                    data = JSON.parse(cleanJson.trim());
                }

                if (data.steps && data.steps.length > 0) {
                    if (data.summary) {
                        targetElement.innerHTML = marked.parse(data.summary);
                        window.lastBotMessageDiv = null; 
                    }

                    const firstNewStep = data.steps[0].step;
                    
                    if (firstNewStep === 0) {
                        window.simulationPlaylist = data.steps;
                        renderPlaylistStep(0);
                    } else {
                        window.simulationPlaylist = window.simulationPlaylist.concat(data.steps);
                        renderPlaylistStep(firstNewStep);
                    }
                    return; 
                }
            } catch (e) { 
                console.error("JSON PARSE FATAL ERROR:", e);
                targetElement.innerHTML = `<div style="color:red; border:1px solid red; padding:5px;">SYSTEM PARSE ERROR: ${e.message}</div>` + marked.parse(fullText);
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
// client.js - The "Nuclear" Sanitizer

// client.js

function sanitizeMermaidString(raw) {
    // 0. PRE-FLIGHT: Strip Markdown
    let clean = raw
        .replace(/^mermaid\s*/i, '')
        .replace(/```mermaid/g, '').replace(/```/g, '')
        .trim();

    // 1. THE NUCLEAR SMASH FIX (Header/Direction Cleanup)
    const keyCommands = "direction|subgraph|end|classDef|linkStyle|style|click|graph";
    clean = clean.replace(new RegExp(`([\\]])\\s*(${keyCommands})`, "gi"), '$1\n$2');
    clean = clean.replace(new RegExp(`(["])\\s*(${keyCommands})`, "gi"), '$1\n$2');

    // =========================================================
    // 🛡️ CRITICAL FIX: Convert Bad Single Quotes to Double Quotes
    // =========================================================
    // The AI generates: Node['Label'] -> Mermaid crashes.
    // We want:          Node["Label"] -> Mermaid is happy.
    
    // Pattern: Find [ followed by ' ... content ... ' followed by ]
    // We capture the content ($1) and wrap it in double quotes.
    clean = clean.replace(/\[\s*'([^']+)'\s*\]/g, '["$1"]');

    // Also fix parentheses variants: Node('Label') -> Node("Label")
    // (Only if it looks like a quoted string inside parens)
    clean = clean.replace(/\(\s*'([^']+)'\s*\)/g, '("$1")');

    // =========================================================

    // 2. DETECT & FIX HEADERS
    clean = clean.replace(/^(graph|flowchart)\s+([A-Z]{2})(?=[^\n])/i, '$1 $2\n');

    // 3. AUTO-HEADER INJECTION
    const validHeaders = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'gantt', 'pie'];
    const hasHeader = validHeaders.some(header => clean.startsWith(header));
    if (!hasHeader) {
        clean = 'graph LR\n' + clean;
    }

    // 4. FIX "UNQUOTED SUBGRAPHS"
    clean = clean.replace(/subgraph\s+([^\n\[]+?)(?=\s*[\n;])/gi, (match, rawTitle) => {
        const safeId = "subgraph_" + Math.floor(Math.random() * 10000);
        const cleanTitle = rawTitle.trim();
        return `subgraph ${safeId} ["${cleanTitle}"]`;
    });

    // 5. COLOR CORRUPTION FIX
    clean = clean.replace(/(stroke|fill|color):\s*[^#a-zA-Z0-9\s;"]+([0-9a-fA-F]{3,6})/gi, '$1:#$2');
    clean = clean.replace(/(stroke|fill|color):\s*([0-9a-fA-F]{3,6})(?=[\s;])/gi, '$1:#$2');

    // 6. SEMICOLON CLEANUP
    clean = clean.replace(/(graph\s+[A-Z]{2});/gi, '$1');
    clean = clean.replace(/end;/gi, 'end');
    clean = clean.replace(/;\s*direction/gi, ';\ndirection');

    // 7. FINAL WHITESPACE POLISH
    clean = clean.replace(/\\n\s*[-*]\s+/g, '<br/>• '); 
    clean = clean.replace(/\n\s*\n/g, '\n'); 

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
                        
                        // --- CLICK LOGIC (PRESERVED) ---
                        let isDragging = false; let startX = 0; let startY = 0;
                        svg.addEventListener('mousedown', (e) => { isDragging = false; startX = e.clientX; startY = e.clientY; });
                        svg.addEventListener('mousemove', (e) => { if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) isDragging = true; });

                        svg.querySelectorAll('.node').forEach(node => {
                            node.style.cursor = "pointer"; node.style.pointerEvents = "bounding-box"; 
                            node.onclick = (e) => { 
                                e.preventDefault(); e.stopPropagation(); 
                                if (isDragging) return;
                                const rawId = node.id;
                                const idParts = rawId.split('-');
                                // Robust ID extraction for Mermaid's varying SVG structure
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

// client.js - Replace the triggerAutoRepair function

async function triggerAutoRepair(badCode, errorMsg, wrapperElement) {
    if (window.isRepairing) return;
    window.isRepairing = true;

    // 0. SAFETY CHECK: Is the wrapper still on screen?
    if (!wrapperElement || !wrapperElement.isConnected) {
        console.warn("⚠️ Repair aborted: Element is no longer in the DOM.");
        window.isRepairing = false;
        return;
    }

    // 4. THE "SURGICAL" PROMPT
    const repairPrompt = `
    CRITICAL SYSTEM ALERT: MERMAID RENDERING FAILED.
    
    ERROR REPORT: "${errorMsg}"
    
    BROKEN CODE:
    \`\`\`mermaid
    ${badCode}
    \`\`\`
    
    YOUR MISSION:
    1. Fix the syntax error identified in the report.
    2. Remove any "smushed" commands (e.g., ensure newlines between ']' and 'direction').
    3. Ensure all text labels use SINGLE QUOTES (') not double quotes.
    4. Remove any semicolons after 'graph', 'subgraph', or 'end'.
    
    OUTPUT FORMAT:
    Return ONLY the corrected Mermaid code. 
    NO JSON. NO "Here is the code". NO Markdown backticks.
    JUST THE CODE.
    `;

    try {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: repairPrompt })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
        }

        // 5. SANITIZE THE REPAIR
        let fixedCode = fullText
            .replace(/```mermaid/g, '') 
            .replace(/```/g, '')
            .trim();
            
        fixedCode = sanitizeMermaidString(fixedCode);

        console.log("🩹 APPLYING FIX:", fixedCode.substring(0, 50) + "...");

        // 6. RE-RENDER (MANUAL INJECTION)
        const newGraphId = 'mermaid-' + Date.now();
        
        wrapperElement.innerHTML = `
            <div class="mermaid" id="${newGraphId}">${fixedCode}</div>
            <div class="explanation-hud" id="hud-${newGraphId}" style="display:none;">
               <div class="hud-content"></div>
            </div>
        `;

        // --- FIX IS HERE: Search LOCALLY, not globally ---
        const graphDiv = wrapperElement.querySelector('.mermaid');
        
        if (!graphDiv) {
            throw new Error("DOM Generation Failed: Mermaid container not found.");
        }
        
        // Attempt Render
        await mermaid.init(undefined, graphDiv);
        
        // 7. SUCCESS: RE-ATTACH LISTENERS
        window.repairAttempts = 0;
        window.isRepairing = false;
        
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
        content.innerHTML = `<div class="msg-header"><span>GHOST // SYSTEM RESPONSE</span></div><div class="msg-body"><span class="stream-text">${marked.parse(text)}</span></div>`;
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
    urlInputContainer.style.display = 'none';
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
    statusText.innerText = "NEURAL_LINK_ACTIVE";
    statusDot.classList.add('active');
    setTimeout(() => {
        if(initialMsg) appendMessage('model', `### UPLOAD COMPLETE\n> System has ingested the file.\n\n${initialMsg}`);
        else appendMessage('model', `### SYSTEM ONLINE\nProtocol initialized. Neural link established.\n\n**Awaiting input...**`);
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

// File Upload
const card1 = document.getElementById('card-1');
const fileInput = document.getElementById('file-upload');
if(card1 && fileInput) {
    card1.addEventListener('click', () => { fileInput.click(); });
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if(!file) return;
        const fd = new FormData(); fd.append('file', file);
        try {
            const res = await fetch(`${API_URL}/upload`, { method:'POST', body: fd });
            const data = await res.json();
            activateChatMode(`File: ${data.filename}`);
        } catch(e) { console.error(e); }
    });
}

// URL Input
const card2 = document.getElementById('card-2');
if(card2) {
    card2.addEventListener('click', () => {
        const c = document.getElementById('url-input-container');
        c.style.display = (c.style.display === 'none' || c.style.display === '') ? 'block' : 'none';
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
            Generate the NEXT 5 steps.
            Return strictly in the JSON Playlist format.
            `;
            
            const input = document.getElementById('user-input');
            input.value = continuePrompt;
            document.getElementById('btn-send').click(); 
        }
    }
};