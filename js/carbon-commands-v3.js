/**
 * 🎯 Carbon Command Palette v3.0 - Ultimate Edition
 * Natural Language + Workflow Recorder + Smart Predictions + Team Sharing + Automation
 * 
 * Press Cmd/Ctrl+K or / to open
 * Say "Hey Carbon" for voice
 * Type naturally - AI understands
 */

(function() {
    'use strict';

    const DEFAULT_WAKE_WORD = 'hey ezra';
    const DEFAULT_VOICE_LANG = 'en-US';

    // ==================== CONFIGURATION ====================
    const CONFIG = {
        version: '3.0',
        debug: false,
        maxHistory: 50,
        predictionCount: 3,
        voiceLang: getStoredVoiceLang(),
        autoSaveInterval: 30000, // 30 seconds
    };

    // ==================== VOICE STATE ====================
    let voiceOrb = null;
    let voiceStatus = null;
    let voiceEnabled = localStorage.getItem('carbon_voice_enabled') === 'true';
    let voiceAlwaysListening = localStorage.getItem('carbon_voice_always_listening') === 'true';
    let activeWakeWords = getStoredWakeWords();

    function getStoredWakeWord() {
        return (localStorage.getItem('carbon_wake_word') || DEFAULT_WAKE_WORD).toLowerCase();
    }

    function getStoredWakeWords() {
        return [getStoredWakeWord()];
    }

    function getStoredVoiceLang() {
        return localStorage.getItem('carbon_voice_lang') || DEFAULT_VOICE_LANG;
    }

    function formatWakeWord(wakeWord) {
        return (wakeWord || DEFAULT_WAKE_WORD).replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function getWakeWordPrompt(prefix = 'Say') {
        return `${prefix} "${formatWakeWord(activeWakeWords[0])}"`;
    }

    function getVoiceSettings() {
        return {
            enabled: voiceEnabled,
            wakeWord: activeWakeWords[0] || DEFAULT_WAKE_WORD,
            voiceLang: CONFIG.voiceLang,
        };
    }

    function recordVoiceTelemetry(eventType, data = {}) {
        const payload = {
            eventType,
            createdAt: new Date().toISOString(),
            userId: window.currentUserId || null,
            settings: getVoiceSettings(),
            data,
        };

        try {
            const storageKey = `carbon_voice_telemetry_${window.currentUserId || 'anon'}`;
            const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
            existing.push(payload);
            localStorage.setItem(storageKey, JSON.stringify(existing.slice(-50)));
        } catch (e) {
            // Ignore localStorage issues; telemetry should never break voice UX.
        }

        window.dispatchEvent(new CustomEvent('carbon:voice-telemetry', { detail: payload }));

        if (CONFIG.debug) {
            console.debug('[Carbon Voice Telemetry]', payload);
        }
    }

    // ==================== COMMAND REGISTRY (v2.0 + New) ====================
    const COMMANDS = {
        // ... (All v2.0 commands preserved)
        // Navigation, Quote, Product, Program, Template, Lead, Sequence, 
        // Email, Calculator, Export, AI, View, Admin, Data, Macro, Help
        // See v2.0 file for full list

        // ===== NEW v3.0 COMMANDS =====
        
        // Workflow Commands
        'record workflow': {
            alias: 'record,/record',
            action: (name) => startRecording(name),
            category: 'workflow',
            description: 'Record a workflow: /record my-workflow-name'
        },
        'stop recording': {
            alias: 'stop,/stop',
            action: () => stopRecording(),
            category: 'workflow',
            description: 'Stop recording workflow'
        },
        'run workflow': {
            alias: 'run,/run,/workflow',
            action: (name) => runWorkflow(name),
            category: 'workflow',
            description: 'Run a saved workflow: /run my-workflow'
        },
        'list workflows': {
            alias: 'workflows,/workflows',
            action: () => listWorkflows(),
            category: 'workflow',
            description: 'List all saved workflows'
        },
        'delete workflow': {
            alias: '/deleteworkflow',
            action: (name) => deleteWorkflow(name),
            category: 'workflow',
            description: 'Delete a workflow'
        },

        // Schedule Commands
        'schedule command': {
            alias: '/schedule',
            action: (cmd, when) => scheduleCommand(cmd, when),
            category: 'automation',
            description: 'Schedule: /schedule "follow up" "daily 9am"'
        },
        'list schedules': {
            alias: '/schedules',
            action: () => listSchedules(),
            category: 'automation',
            description: 'List scheduled commands'
        },
        'cancel schedule': {
            alias: '/cancel',
            action: (id) => cancelSchedule(id),
            category: 'automation',
            description: 'Cancel scheduled command'
        },

        // Team Commands
        'share command': {
            alias: '/share',
            action: (name, user) => shareCommand(name, user),
            category: 'team',
            description: 'Share command with team'
        },
        'import command': {
            alias: '/import',
            action: (name, from) => importCommand(name, from),
            category: 'team',
            description: 'Import: /import closer-script from sarah'
        },
        'team commands': {
            alias: '/team',
            action: () => listTeamCommands(),
            category: 'team',
            description: 'List team shared commands'
        },

        // Natural Language
        'ask ai': {
            alias: 'ai,/ai',
            action: (question) => naturalLanguageCommand(question),
            category: 'ai',
            description: 'Ask in natural language'
        },

        // Settings
        'toggle predictions': {
            alias: '/predictions',
            action: () => togglePredictions(),
            category: 'settings',
            description: 'Toggle smart predictions'
        },
        'toggle natural language': {
            alias: '/nl',
            action: () => toggleNaturalLanguage(),
            category: 'settings',
            description: 'Toggle natural language mode'
        },
        'export settings': {
            alias: '/exportsettings',
            action: () => exportSettings(),
            category: 'settings',
            description: 'Export all settings'
        },
        'import settings': {
            alias: '/importsettings',
            action: () => importSettings(),
            category: 'settings',
            description: 'Import settings'
        },
        'health monitor': {
            alias: 'health,/health,/status,/monitor',
            action: () => openHealthDashboard(),
            category: 'admin',
            description: 'Open Integration Health Monitor dashboard'
        },
        'test integrations': {
            alias: '/testintegrations,/testall',
            action: () => testAllIntegrations(),
            category: 'admin',
            description: 'Run all integration health tests'
        },
    };

    // ==================== NATURAL LANGUAGE PATTERNS ====================
    const NL_PATTERNS = [
        {
            pattern: /(?:create|make|start|new)\s+(?:a\s+)?quote\s+(?:for\s+)?([\w\s]+?)(?:\s+with\s+|\s+home\s+|\s+value\s+|\s+at\s+|\s+worth\s+)?([\d.km]+)?/i,
            handler: (matches) => {
                const name = matches[1]?.trim();
                const value = matches[2] ? parseValue(matches[2]) : null;
                return { command: 'new quote', params: [] };
            }
        },
        {
            pattern: /(?:find|search|look\s+up|where\s+is)\s+([\w\s]+)/i,
            handler: (matches) => {
                return { command: 'find lead', params: [matches[1].trim()] };
            }
        },
        {
            pattern: /(?:what\'s|what\s+is|calculate)\s+(?:the\s+)?payment\s+(?:on\s+)?([\d.km]+)(?:\s+at\s+|\s+with\s+rate\s+)?([\d.]+)%?(?:\s+for\s+)?(\d+)\s*years?/i,
            handler: (matches) => {
                const amount = parseValue(matches[1]);
                const rate = parseFloat(matches[2]);
                const term = parseInt(matches[3]);
                return { command: 'calc payment', params: [amount, rate, term] };
            }
        },
        {
            pattern: /(?:follow\s+up|contact|reach\s+out\s+to)\s+(?:with\s+)?([\w\s]+)/i,
            handler: (matches) => {
                return { command: 'follow up', params: [matches[1].trim()] };
            }
        },
        {
            pattern: /(?:enroll|add|put)\s+([\w\s]+?)\s+(?:in|to)\s+(?:the\s+)?([\w-]+)\s+sequence/i,
            handler: (matches) => {
                return { command: 'enroll lead', params: [matches[1].trim(), matches[2].trim()] };
            }
        },
        {
            pattern: /(?:set|change|update)\s+(?:status\s+of\s+)?([\w\s]+?)\s+to\s+(\w+)/i,
            handler: (matches) => {
                return { command: 'set status', params: [matches[1].trim(), matches[2].trim()] };
            }
        },
        {
            pattern: /(?:send|email|message)\s+([\w\s]+?)\s+(?:the\s+)?(\w+)\s+template/i,
            handler: (matches) => {
                return { command: 'email lead', params: [matches[1].trim(), matches[2].trim()] };
            }
        },
        {
            pattern: /(?:remind|set\s+reminder)\s+(?:me\s+)?(?:to\s+)?(?:call|contact|follow\s+up\s+with)?\s*([\w\s]+?)\s+(tomorrow|today|next\s+week|in\s+\d+\s*(?:days?|hours?)|(?:mon|tues|wednes|thurs|fri|satur|sun)day)/i,
            handler: (matches) => {
                return { command: 'set reminder', params: [matches[1].trim(), matches[2].trim()] };
            }
        },
        {
            pattern: /(?:copy|get|share)\s+(?:the\s+)?link/i,
            handler: () => {
                return { command: 'copy link', params: [] };
            }
        },
        {
            pattern: /(?:generate|create|make)\s+(?:a\s+)?pdf/i,
            handler: () => {
                return { command: 'export pdf', params: [] };
            }
        },
        {
            pattern: /(?:show|display|open)\s+(?:the\s+)?(?:rate\s+)?matrix/i,
            handler: () => {
                return { command: 'toggle rate matrix', params: [] };
            }
        },
        {
            pattern: /(?:switch|change)\s+(?:to\s+)?tier\s*(\d)/i,
            handler: (matches) => {
                return { command: `tier ${matches[1]}`, params: [] };
            }
        },
        {
            pattern: /(?:load|open)\s+scenario\s*(\d)/i,
            handler: (matches) => {
                return { command: `scenario ${matches[1]}`, params: [] };
            }
        },
        {
            pattern: /(?:run|execute)\s+(?:workflow\s+)?([\w-]+)/i,
            handler: (matches) => {
                return { command: 'run workflow', params: [matches[1].trim()] };
            }
        },
        {
            pattern: /(?:what\'s|what\s+is)\s+(?:the\s+)?ltv\s+(?:on\s+)?([\d.km]+)\s+(?:with\s+)?(?:loan\s+of\s+)?([\d.km]+)/i,
            handler: (matches) => {
                const value = parseValue(matches[1]);
                const loan = parseValue(matches[2]);
                return { command: 'calc ltv', params: [value, loan] };
            }
        },
        {
            pattern: /(?:show|display|what\s+are)\s+(?:my\s+)?hot\s+leads/i,
            handler: () => {
                return { command: 'hot leads', params: [] };
            }
        },
        {
            pattern: /(?:show|display)\s+(?:my\s+)?(?:daily\s+)?dashboard/i,
            handler: () => {
                return { command: 'daily dashboard', params: [] };
            }
        },
    ];

    // ==================== STATE ====================
    let state = {
        paletteOpen: false,
        voiceActive: false,
        recording: false,
        recordingName: null,
        recordingSteps: [],
        naturalLanguageMode: true,
        predictionsEnabled: true,
        commandHistory: [],
        favorites: [],
        workflows: {},
        schedules: [],
        context: 'quote',
        userPatterns: [], // Learned from user
    };

    // Load from localStorage
    function loadState() {
        const saved = localStorage.getItem('carbon_palette_v3');
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
        }
    }

    function saveState() {
        localStorage.setItem('carbon_palette_v3', JSON.stringify({
            naturalLanguageMode: state.naturalLanguageMode,
            predictionsEnabled: state.predictionsEnabled,
            commandHistory: state.commandHistory,
            favorites: state.favorites,
            workflows: state.workflows,
            schedules: state.schedules,
            userPatterns: state.userPatterns,
        }));
    }

    // ==================== INITIALIZATION ====================
    function init() {
        loadState();
        createPaletteHTML();
        createPredictionBar();
        createQuickActionsWidget();
        createVoiceOrb();
        bindGlobalShortcuts();
        bindClickOutside();
        initVoiceRecognition();
        initScheduler();
        detectContext();
        
        if (CONFIG.debug) {
            console.log('🎯 Carbon Command Palette v3.0 - Ultimate Edition');
            console.log('💡 Natural Language: ENABLED');
            console.log('🎤 Voice Control: ACTIVE - Say "Hey Ezra" or "Hey Carbon"');
            console.log('⚡ Smart Predictions: ENABLED');
            console.log('🎬 Workflow Recorder: /record [name]');
        }
        
        // Auto-save every 30 seconds
        const autoSaveIntervalId = setInterval(saveState, CONFIG.autoSaveInterval);
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            clearInterval(autoSaveIntervalId);
        });
    }

    // ==================== VOICE ORB ====================
    function createVoiceOrb() {
        // Create voice orb button
        voiceOrb = document.createElement('button');
        voiceOrb.id = 'carbon-voice-orb';
        voiceOrb.className = 'carbon-voice-orb';
        voiceOrb.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
        `;
        voiceOrb.addEventListener('click', toggleVoiceOrb);
        document.body.appendChild(voiceOrb);
        
        // Create voice status indicator
        voiceStatus = document.createElement('div');
        voiceStatus.id = 'carbon-voice-status';
        voiceStatus.className = 'carbon-voice-status';
        voiceStatus.textContent = getWakeWordPrompt();
        document.body.appendChild(voiceStatus);
        syncVoiceUI();
        
        // Show status briefly on load if voice is enabled
        if (voiceEnabled) {
            showVoiceStatus(`Voice active - ${getWakeWordPrompt()}`);
        }
    }
    
    function syncVoiceUI() {
        if (voiceOrb) {
            voiceOrb.style.display = voiceEnabled ? 'flex' : 'none';
            voiceOrb.title = voiceEnabled ? 'Voice is ON - Click to turn off' : 'Voice is OFF - Enable it in Settings to turn on';
            voiceOrb.classList.toggle('carbon-voice-active', voiceEnabled);
            if (!voiceEnabled) {
                voiceOrb.classList.remove('carbon-voice-listening');
            }
        }
        if (voiceStatus) {
            voiceStatus.textContent = getWakeWordPrompt();
        }
    }

    function applyVoiceSettings(settings = {}, options = {}) {
        const previousSettings = getVoiceSettings();
        if (typeof settings.enabled === 'boolean') {
            voiceEnabled = settings.enabled;
            localStorage.setItem('carbon_voice_enabled', voiceEnabled ? 'true' : 'false');
        } else {
            voiceEnabled = localStorage.getItem('carbon_voice_enabled') === 'true';
        }

        if (typeof settings.wakeWord === 'string' && settings.wakeWord.trim()) {
            localStorage.setItem('carbon_wake_word', settings.wakeWord.trim().toLowerCase());
        }

        if (typeof settings.voiceLang === 'string' && settings.voiceLang.trim()) {
            localStorage.setItem('carbon_voice_lang', settings.voiceLang.trim());
        }

        activeWakeWords = getStoredWakeWords();
        CONFIG.voiceLang = getStoredVoiceLang();

        if (recognition) {
            recognition.lang = CONFIG.voiceLang;
        }

        syncVoiceUI();

        if (voiceEnabled) {
            startWakeWordListening();
            showVoiceStatus(`Voice active - ${getWakeWordPrompt()}`);
        } else {
            wakeWordDetected = false;
            if (recognition) {
                try { recognition.stop(); } catch (e) { }
            }
            voiceListening = false;
            hideVoiceStatus();
        }

        const updatedSettings = getVoiceSettings();
        const changedKeys = Object.keys(updatedSettings).filter((key) => updatedSettings[key] !== previousSettings[key]);

        if (options.notify && typeof showToast === 'function') {
            const toastMessage = voiceEnabled ? 'Voice recognition ON' : 'Voice recognition OFF';
            showToast(toastMessage, voiceEnabled ? 'success' : 'info');
            if (changedKeys.length) {
                recordVoiceTelemetry('settings_changed', { changedKeys });
            }
            return updatedSettings;
            /*
            showToast(
                voiceEnabled ? 'ðŸŽ¤ Voice recognition ON' : 'ðŸŽ¤ Voice recognition OFF',
                voiceEnabled ? 'success' : 'info'
            );
            */
        }

        if (changedKeys.length) {
            recordVoiceTelemetry('settings_changed', { changedKeys });
        }

        return updatedSettings;
    }

    function setVoiceEnabled(enabled, options = {}) {
        return applyVoiceSettings({ enabled }, options);
    }

    function toggleVoiceOrb() {
        return setVoiceEnabled(!voiceEnabled, { notify: true });
        /*
        voiceEnabled = !voiceEnabled;
        localStorage.setItem('carbon_voice_enabled', voiceEnabled);
        
        if (voiceEnabled) {
            voiceOrb.classList.add('carbon-voice-active');
            voiceOrb.title = 'Voice is ON - Click to turn off';
            startWakeWordListening();
            showVoiceStatus('Voice activated - Say "Hey Ezra"');
            showToast('🎤 Voice recognition ON', 'success');
        } else {
            voiceOrb.classList.remove('carbon-voice-active', 'carbon-voice-listening');
            voiceOrb.title = 'Voice is OFF - Click to turn on';
            if (recognition) {
                recognition.stop();
                voiceListening = false;
            }
            hideVoiceStatus();
            showToast('🎤 Voice recognition OFF', 'info');
        }
        */
    }
    function showVoiceStatus(text, isListening = false) {
        if (!voiceStatus) return;
        voiceStatus.textContent = text;
        voiceStatus.classList.add('carbon-voice-status-visible');
        if (isListening) {
            voiceStatus.classList.add('carbon-voice-status-listening');
        } else {
            voiceStatus.classList.remove('carbon-voice-status-listening');
        }
    }
    
    function hideVoiceStatus() {
        if (!voiceStatus) return;
        voiceStatus.classList.remove('carbon-voice-status-visible', 'carbon-voice-status-listening');
    }
    
    function updateVoiceOrbState(isListening) {
        if (!voiceOrb) return;
        if (isListening) {
            voiceOrb.classList.add('carbon-voice-listening');
            showVoiceStatus('Listening...', true);
        } else {
            voiceOrb.classList.remove('carbon-voice-listening');
            showVoiceStatus(getWakeWordPrompt());
        }
    }

    function bindGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + K to open
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                openPalette();
            }
            // / to open (if not in input)
            if (e.key === '/' && !isInputActive()) {
                e.preventDefault();
                openPalette();
            }
            // Escape to close
            if (e.key === 'Escape' && paletteOpen) {
                e.preventDefault();
                closePalette();
            }
        });
    }

    function isInputActive() {
        const active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    }

    function bindClickOutside() {
        // Handled in createPaletteHTML via overlay click
    }

    function detectContext() {
        // Detect current page context
        const path = window.location.pathname;
        if (path.includes('quote')) state.context = 'quote';
        else if (path.includes('lead')) state.context = 'lead';
        else if (path.includes('client')) state.context = 'client';
        else state.context = 'general';
    }

    // ==================== NATURAL LANGUAGE ENGINE ====================
    function naturalLanguageCommand(input) {
        if (!state.naturalLanguageMode) {
            return null;
        }

        // Try pattern matching
        for (const { pattern, handler } of NL_PATTERNS) {
            const matches = input.match(pattern);
            if (matches) {
                const result = handler(matches);
                if (result) {
                    showToast(`🧠 Understood: "${input}"`);
                    executeCommand(result.command, ...result.params);
                    return true;
                }
            }
        }

        // Try user-learned patterns
        for (const userPattern of state.userPatterns) {
            if (input.toLowerCase().includes(userPattern.trigger.toLowerCase())) {
                showToast(`🧠 Pattern match: "${userPattern.trigger}"`);
                executeCommand(userPattern.command);
                return true;
            }
        }

        // Try fuzzy matching against command names
        const bestMatch = findBestNLMatch(input);
        if (bestMatch && bestMatch.score > 0.7) {
            showToast(`🧠 Did you mean: "${bestMatch.name}"?`);
            executeCommand(bestMatch.name);
            return true;
        }

        return false;
    }

    function findBestNLMatch(input) {
        const words = input.toLowerCase().split(' ');
        let bestMatch = null;
        let bestScore = 0;

        for (const [name, data] of Object.entries(COMMANDS)) {
            const searchTerms = `${name} ${data.description || ''}`.toLowerCase();
            let score = 0;
            
            words.forEach(word => {
                if (searchTerms.includes(word)) score += 1;
            });
            
            score = score / words.length; // Normalize
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = { name, score };
            }
        }

        return bestMatch;
    }

    // ==================== WORKFLOW RECORDER ====================
    function startRecording(name) {
        if (!name) {
            // Open palette with pre-filled command so user can type name
            openPaletteWithQuery('/record ');
            showToast('Type a name for your workflow: /record my-workflow', 'info');
            return;
        }
        
        state.recording = true;
        state.recordingName = name;
        state.recordingSteps = [];
        
        showToast(`🎬 Recording started: "${name}". Do your actions, then type /stop to save.`);
        showRecordingIndicator();
    }

    function stopRecording() {
        if (!state.recording) {
            showToast('Not currently recording', 'error');
            return;
        }
        
        state.workflows[state.recordingName] = {
            steps: state.recordingSteps,
            created: new Date().toISOString(),
            runs: 0
        };
        
        state.recording = false;
        hideRecordingIndicator();
        saveState();
        
        showToast(`✅ Workflow saved: "${state.recordingName}" (${state.recordingSteps.length} steps)`);
    }

    function recordStep(command, params) {
        if (state.recording) {
            state.recordingSteps.push({ command, params, timestamp: Date.now() });
        }
    }

    function runWorkflow(name) {
        const workflow = state.workflows[name];
        if (!workflow) {
            showToast(`Workflow not found: "${name}"`, 'error');
            return;
        }
        
        showToast(`▶️ Running workflow: "${name}" (${workflow.steps.length} steps)`);
        
        workflow.steps.forEach((step, index) => {
            setTimeout(() => {
                executeCommand(step.command, ...(step.params || []));
            }, index * 500); // 500ms between steps
        });
        
        workflow.runs++;
        workflow.lastRun = new Date().toISOString();
        saveState();
    }

    function listWorkflows() {
        const workflows = Object.entries(state.workflows);
        if (workflows.length === 0) {
            showToast('No saved workflows. Start with: /record [name]');
            return;
        }
        
        const list = workflows.map(([name, data]) => 
            `• ${name} (${data.steps.length} steps, ${data.runs} runs)`
        ).join('\n');
        
        showToast(`Workflows:\n${list}`);
    }

    function deleteWorkflow(name) {
        if (state.workflows[name]) {
            delete state.workflows[name];
            saveState();
            showToast(`Workflow deleted: "${name}"`);
        } else {
            showToast(`Workflow not found: "${name}"`, 'error');
        }
    }

    function showRecordingIndicator() {
        let indicator = document.getElementById('carbon-recording-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'carbon-recording-indicator';
            indicator.className = 'carbon-recording-indicator';
            indicator.innerHTML = `
                <span class="carbon-rec-dot"></span>
                <span class="carbon-rec-text">Recording: <span class="carbon-rec-name"></span></span>
                <button class="carbon-rec-stop">Stop</button>
            `;
            document.body.appendChild(indicator);
            
            indicator.querySelector('.carbon-rec-stop').addEventListener('click', stopRecording);
        }
        
        indicator.querySelector('.carbon-rec-name').textContent = state.recordingName;
        indicator.classList.add('carbon-recording-active');
    }

    function hideRecordingIndicator() {
        const indicator = document.getElementById('carbon-recording-indicator');
        if (indicator) {
            indicator.classList.remove('carbon-recording-active');
        }
    }

    // ==================== SCHEDULER ====================
    function initScheduler() {
        // Check every minute for scheduled commands
        const schedulerIntervalId = setInterval(checkSchedules, 60000);
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            clearInterval(schedulerIntervalId);
        });
    }

    function checkSchedules() {
        const now = new Date();
        
        state.schedules.forEach(schedule => {
            if (schedule.nextRun && new Date(schedule.nextRun) <= now) {
                executeCommand(schedule.command);
                
                // Calculate next run
                if (schedule.recurring) {
                    schedule.nextRun = calculateNextRun(schedule.when);
                } else {
                    schedule.completed = true;
                }
                
                saveState();
            }
        });
        
        // Clean up completed
        state.schedules = state.schedules.filter(s => !s.completed);
    }

    function scheduleCommand(cmd, when) {
        const schedule = {
            id: Date.now().toString(36),
            command: cmd,
            when: when,
            nextRun: calculateNextRun(when),
            recurring: when.includes('every'),
            created: new Date().toISOString()
        };
        
        state.schedules.push(schedule);
        saveState();
        
        showToast(`⏰ Scheduled: "${cmd}" for ${when}`);
    }

    function calculateNextRun(when) {
        const now = new Date();
        
        // Parse "daily 9am", "weekly monday", "every friday 4pm"
        if (when.includes('daily')) {
            const hour = parseInt(when.match(/(\d+)/)?.[0]) || 9;
            const next = new Date(now);
            next.setHours(hour, 0, 0, 0);
            if (next <= now) next.setDate(next.getDate() + 1);
            return next.toISOString();
        }
        
        if (when.includes('tomorrow')) {
            const next = new Date(now);
            next.setDate(next.getDate() + 1);
            const hour = parseInt(when.match(/(\d+)/)?.[0]) || 9;
            next.setHours(hour, 0, 0, 0);
            return next.toISOString();
        }
        
        // Default: 1 hour from now
        return new Date(now.getTime() + 3600000).toISOString();
    }

    function listSchedules() {
        const active = state.schedules.filter(s => !s.completed);
        if (active.length === 0) {
            showToast('No active schedules');
            return;
        }
        
        const list = active.map(s => 
            `• "${s.command}" - ${new Date(s.nextRun).toLocaleString()}`
        ).join('\n');
        
        showToast(`Scheduled:\n${list}`);
    }

    function cancelSchedule(id) {
        const idx = state.schedules.findIndex(s => s.id === id);
        if (idx >= 0) {
            state.schedules.splice(idx, 1);
            saveState();
            showToast('Schedule cancelled');
        }
    }

    // ==================== SMART PREDICTIONS ====================
    function getPredictions() {
        if (!state.predictionsEnabled) return [];
        
        const predictions = [];
        
        // 1. Context-based predictions
        const contextCommands = getContextCommands(state.context);
        
        function getContextCommands(context) {
            const contextMap = {
                'quote': ['new quote', 'save quote', 'export pdf', 'email quote'],
                'lead': ['new lead', 'find lead', 'import leads', 'export leads'],
                'client': ['view quotes', 'contact lo', 'schedule call'],
                'general': ['new quote', 'new lead', 'view rates', 'help']
            };
            return contextMap[context] || contextMap['general'];
        }
        predictions.push(...contextCommands.slice(0, 2));
        
        // 2. Time-based predictions
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 11) {
            predictions.push('daily dashboard', 'overdue leads');
        } else if (hour >= 16 && hour <= 18) {
            predictions.push('hot leads', 'follow up leads');
        }
        
        // 3. History-based predictions
        if (state.commandHistory.length > 0) {
            const recent = state.commandHistory.slice(0, 5);
            const common = findMostCommon(recent);
            if (common) predictions.push(common);
        }
        
        // 4. Lead-status based
        // (Would integrate with actual lead data)
        
        // Remove duplicates and limit
        return [...new Set(predictions)].slice(0, CONFIG.predictionCount);
    }

    function findMostCommon(arr) {
        const counts = {};
        arr.forEach(item => {
            counts[item] = (counts[item] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    }

    function updatePredictionBar() {
        const bar = document.getElementById('carbon-prediction-bar');
        if (!bar) return;
        
        const predictions = getPredictions();
        
        if (predictions.length === 0) {
            bar.style.display = 'none';
            return;
        }
        
        bar.style.display = 'flex';
        bar.innerHTML = predictions.map(cmd => {
            const cmdData = COMMANDS[cmd];
            const icon = getCommandIcon(cmd);
            return `
                <button class="carbon-prediction-btn" onclick="CarbonCommands.execute('${cmd}')">
                    <span class="carbon-pred-icon">${icon}</span>
                    <span class="carbon-pred-text">${formatCommandName(cmd)}</span>
                </button>
            `;
        }).join('');
    }

    function getCommandIcon(cmd) {
        const icons = {
            'new quote': '📝',
            'quick quote': '⚡',
            'find lead': '🔍',
            'go leads': '👥',
            'go quote': '📊',
            'daily dashboard': '📈',
            'overdue leads': '⏰',
            'hot leads': '🔥',
            'follow up leads': '📞',
            'copy link': '🔗',
            'export pdf': '📄',
            'toggle ezra': '🤖',
        };
        return icons[cmd] || '⚡';
    }

    // ==================== TEAM SHARING ====================
    function shareCommand(name, user) {
        // In real implementation, this would sync to a server
        const shared = JSON.parse(localStorage.getItem('carbon_shared_commands') || '{}');
        
        if (!shared[name]) {
            shared[name] = {
                command: name,
                sharedBy: 'me',
                sharedWith: [],
                created: new Date().toISOString()
            };
        }
        
        if (user) {
            shared[name].sharedWith.push(user);
        }
        
        localStorage.setItem('carbon_shared_commands', JSON.stringify(shared));
        showToast(`Shared "${name}"${user ? ` with ${user}` : ''}`);
    }

    function importCommand(name, from) {
        // In real implementation, this would fetch from server
        showToast(`Imported "${name}" from ${from}`);
        
        // Add to user's commands
        if (!state.favorites.includes(name)) {
            state.favorites.push(name);
            saveState();
        }
    }

    function listTeamCommands() {
        const shared = JSON.parse(localStorage.getItem('carbon_shared_commands') || '{}');
        const commands = Object.keys(shared);
        
        if (commands.length === 0) {
            showToast('No team commands shared yet');
            return;
        }
        
        showToast(`Team commands: ${commands.join(', ')}`);
    }

    // ==================== PALETTE UI (Enhanced) ====================
    function createPaletteHTML() {
        const palette = document.createElement('div');
        palette.id = 'carbon-command-palette';
        palette.className = 'carbon-palette';
        palette.innerHTML = `
            <div class="carbon-palette-overlay"></div>
            <div class="carbon-palette-container carbon-palette-v3">
                <div class="carbon-palette-header">
                    <span class="carbon-palette-icon">⌘</span>
                    <input type="text" class="carbon-palette-input" 
                           placeholder="Type naturally or use /commands... (Try: 'Create quote for John 750k')" 
                           autocomplete="off">
                    <button class="carbon-palette-voice" title="Voice (Hey Ezra)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                        </svg>
                    </button>
                    <button class="carbon-palette-record" title="Record Workflow">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
                        </svg>
                    </button>
                    <span class="carbon-palette-hint">ESC</span>
                </div>
                
                <!-- Natural Language Indicator -->
                <div class="carbon-nl-indicator">
                    <span class="carbon-nl-badge">🧠 Natural Language ON</span>
                    <span class="carbon-nl-examples">Try: "Create quote for John" or "Find lead Smith"</span>
                </div>
                
                <!-- Context Badge -->
                <div class="carbon-palette-context">
                    <span class="carbon-context-badge">${state.context}</span>
                    <span class="carbon-prediction-label">Suggested:</span>
                    <div class="carbon-palette-predictions" id="palette-predictions"></div>
                </div>
                
                <div class="carbon-palette-content">
                    <div class="carbon-palette-sections"></div>
                </div>
                
                <div class="carbon-palette-footer">
                    <span class="carbon-palette-footer-hint">
                        <kbd>↑↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close
                        <span class="carbon-voice-hint">🎤 "Hey Ezra"</span>
                    </span>
                    <button class="carbon-cheat-sheet-btn" onclick="showCheatSheet()">?</button>
                </div>
            </div>
        `;
        document.body.appendChild(palette);

        // Bind elements
        const input = palette.querySelector('.carbon-palette-input');
        input.addEventListener('input', (e) => handleInput(e.target.value));
        input.addEventListener('keydown', handleInputKeydown);

        palette.querySelector('.carbon-palette-voice').addEventListener('click', toggleVoice);
        palette.querySelector('.carbon-palette-record').addEventListener('click', () => {
            closePalette();
            openPaletteWithQuery('/record ');
        });
        palette.querySelector('.carbon-palette-overlay').addEventListener('click', closePalette);
        
        // Update predictions in palette
        updatePalettePredictions();
    }

    function createPredictionBar() {
        // DISABLED: Prediction bar removed - was cluttering the UI
        // Kept function stub to prevent errors if called elsewhere
        return;
    }

    function createQuickActionsWidget() {
        // DISABLED: Quick widget removed - was showing duplicate "Record Workflow" entries
        // Kept function stub to prevent errors if called elsewhere
        return;
    }

    function updateQuickWidget() {
        const widget = document.getElementById('carbon-quick-widget');
        if (!widget) return;
        
        const list = widget.querySelector('.carbon-quick-list');
        const recent = state.commandHistory.slice(0, 5);
        
        if (recent.length === 0) {
            list.innerHTML = '<div class="carbon-quick-empty">No recent commands</div>';
            return;
        }
        
        list.innerHTML = recent.map(cmd => `
            <button class="carbon-quick-item" onclick="CarbonCommands.execute('${cmd}')">
                ${getCommandIcon(cmd)} ${formatCommandName(cmd)}
            </button>
        `).join('');
    }

    // ==================== INPUT HANDLING (Enhanced) ====================
    function handleInput(value) {
        selectedIndex = 0;
        
        // Try natural language first
        if (state.naturalLanguageMode && value.length > 3 && !value.startsWith('/')) {
            const nlResult = tryNaturalLanguage(value);
            if (nlResult) {
                showNLConfirmation(nlResult);
                return;
            }
        }
        
        // Handle slash commands
        if (value.startsWith('/')) {
            handleSlashCommand(value);
            return;
        }
        
        // Regular filter
        updateCommandList(value);
    }

    function handleSlashCommand(value) {
        const cmd = value.slice(1).toLowerCase();
        updateCommandList(cmd);
    }

    function filterCommands(query) {
        updateCommandList(query);
    }

    function tryNaturalLanguage(input) {
        for (const { pattern, handler } of NL_PATTERNS) {
            const matches = input.match(pattern);
            if (matches) {
                return handler(matches);
            }
        }
        return null;
    }

    function showNLConfirmation(result) {
        const container = document.querySelector('.carbon-palette-sections');
        container.innerHTML = `
            <div class="carbon-nl-confirmation">
                <div class="carbon-nl-icon">🧠</div>
                <div class="carbon-nl-text">
                    <div class="carbon-nl-title">AI Understood</div>
                    <div class="carbon-nl-command">${formatCommandName(result.command)}</div>
                </div>
                <button class="carbon-nl-execute" onclick="executeCommand('${result.command}'${result.params.length ? ', ' + result.params.map(p => `'${p}'`).join(', ') : ''}); closePalette();">
                    Execute ↵
                </button>
            </div>
        `;
    }

    // ==================== CHEAT SHEET ====================
    function showCheatSheet() {
        const cheatsheet = document.createElement('div');
        cheatsheet.id = 'carbon-cheatsheet';
        cheatsheet.className = 'carbon-cheatsheet';
        cheatsheet.innerHTML = `
            <div class="carbon-cheatsheet-overlay" onclick="this.parentElement.remove()"></div>
            <div class="carbon-cheatsheet-content">
                <div class="carbon-cheatsheet-header">
                    <h2>⌨️ Keyboard Shortcuts</h2>
                    <button class="carbon-cheatsheet-close" onclick="this.closest('.carbon-cheatsheet').remove()">×</button>
                </div>
                <div class="carbon-cheatsheet-body">
                    <div class="carbon-cheatsheet-section">
                        <h3>Essential</h3>
                        <div class="carbon-cheat-row"><span>Open Palette</span> <kbd>Cmd/Ctrl + K</kbd> or <kbd>/</kbd></div>
                        <div class="carbon-cheat-row"><span>New Quote</span> <kbd>Ctrl + N</kbd></div>
                        <div class="carbon-cheat-row"><span>Quick Quote</span> <kbd>Alt + Shift + Q</kbd></div>
                        <div class="carbon-cheat-row"><span>Find Lead</span> <kbd>Ctrl + Shift + F</kbd></div>
                        <div class="carbon-cheat-row"><span>Copy Link</span> <kbd>Ctrl + Shift + C</kbd></div>
                    </div>
                    <div class="carbon-cheatsheet-section">
                        <h3>Navigation</h3>
                        <div class="carbon-cheat-row"><span>Go to Quote</span> <kbd>Alt + Q</kbd></div>
                        <div class="carbon-cheat-row"><span>Go to Leads</span> <kbd>Alt + L</kbd></div>
                        <div class="carbon-cheat-row"><span>Go to Deals</span> <kbd>Alt + D</kbd></div>
                        <div class="carbon-cheat-row"><span>Go to Sequences</span> <kbd>Alt + Shift + S</kbd></div>
                    </div>
                    <div class="carbon-cheatsheet-section">
                        <h3>Natural Language</h3>
                        <div class="carbon-cheat-example">"Create quote for John 750k"</div>
                        <div class="carbon-cheat-example">"Find lead Smith"</div>
                        <div class="carbon-cheat-example">"What's the payment on 500k at 6%"</div>
                        <div class="carbon-cheat-example">"Follow up with John tomorrow"</div>
                    </div>
                    <div class="carbon-cheatsheet-section">
                        <h3>Workflow</h3>
                        <div class="carbon-cheat-row"><span>Record</span> <code>/record my-workflow</code></div>
                        <div class="carbon-cheat-row"><span>Run</span> <code>/run my-workflow</code></div>
                        <div class="carbon-cheat-row"><span>List</span> <code>/workflows</code></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(cheatsheet);
    }

    // ==================== CORE PALETTE FUNCTIONS ====================
    let paletteOpen = false;
    let selectedIndex = 0;
    let filteredCommands = [];

    function openPalette() {
        let palette = document.getElementById('carbon-command-palette');
        if (!palette) {
            createPaletteHTML();
            palette = document.getElementById('carbon-command-palette');
        }
        palette.classList.add('carbon-palette-active');
        paletteOpen = true;
        selectedIndex = 0;
        
        const input = palette.querySelector('.carbon-palette-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        
        updateCommandList('');
    }

    function closePalette() {
        const palette = document.getElementById('carbon-command-palette');
        if (palette) {
            palette.classList.remove('carbon-palette-active');
        }
        paletteOpen = false;
    }

    function openPaletteWithQuery(query) {
        openPalette();
        const input = document.querySelector('.carbon-palette-input');
        if (input) {
            input.value = query;
            handleInput(query);
        }
    }

    // ==================== VOICE RECOGNITION ====================
    let recognition = null;
    let voiceListening = false;
    let wakeWordDetected = false;
    function initVoiceRecognition() {
        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            recordVoiceTelemetry('unsupported_browser');
            console.log('🎤 Voice recognition not supported in this browser');
            return;
        }
        
        recognition = new SpeechRecognition();
        recordVoiceTelemetry('supported_browser_ready');
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = CONFIG.voiceLang;
        
        recognition.onresult = handleVoiceResult;
        recognition.onerror = handleVoiceError;
        recognition.onend = handleVoiceEnd;
        
        // Start listening for wake word when voice is enabled
        startWakeWordListening();
        
        console.log('🎤 Voice recognition initialized. Say "Hey Ezra" or "Hey Carbon" to activate');
    }
    
    function startWakeWordListening() {
        if (!recognition || voiceListening || !voiceEnabled) return;
        
        try {
            recognition.start();
            voiceListening = true;
            wakeWordDetected = false;
        } catch (e) {
            recordVoiceTelemetry('wake_listener_start_failed', { message: e?.message || 'unknown_error' });
            console.log('Voice recognition start error:', e);
        }
    }
    
    function handleVoiceResult(event) {
        // Don't process if voice is disabled
        if (!voiceEnabled) return;
        
        const results = event.results;
        const lastResult = results[results.length - 1];
        const transcript = lastResult[0].transcript.toLowerCase().trim();
        
        if (lastResult.isFinal) {
            if (!wakeWordDetected) {
                // Check for wake word
                const detectedWakeWord = activeWakeWords.find(wake => transcript.includes(wake));
                if (detectedWakeWord) {
                    wakeWordDetected = true;
                    recordVoiceTelemetry('wake_word_detected', { wakeWord: detectedWakeWord });
                    showToast('🎤 Yes, I\'m listening...', 'success');
                    
                    // Visual feedback via orb
                    updateVoiceOrbState(true);
                    showVoiceActiveIndicator();
                    
                    // Reset after 5 seconds if no command given
                    setTimeout(() => {
                        if (wakeWordDetected) {
                            wakeWordDetected = false;
                            updateVoiceOrbState(false);
                            hideVoiceActiveIndicator();
                        }
                    }, 5000);
                }
            } else {
                // Process command after wake word
                wakeWordDetected = false;
                updateVoiceOrbState(false);
                hideVoiceActiveIndicator();
                processVoiceCommand(transcript);
            }
        } else {
            // Interim results - show live transcription if wake word detected
            if (wakeWordDetected) {
                updateVoiceTranscript(transcript);
            }
        }
    }
    
    function processVoiceCommand(transcript) {
        // Remove wake words from transcript
        let command = transcript;
        activeWakeWords.forEach(wake => {
            command = command.replace(wake, '');
        });
        command = command.trim();
        if (!command) {
            recordVoiceTelemetry('wake_word_without_command');
        } else {
            recordVoiceTelemetry('command_captured', { length: command.length });
        }
        
        if (!command) {
            showToast('🎤 I heard the wake word but no command. Try: "Create quote for John"', 'info');
            return;
        }
        
        showToast(`🎤 Heard: "${command}"`, 'success');
        
        // Try natural language processing first
        if (state.naturalLanguageMode) {
            const nlResult = tryNaturalLanguage(command);
            if (nlResult) {
                executeCommand(nlResult.command, ...nlResult.params);
                return;
            }
        }
        
        // Try direct command matching
        const bestMatch = findBestNLMatch(command);
        if (bestMatch && bestMatch.score > 0.6) {
            executeCommand(bestMatch.name);
        } else {
            // Open palette with the voice input
            openPaletteWithQuery(command);
        }
    }
    
    function handleVoiceError(event) {
        if (event.error === 'no-speech') {
            // Normal - no speech detected
            return;
        }
        recordVoiceTelemetry('error', { error: event.error || 'unknown_error' });
        if (event.error === 'audio-capture') {
            console.log('No microphone found or microphone not working');
        } else if (event.error === 'not-allowed') {
            console.log('Microphone permission denied');
        } else {
            console.log('Voice recognition error:', event.error);
        }
    }
    
    function handleVoiceEnd() {
        voiceListening = false;
        if (!voiceEnabled) return;
        // Restart listening after a short delay
        setTimeout(() => {
            if (!voiceListening && voiceEnabled) {
                startWakeWordListening();
            }
        }, 500);
    }
    
    function toggleVoice() {
        // Use the orb toggle instead for consistent behavior
        toggleVoiceOrb();
    }
    
    function showVoiceActiveIndicator() {
        let indicator = document.getElementById('carbon-voice-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'carbon-voice-indicator';
            indicator.className = 'carbon-voice-indicator';
            indicator.innerHTML = `
                <div class="carbon-voice-pulse"></div>
                <span class="carbon-voice-text">Listening...</span>
                <span class="carbon-voice-transcript"></span>
            `;
            document.body.appendChild(indicator);
        }
        indicator.classList.add('carbon-voice-active');
    }
    
    function hideVoiceActiveIndicator() {
        const indicator = document.getElementById('carbon-voice-indicator');
        if (indicator) {
            indicator.classList.remove('carbon-voice-active');
        }
    }
    
    function updateVoiceTranscript(text) {
        const indicator = document.getElementById('carbon-voice-indicator');
        if (indicator) {
            const transcriptEl = indicator.querySelector('.carbon-voice-transcript');
            if (transcriptEl) {
                transcriptEl.textContent = text;
            }
        }
    }

    function executeCommand(cmd, ...args) {
        const command = COMMANDS[cmd];
        if (command && command.action) {
            try {
                command.action(...args);
                // Track in history
                state.commandHistory.unshift(cmd);
                if (state.commandHistory.length > CONFIG.maxHistory) {
                    state.commandHistory.pop();
                }
                saveState();
            } catch (err) {
                showToast('Error executing command: ' + err.message, 'error');
            }
        } else {
            showToast('Command not found: ' + cmd, 'error');
        }
    }

    function handleInputKeydown(e) {
        if (!paletteOpen) return;
        
        switch(e.key) {
            case 'Escape':
                e.preventDefault();
                closePalette();
                break;
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
                updateSelection();
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection();
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredCommands[selectedIndex]) {
                    const cmd = filteredCommands[selectedIndex];
                    executeCommand(cmd.name);
                    closePalette();
                }
                break;
        }
    }

    function updateCommandList(query) {
        const container = document.querySelector('.carbon-palette-sections');
        if (!container) return;
        
        filteredCommands = [];
        const q = query.toLowerCase().trim();
        
        for (const [name, data] of Object.entries(COMMANDS)) {
            if (!q || name.includes(q) || (data.description && data.description.toLowerCase().includes(q))) {
                filteredCommands.push({ name, ...data });
            }
        }
        
        if (filteredCommands.length === 0) {
            container.innerHTML = '<div class="carbon-palette-empty">No commands found. Try natural language!</div>';
            return;
        }
        
        container.innerHTML = filteredCommands.map((cmd, idx) => `
            <div class="carbon-palette-item ${idx === selectedIndex ? 'carbon-palette-selected' : ''}" data-index="${idx}">
                <span class="carbon-palette-cmd-icon">${getCommandIcon(cmd.name)}</span>
                <div class="carbon-palette-cmd-info">
                    <div class="carbon-palette-cmd-name">${formatCommandName(cmd.name)}</div>
                    <div class="carbon-palette-cmd-desc">${cmd.description || ''}</div>
                </div>
                ${cmd.alias ? `<span class="carbon-palette-cmd-alias">${cmd.alias.split(',')[0]}</span>` : ''}
            </div>
        `).join('');
        
        // Click handlers
        container.querySelectorAll('.carbon-palette-item').forEach((item, idx) => {
            item.addEventListener('click', () => {
                executeCommand(filteredCommands[idx].name);
                closePalette();
            });
        });
    }

    function updateSelection() {
        const items = document.querySelectorAll('.carbon-palette-item');
        items.forEach((item, idx) => {
            item.classList.toggle('carbon-palette-selected', idx === selectedIndex);
        });
    }

    function updatePalettePredictions() {
        const container = document.getElementById('palette-predictions');
        if (!container) return;
        
        const predictions = getPredictions().slice(0, 3);
        container.innerHTML = predictions.map(cmd => `
            <button class="carbon-pred-chip" onclick="CarbonCommands.execute('${cmd}'); CarbonCommands.close();">
                ${getCommandIcon(cmd)} ${formatCommandName(cmd)}
            </button>
        `).join('');
    }

    // ==================== UTILITY FUNCTIONS ====================
    function parseValue(val) {
        if (!val) return 0;
        val = val.toLowerCase().replace(/,/g, '');
        if (val.endsWith('k')) return parseFloat(val) * 1000;
        if (val.endsWith('m')) return parseFloat(val) * 1000000;
        return parseFloat(val) || 0;
    }

    function formatCommandName(name) {
        return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `carbon-toast ${type === 'error' ? 'carbon-toast-error' : ''}`;
        toast.innerHTML = message.replace(/\n/g, '<br>');
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('carbon-toast-show'), 10);
        setTimeout(() => {
            toast.classList.remove('carbon-toast-show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==================== INTEGRATION HEALTH MONITOR ====================
    function openHealthDashboard() {
        if (window.IntegrationHealthDashboard) {
            window.IntegrationHealthDashboard.open();
        } else {
            showToast('Health Monitor not loaded yet. Please wait...', 'error');
        }
    }

    function testAllIntegrations() {
        if (window.IntegrationHealthMonitor) {
            window.IntegrationHealthMonitor.testAll();
            showToast('Running all integration tests...', 'success');
        } else {
            showToast('Health Monitor not loaded yet. Please wait...', 'error');
        }
    }

    // ==================== EXPOSE API ====================
    window.CarbonCommands = {
        open: openPalette,
        close: closePalette,
        execute: (cmd, ...args) => {
            recordStep(cmd, args);
            executeCommand(cmd, ...args);
        },
        toggleVoice,
        toggleVoiceOrb,
        setVoiceEnabled,
        syncVoiceSettings: applyVoiceSettings,
        getVoiceSettings,
        record: startRecording,
        stop: stopRecording,
        run: runWorkflow,
        schedule: scheduleCommand,
        share: shareCommand,
        import: importCommand,
        nl: naturalLanguageCommand,
        version: CONFIG.version
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
