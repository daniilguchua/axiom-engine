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
        clusterBkg: 'rgba(255, 255, 255, 0.05)', 
        clusterBorder: '#bc13fe',
        
        fontFamily: 'JetBrains Mono',
        fontSize: '16px',
        nodePadding: '25px' // Give text room to breathe
    },
    flowchart: {
        curve: 'basis',
        htmlLabels: true,
        useMaxWidth: false
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
            wrapperElement.style.opacity = '0.5';
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

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;
    userInput.value = '';

    let targetElement;
    // Check if we are updating an existing simulation
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

        // 1. READ STREAM
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

                // STRATEGY A: Code Block
                const codeBlockMatch = fullText.match(/```json([\s\S]*?)```/);
                if (codeBlockMatch) {
                    cleanJson = codeBlockMatch[1];
                } 
                // STRATEGY B: Raw JSON
                else {
                    const firstBrace = fullText.indexOf('{');
                    const lastBrace = fullText.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        cleanJson = fullText.substring(firstBrace, lastBrace + 1);
                    }
                }

                const data = JSON.parse(cleanJson.trim());
                
                if (data.steps && data.steps.length > 0) {
                    
                    // --- 1. RENDER SUMMARY (IF EXISTS) ---
                    if (data.summary) {
                        appendMessage('model', data.summary);
                        
                        // CRITICAL FIX: 
                        // We reset this tracker to NULL. 
                        // This forces renderPlaylistStep() to create a NEW bubble for the graph 
                        // instead of overwriting the Summary bubble we just created.
                        window.lastBotMessageDiv = null; 
                    }
                    // -------------------------------------

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
                console.error("JSON PARSE ERROR (Falling back to text):", e); 
            }
        }
        // 2. RENDER MARKDOWN
        targetElement.innerHTML = marked.parse(fullText);

        // 3. RENDER MERMAID
        await fixMermaid(targetElement);

        // 4. RESTORE VISIBILITY
        targetElement.style.opacity = '1';
        
        // 5. AUTO-SCROLL
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
async function fixMermaid(container) {
    const codes = container.querySelectorAll('pre code');
    
    // 1. FORCE EXIT FULL SCREEN
    const oldWrappers = document.querySelectorAll('body > .mermaid-wrapper.fullscreen');
    if (oldWrappers.length > 0) {
        oldWrappers.forEach(w => w.remove());
        window.isCinemaMode = false; 
    }

    for (const codeBlock of codes) {
        let rawGraph = codeBlock.textContent;
        const isMermaid = codeBlock.classList.contains('language-mermaid') || 
                          rawGraph.includes('graph TD') || rawGraph.includes('graph LR') ||
                          rawGraph.includes('sequenceDiagram') || rawGraph.includes('stateDiagram');

        if (isMermaid) {
            const preElement = codeBlock.parentElement;

            // 2. ADVANCED CLEANING (THE PRECISION SPLITTER)
            let cleanGraph = rawGraph
                .replace(/^mermaid\s*/i, '')
                .replace(/```mermaid/g, '').replace(/```/g, '')

                // --- FIX 1: THE "QUOTE-SEMICOLON" SMASH (YOUR EXACT ERROR) ---
                // Matches: '...View"]; direction'  ->  '...View"];\n direction'
                // Matches: '...View"];subgraph'    ->  '...View"];\n subgraph'
                .replace(/([\]"])\s*;\s*(direction|subgraph|end)/gi, '$1;\n$2')

                // --- FIX 2: THE "DIRECTION" SMASH ---
                // Matches: 'direction TD;Start' -> 'direction TD\nStart'
                .replace(/(direction\s+[A-Z]{2})\s*;\s*([A-Za-z0-9])/gi, '$1\n$2')
                
                // --- FIX 3: THE "LETTER" SMASH ---
                // Matches: 'Graph;direction' -> 'Graph\ndirection'
                .replace(/([a-z0-9])\s*;\s*(direction|subgraph|end)/gi, '$1\n$2')

                // --- FIX 4: GENERAL SEMICOLON CLEANUP ---
                // Aggressively break semicolons if they aren't inside quotes
                .replace(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\n')

                // --- FIX 5: STANDARD CLEANUP ---
                .replace(/subgraph\s+([a-zA-Z0-9_]+)\s*\[\s*"?\s*(.*?)\s*"?\s*\]/gi, (match, id, title) => {
                    let safeTitle = title.replace(/[\[\]"]/g, '').trim(); 
                    return `subgraph ${id} ["${safeTitle}"]\n`;
                })
                .replace(/\s*end\s*$/gm, '\nend\n') 

                // Handle Arrays inside Labels
                .replace(/(\w+)\["(.*?)"\]/g, (match, id, content) => {
                    let safeContent = content.replace(/\[/g, '(').replace(/\]/g, ')');
                    return `${id}["${safeContent}"]`;
                })
                
                // Bullet points & Quotes
                .replace(/(\["|\[\s*)\s*[-*]\s+/g, '$1• ') 
                .replace(/(\\n|\n|<br\s*\/?>)\s*[-*]\s+/g, '$1• ') 
                .replace(/\\"/g, "'").replace(/""/g, "'")
                .replace(/=\s*\["(.*?)"\]/g, "= '$1'") 
                .replace(/];/g, ']\n') 
                .replace(/["']\s*(?:-|\*)\s+(.*?)["']/g, '"• $1"') 
                .replace(/(\\n|\n)(?:-|\*)\s+/g, '<br/>• ') 
                .trim();
            
            // Auto-Header
            if (!cleanGraph.includes('graph ') && !cleanGraph.includes('sequence') && !cleanGraph.includes('stateDiagram')) {
                cleanGraph = 'graph TD\n' + cleanGraph;
            }

            // 3. BUILD DOM
            const wrapperId = 'wrapper-' + Date.now();
            const graphWrapper = document.createElement('div');
            graphWrapper.className = 'mermaid-wrapper';
            graphWrapper.id = wrapperId;

            const graphDiv = document.createElement('div');
            graphDiv.className = 'mermaid';
            graphDiv.id = 'mermaid-' + Date.now();
            graphDiv.textContent = cleanGraph;

            // ... Controls ...
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'mermaid-controls';
            controlsDiv.innerHTML = `
               <button class="util-btn" id="btn-zoom-in-${graphDiv.id}">+</button>
               <button class="util-btn" id="btn-zoom-out-${graphDiv.id}">-</button>
               <button class="util-btn" id="btn-reset-${graphDiv.id}">⟲</button>
               <div style="width:1px; height:20px; background:rgba(255,255,255,0.2); margin:0 5px;"></div>
               <button class="util-btn" id="btn-expand-${graphDiv.id}">⛶</button>
            `;

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
            graphWrapper.appendChild(controlsDiv);
            graphWrapper.appendChild(hudDiv);
            preElement.replaceWith(graphWrapper);

            // 4. SCROLL HANDLING
            graphWrapper.addEventListener('wheel', (e) => {
                const isOverHud = e.target.closest('.explanation-hud');
                if (graphWrapper.matches(':hover') && !isOverHud) { e.preventDefault(); }
            }, { passive: false });

            // 5. RENDER
            try {
                await new Promise(r => setTimeout(r, 50));
                await mermaid.init(undefined, graphDiv);
                window.repairAttempts = 0; 

                // SVG ZOOM LOGIC
                setTimeout(() => {
                    const svg = graphDiv.querySelector('svg');
                    if(svg) {
                        svg.style.width = '100%'; svg.style.height = '100%';
                        let panZoom = null;
                        if (typeof svgPanZoom !== 'undefined') {
                            panZoom = svgPanZoom(svg, {
                                zoomEnabled: true, controlIconsEnabled: false, fit: true, center: true, minZoom: 0.1, maxZoom: 20, preventMouseEventsDefault: false 
                            });
                            if (panZoom.getZoom() < 0.5) { panZoom.zoom(0.8); panZoom.center(); }

                            const getBtn = (id) => document.getElementById(id);
                            getBtn(`btn-zoom-in-${graphDiv.id}`).onclick = (e) => { e.stopPropagation(); panZoom.zoomIn(); };
                            getBtn(`btn-zoom-out-${graphDiv.id}`).onclick = (e) => { e.stopPropagation(); panZoom.zoomOut(); };
                            getBtn(`btn-reset-${graphDiv.id}`).onclick = (e) => { e.stopPropagation(); panZoom.resetZoom(); panZoom.center(); };
                            
                            // EXPAND LOGIC
                            const placeholder = document.createElement('div');
                            placeholder.id = 'placeholder-' + wrapperId;
                            placeholder.style.height = '600px'; 
                            placeholder.style.display = 'none';

                            getBtn(`btn-expand-${graphDiv.id}`).onclick = (e) => {
                                e.stopPropagation();
                                const isFull = graphWrapper.classList.contains('fullscreen');

                                if (!isFull) {
                                    graphWrapper.parentNode.insertBefore(placeholder, graphWrapper);
                                    placeholder.style.display = 'block';
                                    document.body.appendChild(graphWrapper);
                                    graphWrapper.classList.add('fullscreen');
                                    window.isCinemaMode = true; 
                                    e.target.innerText = '✖';
                                } else {
                                    placeholder.parentNode.insertBefore(graphWrapper, placeholder);
                                    placeholder.style.display = 'none';
                                    placeholder.remove();
                                    graphWrapper.classList.remove('fullscreen');
                                    window.isCinemaMode = false; 
                                    e.target.innerText = '⛶';
                                }
                                setTimeout(() => { panZoom.resize(); panZoom.fit(); panZoom.center(); }, 50);
                            };
                        }
                        
                        // CLICK LOGIC
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
                                let cleanId = idParts.find(p => isNaN(p) && p !== 'flowchart' && p !== 'graph' && p.length > 1);
                                if (!cleanId) cleanId = node.textContent.trim();
                                window.mermaidNodeClick(cleanId, graphWrapper); 
                            };
                        });
                    }
                }, 200);
            } catch (renderErr) { handleError(graphWrapper, cleanGraph, renderErr.message); }
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

function handleError(targetElement, badCode, errorMsg) {
    if (window.repairAttempts >= 3) {
        targetElement.innerHTML = `
            <div style="border:1px solid red; padding:20px; color:red; font-family:monospace;">
                <strong>SYSTEM FAILURE:</strong> Repair Limit Exceeded.<br>
                The AI cannot generate valid syntax for this request.<br>
                <hr>
                <strong>RAW ERROR:</strong> ${errorMsg}
            </div>`;
        window.repairAttempts = 0;
        return;
    }

    window.repairAttempts++;

    const repairDiv = document.createElement('div');
    repairDiv.innerHTML = `
        <div style="border:1px dashed #00f3ff; padding:20px; text-align:center; color:#00f3ff; font-family:monospace; animation: blink 1s infinite;">
            ⚡ GRAPH RENDER FAILURE ⚡<br>
            <span style="font-size:10px; opacity:0.7">${errorMsg.substring(0,50)}...</span><br><br>
            <strong>// AUTO-REPAIR SEQUENCE ENGAGED (${window.repairAttempts}/3)...</strong>
        </div>`;
    
    // NOTE: This targets the graphWrapper now, which is correct
    targetElement.replaceWith(repairDiv);

    triggerAutoRepair(badCode, errorMsg, repairDiv);
}

async function triggerAutoRepair(badCode, errorMsg, targetElement) {
    if (window.isRepairing) return;
    window.isRepairing = true;
    console.log("🚑 SENDING REPAIR REQUEST...");

    let badLineStr = "Unknown";
    const match = errorMsg.match(/line (\d+)/);
    if (match) {
        const lineNum = parseInt(match[1]) - 1;
        const lines = badCode.split('\n');
        if (lines[lineNum]) badLineStr = lines[lineNum].trim();
    }

    const prompt = `
    SYSTEM ALERT: MERMAID PARSE ERROR.
    
    --- DEBUG REPORT ---
    ERROR: "${errorMsg}"
    BROKEN LINE: "${badLineStr}"
    --------------------

    CRITICAL INSTRUCTIONS:
    1. Fix the syntax error on the broken line.
    2. CHECK BRACKETS: Ensure subgraphs use [ ] and nodes use [ "..." ] or ( "..." ).
    3. DO NOT ADVANCE THE STATE. Output the exact same simulation step, just with fixed syntax.
    4. Remove any internal square brackets [] from node labels.

    OUTPUT ONLY THE CORRECTED MERMAID CODE.
    `;

    try {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: prompt })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fixedText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fixedText += decoder.decode(value, { stream: true });
        }

        targetElement.innerHTML = marked.parse(fixedText);
        window.isRepairing = false;
        
        // RECURSIVE CALL: Try to render the fixed code
        fixMermaid(targetElement);

    } catch (e) {
        console.error("Repair Failed", e);
        window.isRepairing = false;
        targetElement.innerHTML = `<div style="color:red">REPAIR FAILED.</div>`;
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
    
    // Button Logic
    const prevDisabled = index === 0 ? 'disabled' : '';
    const nextText = (index === window.simulationPlaylist.length - 1) ? "GENERATE NEXT >>" : "NEXT >";
    
    const htmlContent = `
        <div class="simulation-header">
            ${stepData.instruction}
        </div>
        
        <pre><code class="language-mermaid">${stepData.mermaid}</code></pre>

        <div class="sim-controls">
            <button onclick="handleSimNav('PREV')" ${prevDisabled} class="btn-sim">
                &lt; PREV
            </button>
            
            <button onclick="handleSimNav('RESET')" class="btn-sim reset-btn">
                ⟲ RESET
            </button>
            
            <button onclick="handleSimNav('NEXT')" class="btn-sim">
                ${nextText}
            </button>
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
    
    console.log(`⏩ PLAYING STEP ${index}`);
}

// ==========================================
// SIMULATION CONTROLLER (STATIC BUTTONS)
// ==========================================
window.handleSimNav = function(action) {
    if (window.isProcessing) return; // Prevent double clicks while fetching

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
            // Re-use your existing logic for fetching
            const lastStepData = window.simulationPlaylist[window.currentStepIndex];
            
            // Show loading state on the button itself if you want, 
            // or just use the global chat loader:
            appendMessage('user', `(System: Auto-fetch Steps ${nextIndex}+)`); 

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
            
            // Call your main message handler (make sure userInput is empty first)
            document.getElementById('user-input').value = continuePrompt;
            document.getElementById('btn-send').click(); 
        }
    }
};