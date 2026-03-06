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
        user: null
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    function initEzra() {
        // Wait for Supabase to be available
        if (typeof window.supabase === 'undefined') {
            console.log('Ezra: Waiting for Supabase...');
            setTimeout(initEzra, 500);
            return;
        }

        // Initialize Supabase client
        EzraState.supabase = window.supabase.createClient(
            EZRA_CONFIG.supabaseUrl,
            EZRA_CONFIG.supabaseKey
        );

        // Check auth state
        checkAuthState();

        // Create widget DOM
        createWidgetDOM();

        // Load user preferences
        loadUserPreferences();

        // Setup event listeners
        setupEventListeners();

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
            <!-- Floating Toggle Button -->
            <button id="ezra-toggle" class="ezra-toggle" aria-label="Open Ezra AI Assistant">
                <span class="ezra-toggle-icon">🤖</span>
                <span class="ezra-toggle-text">Ezra</span>
            </button>

            <!-- Chat Container -->
            <div id="ezra-container" class="ezra-container">
                <!-- Header -->
                <div class="ezra-header">
                    <div class="ezra-header-left">
                        <span class="ezra-avatar">🤖</span>
                        <div class="ezra-header-info">
                            <span class="ezra-title">${EZRA_CONFIG.widgetTitle}</span>
                            <span class="ezra-status">
                                <span class="ezra-status-dot"></span>
                                <span class="ezra-status-text">Online</span>
                            </span>
                        </div>
                    </div>
                    <div class="ezra-header-actions">
                        <button id="ezra-model-selector" class="ezra-model-btn" title="AI Model">
                            <span class="ezra-model-icon">🧠</span>
                            <span class="ezra-model-name">Claude</span>
                        </button>
                        <button id="ezra-minimize" class="ezra-icon-btn" title="Minimize">−</button>
                        <button id="ezra-close" class="ezra-icon-btn" title="Close">×</button>
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
                        <div class="ezra-welcome-icon">👋</div>
                        <h3>Hello! I'm Ezra</h3>
                        <p>Your AI loan structuring assistant. I can help you:</p>
                        <ul>
                            <li>Build HELOC quotes</li>
                            <li>Structure optimal loan scenarios</li>
                            <li>Handle borrower objections</li>
                            <li>Generate client scripts</li>
                        </ul>
                        <p class="ezra-welcome-hint">Try a quick command above or type your question!</p>
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
                        <span class="ezra-tier-badge">${EzraState.userTier} tier</span>
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
               EZRA WIDGET STYLES
               ============================================ */
            
            /* CSS Variables */
            :root {
                --ezra-primary: #1e3a5f;
                --ezra-primary-light: #2d5a8f;
                --ezra-accent: #d4af37;
                --ezra-bg: #ffffff;
                --ezra-surface: #f8fafc;
                --ezra-border: #e2e8f0;
                --ezra-text: #1e293b;
                --ezra-text-muted: #64748b;
                --ezra-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                --ezra-radius: 16px;
                --ezra-radius-sm: 8px;
            }

            /* Widget Container */
            .ezra-widget {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 9999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            /* Toggle Button */
            .ezra-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 20px;
                background: linear-gradient(135deg, var(--ezra-primary) 0%, var(--ezra-primary-light) 100%);
                color: white;
                border: none;
                border-radius: 50px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: var(--ezra-shadow);
                transition: all 0.3s ease;
            }

            .ezra-toggle:hover {
                transform: translateY(-2px);
                box-shadow: 0 25px 30px -5px rgba(0, 0, 0, 0.15);
            }

            .ezra-toggle-icon {
                font-size: 20px;
            }

            /* Chat Container */
            .ezra-container {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 420px;
                height: 600px;
                background: var(--ezra-bg);
                border-radius: var(--ezra-radius);
                box-shadow: var(--ezra-shadow);
                display: none;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid var(--ezra-border);
            }

            .ezra-container.open {
                display: flex;
                animation: ezra-slide-in 0.3s ease;
            }

            @keyframes ezra-slide-in {
                from {
                    opacity: 0;
                    transform: translateY(20px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            /* Header */
            .ezra-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                background: linear-gradient(135deg, var(--ezra-primary) 0%, var(--ezra-primary-light) 100%);
                color: white;
            }

            .ezra-header-left {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .ezra-avatar {
                width: 40px;
                height: 40px;
                background: rgba(255,255,255,0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
            }

            .ezra-header-info {
                display: flex;
                flex-direction: column;
            }

            .ezra-title {
                font-weight: 600;
                font-size: 14px;
            }

            .ezra-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                opacity: 0.9;
            }

            .ezra-status-dot {
                width: 8px;
                height: 8px;
                background: #22c55e;
                border-radius: 50%;
                animation: ezra-pulse 2s infinite;
            }

            @keyframes ezra-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .ezra-header-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .ezra-icon-btn, .ezra-model-btn {
                width: 32px;
                height: 32px;
                background: rgba(255,255,255,0.1);
                border: none;
                border-radius: var(--ezra-radius-sm);
                color: white;
                font-size: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            }

            .ezra-icon-btn:hover, .ezra-model-btn:hover {
                background: rgba(255,255,255,0.2);
            }

            .ezra-model-btn {
                width: auto;
                padding: 0 10px;
                gap: 6px;
                font-size: 12px;
            }

            .ezra-model-icon {
                font-size: 14px;
            }

            /* Quick Commands */
            .ezra-quick-commands {
                display: flex;
                gap: 8px;
                padding: 12px 16px;
                background: var(--ezra-surface);
                border-bottom: 1px solid var(--ezra-border);
                overflow-x: auto;
                scrollbar-width: none;
            }

            .ezra-quick-commands::-webkit-scrollbar {
                display: none;
            }

            .ezra-quick-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 14px;
                background: white;
                border: 1px solid var(--ezra-border);
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                color: var(--ezra-text);
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s;
            }

            .ezra-quick-btn:hover {
                background: var(--ezra-primary);
                color: white;
                border-color: var(--ezra-primary);
            }

            /* Messages Area */
            .ezra-messages {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .ezra-welcome {
                text-align: center;
                padding: 20px;
                color: var(--ezra-text);
            }

            .ezra-welcome-icon {
                font-size: 48px;
                margin-bottom: 16px;
            }

            .ezra-welcome h3 {
                margin: 0 0 12px;
                font-size: 20px;
            }

            .ezra-welcome p {
                margin: 0 0 16px;
                color: var(--ezra-text-muted);
                line-height: 1.5;
            }

            .ezra-welcome ul {
                text-align: left;
                display: inline-block;
                margin: 0 0 16px;
                padding-left: 20px;
                color: var(--ezra-text-muted);
            }

            .ezra-welcome li {
                margin: 6px 0;
            }

            .ezra-welcome-hint {
                font-size: 13px;
                font-style: italic;
            }

            /* Message Bubbles */
            .ezra-message {
                display: flex;
                gap: 12px;
                max-width: 85%;
            }

            .ezra-message.user {
                align-self: flex-end;
                flex-direction: row-reverse;
            }

            .ezra-message-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                flex-shrink: 0;
            }

            .ezra-message.assistant .ezra-message-avatar {
                background: var(--ezra-primary);
            }

            .ezra-message.user .ezra-message-avatar {
                background: var(--ezra-accent);
            }

            .ezra-message-content {
                background: var(--ezra-surface);
                padding: 12px 16px;
                border-radius: var(--ezra-radius-sm);
                font-size: 14px;
                line-height: 1.5;
                color: var(--ezra-text);
            }

            .ezra-message.user .ezra-message-content {
                background: var(--ezra-primary);
                color: white;
            }

            .ezra-message-time {
                font-size: 11px;
                color: var(--ezra-text-muted);
                margin-top: 4px;
            }

            /* Auto-fill Block */
            .ezra-autofill-block {
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                border: 1px solid #86efac;
                border-radius: var(--ezra-radius-sm);
                padding: 16px;
                margin-top: 12px;
            }

            .ezra-autofill-header {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: #166534;
                margin-bottom: 12px;
            }

            .ezra-autofill-fields {
                display: grid;
                gap: 8px;
            }

            .ezra-autofill-field {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: white;
                border-radius: 6px;
                font-size: 13px;
            }

            .ezra-autofill-label {
                color: var(--ezra-text-muted);
            }

            .ezra-autofill-value {
                font-weight: 600;
                color: var(--ezra-text);
            }

            .ezra-autofill-actions {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }

            .ezra-autofill-btn {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ezra-autofill-btn.primary {
                background: #22c55e;
                color: white;
            }

            . .ezra-autofill-btn.primary:hover {
                background: #16a34a;
            }

            .ezra-autofill-btn.secondary {
                background: white;
                color: var(--ezra-text);
                border: 1px solid var(--ezra-border);
            }

            /* Typing Indicator */
            .ezra-typing {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 16px 20px;
            }

            .ezra-typing-dot {
                width: 8px;
                height: 8px;
                background: var(--ezra-text-muted);
                border-radius: 50%;
                animation: ezra-typing-bounce 1.4s infinite ease-in-out both;
            }

            .ezra-typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .ezra-typing-dot:nth-child(2) { animation-delay: -0.16s; }

            @keyframes ezra-typing-bounce {
                0%, 80%, 100% { transform: scale(0); }
                40% { transform: scale(1); }
            }

            /* Input Area */
            .ezra-input-area {
                padding: 16px 20px;
                border-top: 1px solid var(--ezra-border);
                background: white;
            }

            .ezra-input-wrapper {
                display: flex;
                gap: 8px;
                background: var(--ezra-surface);
                border-radius: 24px;
                padding: 4px;
                border: 1px solid var(--ezra-border);
            }

            .ezra-input {
                flex: 1;
                border: none;
                background: transparent;
                padding: 12px 16px;
                font-size: 14px;
                resize: none;
                outline: none;
                max-height: 120px;
                font-family: inherit;
            }

            .ezra-send-btn {
                width: 40px;
                height: 40px;
                background: var(--ezra-primary);
                border: none;
                border-radius: 50%;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .ezra-send-btn:hover:not(:disabled) {
                background: var(--ezra-primary-light);
            }

            .ezra-send-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .ezra-send-btn svg {
                width: 18px;
                height: 18px;
            }

            .ezra-input-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 8px;
                font-size: 11px;
                color: var(--ezra-text-muted);
            }

            .ezra-tier-badge {
                background: linear-gradient(135deg, var(--ezra-accent) 0%, #b8941f 100%);
                color: white;
                padding: 2px 8px;
                border-radius: 10px;
                font-weight: 600;
                text-transform: uppercase;
            }

            /* Model Modal */
            .ezra-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }

            .ezra-modal-content {
                background: white;
                border-radius: var(--ezra-radius);
                padding: 24px;
                width: 320px;
                box-shadow: var(--ezra-shadow);
            }

            .ezra-modal-content h4 {
                margin: 0 0 16px;
                font-size: 16px;
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
                border: 2px solid var(--ezra-border);
                border-radius: var(--ezra-radius-sm);
                background: white;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ezra-model-option:hover,
            .ezra-model-option.active {
                border-color: var(--ezra-primary);
                background: var(--ezra-surface);
            }

            .ezra-model-color {
                width: 12px;
                height: 12px;
                border-radius: 50%;
            }

            .ezra-model-label {
                font-weight: 600;
                flex: 1;
                text-align: left;
            }

            .ezra-model-use {
                font-size: 11px;
                color: var(--ezra-text-muted);
            }

            /* Responsive */
            @media (max-width: 480px) {
                .ezra-widget {
                    bottom: 16px;
                    right: 16px;
                    left: 16px;
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
                }

                .ezra-toggle-text {
                    display: none;
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
        document.getElementById('ezra-toggle')?.addEventListener('click', toggleWidget);

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
            document.getElementById('ezra-toggle').style.display = 'none';
            setTimeout(() => document.getElementById('ezra-input')?.focus(), 100);
        } else {
            container.classList.remove('open');
            document.getElementById('ezra-toggle').style.display = 'flex';
        }
    }

    function closeWidget() {
        EzraState.isOpen = false;
        document.getElementById('ezra-container').classList.remove('open');
        document.getElementById('ezra-toggle').style.display = 'flex';
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
        
        const avatar = role === 'assistant' ? '🤖' : '👤';
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
        searchKnowledge: searchKnowledgeBase
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEzra);
    } else {
        initEzra();
    }

})();
