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
    
    // =========================================================================
    // RENDER ATTEMPT WITH TIMEOUT
    // =========================================================================
    
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
    
    // =========================================================================
    // SUCCESS HANDLER
    // =========================================================================
    
    function onRenderSuccess(wrapper, graphDiv, code, simId, stepIndex, wasRepaired = false) {
        // Track validation
        if (simId && stepIndex !== null) {
            const key = `${simId}_${stepIndex}`;
            AXIOM.simulation.validatedSteps.add(key);
            AXIOM.simulation.lastWorkingMermaid[simId] = code;
            
            console.log(`✅ [VALIDATE] Step ${stepIndex} validated for ${simId}`);
            
            const playlist = AXIOM.simulation.store[simId];
            if (playlist && playlist[stepIndex]?.is_final) {
                AXIOM.api.confirmSimulationComplete(simId);
            }
        }
        
        // Log for ML training
        AXIOM.api.logGraphToServer(code, simId, stepIndex, wasRepaired);
        
        // Attach interactions
        setTimeout(() => {
            const svg = graphDiv.querySelector('svg');
            if (svg) {
                svg.style.width = "100%";
                svg.style.height = "100%";
                svg.style.maxWidth = "none";
                AXIOM.interactions.setupZoomPan(wrapper, graphDiv);
                AXIOM.interactions.setupNodeClicks(svg, wrapper);
                AXIOM.interactions.attachNodePhysics(wrapper);
            }
        }, 200);
    }
    
    // =========================================================================
    // MAIN: fixMermaid
    // =========================================================================
    
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
                console.log(`✅ [fixMermaid] Initial render successful`);
                onRenderSuccess(wrapper, graphDiv, sanitizedGraph, simId, stepIndex, false);
            } else {
                console.log(`❌ [fixMermaid] Initial render failed: ${renderResult.error}`);
                await AXIOM.repairSystem.startRepairProcess(wrapper, sanitizedGraph, renderResult.error, simId, stepIndex);
            }
        }
    }
    
    // =========================================================================
    // RENDER PLAYLIST STEP
    // =========================================================================
    
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
        
        if (!targetElement && AXIOM.state.lastBotMessageDiv) {
            targetElement = AXIOM.state.lastBotMessageDiv.querySelector('.msg-body');
        }

        if (targetElement) {
            targetElement.innerHTML = htmlContent;
            
            // THIS IS THE CRITICAL FIX - pass simId and index!
            await fixMermaid(targetElement, simId, index);
            
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