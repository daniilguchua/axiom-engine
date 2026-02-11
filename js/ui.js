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
        lobbyPanel.style.transform = 'scale(0.98)';
        lobbyPanel.style.pointerEvents = 'none';
        
        setTimeout(() => {
            lobbyPanel.classList.add('hidden');
            container.classList.add('mode-focus');
            disconnectBtn.style.display = 'block';
            chatPanel.style.display = 'flex';
            setTimeout(() => {
                chatPanel.style.opacity = '1';
                chatPanel.style.transform = 'translateY(0)';
            }, 50);
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
        chatPanel.style.transform = 'translateY(10px)';
        setTimeout(() => {
            chatPanel.style.display = 'none';
            historyDiv.innerHTML = '';

            container.classList.remove('mode-focus');
            disconnectBtn.style.display = 'none';

            lobbyPanel.classList.remove('hidden');
            lobbyPanel.style.pointerEvents = 'all';
            setTimeout(() => {
                lobbyPanel.style.opacity = '1';
                lobbyPanel.style.transform = 'scale(1)';
            }, 50);
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
        toggleStepSummary,
        openInputDataEditor
    };
    
    // =========================================================================
    // STEP SUMMARY TOGGLE
    // =========================================================================
    
    function toggleStepSummary(button) {
        const content = button.nextElementSibling;
        const icon = button.querySelector('.toggle-icon');
        
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            icon.textContent = '▼';
            button.classList.add('expanded');
            content.classList.add('expanded');
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
            button.classList.remove('expanded');
            content.classList.remove('expanded');
        }
    }
    
    function toggleGraphDataOverlay(button) {
        const overlay = button.closest('.graph-data-overlay');
        if (!overlay) return;
        
        const isCollapsed = overlay.classList.contains('collapsed');
        
        if (isCollapsed) {
            overlay.classList.remove('collapsed');
            button.classList.remove('collapsed');
        } else {
            overlay.classList.add('collapsed');
            button.classList.add('collapsed');
        }
    }
    
    // =========================================================================
    // INPUT DATA EDITOR
    // =========================================================================
    
    function openInputDataEditor(inputData, simId) {
        if (!inputData) return;
        
        const { type, label, value } = inputData;
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'input-data-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        `;
        
        // Create modal content
        const content = document.createElement('div');
        content.style.cssText = `
            background: #0a0a0f;
            border: 2px solid rgba(188, 19, 254, 0.4);
            border-radius: 12px;
            padding: 30px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            color: #fff;
            font-family: 'JetBrains Mono', monospace;
        `;
        
        // Title
        const title = document.createElement('h2');
        title.textContent = `Edit Input Data: ${label}`;
        title.style.cssText = `
            color: #bc13fe;
            margin: 0 0 20px 0;
            font-size: 1.4em;
        `;
        content.appendChild(title);
        
        // Original data display
        const origSection = document.createElement('div');
        origSection.style.cssText = `
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 20px;
            font-size: 0.9em;
        `;
        const origLabel = document.createElement('div');
        origLabel.textContent = 'Original:';
        origLabel.style.color = '#888';
        origLabel.style.marginBottom = '5px';
        origSection.appendChild(origLabel);
        
        const origValue = document.createElement('div');
        origValue.textContent = JSON.stringify(value);
        origValue.style.cssText = `
            word-break: break-all;
            color: #00f3ff;
        `;
        origSection.appendChild(origValue);
        content.appendChild(origSection);
        
        // Edit section
        const editLabel = document.createElement('label');
        editLabel.textContent = 'Your Input (edit below):';
        editLabel.style.cssText = `
            display: block;
            color: #bc13fe;
            margin-bottom: 8px;
            font-weight: bold;
        `;
        content.appendChild(editLabel);
        
        // Format value for editing based on type
        let editableValue = '';
        switch(type) {
            case 'array':
            case 'tree':
            case 'linkedlist':
            case 'search':
                editableValue = Array.isArray(value.array || value) 
                    ? (value.array || value).join(', ') 
                    : JSON.stringify(value);
                break;
            case 'graph':
            case 'dp':
            case 'hashtable':
            default:
                editableValue = JSON.stringify(value, null, 2);
        }
        
        const textarea = document.createElement('textarea');
        textarea.value = editableValue;
        textarea.style.cssText = `
            width: 100%;
            min-height: 150px;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(188, 19, 254, 0.3);
            border-radius: 6px;
            color: #00f3ff;
            padding: 12px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            resize: vertical;
            margin-bottom: 20px;
            line-height: 1.5;
        `;
        content.appendChild(textarea);
        
        // Comment section
        const commentLabel = document.createElement('label');
        commentLabel.textContent = 'Comment (optional):';
        commentLabel.style.cssText = `
            display: block;
            color: #bc13fe;
            margin-bottom: 8px;
            font-weight: bold;
        `;
        content.appendChild(commentLabel);
        
        const commentInput = document.createElement('input');
        commentInput.type = 'text';
        commentInput.placeholder = 'What should I focus on? (e.g., "Show worst case" or "Already sorted")';
        commentInput.style.cssText = `
            width: 100%;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(188, 19, 254, 0.3);
            border-radius: 6px;
            color: #00f3ff;
            padding: 10px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            margin-bottom: 20px;
            box-sizing: border-box;
        `;
        content.appendChild(commentInput);
        
        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        `;
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #888;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.2s ease;
        `;
        cancelBtn.addEventListener('mouseover', () => {
            cancelBtn.style.background = 'rgba(255, 255, 255, 0.15)';
        });
        cancelBtn.addEventListener('mouseout', () => {
            cancelBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        cancelBtn.addEventListener('click', () => {
            modal.remove();
        });
        buttonContainer.appendChild(cancelBtn);
        
        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply & Re-simulate';
        applyBtn.style.cssText = `
            background: linear-gradient(135deg, #bc13fe, #9d06ff);
            border: none;
            color: #fff;
            padding: 10px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            font-weight: bold;
            transition: all 0.2s ease;
        `;
        applyBtn.addEventListener('mouseover', () => {
            applyBtn.style.opacity = '0.9';
        });
        applyBtn.addEventListener('mouseout', () => {
            applyBtn.style.opacity = '1';
        });
        applyBtn.addEventListener('click', async () => {
            const userInput = textarea.value.trim();
            const comment = commentInput.value.trim();
            
            if (!userInput) {
                showToast('⚠️ Input cannot be empty');
                return;
            }
            
            applyBtn.disabled = true;
            applyBtn.textContent = 'Processing...';
            
            // Parse edited input based on type
            let parsedInput = null;
            try {
                switch(type) {
                    case 'array':
                    case 'tree':
                    case 'linkedlist':
                        parsedInput = userInput.split(',').map(x => {
                            const num = parseInt(x.trim());
                            return isNaN(num) ? 0 : num;
                        });
                        break;
                    case 'search':
                        // Try JSON first, fallback to simple parsing
                        try {
                            parsedInput = JSON.parse(userInput);
                        } catch {
                            const parts = userInput.split(/[,;]/);
                            const arr = parts.slice(0, -1).map(x => parseInt(x.trim())).filter(x => !isNaN(x));
                            const target = parseInt(parts[parts.length - 1].trim());
                            parsedInput = { array: arr, target: isNaN(target) ? arr[0] : target };
                        }
                        break;
                    default:
                        parsedInput = JSON.parse(userInput);
                }
                
                // Create edited input data object
                const editedInputData = {
                    type,
                    label,
                    value: parsedInput
                };
                
                // Call re-simulate function
                if (AXIOM.api && AXIOM.api.reSimulateWithEditedInput) {
                    await AXIOM.api.reSimulateWithEditedInput(editedInputData, comment, simId);
                    modal.remove();
                    showToast('✅ Re-generating with your input...');
                } else {
                    showToast('❌ Re-simulate function not available');
                }
            } catch (e) {
                showToast('❌ Error parsing input: ' + e.message);
            } finally {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Apply & Re-simulate';
            }
        });
        buttonContainer.appendChild(applyBtn);
        
        content.appendChild(buttonContainer);
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // Focus textarea
        textarea.focus();
        textarea.select();
    }
    
    // Also expose toggleGraphTheme, toggleStepSummary, and toggleGraphDataOverlay globally for onclick handlers
    window.toggleGraphTheme = toggleGraphTheme;
    window.toggleStepSummary = toggleStepSummary;
    window.toggleGraphDataOverlay = toggleGraphDataOverlay;
    

    // NOTE: Event listeners removed from here. 
    // They are handled in main.js to prevent double-firing bugs.
})();