// js/difficulty.js
/**
 * AXIOM Engine - Difficulty System
 * Handles the 3-tier difficulty selection: Explorer, Engineer, Architect
 */

(function() {
    
    // =========================================================================
    // DIFFICULTY STATE
    // =========================================================================
    
    const DifficultyLevels = {
        explorer: {
            name: 'Explorer',
            icon: '🌟',
            color: '#34D399',
            description: 'Fun & Friendly Learning'
        },
        engineer: {
            name: 'Engineer',
            icon: '⚙️',
            color: '#60A5FA',
            description: 'Technical & Practical'
        },
        architect: {
            name: 'Architect',
            icon: '🏗️',
            color: '#A78BFA',
            description: 'Deep Theory & Systems'
        }
    };
    
    // Current selected difficulty (default: engineer)
    let currentDifficulty = 'engineer';
    let pendingPrompt = null;
    let pendingCallback = null;
    let isModalOpen = false;
    
    // =========================================================================
    // MODAL MANAGEMENT
    // =========================================================================
    
    function showDifficultyModal(prompt, callback) {
        const modal = document.getElementById('difficulty-modal');
        if (!modal) {
            console.error('Difficulty modal not found');
            // Fallback: just use current difficulty
            if (callback) callback(currentDifficulty);
            return;
        }
        
        // Prevent showing modal if it's already open
        if (isModalOpen) {
            console.log('Difficulty modal already open, ignoring duplicate request');
            return;
        }
        
        pendingPrompt = prompt;
        pendingCallback = callback;
        isModalOpen = true;
        
        // Update the confirm button text
        updateConfirmButton();
        
        // Show the modal
        modal.showModal();
        
        // Add animation class
        modal.classList.add('modal-open');
    }
    
    function hideDifficultyModal() {
        const modal = document.getElementById('difficulty-modal');
        if (modal) {
            modal.classList.remove('modal-open');
            modal.close();
        }
        isModalOpen = false;
        pendingPrompt = null;
        pendingCallback = null;
    }
    
    function updateConfirmButton() {
        const btnText = document.getElementById('btn-diff-text');
        if (btnText) {
            const level = DifficultyLevels[currentDifficulty];
            btnText.textContent = `Start with ${level.name} Mode`;
        }
    }
    
    // =========================================================================
    // DIFFICULTY SELECTION
    // =========================================================================
    
    function selectDifficulty(difficulty) {
        if (!DifficultyLevels[difficulty]) {
            console.warn('Unknown difficulty:', difficulty);
            return;
        }
        
        currentDifficulty = difficulty;
        
        // Update card selection UI
        document.querySelectorAll('.difficulty-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.difficulty === difficulty) {
                card.classList.add('selected');
            }
        });
        
        // Update header badge
        updateDifficultyBadge();
        
        // Update confirm button
        updateConfirmButton();
        
        console.log('📊 Difficulty selected:', difficulty);
    }
    
    function updateDifficultyBadge() {
        const badge = document.getElementById('difficulty-badge');
        if (!badge) return;
        
        const level = DifficultyLevels[currentDifficulty];
        const iconEl = badge.querySelector('.diff-icon');
        const textEl = badge.querySelector('.diff-text');
        
        if (iconEl) iconEl.textContent = level.icon;
        if (textEl) textEl.textContent = level.name.toUpperCase();
        
        // Update badge color
        badge.style.borderColor = level.color;
        badge.dataset.difficulty = currentDifficulty;
    }
    
    function getCurrentDifficulty() {
        return currentDifficulty;
    }
    
    // =========================================================================
    // CONFIRM / CANCEL HANDLERS
    // =========================================================================
    
    function confirmDifficulty() {
        hideDifficultyModal();
        
        if (pendingCallback) {
            pendingCallback(currentDifficulty);
        }
    }
    
    function cancelDifficulty() {
        hideDifficultyModal();
        
        // Clear the tracking so user can try again
        if (AXIOM.state) {
            AXIOM.state.lastPromptedForDifficulty = null;
        }
        
        // Restore lobby input if we have a pending prompt (user cancelled)
        if (pendingPrompt && AXIOM.elements && AXIOM.elements.lobbyInput) {
            AXIOM.elements.lobbyInput.value = pendingPrompt;
        }
        
        pendingPrompt = null;
        pendingCallback = null;
    }
    
    // =========================================================================
    // EVENT LISTENERS SETUP
    // =========================================================================
    
    function initDifficultySystem() {
        // Card click handlers
        document.querySelectorAll('.difficulty-card').forEach(card => {
            card.addEventListener('click', () => {
                selectDifficulty(card.dataset.difficulty);
            });
        });
        
        // Confirm button
        const confirmBtn = document.getElementById('btn-diff-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', confirmDifficulty);
        }
        
        // Cancel button
        const cancelBtn = document.getElementById('btn-diff-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', cancelDifficulty);
        }
        
        // Close on backdrop click
        const modal = document.getElementById('difficulty-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    cancelDifficulty();
                }
            });
        }
        
        // Header badge click (to change difficulty mid-session)
        const badge = document.getElementById('difficulty-badge');
        if (badge) {
            badge.addEventListener('click', () => {
                showDifficultyModal(null, (newDiff) => {
                    AXIOM.ui.showToast(`Switched to ${DifficultyLevels[newDiff].name} mode`);
                });
            });
        }
        
        // Initialize badge
        updateDifficultyBadge();
        
        console.log('✅ AXIOM Difficulty System initialized');
    }
    
    // =========================================================================
    // INTEGRATION WITH MAIN FLOW
    // =========================================================================
    
    /**
     * Called before sending a simulation request.
     * Shows difficulty modal if this is a new simulation.
     * 
     * @param {string} prompt - The user's prompt
     * @param {function} onConfirm - Callback with (difficulty) when confirmed
     */
    function promptForDifficulty(prompt, onConfirm) {
        // Check if this looks like a simulation request
        const simKeywords = ['simulate', 'simulation', 'visualize', 'step', 'show', 'create', 'demonstrate', 'run'];
        const isSimulation = simKeywords.some(kw => prompt.toLowerCase().includes(kw));
        
        if (isSimulation) {
            showDifficultyModal(prompt, onConfirm);
        } else {
            // Not a simulation, just use current difficulty
            if (onConfirm) onConfirm(currentDifficulty);
        }
    }
    
    // =========================================================================
    // EXPORT
    // =========================================================================
    
    AXIOM.difficulty = {
        levels: DifficultyLevels,
        get current() { return currentDifficulty; },
        set current(val) { selectDifficulty(val); },
        show: showDifficultyModal,
        hide: hideDifficultyModal,
        select: selectDifficulty,
        get: getCurrentDifficulty,
        prompt: promptForDifficulty,
        init: initDifficultySystem
    };
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDifficultySystem);
    } else {
        initDifficultySystem();
    }
    
    console.log('✅ AXIOM Difficulty module loaded');
})();