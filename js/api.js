// js/api.js
/**
 * AXIOM Engine - API Communication
 * All fetch calls to the backend server.
 * Now with difficulty parameter support!
 */

(function() {
    const API_URL = AXIOM.API_URL;
    
    // =========================================================================
    // FEEDBACK
    // =========================================================================
    
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
            console.log("Feedback sent:", rating);
        } catch (e) {
            console.error("Vote failed", e);
        }
    }
    
    // =========================================================================
    // REPAIR SERVER COMMUNICATION
    // =========================================================================
    
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
            console.error(`[QUICK-FIX] Failed:`, error);
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
            console.warn('[REPAIR] Failed to report tier result:', e);
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
            console.error(`ðŸ“¡ [REPAIR] Server unreachable:`, e);
            return { success: false, error: `Server unreachable: ${e.message}` };
        }
        
        // Now make the actual repair request
        try {
            console.log(`ðŸ“¡ [REPAIR] Sending repair request...`);
            
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
            console.log(`ðŸ“¡ [REPAIR] Response received in ${elapsed}ms, status: ${response.status}`);
            
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
            console.error(`ðŸ“¡ [REPAIR] Request failed:`, error);
            return { success: false, error: `Request failed: ${error.message}` };
        }
    }
    
    // =========================================================================
    // SIMULATION CONFIRMATION
    // =========================================================================
    
    async function confirmSimulationComplete(simId) {
        const playlist = AXIOM.simulation.store[simId];
        if (!playlist || playlist.length === 0) {
            console.warn("No playlist to confirm");
            return;
        }
        
        const lastStep = playlist[playlist.length - 1];
        if (!lastStep.is_final) {
            console.log("Simulation not final, skipping confirmation");
            return;
        }
        
        console.log(`âœ… Confirming simulation complete: ${simId} (${playlist.length} steps)`);
        
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
                console.log(`ðŸ’¾ Simulation cached successfully: ${data.prompt}`);
                AXIOM.ui.showToast('âœ“ Simulation saved to cache');
            } else if (data.status === 'skipped') {
                console.log(`â­ï¸ Cache skipped: ${data.reason}`);
            } else {
                console.warn('Cache response:', data);
            }
        } catch (err) {
            console.error('Failed to confirm simulation:', err);
        }
    }
    
    // =========================================================================
    // FAILURE REPORTING
    // =========================================================================
    
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
        }).catch(e => console.error('Failed to report:', e));
    }
    
    // =========================================================================
    // REPAIR SUCCESS NOTIFICATION
    // =========================================================================
    
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
            console.warn('Failed to notify repair success:', e);
        }
    }
    
    // =========================================================================
    // GRAPH LOGGING (ML Training Data)
    // =========================================================================
    
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
    
    // =========================================================================
    // PROMPT ENHANCEMENT
    // =========================================================================
    
    async function enhancePrompt(text) {
        const response = await fetch(`${API_URL}/enhance-prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        return await response.json();
    }
    
    // =========================================================================
    // FILE UPLOAD
    // =========================================================================
    
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
    
    // =========================================================================
    // SESSION RESET
    // =========================================================================
    
    async function resetSession() {
        if (AXIOM.currentSessionId) {
            console.log("ðŸ’€ TERMINATING SESSION...");
            try {
                await fetch(`${API_URL}/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: AXIOM.currentSessionId })
                });
            } catch (err) {
                console.error("Reset Failed:", err);
            }
        }
    }
    
    // =========================================================================
    // CHAT (Streaming) - NOW WITH DIFFICULTY PARAMETER
    // =========================================================================
    
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
    
    // =========================================================================
    // DIFFICULTY INFO
    // =========================================================================
    
    async function getDifficultyInfo() {
        try {
            const response = await fetch(`${API_URL}/difficulty-info`, {
                method: 'GET'
            });
            return await response.json();
        } catch (e) {
            console.error('Failed to get difficulty info:', e);
            return null;
        }
    }
    
    // =========================================================================
    // GHOST REPAIR SYSTEM - Automatic Testing
    // =========================================================================

    /**
     * Automatically capture and test raw mermaid through all 5 pipelines.
     * This runs in the background and doesn't block rendering.
     */
    async function ghostCaptureAndTest(rawMermaid, simId = null, stepIndex = null, userPrompt = null) {
        // Don't block the main flow - run in background
        setTimeout(async () => {
            try {
                console.log(`🔍 [GHOST] Starting automatic capture for ${rawMermaid.length} chars`);

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
                    throw new Error(`Capture failed: ${captureResponse.status}`);
                }

                const captureData = await captureResponse.json();

                if (!captureData.success) {
                    throw new Error(captureData.error || 'Capture failed');
                }

                console.log(`✅ [GHOST] Captured raw output, testing through 5 pipelines...`);

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

                console.log(`📊 [GHOST] Pipeline transformations applied:`, {
                    raw_length: pipelineCode.raw.length,
                    python_length: pipelineCode.python.length,
                    mermaidjs_length: pipelineCode.mermaidjs.length,
                    python_then_js_length: pipelineCode.python_then_js.length,
                    js_then_python_length: pipelineCode.js_then_python.length
                });

                // Step 3: Test each pipeline
                const testResults = {};
                const pipelines = ['raw', 'python', 'mermaidjs', 'python_then_js', 'js_then_python'];

                for (const pipeline of pipelines) {
                    const code = pipelineCode[pipeline];
                    const result = await testMermaidRendering(code, pipeline);
                    testResults[pipeline] = result;
                    console.log(`  ${pipeline}: ${result.rendered ? '✓ Success' : '✗ Failed'} ${result.error ? '(' + result.error + ')' : ''}`);
                }

                console.log(`📊 [GHOST] Test results:`, testResults);

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

                console.log(`✅ [GHOST] Test complete and logged to database`);

            } catch (error) {
                console.warn(`⚠️ [GHOST] Background testing failed (non-critical):`, error);
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

    // =========================================================================
    // EXPORT
    // =========================================================================

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
        testMermaidRendering
    };
    
    console.log('âœ… AXIOM API loaded');
})();