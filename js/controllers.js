// js/controllers.js
/**
 * AXIOM Engine - Core Controllers
 * Handles node clicks and simulation navigation.
 */

(function() {
    
    // =========================================================================
    // MERMAID NODE CLICK HANDLER
    // =========================================================================
    
    function mermaidNodeClick(nodeId, wrapperElement) {
        if (!nodeId || AXIOM.state.isProcessing) return;
        const cleanId = nodeId.trim();
        console.log("Clicked Node:", cleanId);

        if (wrapperElement) {
            const parentMsg = wrapperElement.closest('.msg.model');
            if (parentMsg) {
                AXIOM.state.lastBotMessageDiv = parentMsg;
                console.log("🎯 Context Restored to Simulation Container via Node Click");
            }
        }

        const triggerSimulationUpdate = (msg) => {
            AXIOM.state.isProcessing = true;
            
            // Add visual feedback to the wrapper
            if (wrapperElement) {
                wrapperElement.style.opacity = '1';
                wrapperElement.style.pointerEvents = 'none';
                const hudContent = wrapperElement.querySelector('.hud-content');
                if (hudContent) hudContent.innerHTML = `<span style="color:var(--accent-cyan)">Processing Simulation Step...</span>`;
            }
            
            AXIOM.state.isSimulationUpdate = true;
            AXIOM.elements.userInput.value = msg;
            AXIOM.sendMessage();
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
            const nextIndex = AXIOM.simulation.currentStepIndex + 1;
            if (nextIndex < window.simulationPlaylist.length) {
                AXIOM.renderer.renderPlaylistStep(nextIndex);
                return;
            }
            triggerSimulationUpdate(`(Calculating Steps ${nextIndex}-${nextIndex + 2}...)`);
            
            const lastStepData = window.simulationPlaylist[AXIOM.simulation.currentStepIndex];
            const continuePrompt = `
COMMAND: CONTINUE_SIMULATION
CURRENT_STATE_CONTEXT:
- Last Step Index: ${lastStepData.step}
- Last Data Snapshot: ${lastStepData.data_table}
- Last Logic: ${lastStepData.instruction}
TASK: Generate NEXT 3 steps.`;
            AXIOM.sendMessage(continuePrompt);
            return;
        }
        
        if (cleanId === 'CMD_PREV') {
            if (wrapperElement) {
                const simId = wrapperElement.closest('[data-sim-id]')?.dataset.simId;
                if (simId) {
                    const stepIndex = (AXIOM.simulation.state?.[simId] ?? 0) - 1;
                    if (stepIndex >= 0) {
                        AXIOM.renderer.renderPlaylistStep(simId, stepIndex, wrapperElement.closest('.msg-body'));
                    }
                }
            }
            return;
        }
        
        // NEW: Node Inspection - Show tooltip with rich context
        let currentStep = null;
        
        if (wrapperElement) {
            // Extract simId from wrapper dataset
            const simId = wrapperElement.closest('[data-sim-id]')?.dataset.simId;
            const playlist = simId && AXIOM.simulation.store?.[simId];
            
            if (playlist && playlist.length > 0) {
                // Get the current step index for this simulation
                const stepIndex = AXIOM.simulation.state?.[simId] ?? playlist.length - 1;
                currentStep = playlist[Math.min(stepIndex, playlist.length - 1)];
                
                console.log(`📍 Node Click: simId=${simId}, stepIndex=${stepIndex}, nodeId=${cleanId}`);
            }
        }
        
        if (currentStep) {
            // Has step context - show tooltip with rich explanation
            showNodeInspectionTooltip(cleanId, wrapperElement, currentStep);
        } else {
            // Fallback to old behavior (only if no step data available)
            const prompt = `Elaborate on the element "${cleanId}" in the context of the current diagram. Keep it concise.`;
            AXIOM.state.isSimulationUpdate = false;
            AXIOM.ui.appendMessage('user', `System Command: Inspect "${cleanId}"`);
            AXIOM.elements.userInput.value = prompt;
            AXIOM.sendMessage();
        }
    }
    
    // =========================================================================
    // SIMULATION NAVIGATION HANDLER
    // =========================================================================
    
    function handleSimNav(simId, action, btnElement) {
        if (AXIOM.state.isProcessing) return;

        // 1. Find the Container relative to the button
        let targetContainer = null;
        if (btnElement) {
            const parentMsg = btnElement.closest('.msg.model');
            if (parentMsg) {
                targetContainer = parentMsg.querySelector('.msg-body');
            }
        }

        // 2. Get Data & Current Index
        const playlist = AXIOM.simulation.store[simId];
        if (!playlist) return;

        // Default to 0 if we haven't tracked this sim yet
        let currentIndex = AXIOM.simulation.state[simId] || 0;

        // 3. Logic
        if (action === 'PREV') {
            if (currentIndex > 0) {
                AXIOM.renderer.renderPlaylistStep(simId, currentIndex - 1, targetContainer);
            }
        }
        else if (action === 'RESET') {
            AXIOM.renderer.renderPlaylistStep(simId, 0, targetContainer);
        }
        else if (action === 'NEXT') {
            if (currentIndex + 1 < playlist.length) {
                AXIOM.renderer.renderPlaylistStep(simId, currentIndex + 1, targetContainer);
            }
        }
        else if (action === 'GENERATE_MORE') {
            const lastStepData = playlist[playlist.length - 1];
            AXIOM.simulation.activeSimId = simId;
            
            // Set Global Update Flag
            AXIOM.state.isSimulationUpdate = true;
            // Set Global Target
            if (targetContainer) {
                AXIOM.state.lastBotMessageDiv = targetContainer.closest('.msg.model');
            }

            if (targetContainer) {
                const graphFrame = targetContainer.querySelector('.graph-frame');
                const loadTarget = graphFrame || targetContainer;

                const loader = document.createElement('div');
                loader.className = 'generation-loader';

                loader.style.cssText = `
                    position: absolute; 
                    top: 0; left: 0; width: 100%; height: 100%; 
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(3px);
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    z-index: 100;
                    border-radius: 4px;
                `;
                
                loader.innerHTML = `
                    <div style="text-align:center;">
                        <div style="font-size: 24px; animation: spin 1s linear infinite; margin-bottom: 10px;">⟳</div>
                        <span style="
                            font-family: 'Inter', sans-serif;
                            color: var(--text-secondary, #B0B0C0);
                            font-weight: 500;
                            letter-spacing: 0.5px;
                        ">Expanding simulation...</span>
                    </div>
                `;
                
                if (getComputedStyle(loadTarget).position === 'static') {
                    loadTarget.style.position = 'relative';
                }
                
                loadTarget.appendChild(loader);
            }
            
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
            
            AXIOM.sendMessage(continuePrompt);
        }
    }
    
    // =========================================================================
    // NODE INSPECTION TOOLTIP SYSTEM
    // =========================================================================
    
    async function showNodeInspectionTooltip(nodeId, wrapperElement, currentStep) {
        let tooltip;
        try {
            // Create tooltip element
            tooltip = document.createElement('div');
            tooltip.className = 'node-tooltip';
            tooltip.innerHTML = `
                <div class="tooltip-header">
                    <span class="tooltip-title">🔍 ${nodeId}</span>
                    <button class="tooltip-close" title="Close">✕</button>
                </div>
                <div class="tooltip-body">
                    <div class="tooltip-loading">Analyzing...</div>
                </div>
            `;
            
            // Position and add to DOM
            if (wrapperElement) {
                wrapperElement.appendChild(tooltip);
                positionTooltip(tooltip, nodeId, wrapperElement);
            } else {
                document.body.appendChild(tooltip);
            }
            
            // Close button handler
            tooltip.querySelector('.tooltip-close').addEventListener('click', () => {
                tooltip.remove();
            });
            
            // Fetch explanation from backend
            const context = {
                node_id: nodeId,
                step_data: currentStep,
                difficulty: AXIOM.state.currentDifficulty || 'engineer'
            };
            
            console.log(`📍 Requesting node inspection for ${nodeId}...`);
            
            const response = await fetch('/node-inspect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(context)
            });
            
            if (response.ok) {
                const explanation = await response.text();
                tooltip.querySelector('.tooltip-body').innerHTML = explanation;
            } else {
                let errorMessage = 'Failed to generate explanation';
                try {
                    const error = await response.json();
                    errorMessage = error.error || errorMessage;
                } catch (parseErr) {
                    const text = await response.text();
                    if (text) errorMessage = text;
                }
                tooltip.querySelector('.tooltip-body').innerHTML = `
                    <div class="tooltip-error">
                        Error: ${errorMessage}
                    </div>
                `;
            }
            
            // Close on outside click
            const closeOutside = (e) => {
                if (!tooltip.contains(e.target) && e.target !== nodeId) {
                    tooltip.remove();
                    document.removeEventListener('click', closeOutside);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeOutside);
            }, 100);
            
        } catch (err) {
            console.error('Tooltip error:', err);
            if (tooltip && tooltip.querySelector('.tooltip-body')) {
                const body = tooltip.querySelector('.tooltip-body');
                body.innerHTML = `
                    <div class="tooltip-error">
                        Error: ${err?.message || 'Failed to generate explanation'}
                    </div>
                `;
            }
        }
    }
    
    function positionTooltip(tooltip, nodeId, wrapper) {
        try {
            // Find the clicked node in the SVG
            const svg = wrapper.querySelector('svg');
            if (!svg) return;
            
            // Try multiple ways to find the node
            let node = svg.querySelector(`#${nodeId}`);
            if (!node) {
                // Try finding by text content
                const nodes = svg.querySelectorAll('.node');
                node = Array.from(nodes).find(n => n.textContent.includes(nodeId));
            }
            
            if (!node) return;
            
            const nodeRect = node.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            
            // Initial position: right of node with some offset
            let left = nodeRect.right - wrapperRect.left + 15;
            let top = nodeRect.top - wrapperRect.top;
            
            // Adjust if tooltip goes off screen
            const tooltipWidth = 320; // max-width from CSS
            const tooltipHeight = 200; // estimated
            
            if (left + tooltipWidth > window.innerWidth) {
                // Move to left of node
                left = nodeRect.left - wrapperRect.left - tooltipWidth - 15;
            }
            
            if (top + tooltipHeight > window.innerHeight) {
                // Move up
                top = Math.max(10, nodeRect.bottom - wrapperRect.top - tooltipHeight);
            }
            
            tooltip.style.left = `${Math.max(10, left)}px`;
            tooltip.style.top = `${Math.max(10, top)}px`;
            
        } catch (err) {
            console.warn('Tooltip positioning error:', err);
        }
    }
    
    // =========================================================================
    // EXPORT (also expose globally for onclick handlers)
    // =========================================================================
    
    AXIOM.controllers = {
        mermaidNodeClick,
        handleSimNav,
        showNodeInspectionTooltip
    };
    
    // Global exposure for onclick handlers in HTML
    window.mermaidNodeClick = mermaidNodeClick;
    window.handleSimNav = handleSimNav;
    
    console.log('✅ AXIOM Controllers loaded');
})();