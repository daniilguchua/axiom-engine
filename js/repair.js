// js/repair.js
/**
 * AXIOM Engine - Self-Healing System v3.0 (TIERED REPAIR)
 * 
 * TIERED REPAIR PIPELINE:
 * ========================
 * TIER 1: Python sanitizer only (via /quick-fix) - ~5ms, FREE
 * TIER 2: Python + JS sanitizer (client-side JS) - ~10ms, FREE
 * TIER 3: LLM repair + Python sanitizer (via /repair) - ~3-10s, COSTS $
 * TIER 4: LLM + Python + JS sanitizer (client-side JS on LLM output) - same as Tier 3
 * 
 * Each tier tries to render after applying fixes.
 * We escalate to the next tier only if rendering fails.
 * All attempts are logged to track which tier fixes what.
 * 
 * GOAL: ~60% fixed by Tier 1, ~25% by Tier 2, ~15% by Tier 3/4
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
                console.log(`[REPAIR] Using working graph from different simulation: ${sid}`);
                return AXIOM.simulation.lastWorkingMermaid[sid];
            }
        }
        
        // Priority 4: Default template for step 0 failures
        console.log("[REPAIR] Using default mermaid template");
        return AXIOM.DEFAULT_MERMAID_TEMPLATE;
    }
    
    // =========================================================================
    // REPAIR UI RENDERING
    // =========================================================================
    
    function renderRepairUI(wrapper, state) {
        const { phase, tier, attempt, error, code, waitMs } = state;
        
        clearRepairTimer();
        
        const elapsedSec = ((Date.now() - AXIOM.repair.startTime) / 1000).toFixed(1);
        const codePreview = (code || '').split('\n').slice(0, 6)
            .map(l => escapeHtml(l.substring(0, 60)))
            .join('\n');
        
        // Phase configurations with tier-specific phases
        const phaseConfig = {
            [RepairPhase.DIAGNOSING]: {
                icon: '🔍',
                title: 'ANALYZING RENDER FAILURE',
                color: '#ff9f43',
                message: 'Diagnosing syntax issues...'
            },
            // Tier 1: Python sanitizer only
            [RepairPhase.TIER1_PYTHON]: {
                icon: '🐍',
                title: 'TIER 1: PYTHON SANITIZER',
                color: '#34D399',
                message: 'Applying Python-based syntax fixes (~5ms, FREE)...'
            },
            // Tier 2: Python + JS sanitizer
            [RepairPhase.TIER2_PYTHON_JS]: {
                icon: '⚡',
                title: 'TIER 2: PYTHON + JS SANITIZER',
                color: '#60A5FA',
                message: 'Applying additional JS sanitization (~10ms, FREE)...'
            },
            // Tier 3: LLM repair
            [RepairPhase.TIER3_LLM]: {
                icon: '🤖',
                title: 'TIER 3: LLM REPAIR',
                color: '#A78BFA',
                message: 'Contacting AI for intelligent repair (~3-10s)...'
            },
            // Tier 4: LLM + JS sanitizer
            [RepairPhase.TIER4_LLM_JS]: {
                icon: '🔧',
                title: 'TIER 4: LLM + JS POLISH',
                color: '#F472B6',
                message: 'Applying JS sanitizer to LLM output...'
            },
            // Legacy phases (kept for compatibility)
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
                icon: '✔',
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
        
        // Build tier indicator dots (4 tiers now)
        const tierDots = [1, 2, 3, 4].map(n => {
            const isActive = tier === n;
            const isPast = tier > n;
            const dotColor = isPast ? '#34D399' : (isActive ? config.color : '#333');
            return `
                <div style="
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: ${dotColor};
                    ${isActive ? `box-shadow: 0 0 8px ${config.color};` : ''}
                "></div>
            `;
        }).join('');
        
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
                    <span style="color: #666;">TIER</span>
                    <span style="
                        color: ${config.color}; 
                        font-weight: bold;
                        background: ${config.color}20;
                        padding: 2px 8px;
                        border-radius: 4px;
                    ">${tier || '-'}/4</span>
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
                <span>AXIOM TIERED REPAIR v3.0</span>
                <div style="display: flex; gap: 8px;">
                    ${tierDots}
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
                        RENDER FAILURE - ALL TIERS EXHAUSTED
                    </span>
                </div>
                <span style="color: #666; font-size: 0.8em;">
                    4/4 TIERS ATTEMPTED
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
    // VERIFICATION (Test if code renders)
    // =========================================================================
    
    async function verifyFix(wrapper, fixedCode, simId, stepIndex) {
        console.log(`🔍 [verifyFix] Testing fixed code...`);
        console.log(`  Code length: ${fixedCode.length}`);
        console.log(`  Newlines: ${(fixedCode.match(/\n/g) || []).length}`);

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
            console.log(`  ⏳ Testing render in hidden container...`);
            await mermaid.run({ nodes: [testDiv] });

            console.log(`  ✅ Hidden test PASSED`);

            // 3. SUCCESS! Clean up test container
            testContainer.remove();

            // 4. Now render for real in the actual wrapper
            console.log(`  🎨 Rendering in actual wrapper...`);
            wrapper.innerHTML = '';
            const graphDiv = AXIOM.renderer.createGraphDiv(fixedCode);
            wrapper.appendChild(AXIOM.renderer.createOverlay());
            wrapper.appendChild(graphDiv);
            await mermaid.run({ nodes: [graphDiv] });

            console.log(`  ✅ Real render PASSED`);

            // 5. Update the playlist with FIXED code (CRITICAL!)
            if (simId && AXIOM.simulation.store[simId]?.[stepIndex]) {
                console.log(`  💾 Updating playlist with fixed code`);
                AXIOM.simulation.store[simId][stepIndex].mermaid = fixedCode;
            }

            // 6. Track success, enable interactions
            AXIOM.renderer.onRenderSuccess(wrapper, graphDiv, fixedCode, simId, stepIndex, true);

            console.log(`  🎉 verifyFix COMPLETE - success!`);
            return { success: true };

        } catch (error) {
            console.error(`  ❌ verifyFix FAILED:`, error.message);
            console.log(`  🔍 Failed code preview:`, fixedCode.substring(0, 200));
            testContainer.remove();
            return { success: false, error: error.message };
        }
    }
    
    // =========================================================================
    // TIER RESULT REPORTING (for analytics)
    // =========================================================================
    
    async function reportTierResult(simId, stepIndex, tier, tierName, inputCode, outputCode, errorBefore, errorAfter, success, durationMs) {
        try {
            await AXIOM.api.reportTierResult({
                sim_id: simId,
                step_index: stepIndex,
                tier: tier,
                tier_name: tierName,
                input_code: inputCode,
                output_code: outputCode,
                error_before: errorBefore,
                error_after: errorAfter,
                was_successful: success,
                duration_ms: durationMs
            });
        } catch (e) {
            console.warn('[REPAIR] Failed to report tier result:', e);
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
                null,
                simId
            );
            
            const codeToTry = response.success ? response.fixedCode : fallbackCode;
            return await verifyFix(wrapper, codeToTry, simId, stepIndex);
            
        } catch (error) {
            // Last resort: try the raw fallback
            return await verifyFix(wrapper, fallbackCode, simId, stepIndex);
        }
    }
    
    // =========================================================================
    // MAIN TIERED REPAIR PROCESS CONTROLLER
    // =========================================================================
    
    async function startRepairProcess(wrapper, badCode, errorMsg, simId, stepIndex) {
        console.group("🔧 [REPAIR SYSTEM] Starting Tiered Repair Process");

        // Prevent concurrent repairs
        if (AXIOM.repair.isActive) {
            console.warn(`⚠️ Repair already active, waiting for completion...`);
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

        console.log(`📊 REPAIR CONTEXT:`);
        console.log(`  SimId: ${simId}`);
        console.log(`  Step: ${stepIndex}`);
        console.log(`  Original error: ${currentError}`);
        console.log(`  Bad code length: ${badCode.length}`);
        console.log(`  Bad code newlines: ${(badCode.match(/\n/g) || []).length}`);
        console.log(`  Bad code preview:`, badCode.substring(0, 150));
        console.log(`  Has previous working: ${!!previousWorking}`);
        
        // Show initial diagnostic phase
        renderRepairUI(wrapper, {
            phase: RepairPhase.DIAGNOSING,
            tier: 0,
            error: currentError,
            code: currentCode
        });
        
        await delay(300); // Brief pause to show diagnostic phase
        
        // =====================================================================
        // TIER 1: Python Sanitizer Only (via /quick-fix)
        // =====================================================================

        console.log(`\n🐍 === TIER 1: PYTHON SANITIZER (Fast & Free) ===`);
        const tier1Start = Date.now();
        
        renderRepairUI(wrapper, {
            phase: RepairPhase.TIER1_PYTHON,
            tier: 1,
            error: currentError,
            code: currentCode
        });
        
        try {
            const quickFixResult = await AXIOM.api.callQuickFix(currentCode, currentError);
            const tier1Duration = Date.now() - tier1Start;
            
            if (quickFixResult.success && quickFixResult.fixedCode) {
                const tier1Code = quickFixResult.fixedCode;
                const tier1Newlines = (tier1Code.match(/\n/g) || []).length;
                console.log(`  ✓ Tier 1 returned code: ${tier1Code.length} chars, ${tier1Newlines} newlines, ${tier1Duration}ms`);
                console.log(`  🔍 Preview:`, tier1Code.substring(0, 150));

                // Try to render
                renderRepairUI(wrapper, {
                    phase: RepairPhase.VERIFYING,
                    tier: 1,
                    error: null,
                    code: tier1Code
                });

                const tier1Verify = await verifyFix(wrapper, tier1Code, simId, stepIndex);

                if (tier1Verify.success) {
                    console.log(`  🎉 TIER 1 SUCCESS! Fixed in ${tier1Duration}ms`);
                    AXIOM.repair.isActive = false;
                    clearRepairTimer();

                    // Report success
                    reportTierResult(simId, stepIndex, 1, 'TIER1_PYTHON', currentCode, tier1Code, currentError, null, true, tier1Duration);

                    AXIOM.ui.showToast(`✓ Fixed by Tier 1 (Python) in ${tier1Duration}ms`);
                    console.groupEnd();
                    return;
                }

                // Tier 1 fix didn't render
                console.warn(`  ❌ Tier 1 fix failed to render: ${tier1Verify.error}`);
                currentCode = tier1Code; // Use Tier 1 output for Tier 2
                currentError = tier1Verify.error;

                // Report failure
                reportTierResult(simId, stepIndex, 1, 'TIER1_PYTHON', badCode, tier1Code, errorMsg, tier1Verify.error, false, tier1Duration);
            } else {
                console.warn(`  ❌ Tier 1 returned no fix or failed`);
                reportTierResult(simId, stepIndex, 1, 'TIER1_PYTHON', badCode, null, errorMsg, quickFixResult.error || 'No fix returned', false, tier1Duration);
            }
        } catch (tier1Error) {
            console.error(`[REPAIR] Tier 1 error:`, tier1Error);
            reportTierResult(simId, stepIndex, 1, 'TIER1_PYTHON', badCode, null, errorMsg, tier1Error.message, false, Date.now() - tier1Start);
        }
        
        // =====================================================================
        // TIER 2: Python + JS Sanitizer (apply JS sanitizer to Tier 1 output)
        // =====================================================================

        console.log(`\n⚡ === TIER 2: PYTHON + JS SANITIZER (Fast & Free) ===`);
        const tier2Start = Date.now();
        
        renderRepairUI(wrapper, {
            phase: RepairPhase.TIER2_PYTHON_JS,
            tier: 2,
            error: currentError,
            code: currentCode
        });
        
        try {
            // Apply JS sanitizer to current code
            const tier2Code = AXIOM.sanitizer.sanitizeMermaidString(currentCode);
            const tier2Duration = Date.now() - tier2Start;
            
            console.log(`[REPAIR] Tier 2 JS sanitizer applied (${tier2Duration}ms)`);
            
            // Try to render
            renderRepairUI(wrapper, {
                phase: RepairPhase.VERIFYING,
                tier: 2,
                error: null,
                code: tier2Code
            });
            
            const tier2Verify = await verifyFix(wrapper, tier2Code, simId, stepIndex);
            
            if (tier2Verify.success) {
                console.log(`[REPAIR] TIER 2 SUCCESS! Fixed in ${tier2Duration}ms`);
                AXIOM.repair.isActive = false;
                clearRepairTimer();
                
                // Report success
                reportTierResult(simId, stepIndex, 2, 'TIER2_PYTHON_JS', currentCode, tier2Code, currentError, null, true, tier2Duration);
                
                AXIOM.ui.showToast(`✓ Fixed by Tier 2 (Python+JS) in ${tier2Duration}ms`);
                return;
            }
            
            // Tier 2 fix didn't render
            console.log(`[REPAIR] Tier 2 fix failed to render: ${tier2Verify.error}`);
            currentError = tier2Verify.error;
            
            // Report failure
            reportTierResult(simId, stepIndex, 2, 'TIER2_PYTHON_JS', currentCode, tier2Code, currentError, tier2Verify.error, false, tier2Duration);
            
        } catch (tier2Error) {
            console.error(`[REPAIR] Tier 2 error:`, tier2Error);
            reportTierResult(simId, stepIndex, 2, 'TIER2_PYTHON_JS', currentCode, null, currentError, tier2Error.message, false, Date.now() - tier2Start);
        }
        
        // =====================================================================
        // TIER 3: LLM Repair (with retry loop, up to MAX_ATTEMPTS)
        // =====================================================================

        console.log(`\n🤖 === TIER 3: LLM REPAIR (Slow, Costs $) ===`);
        
        // Reset to original bad code for LLM - it needs to see the actual problem
        currentCode = badCode;
        currentError = errorMsg;
        
        for (let attempt = 1; attempt <= RepairConfig.MAX_ATTEMPTS; attempt++) {
            const tier3Start = Date.now();
            
            console.log(`[REPAIR] Tier 3, Attempt ${attempt}/${RepairConfig.MAX_ATTEMPTS}`);
            
            renderRepairUI(wrapper, {
                phase: RepairPhase.TIER3_LLM,
                tier: 3,
                attempt: attempt,
                error: currentError,
                code: currentCode
            });
            
            try {
                const llmResult = await AXIOM.api.callRepairServer(
                    currentCode,
                    currentError,
                    context,
                    stepIndex,
                    attempt,
                    previousWorking,
                    simId
                );
                
                const tier3Duration = Date.now() - tier3Start;
                
                if (llmResult.success && llmResult.fixedCode) {
                    const tier3Code = llmResult.fixedCode;
                    console.log(`[REPAIR] LLM returned code (${tier3Code.length} chars, ${tier3Duration}ms)`);
                    
                    // Try to render LLM output directly
                    renderRepairUI(wrapper, {
                        phase: RepairPhase.VERIFYING,
                        tier: 3,
                        attempt: attempt,
                        error: null,
                        code: tier3Code
                    });
                    
                    const tier3Verify = await verifyFix(wrapper, tier3Code, simId, stepIndex);
                    
                    if (tier3Verify.success) {
                        console.log(`[REPAIR] TIER 3 SUCCESS! Fixed in ${tier3Duration}ms (attempt ${attempt})`);
                        AXIOM.repair.isActive = false;
                        clearRepairTimer();
                        
                        // Report success
                        reportTierResult(simId, stepIndex, 3, 'TIER3_LLM', currentCode, tier3Code, currentError, null, true, tier3Duration);
                        
                        AXIOM.ui.showToast(`✓ Fixed by Tier 3 (LLM) in ${(tier3Duration/1000).toFixed(1)}s`);
                        return;
                    }
                    
                    // LLM fix didn't render - try Tier 4
                    console.log(`[REPAIR] Tier 3 fix failed to render: ${tier3Verify.error}`);
                    
                    // Report Tier 3 failure
                    reportTierResult(simId, stepIndex, 3, 'TIER3_LLM', currentCode, tier3Code, currentError, tier3Verify.error, false, tier3Duration);
                    
                    // =========================================================
                    // TIER 4: Apply JS sanitizer to LLM output
                    // =========================================================
                    
                    console.log(`[REPAIR] === TIER 4: LLM + JS SANITIZER ===`);
                    const tier4Start = Date.now();
                    
                    renderRepairUI(wrapper, {
                        phase: RepairPhase.TIER4_LLM_JS,
                        tier: 4,
                        attempt: attempt,
                        error: tier3Verify.error,
                        code: tier3Code
                    });
                    
                    const tier4Code = AXIOM.sanitizer.sanitizeMermaidString(tier3Code);
                    const tier4Duration = Date.now() - tier4Start;
                    
                    renderRepairUI(wrapper, {
                        phase: RepairPhase.VERIFYING,
                        tier: 4,
                        attempt: attempt,
                        error: null,
                        code: tier4Code
                    });
                    
                    const tier4Verify = await verifyFix(wrapper, tier4Code, simId, stepIndex);
                    
                    if (tier4Verify.success) {
                        console.log(`[REPAIR] TIER 4 SUCCESS! Fixed in ${tier3Duration + tier4Duration}ms`);
                        AXIOM.repair.isActive = false;
                        clearRepairTimer();
                        
                        // Report success
                        reportTierResult(simId, stepIndex, 4, 'TIER4_LLM_JS', tier3Code, tier4Code, tier3Verify.error, null, true, tier4Duration);
                        
                        AXIOM.ui.showToast(`✓ Fixed by Tier 4 (LLM+JS) in ${((tier3Duration + tier4Duration)/1000).toFixed(1)}s`);
                        return;
                    }
                    
                    // Tier 4 also failed
                    console.log(`[REPAIR] Tier 4 fix failed to render: ${tier4Verify.error}`);
                    reportTierResult(simId, stepIndex, 4, 'TIER4_LLM_JS', tier3Code, tier4Code, tier3Verify.error, tier4Verify.error, false, tier4Duration);
                    
                    // Update error for next LLM attempt
                    currentCode = tier3Code;
                    currentError = tier4Verify.error;
                    
                } else {
                    console.log(`[REPAIR] LLM returned no fix or failed`);
                    reportTierResult(simId, stepIndex, 3, 'TIER3_LLM', currentCode, null, currentError, llmResult.error || 'No fix returned', false, tier3Duration);
                }
                
            } catch (llmError) {
                console.error(`[REPAIR] LLM error:`, llmError);
                reportTierResult(simId, stepIndex, 3, 'TIER3_LLM', currentCode, null, currentError, llmError.message, false, Date.now() - tier3Start);
            }
            
            // Exponential backoff before next LLM attempt
            if (attempt < RepairConfig.MAX_ATTEMPTS) {
                const backoffMs = Math.min(
                    RepairConfig.BASE_DELAY_MS * Math.pow(2, attempt - 1),
                    RepairConfig.MAX_DELAY_MS
                );
                console.log(`[REPAIR] Waiting ${backoffMs}ms before next LLM attempt...`);
                
                renderRepairUI(wrapper, {
                    phase: 'WAITING',
                    tier: 3,
                    attempt: attempt,
                    error: currentError,
                    code: currentCode,
                    waitMs: backoffMs
                });
                
                await delay(backoffMs);
            }
        }
        
        // =====================================================================
        // FALLBACK: Try previous working graph
        // =====================================================================

        console.log(`\n🔄 === FALLBACK RECOVERY ===`);
        
        if (previousWorking) {
            renderRepairUI(wrapper, {
                phase: RepairPhase.FALLBACK,
                tier: 4,
                error: 'Attempting recovery with previous graph',
                code: previousWorking
            });
            
            const fallbackResult = await attemptFallbackRecovery(wrapper, previousWorking, simId, stepIndex, context);
            
            if (fallbackResult.success) {
                console.log(`[REPAIR] FALLBACK SUCCESS!`);
                AXIOM.repair.isActive = false;
                clearRepairTimer();
                AXIOM.ui.showToast('⚠ Recovered using previous graph state');
                return;
            }
        }
        
        // =====================================================================
        // FATAL: All options exhausted
        // =====================================================================

        console.error(`\n🛑 === FATAL: ALL REPAIR OPTIONS EXHAUSTED ===`);
        console.error(`  Final error: ${currentError}`);
        console.error(`  Attempts made: Tier 1, Tier 2, Tier 3 (${RepairConfig.MAX_ATTEMPTS} attempts), Fallback`);
        console.log(`  🔍 Final failed code:`, badCode.substring(0, 300));

        AXIOM.repair.phase = RepairPhase.FATAL;
        AXIOM.repair.isActive = false;
        clearRepairTimer();

        renderFatalError(wrapper, badCode, currentError, simId, stepIndex);
        AXIOM.api.reportFailureToServer(simId, stepIndex, badCode, currentError);

        console.groupEnd();
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
    
    console.log('✅ AXIOM Tiered Repair System v3.0 loaded');
})();