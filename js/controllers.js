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
            if (window.simulationPlaylist.length > 0) {
                AXIOM.renderer.renderPlaylistStep(AXIOM.simulation.currentStepIndex - 1);
                return;
            }
        }
        
        const prompt = `Elaborate on the element "${cleanId}" in the context of the current diagram. Keep it concise.`;
        AXIOM.state.isSimulationUpdate = false;
        AXIOM.ui.appendMessage('user', `System Command: Inspect "${cleanId}"`);
        AXIOM.elements.userInput.value = prompt;
        AXIOM.sendMessage();
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
                            font-family: 'JetBrains Mono', monospace; 
                            color: #00f3ff; 
                            font-weight: bold; 
                            text-shadow: 0 0 10px rgba(0, 243, 255, 0.8);
                            letter-spacing: 1px;
                        ">EXPANDING SIMULATION...</span>
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
    // EXPORT (also expose globally for onclick handlers)
    // =========================================================================
    
    AXIOM.controllers = {
        mermaidNodeClick,
        handleSimNav
    };
    
    // Global exposure for onclick handlers in HTML
    window.mermaidNodeClick = mermaidNodeClick;
    window.handleSimNav = handleSimNav;
    
    console.log('✅ AXIOM Controllers loaded');
})();