/**
 * Ezra AI Loan Structuring Assistant
 * Chat Widget Module
 * 
 * Features:
 * - Floating chat widget UI
 * - Supabase integration for conversation history
 * - AI model routing (Gemini, Claude, GPT)
 * - UI auto-fill for quote fields
 * - Quick command buttons
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const EZRA_CONFIG = {
        widgetTitle: 'Ezra — AI Loan Structuring Assistant',
        placeholderText: 'Ask Ezra anything...',
        quickCommands: [
            { label: 'Create Quote', icon: '💰', action: 'create_quote' },
            { label: 'Deal Radar', icon: '🎯', action: 'deal_radar' },
            { label: 'Structure Deal', icon: '🏗️', action: 'structure_deal' },
            { label: 'Handle Objection', icon: '🛡️', action: 'handle_objection' },
            { label: 'Explain Strategy', icon: '📋', action: 'explain_strategy' },
            { label: 'Client Script', icon: '📝', action: 'client_script' }
        ],
        models: {
            gemini: { name: 'Gemini', color: '#4285f4', defaultFor: 'simple_chat' },
            claude: { name: 'Claude', color: '#d97757', defaultFor: 'quote_calculations' },
            gpt: { name: 'GPT', color: '#10a37f', defaultFor: 'complex_strategy' }
        },
        supabaseUrl: window.SUPABASE_URL || '',
        supabaseKey: window.SUPABASE_ANON_KEY || ''
    };

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    const EzraState = {
        isOpen: false,
        isMinimized: false,
        conversationId: null,
        messages: [],
        currentModel: 'claude',
        userTier: 'diamond',
        autoFillEnabled: true,
        isTyping: false,
        supabase: null,
        user: null,
        dealRadarData: null,
        activeTab: 'chat' // 'chat' | 'deal-radar'
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    let _initAttempts = 0;
    function initEzra() {
        // Wait for the app's Supabase client to be available
        if (!window._supabase) {
            _initAttempts++;
            if (_initAttempts <= 30) { // up to 15 seconds
                if (_initAttempts === 1) console.log('Ezra: Waiting for Supabase client...');
                setTimeout(initEzra, 500);
            } else {
                console.warn('Ezra: Supabase client not found after 15s — widget disabled');
            }
            return;
        }

        // Use the app's existing Supabase client
        EzraState.supabase = window._supabase;

        // Pick up tier from app globals
        if (window.currentUserTier) EzraState.userTier = window.currentUserTier;

        // Create widget DOM first so elements exist
        createWidgetDOM();

        // Setup event listeners
        setupEventListeners();

        // Check auth state (async — loads conversation)
        checkAuthState();

        // Load user preferences
        loadUserPreferences();

        console.log('Ezra: Initialized successfully');
    }

    async function checkAuthState() {
        const { data: { session } } = await EzraState.supabase.auth.getSession();
        if (session?.user) {
            EzraState.user = session.user;
            loadOrCreateConversation();
        }
    }

    // ============================================
    // DOM CREATION
    // ============================================
    function createWidgetDOM() {
        // Remove existing widget if present
        const existing = document.getElementById('ezra-widget');
        if (existing) existing.remove();

        const widget = document.createElement('div');
        widget.id = 'ezra-widget';
        widget.className = 'ezra-widget';
        widget.innerHTML = `
            <!-- Floating Gold Orb -->
            <button id="ezra-orb" class="ezra-orb" aria-label="Open Ezra AI Assistant">
                <span class="ezra-orb-icon">\u2726</span>
                <span class="ezra-orb-ring"></span>
            </button>

            <!-- Chat Panel -->
            <div id="ezra-container" class="ezra-container">
                <!-- Header -->
                <div class="ezra-header">
                    <div class="ezra-header-left">
                        <div class="ezra-avatar">\u2726</div>
                        <div class="ezra-header-info">
                            <span class="ezra-title">EZRA</span>
                            <span class="ezra-status">
                                <span class="ezra-status-dot"></span>
                                <span class="ezra-status-text">Online</span>
                            </span>
                        </div>
                    </div>
                    <div class="ezra-header-actions">
                        <button id="ezra-model-selector" class="ezra-model-btn" title="AI Model">
                            <span class="ezra-model-name">Claude</span>
                        </button>
                        <button id="ezra-minimize" class="ezra-icon-btn" title="Minimize">\u2212</button>
                        <button id="ezra-close" class="ezra-icon-btn" title="Close">\u00D7</button>
                    </div>
                </div>

                <!-- Quick Commands -->
                <div class="ezra-quick-commands">
                    ${EZRA_CONFIG.quickCommands.map(cmd => `
                        <button class="ezra-quick-btn" data-action="${cmd.action}" title="${cmd.label}">
                            <span>${cmd.icon}</span>
                            <span>${cmd.label}</span>
                        </button>
                    `).join('')}
                </div>

                <!-- Messages Area -->
                <div id="ezra-messages" class="ezra-messages">
                    <div class="ezra-welcome">
                        <div class="ezra-welcome-icon">\u2726</div>
                        <h3>Hello, I'm Ezra</h3>
                        <p>Your AI loan structuring co-pilot.</p>
                        <div class="ezra-welcome-capabilities">
                            <div class="ezra-welcome-cap"><span>\u2726</span> Build HELOC quotes</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Structure loan scenarios</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Handle objections</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Generate client scripts</div>
                        </div>
                    </div>
                </div>

                <!-- Typing Indicator -->
                <div id="ezra-typing" class="ezra-typing" style="display: none;">
                    <span class="ezra-typing-dot"></span>
                    <span class="ezra-typing-dot"></span>
                    <span class="ezra-typing-dot"></span>
                </div>

                <!-- Input Area -->
                <div class="ezra-input-area">
                    <div class="ezra-input-wrapper">
                        <textarea
                            id="ezra-input"
                            class="ezra-input"
                            placeholder="${EZRA_CONFIG.placeholderText}"
                            rows="1"
                        ></textarea>
                        <button id="ezra-send" class="ezra-send-btn" disabled>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="ezra-input-footer">
                        <span class="ezra-tier-badge">${EzraState.userTier}</span>
                        <span class="ezra-powered-by">Powered by AI</span>
                    </div>
                </div>
            </div>

            <!-- Model Selector Modal -->
            <div id="ezra-model-modal" class="ezra-modal" style="display: none;">
                <div class="ezra-modal-content">
                    <h4>Select AI Model</h4>
                    <div class="ezra-model-options">
                        ${Object.entries(EZRA_CONFIG.models).map(([key, model]) => `
                            <button class="ezra-model-option ${key === EzraState.currentModel ? 'active' : ''}" data-model="${key}">
                                <span class="ezra-model-color" style="background: ${model.color}"></span>
                                <span class="ezra-model-label">${model.name}</span>
                                <span class="ezra-model-use">Best for: ${model.defaultFor.replace('_', ' ')}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(widget);

        // Inject styles
        injectStyles();
    }

    function injectStyles() {
        if (document.getElementById('ezra-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'ezra-styles';
        styles.textContent = `
            /* ============================================
               EZRA WIDGET — DARK GLASS + GOLD THEME
               ============================================ */

            /* CSS Variables */
            :root {
                --ezra-gold: #c5a059;
                --ezra-gold-bright: #d4af37;
                --ezra-gold-dim: rgba(197,160,89,0.3);
                --ezra-dark-1: #0f172a;
                --ezra-dark-2: #1e293b;
                --ezra-dark-3: #334155;
                --ezra-glass: rgba(30,41,59,0.85);
                --ezra-glass-border: rgba(197,160,89,0.25);
                --ezra-text: #e2e8f0;
                --ezra-text-muted: #94a3b8;
                --ezra-radius: 16px;
                --ezra-radius-sm: 10px;
            }

            /* Widget Wrapper */
            .ezra-widget {
                position: fixed;
                bottom: 28px;
                right: 28px;
                z-index: 9999;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }

            /* ===== FLOATING ORB ===== */
            .ezra-orb {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                border: none;
                cursor: pointer;
                background: linear-gradient(135deg, #c5a059 0%, #d4af37 50%, #c5a059 100%);
                color: #1e293b;
                font-size: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                box-shadow:
                    0 0 20px rgba(212,175,55,0.4),
                    0 0 60px rgba(212,175,55,0.15),
                    0 8px 32px rgba(0,0,0,0.3);
                transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
                z-index: 2;
            }

            .ezra-orb:hover {
                transform: translateY(-4px) scale(1.08);
                box-shadow:
                    0 0 30px rgba(212,175,55,0.6),
                    0 0 80px rgba(212,175,55,0.25),
                    0 12px 40px rgba(0,0,0,0.35);
            }

            .ezra-orb-icon {
                font-size: 24px;
                filter: drop-shadow(0 0 4px rgba(212,175,55,0.6));
                z-index: 1;
            }

            .ezra-orb-ring {
                position: absolute;
                inset: -4px;
                border-radius: 50%;
                border: 2px solid rgba(212,175,55,0.4);
                animation: ezra-orb-pulse 2.5s ease-in-out infinite;
                pointer-events: none;
            }

            @keyframes ezra-orb-pulse {
                0%, 100% { transform: scale(1); opacity: 0.6; }
                50% { transform: scale(1.15); opacity: 0; }
            }

            /* ===== CHAT PANEL ===== */
            .ezra-container {
                position: absolute;
                bottom: 0;
                right: 0;
                width: 400px;
                height: 560px;
                background: linear-gradient(135deg, var(--ezra-dark-2), var(--ezra-dark-1));
                border-radius: var(--ezra-radius);
                border: 1px solid var(--ezra-glass-border);
                box-shadow:
                    0 0 40px rgba(197,160,89,0.12),
                    0 25px 50px rgba(0,0,0,0.5),
                    inset 0 1px 0 rgba(255,255,255,0.05);
                display: none;
                flex-direction: column;
                overflow: hidden;
                backdrop-filter: blur(20px);
            }

            .ezra-container.open {
                display: flex;
                animation: ezra-panel-in 0.35s cubic-bezier(0.4,0,0.2,1);
            }

            @keyframes ezra-panel-in {
                from {
                    opacity: 0;
                    transform: translateY(16px) scale(0.96);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            /* ===== HEADER ===== */
            .ezra-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 18px;
                background: transparent;
                border-bottom: 1px solid var(--ezra-glass-border);
            }

            .ezra-header-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .ezra-avatar {
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                color: var(--ezra-dark-1);
                font-weight: 700;
                box-shadow: 0 0 12px rgba(212,175,55,0.3);
            }

            .ezra-header-info {
                display: flex;
                flex-direction: column;
            }

            .ezra-title {
                font-family: 'DM Sans', 'Inter', sans-serif;
                font-weight: 700;
                font-size: 15px;
                letter-spacing: 2px;
                color: var(--ezra-gold);
            }

            .ezra-status {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: var(--ezra-text-muted);
            }

            .ezra-status-dot {
                width: 7px;
                height: 7px;
                background: #22c55e;
                border-radius: 50%;
                box-shadow: 0 0 6px rgba(34,197,94,0.5);
                animation: ezra-status-pulse 2s infinite;
            }

            @keyframes ezra-status-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
            }

            .ezra-header-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .ezra-icon-btn {
                width: 30px;
                height: 30px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 8px;
                color: var(--ezra-text-muted);
                font-size: 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .ezra-icon-btn:hover {
                background: rgba(255,255,255,0.12);
                color: var(--ezra-text);
            }

            .ezra-model-btn {
                height: 30px;
                width: auto;
                padding: 0 10px;
                background: rgba(197,160,89,0.12);
                border: 1px solid var(--ezra-gold-dim);
                border-radius: 8px;
                color: var(--ezra-gold);
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                transition: all 0.2s;
            }

            .ezra-model-btn:hover {
                background: rgba(197,160,89,0.2);
                border-color: var(--ezra-gold);
            }

            /* ===== QUICK COMMANDS ===== */
            .ezra-quick-commands {
                display: flex;
                gap: 6px;
                padding: 10px 14px;
                overflow-x: auto;
                scrollbar-width: none;
                border-bottom: 1px solid rgba(255,255,255,0.04);
            }

            .ezra-quick-commands::-webkit-scrollbar {
                display: none;
            }

            .ezra-quick-btn {
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 6px 12px;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 20px;
                font-size: 11px;
                font-weight: 500;
                color: var(--ezra-text-muted);
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s;
            }

            .ezra-quick-btn:hover {
                background: rgba(197,160,89,0.12);
                border-color: var(--ezra-gold-dim);
                color: var(--ezra-gold);
            }

            /* ===== MESSAGES ===== */
            .ezra-messages {
                flex: 1;
                overflow-y: auto;
                padding: 18px;
                display: flex;
                flex-direction: column;
                gap: 14px;
                scrollbar-width: thin;
                scrollbar-color: var(--ezra-dark-3) transparent;
            }

            .ezra-messages::-webkit-scrollbar { width: 4px; }
            .ezra-messages::-webkit-scrollbar-track { background: transparent; }
            .ezra-messages::-webkit-scrollbar-thumb { background: var(--ezra-dark-3); border-radius: 4px; }

            /* Welcome */
            .ezra-welcome {
                text-align: center;
                padding: 24px 16px;
                color: var(--ezra-text);
            }

            .ezra-welcome-icon {
                font-size: 40px;
                color: var(--ezra-gold);
                margin-bottom: 12px;
                filter: drop-shadow(0 0 8px rgba(212,175,55,0.4));
            }

            .ezra-welcome h3 {
                margin: 0 0 8px;
                font-family: 'DM Sans', 'Inter', sans-serif;
                font-size: 18px;
                font-weight: 600;
                color: var(--ezra-text);
            }

            .ezra-welcome p {
                margin: 0 0 16px;
                color: var(--ezra-text-muted);
                font-size: 13px;
                line-height: 1.5;
            }

            .ezra-welcome-capabilities {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                text-align: left;
            }

            .ezra-welcome-cap {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 10px;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 8px;
                font-size: 11px;
                color: var(--ezra-text-muted);
            }

            .ezra-welcome-cap span {
                color: var(--ezra-gold);
                font-size: 10px;
            }

            /* Message Bubbles */
            .ezra-message {
                display: flex;
                gap: 10px;
                max-width: 88%;
            }

            .ezra-message.user {
                align-self: flex-end;
                flex-direction: row-reverse;
            }

            .ezra-message-avatar {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                flex-shrink: 0;
            }

            .ezra-message.assistant .ezra-message-avatar {
                background: linear-gradient(135deg, var(--ezra-dark-3), var(--ezra-dark-2));
                border: 1px solid var(--ezra-glass-border);
                color: var(--ezra-gold);
            }

            .ezra-message.user .ezra-message-avatar {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
            }

            .ezra-message-content {
                padding: 10px 14px;
                border-radius: 12px;
                font-size: 13px;
                line-height: 1.55;
            }

            .ezra-message.assistant .ezra-message-content {
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.08);
                color: var(--ezra-text);
            }

            .ezra-message.user .ezra-message-content {
                background: linear-gradient(135deg, rgba(197,160,89,0.2), rgba(212,175,55,0.15));
                border: 1px solid var(--ezra-gold-dim);
                color: var(--ezra-text);
            }

            .ezra-message-content code {
                background: rgba(0,0,0,0.3);
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                color: var(--ezra-gold);
            }

            .ezra-message-time {
                font-size: 10px;
                color: var(--ezra-text-muted);
                margin-top: 4px;
                opacity: 0.7;
            }

            /* Auto-fill Block (dark emerald) */
            .ezra-autofill-block {
                background: linear-gradient(135deg, rgba(5,46,22,0.6), rgba(6,78,59,0.4));
                border: 1px solid rgba(34,197,94,0.3);
                border-radius: var(--ezra-radius-sm);
                padding: 14px;
                margin-top: 10px;
            }

            .ezra-autofill-header {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: #4ade80;
                font-size: 13px;
                margin-bottom: 10px;
            }

            .ezra-autofill-fields {
                display: grid;
                gap: 6px;
            }

            .ezra-autofill-field {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 7px 10px;
                background: rgba(0,0,0,0.2);
                border-radius: 6px;
                font-size: 12px;
            }

            .ezra-autofill-label {
                color: var(--ezra-text-muted);
            }

            .ezra-autofill-value {
                font-weight: 600;
                color: #4ade80;
            }

            .ezra-autofill-actions {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }

            .ezra-autofill-btn {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ezra-autofill-btn.primary {
                background: #22c55e;
                color: white;
            }

            .ezra-autofill-btn.primary:hover {
                background: #16a34a;
            }

            .ezra-autofill-btn.secondary {
                background: rgba(255,255,255,0.06);
                color: var(--ezra-text);
                border: 1px solid rgba(255,255,255,0.1);
            }

            /* ===== TYPING INDICATOR ===== */
            .ezra-typing {
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 12px 18px;
            }

            .ezra-typing-dot {
                width: 7px;
                height: 7px;
                background: var(--ezra-gold);
                border-radius: 50%;
                animation: ezra-typing-bounce 1.4s infinite ease-in-out both;
            }

            .ezra-typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .ezra-typing-dot:nth-child(2) { animation-delay: -0.16s; }

            @keyframes ezra-typing-bounce {
                0%, 80%, 100% { transform: scale(0); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
            }

            /* ===== INPUT AREA ===== */
            .ezra-input-area {
                padding: 12px 16px;
                border-top: 1px solid rgba(255,255,255,0.06);
                background: rgba(0,0,0,0.15);
            }

            .ezra-input-wrapper {
                display: flex;
                gap: 8px;
                background: rgba(255,255,255,0.04);
                border-radius: 24px;
                padding: 4px;
                border: 1px solid rgba(255,255,255,0.08);
                transition: border-color 0.2s;
            }

            .ezra-input-wrapper:focus-within {
                border-color: var(--ezra-gold-dim);
                box-shadow: 0 0 0 3px rgba(197,160,89,0.08);
            }

            .ezra-input {
                flex: 1;
                border: none;
                background: transparent;
                padding: 10px 14px;
                font-size: 13px;
                resize: none;
                outline: none;
                max-height: 120px;
                font-family: inherit;
                color: var(--ezra-text);
            }

            .ezra-input::placeholder {
                color: var(--ezra-text-muted);
                opacity: 0.6;
            }

            .ezra-send-btn {
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                border: none;
                border-radius: 50%;
                color: var(--ezra-dark-1);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
            }

            .ezra-send-btn:hover:not(:disabled) {
                transform: scale(1.05);
                box-shadow: 0 0 12px rgba(212,175,55,0.4);
            }

            .ezra-send-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }

            .ezra-send-btn svg {
                width: 16px;
                height: 16px;
            }

            .ezra-input-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 6px;
                padding: 0 4px;
                font-size: 10px;
                color: rgba(148,163,184,0.5);
            }

            .ezra-tier-badge {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
                padding: 2px 8px;
                border-radius: 10px;
                font-weight: 700;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            /* ===== MODEL MODAL ===== */
            .ezra-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.6);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            }

            .ezra-modal-content {
                background: linear-gradient(135deg, var(--ezra-dark-2), var(--ezra-dark-1));
                border: 1px solid var(--ezra-glass-border);
                border-radius: var(--ezra-radius);
                padding: 24px;
                width: 320px;
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
            }

            .ezra-modal-content h4 {
                margin: 0 0 16px;
                font-size: 15px;
                font-weight: 600;
                color: var(--ezra-text);
            }

            .ezra-model-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .ezra-model-option {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: var(--ezra-radius-sm);
                background: rgba(255,255,255,0.03);
                cursor: pointer;
                transition: all 0.2s;
                color: var(--ezra-text);
            }

            .ezra-model-option:hover {
                background: rgba(255,255,255,0.06);
                border-color: rgba(255,255,255,0.15);
            }

            .ezra-model-option.active {
                border-color: var(--ezra-gold-dim);
                background: rgba(197,160,89,0.08);
            }

            .ezra-model-color {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                flex-shrink: 0;
            }

            .ezra-model-label {
                font-weight: 600;
                flex: 1;
                text-align: left;
                font-size: 13px;
            }

            .ezra-model-use {
                font-size: 10px;
                color: var(--ezra-text-muted);
            }

            /* ===== DEAL RADAR (dark theme) ===== */
            .ezra-deal-radar {
                padding: 16px;
                height: 100%;
                overflow-y: auto;
            }

            .ezra-dr-header {
                text-align: center;
                margin-bottom: 20px;
            }

            .ezra-dr-header h3 {
                margin: 0 0 8px;
                font-size: 18px;
                color: var(--ezra-text);
            }

            .ezra-dr-header p {
                margin: 0;
                color: var(--ezra-text-muted);
                font-size: 12px;
            }

            .ezra-dr-actions {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }

            .ezra-dr-btn {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: var(--ezra-radius-sm);
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: all 0.2s;
            }

            .ezra-dr-btn.primary {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
            }

            .ezra-dr-btn.primary:hover {
                box-shadow: 0 0 12px rgba(212,175,55,0.3);
            }

            .ezra-dr-btn.secondary {
                background: rgba(255,255,255,0.04);
                color: var(--ezra-text);
                border: 1px solid rgba(255,255,255,0.08);
            }

            .ezra-dr-btn.secondary:hover {
                background: rgba(255,255,255,0.08);
            }

            .ezra-dr-content {
                min-height: 200px;
            }

            .ezra-dr-empty {
                text-align: center;
                padding: 40px 20px;
                color: var(--ezra-text-muted);
            }

            .ezra-dr-icon {
                font-size: 48px;
                display: block;
                margin-bottom: 16px;
            }

            .ezra-dr-scanning {
                text-align: center;
                padding: 40px 20px;
            }

            .ezra-dr-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid var(--ezra-dark-3);
                border-top-color: var(--ezra-gold);
                border-radius: 50%;
                animation: ezra-spin 1s linear infinite;
                margin: 0 auto 16px;
            }

            @keyframes ezra-spin {
                to { transform: rotate(360deg); }
            }

            .ezra-dr-sub {
                font-size: 12px;
                color: var(--ezra-text-muted);
            }

            .ezra-dr-stats {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 20px;
            }

            .ezra-dr-stat {
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
                padding: 14px;
                border-radius: var(--ezra-radius-sm);
                text-align: center;
            }

            .ezra-dr-stat-value {
                display: block;
                font-size: 22px;
                font-weight: 700;
                color: var(--ezra-gold);
            }

            .ezra-dr-stat-label {
                font-size: 11px;
                color: var(--ezra-text-muted);
            }

            .ezra-dr-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .ezra-dr-card {
                background: rgba(255,255,255,0.03);
                border-radius: var(--ezra-radius-sm);
                padding: 14px;
                border: 1px solid rgba(255,255,255,0.06);
                transition: all 0.2s;
            }

            .ezra-dr-card:hover {
                border-color: var(--ezra-gold-dim);
                box-shadow: 0 0 12px rgba(197,160,89,0.1);
            }

            .ezra-dr-card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .ezra-dr-type {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
                padding: 3px 10px;
                border-radius: 12px;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ezra-dr-card-body h4 {
                margin: 0 0 8px;
                font-size: 15px;
                color: var(--ezra-text);
            }

            .ezra-dr-metrics {
                display: flex;
                gap: 16px;
                margin-bottom: 8px;
            }

            .ezra-dr-equity {
                color: #4ade80;
                font-weight: 600;
                font-size: 13px;
            }

            .ezra-dr-cltv {
                color: var(--ezra-text-muted);
                font-size: 13px;
            }

            .ezra-dr-strategy {
                margin: 0;
                font-size: 12px;
                color: var(--ezra-text-muted);
                line-height: 1.4;
            }

            .ezra-dr-card-actions {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }

            .ezra-dr-action-btn {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
                transition: all 0.2s;
            }

            .ezra-dr-action-btn:hover {
                box-shadow: 0 0 10px rgba(212,175,55,0.3);
            }

            .ezra-dr-action-btn.secondary {
                background: transparent;
                color: var(--ezra-text);
                border: 1px solid rgba(255,255,255,0.1);
            }

            .ezra-dr-action-btn.secondary:hover {
                background: rgba(255,255,255,0.06);
            }

            .ezra-dr-error {
                text-align: center;
                padding: 40px 20px;
                color: #f87171;
            }

            /* ===== RESPONSIVE ===== */
            @media (max-width: 480px) {
                .ezra-widget {
                    bottom: 20px;
                    right: 20px;
                }

                .ezra-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    width: auto;
                    height: auto;
                    border-radius: 0;
                    border: none;
                }
            }
        `;

        document.head.appendChild(styles);
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function setupEventListeners() {
        // Toggle button
        document.getElementById('ezra-orb')?.addEventListener('click', toggleWidget);

        // Close button
        document.getElementById('ezra-close')?.addEventListener('click', closeWidget);

        // Minimize button
        document.getElementById('ezra-minimize')?.addEventListener('click', minimizeWidget);

        // Model selector
        document.getElementById('ezra-model-selector')?.addEventListener('click', showModelModal);

        // Send button
        document.getElementById('ezra-send')?.addEventListener('click', sendMessage);

        // Input textarea
        const input = document.getElementById('ezra-input');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            input.addEventListener('input', autoResizeTextarea);
        }

        // Quick command buttons
        document.querySelectorAll('.ezra-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => handleQuickCommand(btn.dataset.action));
        });

        // Model selection
        document.querySelectorAll('.ezra-model-option').forEach(btn => {
            btn.addEventListener('click', () => selectModel(btn.dataset.model));
        });

        // Close modal on outside click
        document.getElementById('ezra-model-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'ezra-model-modal') {
                hideModelModal();
            }
        });
    }

    // ============================================
    // WIDGET CONTROLS
    // ============================================
    function toggleWidget() {
        const container = document.getElementById('ezra-container');
        EzraState.isOpen = !EzraState.isOpen;
        
        if (EzraState.isOpen) {
            container.classList.add('open');
            document.getElementById('ezra-orb').style.display = 'none';
            setTimeout(() => document.getElementById('ezra-input')?.focus(), 100);
        } else {
            container.classList.remove('open');
            document.getElementById('ezra-orb').style.display = 'flex';
        }
    }

    function closeWidget() {
        EzraState.isOpen = false;
        document.getElementById('ezra-container').classList.remove('open');
        document.getElementById('ezra-orb').style.display = 'flex';
    }

    function minimizeWidget() {
        EzraState.isMinimized = true;
        closeWidget();
    }

    function showModelModal() {
        document.getElementById('ezra-model-modal').style.display = 'flex';
    }

    function hideModelModal() {
        document.getElementById('ezra-model-modal').style.display = 'none';
    }

    function selectModel(model) {
        EzraState.currentModel = model;
        document.querySelectorAll('.ezra-model-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.model === model);
        });
        document.querySelector('.ezra-model-name').textContent = EZRA_CONFIG.models[model].name;
        hideModelModal();
    }

    function autoResizeTextarea() {
        const input = document.getElementById('ezra-input');
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        
        const sendBtn = document.getElementById('ezra-send');
        sendBtn.disabled = input.value.trim().length === 0;
    }

    // ============================================
    // MESSAGE HANDLING
    // ============================================
    async function sendMessage() {
        const input = document.getElementById('ezra-input');
        const message = input.value.trim();
        
        if (!message || EzraState.isTyping) return;

        // Clear input
        input.value = '';
        input.style.height = 'auto';
        document.getElementById('ezra-send').disabled = true;

        // Add user message
        addMessage('user', message);

        // Show typing indicator
        showTypingIndicator();

        try {
            // Route to appropriate AI model
            const response = await routeToAI(message);
            
            // Hide typing indicator
            hideTypingIndicator();
            
            // Add assistant response
            addMessage('assistant', response.content, response.metadata);
            
            // Handle auto-fill if present
            if (response.autoFillFields) {
                showAutoFillBlock(response.autoFillFields);
            }
            
            // Save to Supabase
            saveMessageToSupabase('user', message);
            saveMessageToSupabase('assistant', response.content, response.metadata);
            
        } catch (error) {
            hideTypingIndicator();
            addMessage('assistant', 'I apologize, but I encountered an error. Please try again.');
            console.error('Ezra error:', error);
        }
    }

    function addMessage(role, content, metadata = {}) {
        const messagesContainer = document.getElementById('ezra-messages');
        
        // Remove welcome message if present
        const welcome = messagesContainer.querySelector('.ezra-welcome');
        if (welcome) welcome.remove();

        const messageDiv = document.createElement('div');
        messageDiv.className = `ezra-message ${role}`;
        
        const avatar = role === 'assistant' ? '\u2726' : '\u2726';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="ezra-message-avatar">${avatar}</div>
            <div>
                <div class="ezra-message-content">${formatMessage(content)}</div>
                <div class="ezra-message-time">${time}${metadata.model ? ` · ${EZRA_CONFIG.models[metadata.model]?.name || metadata.model}` : ''}</div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Store in state
        EzraState.messages.push({ role, content, metadata, timestamp: new Date() });
    }

    function formatMessage(content) {
        // Simple markdown-like formatting
        return content
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    function showTypingIndicator() {
        EzraState.isTyping = true;
        document.getElementById('ezra-typing').style.display = 'flex';
        document.getElementById('ezra-messages').scrollTop = document.getElementById('ezra-messages').scrollHeight;
    }

    function hideTypingIndicator() {
        EzraState.isTyping = false;
        document.getElementById('ezra-typing').style.display = 'none';
    }

    // ============================================
    // QUICK COMMANDS
    // ============================================
    function handleQuickCommand(action) {
        if (action === 'deal_radar') {
            showDealRadar();
            return;
        }

        const prompts = {
            create_quote: 'Create a HELOC quote for my borrower',
            structure_deal: 'How should I structure this deal for optimal approval?',
            handle_objection: 'Help me handle a borrower objection about rates',
            explain_strategy: 'Explain this loan strategy in simple terms',
            client_script: 'Generate a client script for presenting this HELOC'
        };

        const input = document.getElementById('ezra-input');
        input.value = prompts[action] || '';
        input.focus();
        autoResizeTextarea();
    }

    // ============================================
    // DEAL RADAR UI
    // ============================================
    async function showDealRadar() {
        EzraState.activeTab = 'deal-radar';
        
        const messagesContainer = document.getElementById('ezra-messages');
        messagesContainer.innerHTML = `
            <div class="ezra-deal-radar">
                <div class="ezra-dr-header">
                    <h3>🎯 Deal Radar</h3>
                    <p>AI-powered equity opportunity scanner</p>
                </div>
                <div class="ezra-dr-actions">
                    <button class="ezra-dr-btn primary" onclick="Ezra.scanDealRadar()">
                        <span>🔍</span> Scan Database
                    </button>
                    <button class="ezra-dr-btn secondary" onclick="Ezra.showDealDashboard()">
                        <span>📊</span> Dashboard
                    </button>
                </div>
                <div id="ezra-dr-content" class="ezra-dr-content">
                    <div class="ezra-dr-empty">
                        <span class="ezra-dr-icon">📡</span>
                        <p>Click "Scan Database" to find equity opportunities in your borrower database</p>
                    </div>
                </div>
            </div>
        `;

        // Load existing opportunities if available
        loadDealOpportunities();
    }

    async function loadDealOpportunities() {
        if (!EzraState.user) return;

        try {
            const { data, error } = await EzraState.supabase
                .from('deal_radar')
                .select(`
                    *,
                    borrowers (first_name, last_name, credit_score)
                `)
                .eq('loan_officer_id', EzraState.user.id)
                .eq('status', 'new')
                .gt('expires_at', new Date().toISOString())
                .order('priority_score', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (data && data.length > 0) {
                renderDealOpportunities(data);
            }
        } catch (e) {
            console.error('Error loading deal opportunities:', e);
        }
    }

    function renderDealOpportunities(opportunities) {
        const content = document.getElementById('ezra-dr-content');
        if (!content) return;

        const totalEquity = opportunities.reduce((sum, opp) => sum + (opp.tappable_equity || 0), 0);

        content.innerHTML = `
            <div class="ezra-dr-stats">
                <div class="ezra-dr-stat">
                    <span class="ezra-dr-stat-value">${opportunities.length}</span>
                    <span class="ezra-dr-stat-label">Opportunities</span>
                </div>
                <div class="ezra-dr-stat">
                    <span class="ezra-dr-stat-value">$${(totalEquity / 1000).toFixed(0)}k</span>
                    <span class="ezra-dr-stat-label">Total Equity</span>
                </div>
            </div>
            <div class="ezra-dr-list">
                ${opportunities.map(opp => `
                    <div class="ezra-dr-card" data-opp-id="${opp.id}">
                        <div class="ezra-dr-card-header">
                            <span class="ezra-dr-type">${formatOpportunityType(opp.opportunity_type)}</span>
                            <span class="ezra-dr-priority" style="--priority: ${opp.priority_score}">
                                ${opp.priority_score >= 80 ? '🔥' : opp.priority_score >= 60 ? '⚡' : '💡'}
                            </span>
                        </div>
                        <div class="ezra-dr-card-body">
                            <h4>${opp.borrowers?.first_name} ${opp.borrowers?.last_name}</h4>
                            <div class="ezra-dr-metrics">
                                <span class="ezra-dr-equity">$${(opp.tappable_equity / 1000).toFixed(0)}k tappable</span>
                                <span class="ezra-dr-cltv">${opp.current_combined_ltv?.toFixed(1)}% CLTV</span>
                            </div>
                            <p class="ezra-dr-strategy">${opp.suggested_strategy?.substring(0, 100)}...</p>
                        </div>
                        <div class="ezra-dr-card-actions">
                            <button class="ezra-dr-action-btn" onclick="Ezra.createQuoteFromDeal('${opp.id}')">
                                Create Quote
                            </button>
                            <button class="ezra-dr-action-btn secondary" onclick="Ezra.viewDealDetails('${opp.id}')">
                                Details
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function formatOpportunityType(type) {
        const types = {
            heloc: 'HELOC',
            cash_out_refi: 'Cash-Out Refi',
            debt_consolidation: 'Debt Consolidation',
            rate_reduction: 'Rate Reduction',
            equity_access: 'Equity Access'
        };
        return types[type] || type;
    }

    async function scanDealRadar() {
        const content = document.getElementById('ezra-dr-content');
        content.innerHTML = `
            <div class="ezra-dr-scanning">
                <div class="ezra-dr-spinner"></div>
                <p>Scanning borrower database for equity opportunities...</p>
                <p class="ezra-dr-sub">This may take a moment</p>
            </div>
        `;

        try {
            const response = await fetch(`${EzraState.supabase.supabaseUrl}/functions/v1/deal-radar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${EzraState.supabase.supabaseKey}`
                },
                body: JSON.stringify({
                    action: 'full_scan',
                    loanOfficerId: EzraState.user.id
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast(`Found ${result.opportunitiesFound} opportunities!`, 'success');
                loadDealOpportunities();
            } else {
                throw new Error(result.error);
            }
        } catch (e) {
            console.error('Deal Radar scan error:', e);
            content.innerHTML = `
                <div class="ezra-dr-error">
                    <span>⚠️</span>
                    <p>Scan failed. Please try again.</p>
                    <button onclick="Ezra.scanDealRadar()">Retry</button>
                </div>
            `;
        }
    }

    async function createQuoteFromDeal(opportunityId) {
        try {
            const { data: opp, error } = await EzraState.supabase
                .from('deal_radar')
                .select(`*, borrowers (*)`)
                .eq('id', opportunityId)
                .single();

            if (error) throw error;

            // Build quote from opportunity data
            const quoteMessage = `Build a HELOC quote for ${opp.borrowers.first_name} ${opp.borrowers.last_name}, ` +
                `$${(opp.tappable_equity / 1000).toFixed(0)}k equity available, ` +
                `${opp.current_combined_ltv?.toFixed(1)}% CLTV`;

            // Switch back to chat and send
            EzraState.activeTab = 'chat';
            document.getElementById('ezra-input').value = quoteMessage;
            sendMessage();

        } catch (e) {
            console.error('Error creating quote from deal:', e);
            showToast('Failed to create quote', 'error');
        }
    }

    async function viewDealDetails(opportunityId) {
        // Show detailed view in chat
        EzraState.activeTab = 'chat';
        document.getElementById('ezra-input').value = `Show me details for deal opportunity ${opportunityId}`;
        sendMessage();
    }

    async function showDealDashboard() {
        try {
            const response = await fetch(`${EzraState.supabase.supabaseUrl}/functions/v1/deal-radar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${EzraState.supabase.supabaseKey}`
                },
                body: JSON.stringify({
                    action: 'get_dashboard',
                    loanOfficerId: EzraState.user.id
                })
            });

            const result = await response.json();
            
            // Display dashboard in chat
            EzraState.activeTab = 'chat';
            const dashboardText = formatDashboardText(result.dashboard);
            addMessage('assistant', dashboardText);

        } catch (e) {
            console.error('Error loading dashboard:', e);
            showToast('Failed to load dashboard', 'error');
        }
    }

    function formatDashboardText(dashboard) {
        return `## 📊 Deal Radar Dashboard

**Overview**
• Total Opportunities: ${dashboard.total_opportunities || 0}
• Total Tappable Equity: $${((dashboard.total_tappable_equity || 0) / 1000).toFixed(0)}k

**By Opportunity Type**
${Object.entries(dashboard.by_type || {}).map(([type, count]) => `• ${formatOpportunityType(type)}: ${count}`).join('\n')}

**Top Opportunities**
${(dashboard.top_opportunities || []).slice(0, 5).map((opp, i) => 
    `${i + 1}. ${opp.type} - $${(opp.equity / 1000).toFixed(0)}k equity (${opp.confidence * 100}% confidence)`
).join('\n')}

Use the **Deal Radar** tab to view all opportunities and create quotes.`;
    }

    // ============================================
    // AI ROUTING (Task 3)
    // ============================================
    async function routeToAI(message) {
        // Determine intent and route to appropriate model
        const intent = determineIntent(message);
        
        // Route based on intent and user preference
        let model = EzraState.currentModel;
        
        // Override based on task complexity
        if (intent === 'quote_calculation') {
            model = 'claude'; // Best for calculations
        } else if (intent === 'simple_chat') {
            model = 'gemini'; // Fast for simple queries
        } else if (intent === 'complex_strategy') {
            model = 'gpt'; // Best for complex reasoning
        }

        // Call the appropriate AI service
        const response = await callAIService(message, model, intent);
        
        return {
            content: response.content,
            metadata: { model, intent },
            autoFillFields: response.autoFillFields
        };
    }

    function determineIntent(message) {
        const lower = message.toLowerCase();
        
        if (/quote|calculate|cltv|payment|amount|rate/i.test(lower)) {
            return 'quote_calculation';
        }
        if (/structure|strategy|optimize|approval|probability/i.test(lower)) {
            return 'complex_strategy';
        }
        if (/create|build|make|generate.*quote/i.test(lower)) {
            return 'quote_creation';
        }
        if (/objection|handle|respond|concern/i.test(lower)) {
            return 'objection_handling';
        }
        if (/explain|script|say|tell|presentation/i.test(lower)) {
            return 'sales_coach';
        }
        return 'simple_chat';
    }

    async function callAIService(message, model, intent) {
        // This would call your Edge Function or API endpoint
        // For now, returning a mock response
        
        // In production, this calls:
        // POST /functions/v1/ezra-chat
        // { message, model, intent, conversationId, userId }
        
        const mockResponses = {
            quote_creation: `I'll help you create a HELOC quote. Let me gather the borrower information and calculate the optimal structure.

**Quote Summary**
• Loan Amount: $150,000
• Interest Rate: 8.25%
• Origination Fee: $995
• Draw Period: 10 years
• Repayment Term: 20 years

**Key Metrics**
• Combined LTV: 67%
• Interest-Only Payment: ~$1,031/month

Would you like me to auto-fill these fields in the quote tool?`,

            complex_strategy: `Based on the borrower's profile, here's my recommended deal strategy:

**Deal Strategy**
Structure as a fixed-rate HELOC to provide payment stability. The 67% CLTV is well within guidelines.

**Approval Considerations**
• Strong equity position (33% remaining)
• Credit score qualifies for tier 1 rates
• Debt-to-income within acceptable range

**Recommended Structure**
• 10-year draw with 20-year amortization
• Interest-only option for first 10 years
• Consider rate lock for first $50K draw`,

            objection_handling: `Here's how to handle rate concerns:

**Explanation**
While the rate may seem higher than a first mortgage, remember you're only paying interest on what you use, not the full credit line.

**Analogy**
"Think of the HELOC as a financial safety net - like insurance. You have access to $150K but if you only use $20K for a kitchen remodel, you only pay interest on that $20K."

**Suggested Script**
"I understand rate is important. The beauty of a HELOC is flexibility - you can lock in portions at fixed rates when rates are favorable, while keeping the rest as a low-cost safety net. You're not committed to borrowing the full amount."`,

            sales_coach: `Here's a client-friendly explanation:

**Quote Summary**
$150,000 HELOC at 8.25% with a 10-year draw period.

**Loan Strategy**
Use the HELOC to consolidate high-interest debt while preserving your first mortgage rate.

**What To Say To The Client**
"Think of this HELOC as a financial safety net. You only pay interest on the amount you actually use, not the full $150,000. It's there when you need it - for home improvements, debt consolidation, or emergencies. During the first 10 years, you can draw, repay, and redraw as needed. After that, any balance converts to a 20-year payment plan."`,

            simple_chat: `I'm here to help! I can assist you with:

• Building HELOC quotes
• Structuring loan scenarios
• Calculating CLTV and payments
• Handling borrower objections
• Generating client scripts

What would you like to work on?`
        };

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        return {
            content: mockResponses[intent] || mockResponses.simple_chat,
            autoFillFields: intent === 'quote_creation' ? {
                borrower_name: 'Maria Lopez',
                property_value: 850000,
                existing_mortgage_balance: 420000,
                heloc_amount: 150000,
                combined_ltv: 67,
                interest_rate: 8.25,
                origination_fee: 995,
                draw_period_years: 10,
                repayment_term_years: 20,
                interest_only_payment_estimate: 1031
            } : null
        };
    }

    // ============================================
    // AUTO-FILL FUNCTIONALITY (Task 4)
    // ============================================
    function showAutoFillBlock(fields) {
        const messagesContainer = document.getElementById('ezra-messages');
        
        const autoFillDiv = document.createElement('div');
        autoFillDiv.className = 'ezra-message assistant';
        
        const fieldRows = Object.entries(fields).map(([key, value]) => `
            <div class="ezra-autofill-field">
                <span class="ezra-autofill-label">${formatFieldLabel(key)}</span>
                <span class="ezra-autofill-value">${formatFieldValue(key, value)}</span>
            </div>
        `).join('');
        
        autoFillDiv.innerHTML = `
            <div class="ezra-message-avatar">🤖</div>
            <div style="flex: 1;">
                <div class="ezra-autofill-block">
                    <div class="ezra-autofill-header">
                        <span>⚡</span>
                        <span>Ready to Auto-Fill Quote Fields</span>
                    </div>
                    <div class="ezra-autofill-fields">
                        ${fieldRows}
                    </div>
                    <div class="ezra-autofill-actions">
                        <button class="ezra-autofill-btn primary" onclick="Ezra.applyAutoFill(${JSON.stringify(fields).replace(/"/g, '&quot;')})">
                            Apply to Quote Tool
                        </button>
                        <button class="ezra-autofill-btn secondary" onclick="this.closest('.ezra-message').remove()">
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        messagesContainer.appendChild(autoFillDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function formatFieldLabel(key) {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function formatFieldValue(key, value) {
        if (key.includes('amount') || key.includes('value') || key.includes('balance') || key.includes('fee')) {
            return '$' + value.toLocaleString();
        }
        if (key.includes('rate') || key.includes('ltv')) {
            return value + '%';
        }
        if (key.includes('years')) {
            return value + ' years';
        }
        if (key.includes('payment')) {
            return '$' + value.toLocaleString() + '/mo';
        }
        return value;
    }

    function applyAutoFill(fields) {
        // Map Ezra fields to form field IDs
        const fieldMap = {
            borrower_name: 'in-client-name',
            property_value: 'in-home-value',
            existing_mortgage_balance: 'in-mortgage-balance',
            heloc_amount: 'in-net-cash',
            interest_rate: 'heloc-rate',
            origination_fee: 'origination-fee',
            combined_ltv: 'cltv-display'
        };

        let appliedCount = 0;
        
        Object.entries(fields).forEach(([ezraKey, value]) => {
            const formFieldId = fieldMap[ezraKey];
            if (formFieldId) {
                const field = document.getElementById(formFieldId);
                if (field) {
                    field.value = value;
                    field.dispatchEvent(new Event('change'));
                    appliedCount++;
                    
                    // Visual feedback
                    field.style.transition = 'background 0.3s';
                    field.style.background = '#dcfce7';
                    setTimeout(() => field.style.background = '', 1000);
                }
            }
        });

        // Show confirmation
        showToast(`Applied ${appliedCount} fields to quote tool`, 'success');
        
        // Trigger calculations
        if (typeof updateCalculations === 'function') {
            updateCalculations();
        }
        if (typeof autoSave === 'function') {
            autoSave();
        }
    }

    // ============================================
    // SUPABASE INTEGRATION
    // ============================================
    async function loadOrCreateConversation() {
        if (!EzraState.user) return;

        // Check for existing active conversation
        const { data, error } = await EzraState.supabase
            .from('ezra_conversations')
            .select('*')
            .eq('loan_officer_id', EzraState.user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (data) {
            EzraState.conversationId = data.id;
            loadConversationHistory(data.id);
        } else {
            createNewConversation();
        }
    }

    async function createNewConversation() {
        const conversationId = 'ezra_' + Date.now();
        
        const { data, error } = await EzraState.supabase
            .from('ezra_conversations')
            .insert({
                conversation_id: conversationId,
                loan_officer_id: EzraState.user.id,
                tier_access: EzraState.userTier,
                status: 'active'
            })
            .select()
            .single();

        if (data) {
            EzraState.conversationId = data.id;
        }
    }

    async function loadConversationHistory(conversationId) {
        const { data, error } = await EzraState.supabase
            .from('ezra_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(50);

        if (data) {
            data.forEach(msg => {
                addMessage(msg.role, msg.content, { model: msg.model_used });
            });
        }
    }

    async function saveMessageToSupabase(role, content, metadata = {}) {
        if (!EzraState.conversationId) return;

        await EzraState.supabase
            .from('ezra_messages')
            .insert({
                conversation_id: EzraState.conversationId,
                role,
                content,
                model_used: metadata.model,
                metadata
            });
    }

    async function loadUserPreferences() {
        if (!EzraState.user) return;

        const { data, error } = await EzraState.supabase
            .from('ezra_user_preferences')
            .select('*')
            .eq('loan_officer_id', EzraState.user.id)
            .single();

        if (data) {
            EzraState.currentModel = data.preferred_model;
            EzraState.autoFillEnabled = data.auto_fill_enabled;
            EzraState.userTier = data.default_tier;
            
            // Update UI
            document.querySelector('.ezra-model-name').textContent = 
                EZRA_CONFIG.models[data.preferred_model]?.name || 'Claude';
            document.querySelector('.ezra-tier-badge').textContent = 
                data.default_tier + ' tier';
        }
    }

    // ============================================
    // VECTOR SEARCH (Task 5)
    // ============================================
    async function searchKnowledgeBase(query, category = null) {
        // This would call an Edge Function that:
        // 1. Generates embedding for the query
        // 2. Calls search_ezra_knowledge() in Supabase
        // 3. Returns relevant context
        
        const { data, error } = await EzraState.supabase
            .rpc('search_ezra_knowledge', {
                query_embedding: query, // Would be actual embedding vector
                match_threshold: 0.7,
                match_count: 5,
                filter_category: category
            });

        return data || [];
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================
    window.Ezra = {
        init: initEzra,
        toggle: toggleWidget,
        open: () => { if (!EzraState.isOpen) toggleWidget(); },
        close: closeWidget,
        sendMessage: (msg) => {
            document.getElementById('ezra-input').value = msg;
            sendMessage();
        },
        applyAutoFill: applyAutoFill,
        setModel: selectModel,
        getState: () => ({ ...EzraState }),
        searchKnowledge: searchKnowledgeBase,
        // Deal Radar API
        showDealRadar: showDealRadar,
        scanDealRadar: scanDealRadar,
        showDealDashboard: showDealDashboard,
        createQuoteFromDeal: createQuoteFromDeal,
        viewDealDetails: viewDealDetails
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEzra);
    } else {
        initEzra();
    }

    // Also listen for auth-ready event as a fallback trigger
    document.addEventListener('auth-ready', () => {
        if (!EzraState.supabase && window._supabase) {
            initEzra();
        }
    });

})();
