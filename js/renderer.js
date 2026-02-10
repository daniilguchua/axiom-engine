// js/renderer.js
/**
 * AXIOM Engine - Mermaid Rendering
 * fixMermaid, renderPlaylistStep, and related rendering functions.
 */

(function() {
    const { RepairConfig } = AXIOM;
    
    // =========================================================================
    // WRAPPER & ELEMENT CREATION
    // =========================================================================
    
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
            transition: "transform 0.05s linear, opacity 0.3s ease",
            width: "100%",
            height: "100%",
            opacity: "0"
        });

        // SAFETY NET: Force-reveal after 3s if the normal reveal path fails
        const safetyTimer = setTimeout(() => {
            if (graphDiv.style.opacity === '0') {
                console.warn('[SAFETY] Force-revealing graphDiv after 3s timeout');
                graphDiv.style.opacity = '1';
            }
        }, 3000);
        graphDiv.dataset.safetyTimer = String(safetyTimer);

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
    
    // =========================================================================
    // RENDER ATTEMPT WITH TIMEOUT
    // =========================================================================
    
    async function attemptRender(graphDiv, wrapper) {
        console.log(`🎨 [attemptRender] Starting render attempt...`);
        const code = graphDiv.textContent;
        console.log(`  Code length: ${code.length}`);
        console.log(`  Newlines: ${(code.match(/\n/g) || []).length}`);

        try {
            await new Promise(r => setTimeout(r, 50));

            console.log(`⏳ Calling mermaid.run()...`);
            const startTime = Date.now();

            // Race between render and timeout
            const result = await Promise.race([
                mermaid.run({ nodes: [graphDiv] }).then(() => {
                    console.log(`✅ mermaid.run() succeeded in ${Date.now() - startTime}ms`);
                    return { success: true };
                }),
                new Promise((_, reject) =>
                    setTimeout(() => {
                        console.error(`⏰ Render timeout after ${RepairConfig.RENDER_TIMEOUT_MS}ms`);
                        reject(new Error('Render timeout'));
                    }, RepairConfig.RENDER_TIMEOUT_MS)
                )
            ]);

            return result;
        } catch (error) {
            const errorMsg = error.message || 'Unknown render error';
            console.error(`❌ [attemptRender] Render failed:`, errorMsg);
            console.log(`🔍 Failed code:`, code.substring(0, 200));
            return { success: false, error: errorMsg };
        }
    }
    
    // =========================================================================
    // SUCCESS HANDLER
    // =========================================================================
    
    function onRenderSuccess(wrapper, graphDiv, code, simId, stepIndex, wasRepaired = false) {
        console.log(`🎉 [onRenderSuccess] Render successful!`);
        console.log(`  SimId: ${simId}`);
        console.log(`  Step: ${stepIndex}`);
        console.log(`  Was repaired: ${wasRepaired}`);

        // Track validation
        if (simId && stepIndex !== null) {
            const key = `${simId}_${stepIndex}`;
            AXIOM.simulation.validatedSteps.add(key);
            AXIOM.simulation.lastWorkingMermaid[simId] = code;

            console.log(`✅ [VALIDATE] Step ${stepIndex} validated for ${simId}`);
            console.log(`  Storing working Mermaid for future reference`);

            const playlist = AXIOM.simulation.store[simId];
            if (playlist && playlist[stepIndex]?.is_final) {
                console.log(`🏁 Final step detected, confirming simulation complete`);
                AXIOM.api.confirmSimulationComplete(simId);
            }
        }

        // Send sanitized graph back to backend for use in continuations
        // CRITICAL: Always send, even if repaired - we want the working version
        if (simId && stepIndex !== null) {
            fetch(`${AXIOM.API_URL}/update-sanitized-graph`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: AXIOM.currentSessionId,
                    step_index: stepIndex,
                    sanitized_mermaid: code
                })
            }).catch(e => console.warn('[SANITIZE] Failed to send sanitized graph to backend:', e));
        }
        
        // Log for ML training
        AXIOM.api.logGraphToServer(code, simId, stepIndex, wasRepaired);

        // Attach interactions (no delay - setupZoomPan handles dimension waiting internally)
        const svg = graphDiv.querySelector('svg');
        if (svg) {
            console.log(`🎨 Attaching interactions to SVG`);
            AXIOM.interactions.setupZoomPan(wrapper, graphDiv);
            console.log(`📍 Setting up node click handlers (${svg.querySelectorAll('.node').length} nodes found)`);
            AXIOM.interactions.setupNodeClicks(svg, wrapper);
            AXIOM.interactions.attachNodePhysics(wrapper);
        } else {
            console.warn(`⚠️ No SVG found in graphDiv after render, revealing anyway`);
            graphDiv.style.opacity = '1';
            if (graphDiv.dataset.safetyTimer) {
                clearTimeout(Number(graphDiv.dataset.safetyTimer));
            }
        }
    }
    
    // =========================================================================
    // MAIN: fixMermaid
    // =========================================================================
    
    async function fixMermaid(container, simId = null, stepIndex = null) {
        console.group(`🔧 [RENDERER] fixMermaid() - simId=${simId}, step=${stepIndex}`);

        if (!container) {
            console.error("❌ No container provided to fixMermaid");
            console.groupEnd();
            return;
        }

        const codes = container.querySelectorAll('pre code');
        console.log(`📦 Found ${codes.length} code blocks in container`);

        let blockIndex = 0;
        for (const codeBlock of codes) {
            console.log(`\n🔍 Checking code block ${++blockIndex}/${codes.length}`);

            const rawGraph = codeBlock.textContent;
            const isMermaid = codeBlock.classList.contains('language-mermaid') ||
                rawGraph.includes('graph TD') || rawGraph.includes('graph LR') ||
                rawGraph.includes('flowchart') ||
                rawGraph.includes('sequenceDiagram');

            console.log(`  Is Mermaid: ${isMermaid}`);
            if (!isMermaid) {
                console.log(`  ⏭️  Skipping non-Mermaid block`);
                continue;
            }

            console.log(`📊 RAW MERMAID (before sanitizer):`);
            console.log(`  Length: ${rawGraph.length}`);
            console.log(`  Has newlines: ${rawGraph.includes('\n')}`);
            console.log(`  Newline count: ${(rawGraph.match(/\n/g) || []).length}`);
            console.log(`  Preview:`, rawGraph.substring(0, 150));

            // 🔍 GHOST: Automatically capture and test in background
            console.log(`🔍 [GHOST] Checking if capture is available:`, {
                hasAPI: !!AXIOM.api,
                hasFunction: !!(AXIOM.api && AXIOM.api.ghostCaptureAndTest),
                simId,
                stepIndex,
                graphLength: rawGraph.length
            });
            
            if (AXIOM.api && AXIOM.api.ghostCaptureAndTest) {
                console.log(`🔍 [GHOST] ✅ Triggering automatic capture for step ${stepIndex}`);
                AXIOM.api.ghostCaptureAndTest(rawGraph, simId, stepIndex, null);
            } else {
                console.error(`❌ [GHOST] Capture function not available!`, {
                    AXIOM_exists: !!AXIOM,
                    api_exists: !!AXIOM.api,
                    ghostCapture_exists: !!(AXIOM.api && AXIOM.api.ghostCaptureAndTest)
                });
            }

            const preElement = codeBlock.parentElement;
            const sanitizedGraph = AXIOM.sanitizer.sanitizeMermaidString(rawGraph);

            console.log(`📊 SANITIZED MERMAID (after sanitizer):`);
            console.log(`  Length: ${sanitizedGraph.length}`);
            console.log(`  Has newlines: ${sanitizedGraph.includes('\n')}`);
            console.log(`  Newline count: ${(sanitizedGraph.match(/\n/g) || []).length}`);
            console.log(`  Preview:`, sanitizedGraph.substring(0, 150));
            
            // Create the wrapper structure
            console.log(`\n🎨 Creating wrapper and attempting render...`);
            const wrapper = createGraphWrapper(simId, stepIndex);
            const graphDiv = createGraphDiv(sanitizedGraph);

            wrapper.appendChild(createOverlay());
            wrapper.appendChild(graphDiv);
            preElement.replaceWith(wrapper);

            // Attempt initial render
            console.log(`⏳ Attempting initial render...`);
            const renderResult = await attemptRender(graphDiv, wrapper);

            if (renderResult.success) {
                console.log(`✅ Initial render SUCCESSFUL`);
                onRenderSuccess(wrapper, graphDiv, sanitizedGraph, simId, stepIndex, false);
            } else {
                console.error(`❌ Initial render FAILED: ${renderResult.error}`);
                console.log(`🔧 Triggering repair system...`);
                await AXIOM.repairSystem.startRepairProcess(wrapper, sanitizedGraph, renderResult.error, simId, stepIndex);
            }
        }

        console.groupEnd();
    }
    
    // =========================================================================
    // RENDER PLAYLIST STEP
    // =========================================================================
    
    // Helper function to render step analysis (NEW FORMAT - single object)
    function renderStepAnalysis(analysis) {
        console.log('[RENDERER] renderStepAnalysis:', { 
            hasAnalysis: !!analysis,
            isObject: typeof analysis === 'object' && !Array.isArray(analysis),
            keys: analysis ? Object.keys(analysis) : []
        });
        
        // Handle missing or invalid analysis
        if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
            console.warn('[RENDERER] Invalid step analysis format (expected single object, not array)');
            return '';
        }
        
        // Render single analysis object with new fields
        return `
            <div class="step-item">
                <div class="step-detail">
                    <div class="step-label">What Changed</div>
                    <div class="step-value">${analysis.what_changed || 'N/A'}</div>
                </div>
                <div class="step-detail">
                    <div class="step-label">Previous State</div>
                    <div class="step-value">${analysis.previous_state || 'N/A'}</div>
                </div>
                <div class="step-detail">
                    <div class="step-label">Current State</div>
                    <div class="step-value">${analysis.current_state || 'N/A'}</div>
                </div>
                <div class="step-detail">
                    <div class="step-label">Why It Matters</div>
                    <div class="step-value">${analysis.why_matters || 'N/A'}</div>
                </div>
            </div>
        `;
    }

    async function renderPlaylistStep(simId, index, targetElement = null) {
        const playlist = AXIOM.simulation.store[simId];
        if (!playlist || index < 0 || index >= playlist.length) return;

        AXIOM.simulation.state[simId] = index;

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
        <div class="simulation-container" data-sim-id="${simId}" data-step="${index}">
            <div class="simulation-header" style="border-left: 3px solid #bc13fe; padding-left: 10px; margin-bottom: 5px;">
                ${marked.parse(stepData.instruction)}
            </div>
            
            <div class="graph-frame" style="position: relative;">
                <pre><code class="language-mermaid">${AXIOM.escapeHtml(stepData.mermaid)}</code></pre>
                ${stepData.data_table ? `
                <div class="graph-data-overlay" data-sim-id="${simId}" data-step="${index}">
                    <div class="overlay-header">
                        <div class="overlay-title">📊 STATE</div>
                        <button class="overlay-toggle-btn" onclick="toggleGraphDataOverlay(this)">◀</button>
                    </div>
                    <div class="overlay-content">
                        ${stepData.data_table}
                    </div>
                </div>
                ` : ''}
                ${feedbackHtml}
            </div>
            
            <div class="sim-controls" style="display:flex; justify-content:space-between; margin-top:5px;">
                <div>
                    <button onclick="handleSimNav('${simId}', 'PREV', this)" ${prevDisabled} class="btn-sim">&lt; PREV</button>
                    <button onclick="handleSimNav('${simId}', 'RESET', this)" class="btn-sim reset-btn">⟲ RESET</button>
                </div>
                ${nextButtonHtml}
            </div>

            <div class="step-summary-wrapper">
                <button class="summary-toggle" onclick="toggleStepSummary(this)">
                    <span class="toggle-icon">▶</span>
                    <span class="toggle-text">Step-by-Step Analysis</span>
                </button>
                <div class="summary-content" style="display: none;">
                    ${stepData.step_analysis ? renderStepAnalysis(stepData.step_analysis) : '<p style="padding:20px;color:#94A3B8;">No step analysis available for this simulation.</p>'}
                </div>
            </div>
        </div>`;
        
        if (!targetElement && AXIOM.state.lastBotMessageDiv) {
            targetElement = AXIOM.state.lastBotMessageDiv.querySelector('.msg-body');
        }

        if (targetElement) {
            targetElement.innerHTML = htmlContent;
            
            // THIS IS THE CRITICAL FIX - pass simId and index!
            await fixMermaid(targetElement, simId, index);
            
            // NOTE: Old floating panel disabled - using new graph-data-overlay instead
            // if (AXIOM.interactions && AXIOM.interactions.createOrUpdateFloatingPanel && stepData.data_table) {
            //     console.log('[RENDERER] Creating floating panel:', { simId, index, hasDataTable: !!stepData.data_table });
            //     AXIOM.interactions.createOrUpdateFloatingPanel(simId, index, stepData.data_table);
            // }
            
            targetElement.style.opacity = '1';
            
            if (targetElement.closest('.msg.model') === AXIOM.state.lastBotMessageDiv && index === 0) {
                AXIOM.state.lastBotMessageDiv.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
    }
    
    // =========================================================================
    // EXPORT
    // =========================================================================
    
    AXIOM.renderer = {
        createGraphWrapper,
        createGraphDiv,
        createOverlay,
        attemptRender,
        onRenderSuccess,
        fixMermaid,
        renderPlaylistStep
    };
    
    console.log('✅ AXIOM Renderer loaded');
})();