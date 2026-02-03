// js/ui.js
/**
 * AXIOM Engine - UI Helpers
 * Message rendering, toasts, mode transitions.
 * FIX: Removed duplicate event listeners causing the difficulty loop.
 */

(function() {
    
    // =========================================================================
    // MESSAGE RENDERING
    // =========================================================================
    
    function appendMessage(role, text) {
        const historyDiv = AXIOM.elements.historyDiv;
        
        const div = document.createElement('div');
        div.className = `msg ${role}`;
        const content = document.createElement('div');
        content.className = 'content';
        
        if (role === 'model') {
            content.innerHTML = `
                <div class="msg-header"><span>AXIOM // SYSTEM</span></div>
                <div class="msg-body"><span class="stream-text">${marked.parse(text)}</span></div>
            `;
        } else {
            content.innerHTML = marked.parse(text);
        }
        
        div.appendChild(content);
        historyDiv.appendChild(div);
        historyDiv.scrollTop = historyDiv.scrollHeight;
        
        if (role === 'model') return content.querySelector('.stream-text');
        return content;
    }
    
    // =========================================================================
    // TOAST NOTIFICATIONS
    // =========================================================================
    
    function showToast(msg) {
        let toast = document.getElementById('ghost-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ghost-toast';
            Object.assign(toast.style, {
                position: 'fixed',
                bottom: '100px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(139, 92, 246, 0.2)',
                color: '#fff',
                border: '1px solid var(--accent)',
                padding: '12px 24px',
                borderRadius: '8px',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                zIndex: '10000',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 0 30px rgba(139, 92, 246, 0.3)',
                transition: 'all 0.3s ease',
                opacity: '0'
            });
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
        }, 2000);
    }
    
    // =========================================================================
    // NEURAL CANVAS PROCESSING EFFECTS
    // =========================================================================
    
    function startProcessingEffects() {
        if (window.neuralCanvas) {
            window.neuralCanvas.setProcessingMode(1);
            // Periodic wave pulses during processing
            window._processingInterval = setInterval(() => {
                if (window.neuralCanvas) {
                    window.neuralCanvas.wavePulse();
                }
            }, 1500);
        }
    }
    
    function stopProcessingEffects(success = true) {
        if (window._processingInterval) {
            clearInterval(window._processingInterval);
            window._processingInterval = null;
        }
        if (window.neuralCanvas) {
            window.neuralCanvas.setProcessingMode(0);
            if (success) {
                window.neuralCanvas.celebrate();
            }
        }
    }
    
    // =========================================================================
    // MODE TRANSITIONS
    // =========================================================================
    
    function activateChatMode(initialMsg) {
        const { lobbyPanel, container, disconnectBtn, chatPanel, statusText, statusDot } = AXIOM.elements;
        
        AXIOM.state.appMode = 'CHAT';
        lobbyPanel.style.opacity = '0';
        lobbyPanel.style.pointerEvents = 'none';
        
        setTimeout(() => {
            lobbyPanel.classList.add('hidden');
            container.classList.add('mode-focus');
            disconnectBtn.style.display = 'block';
            chatPanel.style.display = 'flex';
            setTimeout(() => { chatPanel.style.opacity = '1'; }, 50);
        }, 500);
        
        statusText.innerText = "ENGINE ONLINE";
        statusDot.classList.add('active');
        
        setTimeout(() => {
            if (initialMsg) {
                appendMessage('model', `### CONTEXT LOADED\n${initialMsg}`);
            } else {
                // Safe check for difficulty level
                let diffName = "ENGINEER";
                let diffIcon = "⚙️";
                if (AXIOM.difficulty && AXIOM.difficulty.current && AXIOM.difficulty.levels[AXIOM.difficulty.current]) {
                    diffName = AXIOM.difficulty.levels[AXIOM.difficulty.current].name;
                    diffIcon = AXIOM.difficulty.levels[AXIOM.difficulty.current].icon;
                }
                
                appendMessage('model', `### AXIOM ENGINE v1.3\n**Ready for input.** Mode: ${diffIcon} ${diffName}\n\nDefine simulation parameters.`);
            }
        }, 250);
    }
    
    function disconnect() {
        const { lobbyPanel, container, disconnectBtn, chatPanel, historyDiv, 
                statusText, statusDot, lobbyInput } = AXIOM.elements;
        
        // 1. VISUAL: Reset the UI State
        AXIOM.state.appMode = 'LOBBY';
        AXIOM.state.isProcessing = false;
        AXIOM.state.lastBotMessageDiv = null;
        if (lobbyInput) lobbyInput.value = '';
        
        // 2. BACKEND: Kill the session
        AXIOM.api.resetSession();

        // 3. ANIMATION: Transition back to Lobby
        chatPanel.style.opacity = '0';
        setTimeout(() => {
            chatPanel.style.display = 'none';
            historyDiv.innerHTML = '';
            
            container.classList.remove('mode-focus');
            disconnectBtn.style.display = 'none';
            
            lobbyPanel.classList.remove('hidden');
            lobbyPanel.style.pointerEvents = 'all';
            setTimeout(() => { lobbyPanel.style.opacity = '1'; }, 50);
        }, 500);
        
        statusText.innerText = "IDLE";
        statusDot.classList.remove('active');
    }
    
    // =========================================================================
    // LOBBY HANDLER - NOW WITH DIFFICULTY MODAL
    // =========================================================================
    
    function handleLobbyInit() {
        // Don't process if already in chat mode
        if (AXIOM.state.appMode === 'CHAT') {
            console.log('Already in chat mode, ignoring lobby init');
            return;
        }
        
        const val = AXIOM.elements.lobbyInput.value;
        if (!val) return;
        
        // Clear lobby input and transition to chat mode
        // User can select difficulty using the selector bar before sending
        AXIOM.elements.lobbyInput.value = '';
        
        activateChatMode();
        setTimeout(() => {
            AXIOM.elements.userInput.value = val;
            // Use current difficulty from selector bar (no modal)
            if (typeof AXIOM.sendMessageWithDifficulty === 'function') {
                AXIOM.sendMessageWithDifficulty(val, AXIOM.difficulty.current);
            } else {
                AXIOM.sendMessage(val, true);
            }
        }, 800);
    }
    
    // =========================================================================
    // GRAPH THEME TOGGLE
    // =========================================================================
    
    function toggleGraphTheme(btn) {
        const wrapper = btn.closest('.mermaid-wrapper');
        if (!wrapper) return;

        wrapper.classList.toggle('light-mode');
        
        const isLight = wrapper.classList.contains('light-mode');
        btn.innerText = isLight ? "☾ DARK" : "☀ LIGHT";
    }
    
    // =========================================================================
    // EXPORT
    // =========================================================================
    
    AXIOM.ui = {
        appendMessage,
        showToast,
        activateChatMode,
        disconnect,
        handleLobbyInit,
        toggleGraphTheme,
        startProcessingEffects,
        stopProcessingEffects,
        toggleStepSummary
    };
    
    // =========================================================================
    // STEP SUMMARY TOGGLE
    // =========================================================================
    
    function toggleStepSummary(button) {
        const content = button.nextElementSibling;
        const icon = button.querySelector('.toggle-icon');
        
        console.log('[UI] toggleStepSummary:', { 
            content, 
            currentDisplay: content.style.display,
            hasExpanded: content.classList.contains('expanded')
        });
        
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            icon.textContent = '▼';
            button.classList.add('expanded');
            content.classList.add('expanded');
            console.log('[UI] Expanded step summary');
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
            button.classList.remove('expanded');
            content.classList.remove('expanded');
            console.log('[UI] Collapsed step summary');
        }
    }
    
    function toggleGraphDataOverlay(button) {
        const overlay = button.closest('.graph-data-overlay');
        if (!overlay) return;
        
        const isCollapsed = overlay.classList.contains('collapsed');
        
        if (isCollapsed) {
            overlay.classList.remove('collapsed');
            button.classList.remove('collapsed');
            console.log('[UI] Expanded graph data overlay');
        } else {
            overlay.classList.add('collapsed');
            button.classList.add('collapsed');
            console.log('[UI] Collapsed graph data overlay');
        }
    }
    
    // Also expose toggleGraphTheme, toggleStepSummary, and toggleGraphDataOverlay globally for onclick handlers
    window.toggleGraphTheme = toggleGraphTheme;
    window.toggleStepSummary = toggleStepSummary;
    window.toggleGraphDataOverlay = toggleGraphDataOverlay;
    
    console.log('✅ AXIOM UI loaded');
    
    // NOTE: Event listeners removed from here. 
    // They are handled in main.js to prevent double-firing bugs.
})();