// js/repair.js
/**
 * AXIOM Engine - Self-Healing System v2.0
 * 
 * Architecture:
 * 1. Mermaid render fails
 * 2. DIAGNOSTIC phase - analyze the error
 * 3. LLM REPAIR phase - sequential attempts with exponential backoff
 * 4. VERIFICATION phase - test the fix
 * 5. FALLBACK phase - use previous working graph
 * 6. FATAL phase - show debug info
 */

(function() {
    const { RepairConfig, RepairPhase, escapeHtml, delay } = AXIOM;
    
    // =========================================================================
    // REPAIR TIMER MANAGEMENT
    // =========================================================================
    
    function startRepairTimer(wrapper) {
        if (AXIOM.repair.timerInterval) clearInterval(AXIOM.repair.timerInterval);

        AXIOM.repair.timerInterval = setInterval(() => {
            // 1. Update Total Elapsed Time
            const timerEl = wrapper.querySelector('#repair-timer');
            if (timerEl && AXIOM.repair.startTime) {
                const elapsed = ((Date.now() - AXIOM.repair.startTime) / 1000).toFixed(1);
                timerEl.textContent = `Elapsed: ${elapsed}s`;
            }

            // 2. Update "Next Attempt" Countdown
            const countdownEl = wrapper.querySelector('#countdown-val');
            if (countdownEl) {
                let val = parseInt(countdownEl.innerText);
                if (!isNaN(val) && val > 0) {
                    const now = Date.now();
                    if (!AXIOM.repair.lastTick || now - AXIOM.repair.lastTick >= 1000) {
                        countdownEl.innerText = val - 1;
                        AXIOM.repair.lastTick = now;
                    }
                }
            }
        }, 100);
    }
    
    function clearRepairTimer() {
        if (AXIOM.repair.timerInterval) {
            clearInterval(AXIOM.repair.timerInterval);
            AXIOM.repair.timerInterval = null;
        }
    }
    
    function waitForRepairComplete() {
        return new Promise(resolve => {
            const check = setInterval(() => {
                if (!AXIOM.repair.isActive) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
            setTimeout(() => { clearInterval(check); resolve(); }, 60000);
        });
    }
    
    // =========================================================================
    // CONTEXT HELPERS
    // =========================================================================
    
    function getRepairContext(simId, stepIndex) {
        if (simId && AXIOM.simulation.store[simId]?.[stepIndex]) {
            return AXIOM.simulation.store[simId][stepIndex].instruction || "Algorithm visualization step";
        }
        return "Mermaid diagram";
    }
    
    function getLastWorkingGraph(simId, stepIndex) {
        // Priority 1: Last working graph for this simulation
        if (simId && AXIOM.simulation.lastWorkingMermaid[simId]) {
            return AXIOM.simulation.lastWorkingMermaid[simId];
        }
        
        // Priority 2: Previous step's mermaid (if not step 0)
        const playlist = AXIOM.simulation.store[simId];
        if (playlist && stepIndex > 0 && playlist[stepIndex - 1]?.mermaid) {
            return playlist[stepIndex - 1].mermaid;
        }
        
        // Priority 3: Any working graph from any simulation (recent)
        for (const sid of Object.keys(AXIOM.simulation.lastWorkingMermaid)) {
            if (AXIOM.simulation.lastWorkingMermaid[sid]) {
                console.log(`🔄 Using working graph from different simulation: ${sid}`);
                return AXIOM.simulation.lastWorkingMermaid[sid];
            }
        }
        
        // Priority 4: Default template for step 0 failures
        console.log("🔄 Using default mermaid template");
        return AXIOM.DEFAULT_MERMAID_TEMPLATE;
    }
    
    // =========================================================================
    // REPAIR UI RENDERING
    // =========================================================================
    
    function renderRepairUI(wrapper, state) {
        const { phase, attempt, error, code, waitMs } = state;
        
        clearRepairTimer();
        
        const elapsedSec = ((Date.now() - AXIOM.repair.startTime) / 1000).toFixed(1);
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
    
    // =========================================================================
    // VERIFICATION
    // =========================================================================
    
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
            const graphDiv = AXIOM.renderer.createGraphDiv(fixedCode);
            wrapper.appendChild(AXIOM.renderer.createOverlay());
            wrapper.appendChild(graphDiv);
            await mermaid.run({ nodes: [graphDiv] });
            
            // 5. Update the playlist with FIXED code (CRITICAL!)
            if (simId && AXIOM.simulation.store[simId]?.[stepIndex]) {
                AXIOM.simulation.store[simId][stepIndex].mermaid = fixedCode;
            }
            
            // 6. Track success, enable interactions
            AXIOM.renderer.onRenderSuccess(wrapper, graphDiv, fixedCode, simId, stepIndex, true);
            
            return { success: true };
            
        } catch (error) {
            testContainer.remove();
            return { success: false, error: error.message };
        }
    }
    
    // =========================================================================
    // FALLBACK RECOVERY
    // =========================================================================
    
    async function attemptFallbackRecovery(wrapper, fallbackCode, simId, stepIndex, context) {
        try {
            // Ask LLM to adapt the previous graph for current context
            const response = await AXIOM.api.callRepairServer(
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
    
    // =========================================================================
    // MAIN REPAIR PROCESS CONTROLLER
    // =========================================================================
    
    async function startRepairProcess(wrapper, badCode, errorMsg, simId, stepIndex) {
        // Prevent concurrent repairs
        if (AXIOM.repair.isActive) {
            console.log(`⏳ [REPAIR] Already active, queuing...`);
            await waitForRepairComplete();
        }
        
        // Initialize repair state
        AXIOM.repair = {
            ...AXIOM.repair,
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
        while (AXIOM.repair.attempt < RepairConfig.MAX_ATTEMPTS) {
            AXIOM.repair.attempt++;
            const attempt = AXIOM.repair.attempt;
            
            console.log(`🔧 [REPAIR] === ATTEMPT ${attempt}/${RepairConfig.MAX_ATTEMPTS} ===`);
            
            // Update UI to show we're contacting LLM
            AXIOM.repair.phase = RepairPhase.CONTACTING_LLM;
            renderRepairUI(wrapper, {
                phase: RepairPhase.CONTACTING_LLM,
                attempt: attempt,
                error: currentError,
                code: currentCode
            });
            
            try {
                // Call the repair server
                console.log(`📡 [REPAIR] Calling server...`);
                const serverResponse = await AXIOM.api.callRepairServer(
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
                AXIOM.repair.phase = RepairPhase.APPLYING_FIX;
                renderRepairUI(wrapper, {
                    phase: RepairPhase.APPLYING_FIX,
                    attempt: attempt,
                    error: currentError,
                    code: fixedCode
                });
                
                await delay(300);
                
                // Try to render the fixed code
                AXIOM.repair.phase = RepairPhase.VERIFYING;
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
                    AXIOM.repair.phase = RepairPhase.SUCCESS;
                    AXIOM.repair.isActive = false;
                    clearRepairTimer();
                    
                    AXIOM.ui.showToast(`✓ Repaired on attempt ${attempt}/${RepairConfig.MAX_ATTEMPTS}`);
                    return;
                }
                
                // Render failed
                console.log(`❌ [REPAIR] Attempt ${attempt} - fix didn't render: ${verifyResult.error}`);
                currentCode = fixedCode;
                currentError = verifyResult.error;
                
            } catch (error) {
                console.error(`❌ [REPAIR] Attempt ${attempt} error:`, error);
                currentError = error.message;
            }
            
            // Exponential backoff before next attempt
            if (AXIOM.repair.attempt < RepairConfig.MAX_ATTEMPTS) {
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
            AXIOM.repair.phase = RepairPhase.FALLBACK;
            renderRepairUI(wrapper, {
                phase: RepairPhase.FALLBACK,
                attempt: RepairConfig.MAX_ATTEMPTS,
                error: 'Attempting recovery with previous graph',
                code: previousWorking
            });
            
            const fallbackResult = await attemptFallbackRecovery(wrapper, previousWorking, simId, stepIndex, context);
            
            if (fallbackResult.success) {
                console.log(`✅ [REPAIR] Fallback succeeded!`);
                AXIOM.repair.isActive = false;
                clearRepairTimer();
                AXIOM.ui.showToast('Recovered using previous graph state');
                return;
            }
        }
        
        // === TOTAL FAILURE ===
        console.log(`💀 [REPAIR] All recovery options exhausted`);
        AXIOM.repair.phase = RepairPhase.FATAL;
        AXIOM.repair.isActive = false;
        clearRepairTimer();
        
        renderFatalError(wrapper, badCode, currentError, simId, stepIndex);
        AXIOM.api.reportFailureToServer(simId, stepIndex, badCode, currentError);
    }
    
    // =========================================================================
    // INJECT CSS
    // =========================================================================
    
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
    
    // =========================================================================
    // EXPORT
    // =========================================================================
    
    AXIOM.repairSystem = {
        startRepairProcess,
        verifyFix,
        renderRepairUI,
        renderFatalError,
        getLastWorkingGraph,
        getRepairContext,
        clearRepairTimer
    };
    
    console.log('✅ AXIOM Repair System loaded');
})();