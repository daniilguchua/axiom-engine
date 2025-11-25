// js/api.js
/**
 * AXIOM Engine - API Communication
 * All fetch calls to the backend server.
 * Now with difficulty parameter support!
 */

(function() {
    const API_URL = AXIOM.API_URL;
    
    // --- Feedback ---
    
    async function sendFeedback(rating, btnElement) {
        // 1. Visual Feedback (Instant)
        const parent = btnElement.parentElement;
        parent.innerHTML = rating === 1 ? 
            `<span style="color:#00ff9f; font-weight:bold; font-size:1.2rem;">âœ“</span>` : 
            `<span style="color:#ff003c; font-weight:bold; font-size:1.2rem;">âœ•</span>`;

        // 2. Send to Server
        try {
            await fetch(`${API_URL}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating: rating,
                    session_id: AXIOM.currentSessionId
                })
            });
        } catch (e) {
            console.error('[AXIOM:API] Vote failed:', e);
        }
    }
    
    // --- Repair Server Communication ---
    
    /**
     * TIER 1: Call Python-only quick-fix endpoint (fast, free)
     */
    async function callQuickFix(code, error, stepIndex, simId) {
        const startTime = Date.now();
        
        try {
            const response = await fetch(`${API_URL}/quick-fix`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000),  // 10 second timeout (fast!)
                body: JSON.stringify({
                    code: code,
                    error: error,
                    step_index: stepIndex,
                    sim_id: simId,
                    session_id: AXIOM.currentSessionId
                })
            });
            
            if (!response.ok) {
                return { success: false, error: `Server error ${response.status}` };
            }
            
            const data = await response.json();
            
            return {
                success: true,
                fixedCode: data.fixed_code,
                tier: data.tier,
                tierName: data.tier_name,
                changed: data.changed,
                durationMs: data.duration_ms
            };
            
        } catch (error) {
            console.error('[AXIOM:API] Quick-fix failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Report the result of a repair tier attempt to the server for tracking
     */
    async function reportTierResult(params) {
        try {
            await fetch(`${API_URL}/repair-tier-result`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: AXIOM.currentSessionId,
                    sim_id: params.simId || '',
                    step_index: params.stepIndex || 0,
                    tier: params.tier,
                    tier_name: params.tierName,
                    attempt_number: params.attemptNumber || 1,
                    input_code: params.inputCode || '',
                    output_code: params.outputCode || '',
                    error_before: params.errorBefore || '',
                    error_after: params.errorAfter || null,
                    was_successful: params.wasSuccessful,
                    duration_ms: params.durationMs || 0
                })
            });
        } catch (e) {
            console.warn('[AXIOM:API] Failed to report tier result:', e);
        }
    }

    /**
     * TIER 3: Call LLM repair endpoint (slow, costs $)
     * Now returns tier info and sanitized flag
     */
    async function callRepairServer(code, error, context, stepIndex, attemptNumber, previousWorking, simId) {
        const startTime = Date.now();
        
        // First, verify the server is reachable
        try {
            const healthCheck = await fetch(`${API_URL}/health`, { 
                method: 'GET',
                signal: AbortSignal.timeout(90000)
            });
            if (!healthCheck.ok) {
                return { success: false, error: 'Server health check failed' };
            }
        } catch (e) {
            console.error('[AXIOM:API] Server unreachable:', e);
            return { success: false, error: `Server unreachable: ${e.message}` };
        }
        
        // Now make the actual repair request
        try {

            const response = await fetch(`${API_URL}/repair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(100000),
                body: JSON.stringify({
                    code: code,
                    error: error,
                    context: context,
                    step_index: stepIndex,
                    attempt_number: attemptNumber,
                    previous_working: previousWorking,
                    sim_id: simId || '',
                    session_id: AXIOM.currentSessionId
                })
            });
            
            const elapsed = Date.now() - startTime;

            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                return { success: false, error: `Server error ${response.status}: ${errorText}` };
            }
            
            const data = await response.json();
            
            if (data.error) {
                return { success: false, error: data.error };
            }
            
            if (!data.fixed_code || data.fixed_code.trim().length === 0) {
                return { success: false, error: 'Server returned empty fix' };
            }
            
            return { 
                success: true, 
                fixedCode: data.fixed_code,
                method: data.method,
                tier: data.tier || 3,
                tierName: data.tier_name || 'TIER3_LLM_PYTHON',
                sanitized: data.sanitized || false,
                durationMs: elapsed
            };
            
        } catch (error) {
            console.error('[AXIOM:API] Repair request failed:', error);
            return { success: false, error: `Request failed: ${error.message}` };
        }
    }
    
    // --- Simulation Confirmation ---
    
    async function confirmSimulationComplete(simId) {
        const playlist = AXIOM.simulation.store[simId];
        if (!playlist || playlist.length === 0) {
            console.warn('[AXIOM:API] No playlist to confirm');
            return;
        }
        
        const lastStep = playlist[playlist.length - 1];
        if (!lastStep.is_final) {
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/confirm-complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: AXIOM.currentSessionId,
                    sim_id: simId,
                    step_count: playlist.length,
                    steps: playlist
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'cached') {
                AXIOM.ui.showToast('✓ Simulation saved to cache');
            }
        } catch (err) {
            console.error('[AXIOM:API] Failed to confirm simulation:', err);
        }
    }
    
    // --- Failure Reporting ---
    
    function reportFailureToServer(simId, stepIndex, code, error) {
        if (!simId) return;
        
        fetch(`${API_URL}/repair-failed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: AXIOM.currentSessionId,
                sim_id: simId,
                step_index: stepIndex,
                broken_code: code,
                final_error: error
            })
        }).catch(e => console.error('[AXIOM:API] Failed to report:', e));
    }
    
    // --- Repair Success Notification ---
    
    async function notifyRepairSuccess(simId, stepIndex) {
        try {
            await fetch(`${API_URL}/repair-success`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: AXIOM.currentSessionId,
                    sim_id: simId,
                    step_index: stepIndex
                })
            });
        } catch (e) {
            console.warn('[AXIOM:API] Failed to notify repair success:', e);
        }
    }
    
    // --- Graph Logging (ML Training Data) ---
    
    function logGraphToServer(code, simId, stepIndex, wasRepaired) {
        const context = simId && AXIOM.simulation.store[simId]?.[stepIndex]?.instruction || "Unknown";
        
        fetch(`${API_URL}/log-graph`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mermaid_code: code,
                context: context,
                source: wasRepaired ? "repair_success" : "direct_render",
                was_repaired: wasRepaired,
                session_id: AXIOM.currentSessionId
            })
        }).catch(() => {}); // Silent fail - non-critical
    }
    
    // --- Prompt Enhancement ---
    
    async function enhancePrompt(text) {
        const response = await fetch(`${API_URL}/enhance-prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        return await response.json();
    }
    
    // --- File Upload ---
    
    async function uploadFile(file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('session_id', AXIOM.currentSessionId);
        
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: fd
        });
        return await response.json();
    }
    
    // --- Session Reset ---
    
    async function resetSession() {
        if (AXIOM.currentSessionId) {

            try {
                await fetch(`${API_URL}/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: AXIOM.currentSessionId })
                });
            } catch (err) {
                console.error('[AXIOM:API] Reset failed:', err);
            }
        }
    }
    
    // --- Chat (Streaming) - Now With Difficulty Parameter ---
    
    async function sendChatMessage(text, difficulty = 'engineer') {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: text,
                session_id: AXIOM.currentSessionId,
                difficulty: difficulty  // NEW: Include difficulty level
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
        }
        
        return fullText;
    }
    
    // --- Difficulty Info ---
    
    async function getDifficultyInfo() {
        try {
            const response = await fetch(`${API_URL}/difficulty-info`, {
                method: 'GET'
            });
            return await response.json();
        } catch (e) {
            console.error('[AXIOM:API] Failed to get difficulty info:', e);
            return null;
        }
    }
    
    // --- Ghost Repair System - Automatic Testing ---

    /**
     * Automatically capture and test raw mermaid through all 5 pipelines.
     * This runs in the background and doesn't block rendering.
     */
    async function ghostCaptureAndTest(rawMermaid, simId = null, stepIndex = null, userPrompt = null) {
        // Don't block the main flow - run in background
        setTimeout(async () => {
            try {
                // Step 1: Capture raw and get pipeline versions
                const captureResponse = await fetch(`${API_URL}/debug/capture-raw`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        raw_mermaid: rawMermaid,
                        session_id: AXIOM.currentSessionId || 'unknown',
                        sim_id: simId,
                        step_index: stepIndex,
                        prompt: userPrompt
                    })
                });

                if (!captureResponse.ok) {
                    const errorText = await captureResponse.text();
                    console.error(`[AXIOM:GHOST] Capture failed: ${captureResponse.status}`, errorText);
                    throw new Error(`Capture failed: ${captureResponse.status}`);
                }

                const captureData = await captureResponse.json();

                if (!captureData.success) {
                    throw new Error(captureData.error || 'Capture failed');
                }

                // Step 2: Apply transformations for each pipeline
                const pipelineCode = {
                    raw: rawMermaid,
                    python: captureData.pipelines.python,  // Already sanitized by server
                    mermaidjs: AXIOM.sanitizer ? AXIOM.sanitizer.sanitizeMermaidString(rawMermaid) : rawMermaid,
                    python_then_js: AXIOM.sanitizer ? AXIOM.sanitizer.sanitizeMermaidString(captureData.pipelines.python) : captureData.pipelines.python,
                    js_then_python: rawMermaid  // Will apply JS first, then we need Python (simplified: just raw for now)
                };

                // For JS→Python pipeline, apply JS sanitizer first
                if (AXIOM.sanitizer) {
                    const jsSanitized = AXIOM.sanitizer.sanitizeMermaidString(rawMermaid);
                    // We'd need to send this back to server for Python sanitization, but for now use JS-only
                    pipelineCode.js_then_python = jsSanitized;
                }

                // Step 3: Test each pipeline
                const testResults = {};
                const pipelines = ['raw', 'python', 'mermaidjs', 'python_then_js', 'js_then_python'];

                for (const pipeline of pipelines) {
                    const code = pipelineCode[pipeline];
                    const result = await testMermaidRendering(code, pipeline);
                    testResults[pipeline] = result;
                }

                // Step 3: Log to database
                await fetch(`${API_URL}/debug/log-test-results`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        raw_mermaid: rawMermaid,
                        session_id: AXIOM.currentSessionId || 'unknown',
                        sim_id: simId,
                        step_index: stepIndex,
                        prompt: userPrompt,
                        test_results: testResults
                    })
                });

            } catch (error) {
                console.warn('[AXIOM:GHOST] Background testing failed (non-critical):', error);
                // Don't throw - this is background testing and shouldn't break the app
            }
        }, 100); // Small delay to not block rendering
    }

    /**
     * Test if a mermaid code string renders successfully.
     * Returns: { output, error, rendered }
     */
    async function testMermaidRendering(code, pipelineName) {
        return new Promise((resolve) => {
            try {
                // Create invisible test div
                const testDiv = document.createElement('div');
                testDiv.className = 'mermaid';
                testDiv.style.display = 'none';
                testDiv.textContent = code;
                document.body.appendChild(testDiv);

                // Try to render
                mermaid.run({ nodes: [testDiv] })
                    .then(() => {
                        document.body.removeChild(testDiv);
                        resolve({
                            output: code,
                            error: null,
                            rendered: true
                        });
                    })
                    .catch((error) => {
                        document.body.removeChild(testDiv);
                        resolve({
                            output: code,
                            error: error.message || 'Render failed',
                            rendered: false
                        });
                    });
            } catch (error) {
                resolve({
                    output: code,
                    error: error.message || 'Test setup failed',
                    rendered: false
                });
            }
        });
    }

    // --- Input Data Re-Simulation ---

    async function reSimulateWithEditedInput(editedInputData, comment, simId) {
        /**
         * Trigger re-simulation with edited input data.
         * Updates the existing message in-place instead of creating a new one.
         */
        try {
            const prompt = `REGENERATE_SIMULATION_WITH_NEW_INPUT: ${JSON.stringify(editedInputData)}${comment ? '\nUser comment: ' + comment : ''}`;
            const difficulty = AXIOM.difficulty ? AXIOM.difficulty.current : 'engineer';

            // Find the existing simulation message and set update mode
            const badge = document.getElementById(`badge-${simId}`);
            const existingMsg = badge ? badge.closest('.msg.model') : AXIOM.state.lastBotMessageDiv;

            if (existingMsg) {
                AXIOM.state.isSimulationUpdate = true;
                AXIOM.state.lastBotMessageDiv = existingMsg;

                // Show loading state in existing message
                const msgBody = existingMsg.querySelector('.msg-body');
                if (msgBody) {
                    const diffLevel = AXIOM.difficulty.levels[difficulty];
                    msgBody.innerHTML = `
                    <div class="axiom-loader">
                        <div class="loader-spinner"></div>
                        <div class="loader-content">
                            <div class="loader-text">RECALCULATING UNIVERSE...</div>
                            <div class="loader-difficulty">${diffLevel.icon} ${diffLevel.name} Mode</div>
                            <div class="loader-bar-bg"><div class="loader-bar-fill"></div></div>
                        </div>
                    </div>`;
                }
            }

            await AXIOM.sendMessageWithDifficulty(prompt, difficulty);

        } catch (error) {
            console.error('[AXIOM:API] Re-simulation failed:', error);
            AXIOM.ui.showToast('❌ Re-simulation failed: ' + error.message);
            throw error;
        }
    }

    // --- Export ---

    async function clearAllPendingRepairs() {
        try {
            const response = await fetch(`${API_URL}/clear-pending-repairs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[AXIOM:API] Clear pending repairs failed:', error);
            throw error;
        }
    }

    AXIOM.api = {
        sendFeedback,
        callQuickFix,
        reportTierResult,
        callRepairServer,
        confirmSimulationComplete,
        reportFailureToServer,
        notifyRepairSuccess,
        logGraphToServer,
        enhancePrompt,
        uploadFile,
        resetSession,
        sendChatMessage,
        getDifficultyInfo,
        ghostCaptureAndTest,
        testMermaidRendering,
        clearAllPendingRepairs,
        reSimulateWithEditedInput
    };
    

})();