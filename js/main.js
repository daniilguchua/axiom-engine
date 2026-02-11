// js/main.js
/**
 * AXIOM Engine - Main Entry Point
 * sendMessage, retryLastMessage, and all event listener initialization.
 * Now with integrated difficulty system!
 * 
 * LOAD ORDER:
 * 1. config.js
 * 2. api.js
 * 3. sanitizer.js
 * 4. interactions.js
 * 5. ui.js
 * 6. repair.js
 * 7. renderer.js
 * 8. controllers.js
 * 9. difficulty.js
 * 10. main.js (this file - LAST)
 */

(function() {
    
    // =========================================================================
    // DOM ELEMENT INITIALIZATION
    // =========================================================================
    
    AXIOM.elements = {
        lobbyPanel: document.getElementById('lobby-panel'),
        chatPanel: document.getElementById('chat-panel'),
        historyDiv: document.getElementById('chat-history'),
        userInput: document.getElementById('user-input'),
        statusText: document.getElementById('status-text'),
        statusDot: document.getElementById('status-dot'),
        container: document.getElementById('app-container'),
        disconnectBtn: document.getElementById('btn-disconnect'),
        lobbyInput: document.getElementById('lobby-input'),
        lobbyBtn: document.getElementById('lobby-btn'),
        lobbyEnhanceBtn: document.getElementById('lobby-enhance-btn'),
        difficultyModal: document.getElementById('difficulty-modal')
    };
    
    // =========================================================================
    // SEND MESSAGE (Main Chat Function) - WITH DIFFICULTY SUPPORT
    // =========================================================================
    
    async function sendMessage(overrideText = null, skipDifficultyPrompt = false) {
        const isStringArg = typeof overrideText === 'string';
        const text = isStringArg ? overrideText : AXIOM.elements.userInput.value.trim();
        
        if (!text) return;
        
        // Track for retry functionality
        AXIOM.state.lastUserMessage = text;
        
        // Always use the currently selected difficulty (no modal prompts)
        // The user can change difficulty using the selector bar before sending
        sendMessageWithDifficulty(text, AXIOM.difficulty.current);
    }
    
    async function sendMessageWithDifficulty(text, difficulty) {
        AXIOM.elements.userInput.value = '';

        // Determine if we're updating an existing simulation or creating new message
        let targetElement;
        let isUpdateMode = AXIOM.state.isSimulationUpdate && AXIOM.state.lastBotMessageDiv;

        if (isUpdateMode) {
            targetElement = AXIOM.state.lastBotMessageDiv.querySelector('.msg-body');
            targetElement.style.opacity = '1';
        } else {
            AXIOM.ui.appendMessage('user', text);
            const botContent = AXIOM.ui.appendMessage('model', ' ');
            targetElement = botContent.parentElement;
            AXIOM.state.lastBotMessageDiv = botContent.closest('.msg.model');
            
            // Show loading state with difficulty indicator
            const diffLevel = AXIOM.difficulty.levels[difficulty];
            targetElement.innerHTML = `
            <div class="axiom-loader">
                <div class="loader-spinner"></div>
                <div class="loader-content">
                    <div class="loader-text">COMPUTING VECTORS...</div>
                    <div class="loader-difficulty">${diffLevel.icon} ${diffLevel.name} Mode</div>
                    <div class="loader-bar-bg"><div class="loader-bar-fill"></div></div>
                </div>
            </div>`;
        }

        AXIOM.state.isProcessing = true;
        const inputWrapper = document.querySelector('.input-wrapper');
        if (inputWrapper) inputWrapper.classList.add('processing');

        try {
            // Stream the response WITH difficulty parameter
            const fullText = await AXIOM.api.sendChatMessage(text, difficulty);

            // =====================================================================
            // RESPONSE TYPE DETECTION
            // =====================================================================
            
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
                    const beforeRepair = cleanJson;
                    cleanJson = AXIOM.sanitizer.repairLLMJson(cleanJson);

                    // Step 2.5: Strip leading/trailing non-JSON content
                    // Detect whether the JSON starts with [ (array) or { (object)
                    const trimmedForDetection = cleanJson.trimStart();
                    const isArray = trimmedForDetection[0] === '[';
                    const openChar = isArray ? '[' : '{';
                    const closeChar = isArray ? ']' : '}';
                    const firstBrace = cleanJson.indexOf(openChar);

                    // Find the matching closing bracket/brace by counting, not just using lastIndexOf
                    // This prevents finding brackets inside trailing HTML comments or text
                    let lastBrace = -1;
                    if (firstBrace !== -1) {
                        let depth = 0;
                        let inString = false;
                        let escapeNext = false;

                        for (let i = firstBrace; i < cleanJson.length; i++) {
                            const char = cleanJson[i];

                            if (escapeNext) {
                                escapeNext = false;
                                continue;
                            }

                            if (char === '\\') {
                                escapeNext = true;
                                continue;
                            }

                            if (char === '"') {
                                inString = !inString;
                                continue;
                            }

                            if (!inString) {
                                if (char === openChar) {
                                    depth++;
                                } else if (char === closeChar) {
                                    depth--;
                                    if (depth === 0) {
                                        lastBrace = i;
                                        break; // Found the matching closing bracket/brace
                                    }
                                }
                            }
                        }
                    }

                    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                        const leading = cleanJson.substring(0, firstBrace).trim();
                        const trailing = cleanJson.substring(lastBrace + 1).trim();

                        if (leading || trailing) {
                            cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
                        }
                    } else {
                        console.error(`Could not find valid JSON boundaries`);
                    }

                    // Step 3: Try parsing DIRECTLY first
                    try {
                        parsed = JSON.parse(cleanJson);
                    } catch (firstParseErr) {
                        console.warn("JSON direct parse failed:", firstParseErr.message);

                        // The mermaid regex fixes broken JSON from fresh LLM output
                        // (literal newlines and unescaped quotes inside mermaid string values).
                        // Only applied when direct parse fails, to avoid double-escaping cached JSON.
                        let mermaidFieldsFound = 0;
                        cleanJson = cleanJson.replace(
                            /"mermaid"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"(?:data_table|step|instruction|is_final))/g,
                            (match, content) => {
                                mermaidFieldsFound++;

                                const escaped = content
                                    .replace(/\\/g, '\\\\')
                                    .replace(/"/g, '\\"')
                                    .replace(/\n/g, '\\n')
                                    .replace(/\r/g, '\\r');

                                return `"mermaid": "${escaped}"`;
                            }
                        );

                        if (mermaidFieldsFound === 0) {
                            console.warn(`No mermaid fields found to fix`);
                        }

                        // Retry parse after mermaid escaping
                        try {
                            parsed = JSON.parse(cleanJson);
                        } catch (secondParseErr) {
                            console.error("JSON parse failed even after escaping:", secondParseErr.message);
                            throw secondParseErr;
                        }
                    }
                    
                    // Step 4: Validate structure and extract steps
                    let newSteps = [];
                    if (Array.isArray(parsed)) {
                        newSteps = parsed;
                    } else if (parsed && typeof parsed === 'object') {
                        if (Array.isArray(parsed.steps)) {
                            newSteps = parsed.steps;
                        } else if (typeof parsed.step !== 'undefined' && parsed.instruction) {
                            newSteps = [parsed];
                        }
                    }

                    // Step 4.5: Normalize mermaid strings (fix corrupted cached data)
                    // Old code double-escaped mermaid content before caching.
                    // This produces literal \n, \", \\ in mermaid strings after JSON.parse.
                    // Clean them up so the store (and future cache entries) have correct data.
                    for (let i = 0; i < newSteps.length; i++) {
                        if (newSteps[i].mermaid && typeof newSteps[i].mermaid === 'string') {
                            const m = newSteps[i].mermaid;
                            const hasLiteralEscapes = m.includes('\\n') || m.includes('\\"');
                            if (hasLiteralEscapes) {
                                newSteps[i].mermaid = m
                                    .replace(/\\\\/g, '\\')   // Un-double backslashes first
                                    .replace(/\\n/g, '\n')     // Then \n → newline
                                    .replace(/\\"/g, '"')      // \" → quote
                                    .replace(/\\t/g, '\t')     // \t → tab
                                    .replace(/\\r/g, '\r');    // \r → CR
                            }
                        }
                    }

                    // Step 5: Validate we have usable steps
                    if (newSteps.length === 0) {
                        console.error("No valid steps found in parsed JSON");
                        throw new Error("No valid steps found in parsed JSON");
                    }

                    // Validate each step has required fields
                    for (let i = 0; i < newSteps.length; i++) {
                        const step = newSteps[i];

                        if (typeof step.step === 'undefined') {
                            step.step = i;
                        }
                        if (!step.instruction) {
                            step.instruction = "Step " + step.step;
                        }
                        if (!step.mermaid) {
                            console.error(`Step ${i} missing required 'mermaid' field!`);
                            throw new Error(`Step ${i} missing required 'mermaid' field`);
                        }

                        const mermaidNewlines = (step.mermaid.match(/\n/g) || []).length;

                        if (mermaidNewlines === 0) {
                            console.warn(`Step ${i}: Mermaid has NO newlines, might be malformed.`);
                        }
                    }
                    
                    // Step 6: Determine simulation scope
                    let simId = AXIOM.simulation.activeSimId;
                    const isNewSimulation = newSteps.length > 0 && newSteps[0].step === 0;
                    
                    if (isNewSimulation) {
                        simId = 'sim_' + Date.now();
                        AXIOM.simulation.activeSimId = simId;
                        AXIOM.simulation.store[simId] = [];
                        AXIOM.simulation.state[simId] = 0;
                        AXIOM.simulation.validatedSteps = new Set();
                        AXIOM.simulation.lastWorkingMermaid[simId] = null;
                        AXIOM.simulation.difficulty = difficulty;
                    } else if (!simId) {
                        simId = 'sim_cont_' + Date.now();
                        AXIOM.simulation.activeSimId = simId;
                        AXIOM.simulation.store[simId] = [];
                        AXIOM.simulation.state[simId] = 0;
                        AXIOM.simulation.validatedSteps = new Set();
                        AXIOM.simulation.lastWorkingMermaid[simId] = null;
                    }
                    
                    // Step 7: Merge steps into store
                    if (isNewSimulation) {
                        AXIOM.simulation.store[simId] = newSteps;
                    } else {
                        AXIOM.simulation.store[simId] = AXIOM.simulation.store[simId].concat(newSteps);
                    }
                    
                    // Step 8: Calculate which index to render
                    const startIndex = isNewSimulation ? 0 : AXIOM.simulation.store[simId].length - newSteps.length;
                    
                    // Step 9: Extract input data from trailing marker
                    AXIOM.simulation.inputData = AXIOM.simulation.inputData || {};
                    const inputDataMatch = fullText.match(/<!--AXIOM_INPUT_DATA:(.*?)-->/);
                    if (inputDataMatch) {
                        try {
                            const inputData = JSON.parse(inputDataMatch[1]);
                            AXIOM.simulation.inputData[simId] = inputData;
                            console.log('[AXIOM] Extracted input data:', inputData);
                        } catch (e) {
                            console.warn('[AXIOM] Failed to parse input data marker:', e);
                        }
                    }
                    // Fallback: check parsed JSON for input_data field (cached responses)
                    if (!AXIOM.simulation.inputData[simId] && parsed && parsed.input_data) {
                        AXIOM.simulation.inputData[simId] = parsed.input_data;
                        console.log('[AXIOM] Extracted input data from cached response:', parsed.input_data);
                    }
                    
                    // Step 10: Remove loading overlay if present
                    const loader = targetElement.querySelector('.generation-loader');
                    if (loader) loader.remove();
                    
                    const axiomLoader = targetElement.querySelector('.axiom-loader');
                    if (axiomLoader) axiomLoader.remove();
                    
                    // Step 11: Render the FIRST of the new steps
                    await AXIOM.renderer.renderPlaylistStep(simId, startIndex, targetElement);
                    
                    return;
                    
                } catch (jsonErr) {
                    console.error("❌ JSON Processing Failed:", jsonErr.message);
                    
                    // Try to identify what's at the error position
                    const posMatch = jsonErr.message.match(/position\s+(\d+)/i);
                    if (posMatch) {
                        const errorPos = parseInt(posMatch[1]);
                    }
                    
                    // Show error to user
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
                                The simulation data couldn't be parsed. Error: <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px;">${AXIOM.escapeHtml(jsonErr.message)}</code>
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
                                ">🔄 Retry Request</button>
                                <button onclick="this.closest('.parse-error').querySelector('details').open = true" style="
                                    background: transparent;
                                    color: #888;
                                    border: 1px solid #444;
                                    padding: 10px 20px;
                                    border-radius: 4px;
                                    cursor: pointer;
                                    font-family: inherit;
                                ">View Raw Response</button>
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
                                ">${AXIOM.escapeHtml(fullText.substring(0, 3000))}${fullText.length > 3000 ? '\n\n... [truncated]' : ''}</pre>
                            </details>
                        </div>`;
                    targetElement.style.opacity = '1';
                    
                    return;
                }
            }

            // =====================================================================
            // STANDARD TEXT/MARKDOWN RESPONSE
            // =====================================================================
            
            targetElement.innerHTML = marked.parse(fullText);
            
            // Process any mermaid diagrams in the markdown
            await AXIOM.renderer.fixMermaid(targetElement);
            
            targetElement.style.opacity = '1';
            AXIOM.elements.historyDiv.scrollTop = AXIOM.elements.historyDiv.scrollHeight;

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
                    <p style="color: #ffaaaa; margin: 10px 0 0 0;">${AXIOM.escapeHtml(e.message)}</p>
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
            AXIOM.state.isProcessing = false;
            AXIOM.state.isSimulationUpdate = false;
            const inputWrapper = document.querySelector('.input-wrapper');
            if (inputWrapper) inputWrapper.classList.remove('processing');
        }
    }
    
    // =========================================================================
    // RETRY LAST MESSAGE
    // =========================================================================
    
    function retryLastMessage() {
        if (AXIOM.state.lastUserMessage) {
            // Clear tracking so it can be re-evaluated if needed
            AXIOM.state.lastPromptedForDifficulty = null;
            // Skip difficulty prompt on retry - use current difficulty
            sendMessageWithDifficulty(AXIOM.state.lastUserMessage, AXIOM.difficulty.current);
        } else {
            AXIOM.ui.showToast("No message to retry");
        }
    }
    
    // =========================================================================
    // EXPORT
    // =========================================================================
    
    AXIOM.sendMessage = sendMessage;
    AXIOM.sendMessageWithDifficulty = sendMessageWithDifficulty;
    AXIOM.retryLastMessage = retryLastMessage;
    
    // Global exposure for onclick handlers
    window.sendMessage = sendMessage;
    window.retryLastMessage = retryLastMessage;
    window.sendFeedback = AXIOM.api.sendFeedback;
    
    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================
    
    const { lobbyBtn, lobbyInput, userInput, disconnectBtn } = AXIOM.elements;
    
    // Lobby handlers - now with difficulty prompt
    if (lobbyBtn) lobbyBtn.addEventListener('click', AXIOM.ui.handleLobbyInit);
    if (lobbyInput) lobbyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            AXIOM.ui.handleLobbyInit();
        }
    });

    // Quick presets menu
    const cardSim = document.getElementById('card-sim');
    const presetMenu = document.getElementById('quick-presets');
    const presetsBackdrop = document.getElementById('presets-backdrop');
    const closePresets = document.getElementById('close-presets');

    function togglePresets(show) {
        if (show) {
            presetMenu.classList.add('active');
            presetsBackdrop.classList.add('active');
            if (cardSim) cardSim.style.borderColor = '#00f3ff';
        } else {
            presetMenu.classList.remove('active');
            presetsBackdrop.classList.remove('active');
            if (cardSim) cardSim.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }
    }

    if (cardSim && presetMenu) {
        cardSim.addEventListener('click', () => {
            const isActive = presetMenu.classList.contains('active');
            togglePresets(!isActive);
        });
    }

    // Close button
    if (closePresets) {
        closePresets.addEventListener('click', () => {
            togglePresets(false);
        });
    }

    // Click backdrop to close
    if (presetsBackdrop) {
        presetsBackdrop.addEventListener('click', () => {
            togglePresets(false);
        });
    }

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const prompt = e.target.getAttribute('data-prompt');
            if (lobbyInput) lobbyInput.value = prompt;
            togglePresets(false);
            AXIOM.ui.handleLobbyInit();
        });
    });

    // File upload
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
            try {
                const data = await AXIOM.api.uploadFile(file);
                if (spinnerOverlay) spinnerOverlay.style.display = 'none';
                AXIOM.ui.activateChatMode(`**SYSTEM INGEST COMPLETE**\nTarget Data: _${data.filename}_`);
            } catch (e) {
                console.error(e);
                if (spinnerOverlay) spinnerOverlay.style.display = 'none';
                alert("INGEST FAILED: " + e.message);
            }
        });
    }

    // Chat send button
    document.getElementById('btn-send').addEventListener('click', () => sendMessage());
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Disconnect button
    disconnectBtn.addEventListener('click', AXIOM.ui.disconnect);

    // Enhance buttons
    document.getElementById('btn-enhance').addEventListener('click', async () => {
        const text = userInput.value.trim();
        if (!text) { alert("Prompt needed."); return; }
        const originalText = text;
        userInput.value = "Enhancing...";
        userInput.disabled = true;
        try {
            const data = await AXIOM.api.enhancePrompt(text);
            userInput.value = data.enhanced_prompt || originalText;
        } catch (e) {
            userInput.value = originalText;
        } finally {
            userInput.disabled = false;
            userInput.focus();
        }
    });

    document.getElementById('lobby-enhance-btn').addEventListener('click', async () => {
        const text = lobbyInput.value.trim();
        if (!text) { alert("Prompt needed."); return; }
        const originalText = text;
        lobbyInput.value = "Enhancing...";
        lobbyInput.disabled = true;
        try {
            const data = await AXIOM.api.enhancePrompt(text);
            lobbyInput.value = data.enhanced_prompt || originalText;
        } catch (e) {
            lobbyInput.value = originalText;
        } finally {
            lobbyInput.disabled = false;
            lobbyInput.focus();
        }
    });

    // =========================================================================
    // INITIALIZATION COMPLETE
    // =========================================================================
    
})();