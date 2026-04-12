/**
 * Quote Builder Voice Input System
 * Phase 3: Hands-free quote building with voice commands
 */

(function() {
    'use strict';

    // Voice System State
    let voiceState = {
        isListening: false,
        isSupported: false,
        recognition: null,
        transcript: '',
        interimTranscript: '',
        wakeWordDetected: false,
        commandQueue: [],
        currentStep: 1
    };

    // Voice Commands Dictionary
    const VOICE_COMMANDS = {
        // Navigation
        'next step': { action: 'next' },
        'next': { action: 'next' },
        'continue': { action: 'next' },
        'go back': { action: 'back' },
        'previous': { action: 'back' },
        'back': { action: 'back' },
        'start over': { action: 'restart' },
        'cancel': { action: 'close' },
        'close': { action: 'close' },

        // Step 1: Client Info
        'load lead': { action: 'loadLead', pattern: /load lead (.+?) from (bonzo|ghl|crm)/i },
        'new client': { action: 'showManual' },
        'client name is': { action: 'setName', pattern: /client name is (.+)/i },
        'name is': { action: 'setName', pattern: /name is (.+)/i },
        'phone is': { action: 'setPhone', pattern: /phone is (.+)/i },
        'credit score is': { action: 'setCredit', pattern: /credit score is (\d+)/i },
        'credit is': { action: 'setCredit', pattern: /credit is (\d+)/i },
        'cash needed': { action: 'setAmount', pattern: /cash needed (?:is )?(?:\$)?(.+?)(?:\s|$)/i },
        'need': { action: 'setAmount', pattern: /need (?:\$)?(.+?)(?:\s|$)/i },
        'amount is': { action: 'setAmount', pattern: /amount is (?:\$)?(.+)/i },
        'purpose is': { action: 'setPurpose', pattern: /purpose is (.+)/i },
        'for': { action: 'setPurpose', pattern: /for (.+)/i },
        'debt consolidation': { action: 'setPurpose', value: 'debt consolidation' },
        'home improvement': { action: 'setPurpose', value: 'home improvement' },
        'investment': { action: 'setPurpose', value: 'investment' },
        'emergency fund': { action: 'setPurpose', value: 'emergency' },

        // Step 2: Property
        'property value': { action: 'setPropertyValue', pattern: /property value (?:is )?(?:\$)?(.+?)(?:\s|$)/i },
        'home is worth': { action: 'setPropertyValue', pattern: /home is worth (?:\$)?(.+?)(?:\s|$)/i },
        'value is': { action: 'setPropertyValue', pattern: /value is (?:\$)?(.+?)(?:\s|$)/i },
        'mortgage balance': { action: 'setMortgage', pattern: /mortgage balance (?:is )?(?:\$)?(.+?)(?:\s|$)/i },
        'mortgage is': { action: 'setMortgage', pattern: /mortgage is (?:\$)?(.+?)(?:\s|$)/i },
        'owe': { action: 'setMortgage', pattern: /owe (?:\$)?(.+?)(?:\s|$)/i },
        'address is': { action: 'setAddress', pattern: /address is (.+)/i },

        // Step 3: Rates
        'use last rates': { action: 'useLastRates' },
        'skip rates': { action: 'skipRates' },
        'paste rates': { action: 'showRatePaste' },

        // Step 4: Recommendation
        'use tier one': { action: 'selectTier', value: 't1' },
        'use tier two': { action: 'selectTier', value: 't2' },
        'use tier three': { action: 'selectTier', value: 't3' },
        'tier one': { action: 'selectTier', value: 't1' },
        'tier two': { action: 'selectTier', value: 't2' },
        'tier three': { action: 'selectTier', value: 't3' },
        'fifteen years': { action: 'selectTerm', value: 15 },
        'twenty years': { action: 'selectTerm', value: 20 },
        'thirty years': { action: 'selectTerm', value: 30 },
        'use this': { action: 'acceptRecommendation' },
        'looks good': { action: 'acceptRecommendation' },
        'show all options': { action: 'showAllOptions' },

        // Step 5: Generate
        'generate quote': { action: 'generateQuote' },
        'generate pdf': { action: 'generatePDF' },
        'email client': { action: 'emailClient' },
        'text client': { action: 'textClient' },
        'save and close': { action: 'saveAndClose' },
        'save quote': { action: 'saveAndClose' },

        // Corrections
        'no i said': { action: 'correctLast', pattern: /no,? i said (.+)/i },
        'correction': { action: 'correctLast', pattern: /correction,? (.+)/i },
        'change that to': { action: 'correctLast', pattern: /change that to (.+)/i }
    };

    // Number word to digit mapping
    const NUMBER_WORDS = {
        'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
        'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
        'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
        'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
        'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
        'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000,
        'million': 1000000
    };

    // Initialize voice system
    function initVoiceSystem() {
        checkSupport();
        addVoiceButton();
        console.log('🎤 Voice Input System initialized');
    }

    // Check browser support
    function checkSupport() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceState.isSupported = !!SpeechRecognition;
        
        if (voiceState.isSupported) {
            voiceState.recognition = new SpeechRecognition();
            voiceState.recognition.continuous = true;
            voiceState.recognition.interimResults = true;
            voiceState.recognition.lang = 'en-US';
            
            voiceState.recognition.onresult = handleRecognitionResult;
            voiceState.recognition.onerror = handleRecognitionError;
            voiceState.recognition.onend = handleRecognitionEnd;
        }
    }

    // Add voice button to quote builder
    function addVoiceButton() {
        // Wait for quote builder to be ready
        const checkInterval = setInterval(() => {
            const modal = document.querySelector('.quote-builder-modal');
            if (modal && !document.getElementById('qb-voice-btn')) {
                clearInterval(checkInterval);
                injectVoiceButton(modal);
            }
        }, 500);
    }

    // Inject voice button
    function injectVoiceButton(modal) {
        const header = modal.querySelector('.qb-header');
        if (!header) return;

        const voiceBtn = document.createElement('button');
        voiceBtn.id = 'qb-voice-btn';
        voiceBtn.className = 'qb-voice-btn';
        voiceBtn.innerHTML = '🎤';
        voiceBtn.title = voiceState.isSupported ? 'Voice input (hold to speak)' : 'Voice not supported';
        voiceBtn.disabled = !voiceState.isSupported;
        
        // Push-to-talk behavior
        voiceBtn.addEventListener('mousedown', startListening);
        voiceBtn.addEventListener('mouseup', stopListening);
        voiceBtn.addEventListener('mouseleave', stopListening);
        
        // Touch support
        voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startListening(); });
        voiceBtn.addEventListener('touchend', stopListening);
        
        header.appendChild(voiceBtn);

        // Add voice status display
        const statusEl = document.createElement('div');
        statusEl.id = 'qb-voice-status';
        statusEl.className = 'qb-voice-status';
        statusEl.style.display = 'none';
        modal.appendChild(statusEl);
    }

    // Start listening
    function startListening() {
        if (!voiceState.isSupported || voiceState.isListening) return;
        
        voiceState.isListening = true;
        voiceState.transcript = '';
        voiceState.interimTranscript = '';
        
        try {
            voiceState.recognition.start();
            updateVoiceUI('listening');
        } catch (e) {
            console.error('Voice recognition error:', e);
            voiceState.isListening = false;
        }
    }

    // Stop listening
    function stopListening() {
        if (!voiceState.isListening) return;
        
        voiceState.isListening = false;
        
        try {
            voiceState.recognition.stop();
        } catch (e) {
            // Ignore errors on stop
        }
        
        updateVoiceUI('idle');
        
        // Process final transcript
        if (voiceState.transcript) {
            processVoiceCommand(voiceState.transcript);
        }
    }

    // Handle recognition result
    function handleRecognitionResult(event) {
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                final += transcript;
            } else {
                interim += transcript;
            }
        }
        
        voiceState.transcript = final;
        voiceState.interimTranscript = interim;
        
        updateVoiceStatus(final || interim);
    }

    // Handle recognition error
    function handleRecognitionError(event) {
        console.error('Speech recognition error:', event.error);
        voiceState.isListening = false;
        updateVoiceUI('error');
        
        let message = 'Voice error. Try again.';
        switch (event.error) {
            case 'no-speech':
                message = 'No speech detected. Try again.';
                break;
            case 'audio-capture':
                message = 'No microphone found.';
                break;
            case 'not-allowed':
                message = 'Microphone access denied.';
                break;
        }
        
        showVoiceToast(message);
    }

    // Handle recognition end
    function handleRecognitionEnd() {
        if (voiceState.isListening) {
            // Restart if still supposed to be listening
            try {
                voiceState.recognition.start();
            } catch (e) {
                voiceState.isListening = false;
                updateVoiceUI('idle');
            }
        }
    }

    // Update voice UI
    function updateVoiceUI(state) {
        const btn = document.getElementById('qb-voice-btn');
        const status = document.getElementById('qb-voice-status');
        
        if (!btn) return;
        
        btn.className = 'qb-voice-btn ' + state;
        
        if (state === 'listening') {
            btn.innerHTML = '<span class="qb-voice-wave"></span>';
            if (status) status.style.display = 'block';
        } else if (state === 'error') {
            btn.innerHTML = '⚠️';
            setTimeout(() => {
                btn.innerHTML = '🎤';
                btn.className = 'qb-voice-btn';
            }, 2000);
        } else {
            btn.innerHTML = '🎤';
            if (status) {
                status.style.display = 'none';
                status.textContent = '';
            }
        }
    }

    // Update voice status text
    function updateVoiceStatus(text) {
        const status = document.getElementById('qb-voice-status');
        if (status) {
            status.textContent = text;
            status.className = 'qb-voice-status ' + (voiceState.interimTranscript ? 'interim' : 'final');
        }
    }

    // Process voice command
    function processVoiceCommand(transcript) {
        const lowerTranscript = transcript.toLowerCase().trim();
        
        console.log('Voice command:', lowerTranscript);
        
        // Find matching command
        for (const [phrase, command] of Object.entries(VOICE_COMMANDS)) {
            if (lowerTranscript.includes(phrase)) {
                let value = command.value;
                
                // Extract value from pattern if provided
                if (command.pattern) {
                    const match = transcript.match(command.pattern);
                    if (match) {
                        value = match[1];
                    }
                }
                
                executeCommand(command.action, value, transcript);
                return;
            }
        }
        
        // No command matched - try to extract numbers
        const number = extractNumber(lowerTranscript);
        if (number !== null) {
            // Try to infer context from current step
            inferAndSetValue(number);
        } else {
            showVoiceToast('Command not recognized. Try: "Cash needed is 75 thousand"');
        }
    }

    // Execute voice command
    function executeCommand(action, value, fullTranscript) {
        console.log('Executing:', action, value);
        
        switch (action) {
            case 'next':
                window.QuoteBuilderV2?.nextStep();
                showVoiceToast('Next step');
                break;
            case 'back':
                window.QuoteBuilderV2?.prevStep();
                showVoiceToast('Previous step');
                break;
            case 'close':
                window.QuoteBuilderV2?.close();
                break;
            case 'restart':
                window.QuoteBuilderV2?.start();
                showVoiceToast('Starting over');
                break;
                
            // Step 1 commands
            case 'loadLead':
                if (value) {
                    const source = fullTranscript.match(/from (bonzo|ghl|crm)/i)?.[1].toLowerCase();
                    if (source) {
                        window.QuoteBuilderV2?.loadLeads(source);
                        showVoiceToast(`Loading leads from ${source}`);
                    }
                }
                break;
            case 'showManual':
                window.QuoteBuilderV2?.showManualEntry();
                showVoiceToast('Manual entry');
                break;
            case 'setName':
                setInputValue('qb-client-name', value);
                showVoiceToast(`Name: ${value}`);
                break;
            case 'setPhone':
                setInputValue('qb-client-phone', value);
                showVoiceToast(`Phone: ${value}`);
                break;
            case 'setCredit':
                setSelectValue('qb-client-credit', value + '+');
                showVoiceToast(`Credit: ${value}`);
                break;
            case 'setAmount':
                const amount = parseAmount(value);
                if (amount) {
                    setInputValue('qb-cash-needed', amount);
                    showVoiceToast(`Amount: $${amount.toLocaleString()}`);
                }
                break;
            case 'setPurpose':
                setPurposeRadio(value);
                showVoiceToast(`Purpose: ${value}`);
                break;
                
            // Step 2 commands
            case 'setPropertyValue':
                const propValue = parseAmount(value);
                if (propValue) {
                    setInputValue('qb-property-value', propValue);
                    window.QuoteBuilderV2?.calculateEquity();
                    showVoiceToast(`Property: $${propValue.toLocaleString()}`);
                }
                break;
            case 'setMortgage':
                const mortgage = parseAmount(value);
                if (mortgage) {
                    setInputValue('qb-mortgage-balance', mortgage);
                    window.QuoteBuilderV2?.calculateEquity();
                    showVoiceToast(`Mortgage: $${mortgage.toLocaleString()}`);
                }
                break;
            case 'setAddress':
                setInputValue('qb-property-address', value);
                showVoiceToast(`Address set`);
                break;
                
            // Step 3 commands
            case 'useLastRates':
                window.QuoteBuilderV2?.useLastRates();
                showVoiceToast('Using last rates');
                break;
            case 'skipRates':
                window.QuoteBuilderV2?.skipRates();
                showVoiceToast('Skipping rates');
                break;
            case 'showRatePaste':
                window.QuoteBuilderV2?.showRatePaste();
                showVoiceToast('Paste rate sheet');
                break;
                
            // Step 4 commands
            case 'selectTier':
                // Store selection for when recommendation is generated
                voiceState.selectedTier = value;
                showVoiceToast(`Selected ${value.replace('t', 'Tier ')}`);
                break;
            case 'selectTerm':
                voiceState.selectedTerm = value;
                showVoiceToast(`Selected ${value} years`);
                break;
            case 'acceptRecommendation':
                window.QuoteBuilderV2?.selectRecommendation();
                showVoiceToast('Recommendation accepted');
                break;
            case 'showAllOptions':
                window.QuoteBuilderV2?.showAllOptions();
                break;
                
            // Step 5 commands
            case 'generateQuote':
                showVoiceToast('Quote generated');
                break;
            case 'generatePDF':
                window.QuoteBuilderV2?.generatePDF();
                showVoiceToast('Generating PDF');
                break;
            case 'emailClient':
                window.QuoteBuilderV2?.emailClient();
                showVoiceToast('Opening email');
                break;
            case 'textClient':
                window.QuoteBuilderV2?.textClient();
                showVoiceToast('Opening SMS');
                break;
            case 'saveAndClose':
                window.QuoteBuilderV2?.saveAndClose();
                showVoiceToast('Quote saved');
                break;
                
            // Corrections
            case 'correctLast':
                handleCorrection(value);
                break;
        }
    }

    // Parse amount from string (handles "75 thousand", "75000", etc.)
    function parseAmount(str) {
        if (!str) return null;
        
        str = str.toLowerCase().replace(/[$,]/g, '');
        
        // Check for word numbers
        let total = 0;
        let current = 0;
        const words = str.split(/\s+/);
        
        for (const word of words) {
            const num = parseFloat(word);
            if (!isNaN(num)) {
                current = num;
            } else if (NUMBER_WORDS[word]) {
                const val = NUMBER_WORDS[word];
                if (val === 100) {
                    current *= val;
                } else if (val >= 1000) {
                    current *= val;
                    total += current;
                    current = 0;
                } else {
                    current += val;
                }
            }
        }
        
        total += current;
        return total > 0 ? total : parseFloat(str) || null;
    }

    // Extract number from transcript
    function extractNumber(transcript) {
        const match = transcript.match(/(\d+(?:,\d{3})*(?:\.\d+)?)/);
        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        }
        
        // Try word numbers
        return parseAmount(transcript);
    }

    // Infer and set value based on current step
    function inferAndSetValue(number) {
        const step = getCurrentStep();
        
        switch (step) {
            case 1:
                if (number >= 300 && number <= 850) {
                    setSelectValue('qb-client-credit', number + '+');
                    showVoiceToast(`Credit score: ${number}`);
                } else {
                    setInputValue('qb-cash-needed', number);
                    showVoiceToast(`Amount: $${number.toLocaleString()}`);
                }
                break;
            case 2:
                const propValue = document.getElementById('qb-property-value')?.value;
                if (!propValue) {
                    setInputValue('qb-property-value', number);
                    window.QuoteBuilderV2?.calculateEquity();
                    showVoiceToast(`Property value: $${number.toLocaleString()}`);
                } else {
                    setInputValue('qb-mortgage-balance', number);
                    window.QuoteBuilderV2?.calculateEquity();
                    showVoiceToast(`Mortgage: $${number.toLocaleString()}`);
                }
                break;
        }
    }

    // Get current step from quote builder
    function getCurrentStep() {
        // Try to get from QuoteBuilderV2 state
        if (window.QuoteBuilderV2 && window.QuoteBuilderV2.getState) {
            return window.QuoteBuilderV2.getState().step;
        }
        
        // Fallback: infer from UI
        const stepIndicator = document.querySelector('.qb-step-indicator');
        if (stepIndicator) {
            const match = stepIndicator.textContent.match(/Step (\d)/);
            if (match) return parseInt(match[1]);
        }
        
        return 1;
    }

    // Set input value
    function setInputValue(id, value) {
        const input = document.getElementById(id);
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // Set select value
    function setSelectValue(id, value) {
        const select = document.getElementById(id);
        if (select) {
            // Find closest matching option
            for (const option of select.options) {
                if (option.value.includes(value) || value.includes(option.value)) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
            }
        }
    }

    // Set purpose radio button
    function setPurposeRadio(value) {
        const radios = document.querySelectorAll('input[name="purpose"]');
        for (const radio of radios) {
            if (radio.value.toLowerCase().includes(value.toLowerCase())) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
        }
    }

    // Handle correction
    function handleCorrection(newValue) {
        showVoiceToast(`Corrected to: ${newValue}`);
        // Re-process as new command
        processVoiceCommand(newValue);
    }

    // Show voice toast
    function showVoiceToast(message) {
        const toast = document.createElement('div');
        toast.className = 'qb-voice-toast';
        toast.innerHTML = `<span class="qb-voice-toast-icon">🎤</span> ${message}`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // Test voice command (for debugging)
    function testCommand(command) {
        console.log('Testing voice command:', command);
        processVoiceCommand(command);
    }
    
    // Expose globally
    window.QuoteBuilderVoice = {
        init: initVoiceSystem,
        start: startListening,
        stop: stopListening,
        isSupported: () => voiceState.isSupported,
        getState: () => ({ ...voiceState }),
        test: testCommand
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVoiceSystem);
    } else {
        initVoiceSystem();
    }
})();
