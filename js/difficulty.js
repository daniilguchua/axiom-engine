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
    let isModalOpen = false; // Track modal state to prevent duplicate opens
    
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
        
        // Prevent duplicate modal opens
        if (isModalOpen) {
            console.log('Difficulty modal already open, ignoring duplicate request');
            return;
        }
        
        pendingPrompt = prompt;
        pendingCallback = callback;
        isModalOpen = true; // Set flag when modal is opened
        
        // Update the confirm button text
        updateConfirmButton();
        
        // Show the modal
        modal.showModal();
        
        // Add animation class
        modal.classList.add('modal-open');
        
        // Clear the backdrop if it persists
        const backdrop = document.querySelector('dialog::backdrop');
        if (backdrop) {
            backdrop.style.opacity = '0';
            backdrop.style.pointerEvents = 'none';
        }
        
        console.log('✅ Difficulty modal shown');
    }
    
    function hideDifficultyModal() {
        const modal = document.getElementById('difficulty-modal');
        if (modal) {
            modal.classList.remove('modal-open');
            modal.close();
            isModalOpen = false; // Clear flag when modal is closed
            
            // Ensure backdrop is removed
            const backdrop = document.querySelector('dialog::backdrop');
            if (backdrop) {
                backdrop.style.opacity = '0';
                backdrop.style.pointerEvents = 'none';
            }
        }
        pendingPrompt = null;
        pendingCallback = null;
        console.log('✅ Difficulty modal hidden');
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
        
        // Update card selection UI (for modal)
        document.querySelectorAll('.difficulty-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.difficulty === difficulty) {
                card.classList.add('selected');
            }
        });
        
        // Update selector bar buttons
        updateSelectorBar();
        
        // Update header badge
        updateDifficultyBadge();
        
        // Update confirm button (for modal)
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
        console.log('✅ Difficulty confirmed:', currentDifficulty);
        hideDifficultyModal();
        
        if (pendingCallback) {
            console.log('📞 Calling difficulty callback with:', currentDifficulty);
            pendingCallback(currentDifficulty);
        }
    }
    
    function cancelDifficulty() {
        console.log('❌ Difficulty selection cancelled');
        hideDifficultyModal();
        
        // Restore lobby input if it was cleared prematurely
        if (AXIOM.state && AXIOM.state.lastPromptedLobbyInput) {
            if (AXIOM.elements && AXIOM.elements.lobbyInput) {
                AXIOM.elements.lobbyInput.value = AXIOM.state.lastPromptedLobbyInput;
                AXIOM.state.lastPromptedLobbyInput = null;
            }
        }
        
        pendingPrompt = null;
        pendingCallback = null;
        
        // Clear the tracking so user can try again
        if (AXIOM.state) {
            AXIOM.state.lastPromptedForDifficulty = null;
        }
    }
    
    // =========================================================================
    // EVENT LISTENERS SETUP
    // =========================================================================
    
    function initDifficultySystem() {
        // =====================================================================
        // DROPDOWN FUNCTIONALITY
        // =====================================================================
        
        const dropdown = document.getElementById('difficulty-dropdown');
        const trigger = document.getElementById('diff-trigger');
        const menu = document.getElementById('diff-menu');
        
        // Toggle dropdown on trigger click
        if (trigger && menu && dropdown) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('open');
                menu.classList.toggle('open');
            });
            
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.remove('open');
                    menu.classList.remove('open');
                }
            });
            
            // Close on escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    dropdown.classList.remove('open');
                    menu.classList.remove('open');
                }
            });
        }
        
        // Dropdown option click handlers
        document.querySelectorAll('.diff-option').forEach(option => {
            option.addEventListener('click', () => {
                const newDifficulty = option.dataset.difficulty;
                selectDifficulty(newDifficulty);
                
                // Update active state on options
                document.querySelectorAll('.diff-option').forEach(opt => {
                    opt.classList.remove('active');
                });
                option.classList.add('active');
                
                // Update trigger display
                updateDropdownTrigger(newDifficulty);
                
                // Close dropdown
                if (dropdown && menu) {
                    dropdown.classList.remove('open');
                    menu.classList.remove('open');
                }
                
                // Show toast notification
                if (AXIOM.ui && AXIOM.ui.showToast) {
                    AXIOM.ui.showToast(`Switched to ${DifficultyLevels[newDifficulty].name} mode`);
                }
            });
        });
        
        // =====================================================================
        // MODAL FUNCTIONALITY (kept for header badge)
        // =====================================================================
        
        // Modal card click handlers (for modal if still used)
        document.querySelectorAll('.difficulty-card').forEach(card => {
            card.addEventListener('click', () => {
                selectDifficulty(card.dataset.difficulty);
            });
        });
        
        // Confirm button (for modal)
        const confirmBtn = document.getElementById('btn-diff-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', confirmDifficulty);
        }
        
        // Cancel button (for modal)
        const cancelBtn = document.getElementById('btn-diff-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', cancelDifficulty);
        }
        
        // Close on backdrop click (for modal)
        const modal = document.getElementById('difficulty-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    cancelDifficulty();
                }
            });
        }
        
        // Header badge click (to change difficulty mid-session - opens modal)
        const badge = document.getElementById('difficulty-badge');
        if (badge) {
            badge.addEventListener('click', () => {
                showDifficultyModal(null, (newDiff) => {
                    updateDropdownTrigger(newDiff);
                    updateDropdownOptions(newDiff);
                    if (AXIOM.ui && AXIOM.ui.showToast) {
                        AXIOM.ui.showToast(`Switched to ${DifficultyLevels[newDiff].name} mode`);
                    }
                });
            });
        }
        
        // Initialize badge and dropdown
        updateDifficultyBadge();
        updateDropdownTrigger(currentDifficulty);
        updateDropdownOptions(currentDifficulty);
        
        console.log('✅ AXIOM Difficulty System initialized');
    }
    
    function updateDropdownTrigger(difficulty) {
        const iconEl = document.querySelector('.diff-current-icon');
        const textEl = document.querySelector('.diff-current-text');
        
        if (iconEl && textEl && DifficultyLevels[difficulty]) {
            iconEl.textContent = DifficultyLevels[difficulty].icon;
            textEl.textContent = DifficultyLevels[difficulty].name;
        }
    }
    
    function updateDropdownOptions(difficulty) {
        document.querySelectorAll('.diff-option').forEach(opt => {
            opt.classList.remove('active');
            if (opt.dataset.difficulty === difficulty) {
                opt.classList.add('active');
            }
        });
    }
    
    // Legacy function for compatibility
    function updateSelectorBar() {
        updateDropdownTrigger(currentDifficulty);
        updateDropdownOptions(currentDifficulty);
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
        init: initDifficultySystem,
        updateSelectorBar: updateSelectorBar
    };
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDifficultySystem);
    } else {
        initDifficultySystem();
    }
    
    console.log('✅ AXIOM Difficulty module loaded');
})();