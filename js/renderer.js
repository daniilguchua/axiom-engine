// js/renderer.js
/**
 * AXIOM Engine - Mermaid Rendering
 * fixMermaid, renderPlaylistStep, and related rendering functions.
 */

(function() {
    const { RepairConfig } = AXIOM;
    
    // =========================================================================
    // INPUT DATA BADGE RENDERING
    // =========================================================================
    
    function formatInputDataBadge(inputData) {
        if (!inputData) return '';
        
        const { type, label, value } = inputData;
        let displayText = '';
        
        switch(type) {
            case 'array':
                {
                    const arr = Array.isArray(value) ? value : [];
                    const maxShow = 5;
                    const display = arr.slice(0, maxShow).join(', ');
                    const suffix = arr.length > maxShow ? `... (${arr.length} total)` : '';
                    displayText = `📥 Array: [${display}${suffix}]`;
                }
                break;
            case 'tree':
                {
                    const arr = Array.isArray(value) ? value : [];
                    const maxShow = 5;
                    const display = arr.slice(0, maxShow).join(', ');
                    const suffix = arr.length > maxShow ? `... (${arr.length} total)` : '';
                    displayText = `🌳 Tree: Insert [${display}${suffix}]`;
                }
                break;
            case 'linkedlist':
                {
                    const arr = Array.isArray(value) ? value : [];
                    const maxShow = 5;
                    const display = arr.slice(0, maxShow).join(' → ');
                    const suffix = arr.length > maxShow ? ` → ...` : '';
                    displayText = `🔗 List: ${display}${suffix}`;
                }
                break;
            case 'graph':
                {
                    const nodes = value && typeof value === 'object' ? Object.keys(value) : [];
                    const nodeList = nodes.slice(0, 4).join(', ');
                    const suffix = nodes.length > 4 ? `, ...` : '';
                    displayText = `🗺️ Graph (${nodes.length} nodes): ${nodeList}${suffix}`;
                }
                break;
            case 'search':
                {
                    const arr = value.array || [];
                    const target = value.target;
                    displayText = `🔍 Search: [${arr.slice(0, 5).join(', ')}] → target: ${target}`;
                }
                break;
            case 'dp':
                {
                    displayText = `⚡ DP Problem`;
                }
                break;
            case 'hashtable':
                {
                    const keys = value.keys || [];
                    const tableSize = value.table_size || 7;
                    displayText = `#️⃣ Hash: [${keys.slice(0, 5).join(', ')}] (size: ${tableSize})`;
                }
                break;
            default:
                displayText = `📥 ${label || 'Input Data'}`;
        }
        
        return displayText;
    }
    
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
        const code = graphDiv.textContent;

        try {
            await new Promise(r => setTimeout(r, 50));

            const startTime = Date.now();

            // Race between render and timeout
            const result = await Promise.race([
                mermaid.run({ nodes: [graphDiv] }).then(() => {
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
            console.error(`[attemptRender] Render failed:`, errorMsg);
            return { success: false, error: errorMsg };
        }
    }
    
    // =========================================================================
    // SUCCESS HANDLER
    // =========================================================================
    
    function onRenderSuccess(wrapper, graphDiv, code, simId, stepIndex, wasRepaired = false) {
        // Track validation
        if (simId && stepIndex !== null) {
            const key = `${simId}_${stepIndex}`;
            AXIOM.simulation.validatedSteps.add(key);
            AXIOM.simulation.lastWorkingMermaid[simId] = code;

            const playlist = AXIOM.simulation.store[simId];
            if (playlist && playlist[stepIndex]?.is_final) {
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
            AXIOM.interactions.setupZoomPan(wrapper, graphDiv);
            AXIOM.interactions.setupNodeClicks(svg, wrapper);
            AXIOM.interactions.attachNodePhysics(wrapper);
        } else {
            console.warn(`No SVG found in graphDiv after render, revealing anyway`);
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
        if (!container) {
            console.error("No container provided to fixMermaid");
            return;
        }

        const codes = container.querySelectorAll('pre code');

        let blockIndex = 0;
        for (const codeBlock of codes) {
            blockIndex++;

            const rawGraph = codeBlock.textContent;
            const isMermaid = codeBlock.classList.contains('language-mermaid') ||
                rawGraph.includes('graph TD') || rawGraph.includes('graph LR') ||
                rawGraph.includes('flowchart') ||
                rawGraph.includes('sequenceDiagram');

            if (!isMermaid) {
                continue;
            }

            // GHOST: Automatically capture and test in background
            if (AXIOM.api && AXIOM.api.ghostCaptureAndTest) {
                AXIOM.api.ghostCaptureAndTest(rawGraph, simId, stepIndex, null);
            } else {
                console.error(`[GHOST] Capture function not available!`);
            }

            const preElement = codeBlock.parentElement;
            const sanitizedGraph = AXIOM.sanitizer.sanitizeMermaidString(rawGraph);

            // Create the wrapper structure
            const wrapper = createGraphWrapper(simId, stepIndex);
            const graphDiv = createGraphDiv(sanitizedGraph);

            wrapper.appendChild(createOverlay());
            wrapper.appendChild(graphDiv);
            preElement.replaceWith(wrapper);

            // Attempt initial render
            const renderResult = await attemptRender(graphDiv, wrapper);

            if (renderResult.success) {
                onRenderSuccess(wrapper, graphDiv, sanitizedGraph, simId, stepIndex, false);
            } else {
                console.error(`Initial render FAILED: ${renderResult.error}`);
                await AXIOM.repairSystem.startRepairProcess(wrapper, sanitizedGraph, renderResult.error, simId, stepIndex);
            }
        }
    }
    
    // =========================================================================
    // RENDER PLAYLIST STEP
    // =========================================================================
    
    // Helper function to render step analysis (NEW FORMAT - single object)
    function renderStepAnalysis(analysis) {
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
            // Create badge HTML string first (no listeners yet - will attach after DOM insertion)
            let badgeHtml = '';
            let inputDataForBadge = null;
            if (index === 0) {
                const inputData = AXIOM.simulation.inputData && AXIOM.simulation.inputData[simId];
                if (inputData) {
                    inputDataForBadge = inputData;
                    const badgeText = formatInputDataBadge(inputData);
                    badgeHtml = `
                        <div class="input-data-badge" id="badge-${simId}" style="
                            display: inline-block;
                            padding: 8px 12px;
                            background: rgba(188, 19, 254, 0.15);
                            border: 1px solid rgba(188, 19, 254, 0.4);
                            border-radius: 6px;
                            color: #bc13fe;
                            font-size: 0.9em;
                            font-weight: 600;
                            margin-bottom: 12px;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            font-family: 'JetBrains Mono', monospace;
                            user-select: none;
                        " title="Click to edit input data">
                            ${AXIOM.escapeHtml(badgeText)}
                        </div>
                    `;
                }
            }
            
            targetElement.innerHTML = badgeHtml + htmlContent;
            
            // NOW attach click handler to the badge AFTER it's in the DOM
            if (index === 0 && inputDataForBadge) {
                const badgeEl = targetElement.querySelector(`#badge-${simId}`);
                if (badgeEl) {
                    badgeEl.addEventListener('click', () => {
                        if (AXIOM.ui && AXIOM.ui.openInputDataEditor) {
                            AXIOM.ui.openInputDataEditor(inputDataForBadge, simId);
                        }
                    });
                    badgeEl.addEventListener('mouseover', () => {
                        badgeEl.style.background = 'rgba(188, 19, 254, 0.25)';
                        badgeEl.style.borderColor = 'rgba(188, 19, 254, 0.6)';
                    });
                    badgeEl.addEventListener('mouseout', () => {
                        badgeEl.style.background = 'rgba(188, 19, 254, 0.15)';
                        badgeEl.style.borderColor = 'rgba(188, 19, 254, 0.4)';
                    });
                }
            }
            
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
    
})();