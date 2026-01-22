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
            `<span style="color:#00ff9f; font-weight:bold; font-size:1.2rem;">✓</span>` : 
            `<span style="color:#ff003c; font-weight:bold; font-size:1.2rem;">✕</span>`;

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
    
    async function callRepairServer(code, error, context, stepIndex, attemptNumber, previousWorking) {
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
            console.error(`📡 [REPAIR] Server unreachable:`, e);
            return { success: false, error: `Server unreachable: ${e.message}` };
        }
        
        // Now make the actual repair request
        try {
            console.log(`📡 [REPAIR] Sending repair request...`);
            
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
                    session_id: AXIOM.currentSessionId
                })
            });
            
            const elapsed = Date.now() - startTime;
            console.log(`📡 [REPAIR] Response received in ${elapsed}ms, status: ${response.status}`);
            
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
                durationMs: elapsed
            };
            
        } catch (error) {
            console.error(`📡 [REPAIR] Request failed:`, error);
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
        
        console.log(`✅ Confirming simulation complete: ${simId} (${playlist.length} steps)`);
        
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
                console.log(`💾 Simulation cached successfully: ${data.prompt}`);
                AXIOM.ui.showToast('✓ Simulation saved to cache');
            } else if (data.status === 'skipped') {
                console.log(`⏭️ Cache skipped: ${data.reason}`);
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
            console.log("💀 TERMINATING SESSION...");
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
    // EXPORT
    // =========================================================================
    
    AXIOM.api = {
        sendFeedback,
        callRepairServer,
        confirmSimulationComplete,
        reportFailureToServer,
        notifyRepairSuccess,
        logGraphToServer,
        enhancePrompt,
        uploadFile,
        resetSession,
        sendChatMessage,
        getDifficultyInfo
    };
    
    console.log('✅ AXIOM API loaded');
})();