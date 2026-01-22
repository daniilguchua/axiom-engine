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
                background: 'rgba(0, 243, 255, 0.2)',
                color: '#fff',
                border: '1px solid #00f3ff',
                padding: '10px 20px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                zIndex: '10000',
                backdropFilter: 'blur(5px)',
                boxShadow: '0 0 20px rgba(0,243,255,0.4)',
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
        
        // Show difficulty modal for new simulations
        const simKeywords = ['simulate', 'simulation', 'visualize', 'step', 'show', 'create', 'demonstrate', 'run'];
        const isSimulation = simKeywords.some(kw => val.toLowerCase().includes(kw));
        
        if (isSimulation) {
            // Show difficulty selection modal
            // Store the prompt value - we'll clear lobby input after confirmation
            AXIOM.difficulty.show(val, (selectedDifficulty) => {
                // Clear lobby input AFTER user confirms difficulty
                AXIOM.elements.lobbyInput.value = '';
                
                // User selected difficulty, now activate chat mode
                activateChatMode();
                setTimeout(() => {
                    // Safety check to ensure function exists
                    if (typeof AXIOM.sendMessageWithDifficulty === 'function') {
                        AXIOM.sendMessageWithDifficulty(val, selectedDifficulty);
                    } else {
                        console.warn("Fallback to standard sendMessage");
                        AXIOM.sendMessage(val, true);
                    }
                }, 800);
            });
        } else {
            // Not a simulation, go directly to chat
            activateChatMode();
            setTimeout(() => {
                AXIOM.elements.userInput.value = val;
                AXIOM.sendMessage(val, true); // Skip difficulty prompt
            }, 800);
        }
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
        toggleGraphTheme
    };
    
    // Also expose toggleGraphTheme globally for onclick handlers
    window.toggleGraphTheme = toggleGraphTheme;
    
    console.log('✅ AXIOM UI loaded');
    
    // NOTE: Event listeners removed from here. 
    // They are handled in main.js to prevent double-firing bugs.
})();