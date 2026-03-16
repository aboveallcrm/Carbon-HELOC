/**
 * ============================================================================
 * ENHANCED QUOTE TEMPLATES SYSTEM v2.0
 * AboveAllCarbon HELOC - Diamond Tier Feature
 * ============================================================================
 * 
 * FEATURES:
 * - Expanded template state (rates, presentation controls, white label, client features)
 * - Template metadata (description, tags, default flag, shared flag)
 * - Enhanced UI (search/filter, usage stats, set default, duplicate)
 * - Cloud sync ready (Supabase structure with user_id)
 * - Export/Import JSON and URL sharing
 * 
 * STORAGE KEYS:
 * - heloc_quote_templates_v2: Main templates array
 * - heloc_template_default_id: ID of default template to auto-load
 * - heloc_templates_last_sync: Last cloud sync timestamp
 * 
 * CLOUD SYNC (Future):
 * - Table: quote_templates
 * - Fields: id, user_id, name, description, tags, is_default, is_shared, 
 *           template_data, usage_count, last_used_at, created_at, updated_at
 * ============================================================================
 */

// ===== TEMPLATE SYSTEM CONFIGURATION =====
const TEMPLATE_CONFIG = {
    storageKey: 'heloc_quote_templates_v2',
    defaultTemplateKey: 'heloc_template_default_id',
    lastSyncKey: 'heloc_templates_last_sync',
    maxLocalTemplates: 50,  // Prevent localStorage overflow
    version: '2.0'
};

// ===== UTILITY FUNCTIONS =====

/**
 * Generate a unique ID for templates
 */
function generateTemplateId() {
    return 'tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get current user ID for cloud sync
 */
function getCurrentUserId() {
    return window.currentUserId || window.currentUser?.id || null;
}

/**
 * Get templates from localStorage
 */
function getTemplates() {
    try {
        const data = localStorage.getItem(TEMPLATE_CONFIG.storageKey);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Error loading templates:', e);
        return [];
    }
}

/**
 * Save templates to localStorage
 */
function saveTemplates(templates) {
    try {
        // Limit to max templates to prevent storage overflow
        if (templates.length > TEMPLATE_CONFIG.maxLocalTemplates) {
            templates = templates.slice(0, TEMPLATE_CONFIG.maxLocalTemplates);
        }
        localStorage.setItem(TEMPLATE_CONFIG.storageKey, JSON.stringify(templates));
        return true;
    } catch (e) {
        console.error('Error saving templates:', e);
        showToast('Error saving template. Storage may be full.', 'error');
        return false;
    }
}

/**
 * Get default template ID
 */
function getDefaultTemplateId() {
    return localStorage.getItem(TEMPLATE_CONFIG.defaultTemplateKey) || null;
}

/**
 * Set default template
 */
function setDefaultTemplateId(templateId) {
    if (templateId) {
        localStorage.setItem(TEMPLATE_CONFIG.defaultTemplateKey, templateId);
    } else {
        localStorage.removeItem(TEMPLATE_CONFIG.defaultTemplateKey);
    }
}

// ===== EXPANDED TEMPLATE STATE CAPTURE =====

/**
 * Capture complete template state including all settings
 */
function captureTemplateState() {
    const state = {
        // Template metadata
        version: TEMPLATE_CONFIG.version,
        capturedAt: new Date().toISOString(),
        
        // ===== RATE CONFIGURATION =====
        rates: {
            // Tier 1 Origination
            t1Orig: document.getElementById('t1-orig')?.value || '4.99',
            // Tier 1 Fixed Rates
            t1_30_rate: document.getElementById('t1-30-rate')?.value || '',
            t1_20_rate: document.getElementById('t1-20-rate')?.value || '',
            t1_15_rate: document.getElementById('t1-15-rate')?.value || '',
            t1_10_rate: document.getElementById('t1-10-rate')?.value || '',
            t1_30_rate_manual: document.getElementById('t1-30-rate-manual')?.value || '',
            t1_20_rate_manual: document.getElementById('t1-20-rate-manual')?.value || '',
            t1_15_rate_manual: document.getElementById('t1-15-rate-manual')?.value || '',
            t1_10_rate_manual: document.getElementById('t1-10-rate-manual')?.value || '',
            // Tier 1 Variable Rates
            t1_30_var: document.getElementById('t1-30-var')?.value || '',
            t1_20_var: document.getElementById('t1-20-var')?.value || '',
            t1_15_var: document.getElementById('t1-15-var')?.value || '',
            t1_10_var: document.getElementById('t1-10-var')?.value || '',
            t1_30_var_manual: document.getElementById('t1-30-var-manual')?.value || '',
            t1_20_var_manual: document.getElementById('t1-20-var-manual')?.value || '',
            t1_15_var_manual: document.getElementById('t1-15-var-manual')?.value || '',
            t1_10_var_manual: document.getElementById('t1-10-var-manual')?.value || '',
            
            // Tier 2 Origination
            t2Orig: document.getElementById('t2-orig')?.value || '2.99',
            // Tier 2 Fixed Rates
            t2_30_rate: document.getElementById('t2-30-rate')?.value || '',
            t2_20_rate: document.getElementById('t2-20-rate')?.value || '',
            t2_15_rate: document.getElementById('t2-15-rate')?.value || '',
            t2_10_rate: document.getElementById('t2-10-rate')?.value || '',
            t2_30_rate_manual: document.getElementById('t2-30-rate-manual')?.value || '',
            t2_20_rate_manual: document.getElementById('t2-20-rate-manual')?.value || '',
            t2_15_rate_manual: document.getElementById('t2-15-rate-manual')?.value || '',
            t2_10_rate_manual: document.getElementById('t2-10-rate-manual')?.value || '',
            // Tier 2 Variable Rates
            t2_30_var: document.getElementById('t2-30-var')?.value || '',
            t2_20_var: document.getElementById('t2-20-var')?.value || '',
            t2_15_var: document.getElementById('t2-15-var')?.value || '',
            t2_10_var: document.getElementById('t2-10-var')?.value || '',
            t2_30_var_manual: document.getElementById('t2-30-var-manual')?.value || '',
            t2_20_var_manual: document.getElementById('t2-20-var-manual')?.value || '',
            t2_15_var_manual: document.getElementById('t2-15-var-manual')?.value || '',
            t2_10_var_manual: document.getElementById('t2-10-var-manual')?.value || '',
            
            // Tier 3 Origination
            t3Orig: document.getElementById('t3-orig')?.value || '1.50',
            // Tier 3 Fixed Rates
            t3_30_rate: document.getElementById('t3-30-rate')?.value || '',
            t3_20_rate: document.getElementById('t3-20-rate')?.value || '',
            t3_15_rate: document.getElementById('t3-15-rate')?.value || '',
            t3_10_rate: document.getElementById('t3-10-rate')?.value || '',
            t3_30_rate_manual: document.getElementById('t3-30-rate-manual')?.value || '',
            t3_20_rate_manual: document.getElementById('t3-20-rate-manual')?.value || '',
            t3_15_rate_manual: document.getElementById('t3-15-rate-manual')?.value || '',
            t3_10_rate_manual: document.getElementById('t3-10-rate-manual')?.value || '',
            // Tier 3 Variable Rates
            t3_30_var: document.getElementById('t3-30-var')?.value || '',
            t3_20_var: document.getElementById('t3-20-var')?.value || '',
            t3_15_var: document.getElementById('t3-15-var')?.value || '',
            t3_10_var: document.getElementById('t3-10-var')?.value || '',
            t3_30_var_manual: document.getElementById('t3-30-var-manual')?.value || '',
            t3_20_var_manual: document.getElementById('t3-20-var-manual')?.value || '',
            t3_15_var_manual: document.getElementById('t3-15-var-manual')?.value || '',
            t3_10_var_manual: document.getElementById('t3-10-var-manual')?.value || '',
            
            // Rate mode
            manualRates: document.getElementById('toggle-manual-rates')?.classList.contains('active') || false
        },
        
        // ===== PRESENTATION OUTPUT CONTROLS =====
        presentation: {
            // Main toggles
            interestOnly: document.getElementById('toggle-interest-only')?.classList.contains('active') || false,
            showVariable: document.getElementById('toggle-show-variable')?.classList.contains('active') || false,
            showRecommendation: document.getElementById('toggle-show-recommendation')?.classList.contains('active') || false,
            showFees: document.getElementById('toggle-show-fees')?.classList.contains('active') || false,
            showDisclaimer: document.getElementById('toggle-show-disclaimer')?.classList.contains('active') || false,
            
            // Recommendation settings
            recTier: document.getElementById('rec-tier-select')?.value || 't2',
            recTerm: document.getElementById('rec-term-select')?.value || '20',
            showBreakEven: document.getElementById('chk-show-break')?.checked || false,
            showAI: document.getElementById('chk-show-ai')?.checked || false,
            showDebt: document.getElementById('chk-show-debt')?.checked || false,
            showRefi: document.getElementById('chk-show-refi')?.checked || false,
            
            // Refi baseline
            refiBalance: document.getElementById('in-refi-balance')?.value || '0',
            refiRate: document.getElementById('in-refi-rate')?.value || '0',
            refiPayment: document.getElementById('in-refi-payment')?.value || '0',
            
            // Property type
            propertyType: document.getElementById('in-property-type')?.value || 'Primary Residence',
            
            // Quote style preset
            quoteStylePreset: document.getElementById('quote-style-preset')?.value || 'default',
            
            // Client Link options
            linkShowLoInfo: document.getElementById('chk-link-lo-info')?.checked ?? true,
            linkEnableAiChat: document.getElementById('chk-link-ai-chat')?.checked ?? true,
            linkAiChatMode: document.querySelector('input[name="ai-chat-mode"]:checked')?.value || 'ezra',
            linkShowApply: document.getElementById('chk-link-apply')?.checked ?? true,
            linkShowVideo: document.getElementById('chk-link-video')?.checked || false,
            linkVideoUrl: document.getElementById('link-video-url')?.value || '',
            linkVideoMode: document.querySelector('input[name="video-mode"]:checked')?.value || 'manual',
            linkShowSalesPsych: document.getElementById('chk-link-sales-psych')?.checked ?? true,
            linkShowExpiry: document.getElementById('chk-link-expiry')?.checked ?? true,
            linkExpiryDays: document.getElementById('link-expiry-days')?.value || '30',
            linkRateLock: document.getElementById('chk-rate-lock')?.checked || false,
            
            // PDF options
            pdfShowLoInfo: document.getElementById('chk-pdf-lo-info')?.checked ?? true,
            pdfShowDisclaimer: document.getElementById('chk-pdf-disclaimer')?.checked ?? true,
            pdfShowAiStrategy: document.getElementById('chk-pdf-ai-strategy')?.checked || false
        },
        
        // ===== WHITE LABEL SETTINGS =====
        whiteLabel: {
            lenderName: document.getElementById('wl-lender-name')?.value || '',
            tagline: document.getElementById('wl-tagline')?.value || 'Unlock Your Wealth Without Selling',
            headerBg: document.getElementById('wl-header-bg')?.value || '#0f2b4c',
            accentColor: document.getElementById('wl-accent')?.value || '#c5a059',
            headerText: document.getElementById('wl-header-text')?.value || '#ffffff',
            bodyText: document.getElementById('wl-body-text')?.value || '#1e293b',
            applyLink: document.getElementById('wl-apply-link')?.value || '',
            applyText: document.getElementById('wl-apply-text')?.value || 'Apply Now'
        },
        
        // ===== CLIENT QUOTE FEATURES (Titanium v5.9.3) =====
        clientFeatures: {
            showPrequal: document.getElementById('chk-show-prequal')?.classList.contains('active') ?? true,
            showDocUpload: document.getElementById('chk-show-doc-upload')?.classList.contains('active') ?? true,
            showTierCompare: document.getElementById('chk-show-tier-compare')?.classList.contains('active') ?? true,
            showDtiCalc: document.getElementById('chk-show-dti-calc')?.classList.contains('active') ?? true,
            showWhatIfPayoff: document.getElementById('chk-show-whatif-payoff')?.classList.contains('active') ?? true,
            showTestimonials: document.getElementById('chk-show-testimonials')?.classList.contains('active') || false,
            tierCompareMode: document.getElementById('select-tier-compare-mode')?.value || 'all',
            testimonialsJson: document.getElementById('lo-testimonials-json')?.value || ''
        },
        
        // ===== EMAIL TEMPLATES =====
        email: {
            subject: document.getElementById('email-subject')?.value || '',
            body: document.getElementById('email-template')?.value || ''
        }
    };
    
    return state;
}

/**
 * Apply template state to the UI
 */
function applyTemplateState(state) {
    if (!state) return;
    
    // ===== APPLY RATE CONFIGURATION =====
    if (state.rates) {
        const r = state.rates;
        
        // Helper to set input value
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined && val !== '') el.value = val;
        };
        
        // Tier 1
        setVal('t1-orig', r.t1Orig);
        setVal('t1-30-rate', r.t1_30_rate);
        setVal('t1-20-rate', r.t1_20_rate);
        setVal('t1-15-rate', r.t1_15_rate);
        setVal('t1-10-rate', r.t1_10_rate);
        setVal('t1-30-rate-manual', r.t1_30_rate_manual);
        setVal('t1-20-rate-manual', r.t1_20_rate_manual);
        setVal('t1-15-rate-manual', r.t1_15_rate_manual);
        setVal('t1-10-rate-manual', r.t1_10_rate_manual);
        setVal('t1-30-var', r.t1_30_var);
        setVal('t1-20-var', r.t1_20_var);
        setVal('t1-15-var', r.t1_15_var);
        setVal('t1-10-var', r.t1_10_var);
        setVal('t1-30-var-manual', r.t1_30_var_manual);
        setVal('t1-20-var-manual', r.t1_20_var_manual);
        setVal('t1-15-var-manual', r.t1_15_var_manual);
        setVal('t1-10-var-manual', r.t1_10_var_manual);
        
        // Tier 2
        setVal('t2-orig', r.t2Orig);
        setVal('t2-30-rate', r.t2_30_rate);
        setVal('t2-20-rate', r.t2_20_rate);
        setVal('t2-15-rate', r.t2_15_rate);
        setVal('t2-10-rate', r.t2_10_rate);
        setVal('t2-30-rate-manual', r.t2_30_rate_manual);
        setVal('t2-20-rate-manual', r.t2_20_rate_manual);
        setVal('t2-15-rate-manual', r.t2_15_rate_manual);
        setVal('t2-10-rate-manual', r.t2_10_rate_manual);
        setVal('t2-30-var', r.t2_30_var);
        setVal('t2-20-var', r.t2_20_var);
        setVal('t2-15-var', r.t2_15_var);
        setVal('t2-10-var', r.t2_10_var);
        setVal('t2-30-var-manual', r.t2_30_var_manual);
        setVal('t2-20-var-manual', r.t2_20_var_manual);
        setVal('t2-15-var-manual', r.t2_15_var_manual);
        setVal('t2-10-var-manual', r.t2_10_var_manual);
        
        // Tier 3
        setVal('t3-orig', r.t3Orig);
        setVal('t3-30-rate', r.t3_30_rate);
        setVal('t3-20-rate', r.t3_20_rate);
        setVal('t3-15-rate', r.t3_15_rate);
        setVal('t3-10-rate', r.t3_10_rate);
        setVal('t3-30-rate-manual', r.t3_30_rate_manual);
        setVal('t3-20-rate-manual', r.t3_20_rate_manual);
        setVal('t3-15-rate-manual', r.t3_15_rate_manual);
        setVal('t3-10-rate-manual', r.t3_10_rate_manual);
        setVal('t3-30-var', r.t3_30_var);
        setVal('t3-20-var', r.t3_20_var);
        setVal('t3-15-var', r.t3_15_var);
        setVal('t3-10-var', r.t3_10_var);
        setVal('t3-30-var-manual', r.t3_30_var_manual);
        setVal('t3-20-var-manual', r.t3_20_var_manual);
        setVal('t3-15-var-manual', r.t3_15_var_manual);
        setVal('t3-10-var-manual', r.t3_10_var_manual);
        
        // Manual rates toggle
        const manualToggle = document.getElementById('toggle-manual-rates');
        if (manualToggle && r.manualRates !== undefined) {
            const isActive = manualToggle.classList.contains('active');
            if (r.manualRates && !isActive) toggleManualRates(manualToggle);
            if (!r.manualRates && isActive) toggleManualRates(manualToggle);
        }
    }
    
    // ===== APPLY PRESENTATION CONTROLS =====
    if (state.presentation) {
        const p = state.presentation;
        
        // Helper for toggles
        const setToggle = (id, active) => {
            const el = document.getElementById(id);
            if (!el) return;
            const isActive = el.classList.contains('active');
            if (active && !isActive) toggleSwitch(el);
            if (!active && isActive) toggleSwitch(el);
        };
        
        setToggle('toggle-interest-only', p.interestOnly);
        setToggle('toggle-show-variable', p.showVariable);
        setToggle('toggle-show-recommendation', p.showRecommendation);
        setToggle('toggle-show-fees', p.showFees);
        setToggle('toggle-show-disclaimer', p.showDisclaimer);
        
        // Selects
        const setSelect = (id, val) => {
            const el = document.getElementById(id);
            if (el && val) el.value = val;
        };
        
        setSelect('rec-tier-select', p.recTier);
        setSelect('rec-term-select', p.recTerm);
        setSelect('in-property-type', p.propertyType);
        setSelect('quote-style-preset', p.quoteStylePreset);
        
        // Checkboxes
        const setChk = (id, checked) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!checked;
        };
        
        setChk('chk-show-break', p.showBreakEven);
        setChk('chk-show-ai', p.showAI);
        setChk('chk-show-debt', p.showDebt);
        setChk('chk-show-refi', p.showRefi);
        
        // Refi inputs
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val;
        };
        
        setVal('in-refi-balance', p.refiBalance);
        setVal('in-refi-rate', p.refiRate);
        setVal('in-refi-payment', p.refiPayment);
        
        // Client link options
        setChk('chk-link-lo-info', p.linkShowLoInfo);
        setChk('chk-link-ai-chat', p.linkEnableAiChat);
        setChk('chk-link-apply', p.linkShowApply);
        setChk('chk-link-video', p.linkShowVideo);
        setChk('chk-link-sales-psych', p.linkShowSalesPsych);
        setChk('chk-link-expiry', p.linkShowExpiry);
        setChk('chk-rate-lock', p.linkRateLock);
        
        setVal('link-video-url', p.linkVideoUrl);
        setVal('link-expiry-days', p.linkExpiryDays);
        
        // Radio buttons
        if (p.linkAiChatMode) {
            const radio = document.querySelector(`input[name="ai-chat-mode"][value="${p.linkAiChatMode}"]`);
            if (radio) radio.checked = true;
        }
        if (p.linkVideoMode) {
            const radio = document.querySelector(`input[name="video-mode"][value="${p.linkVideoMode}"]`);
            if (radio) radio.checked = true;
        }
        
        // PDF options
        setChk('chk-pdf-lo-info', p.pdfShowLoInfo);
        setChk('chk-pdf-disclaimer', p.pdfShowDisclaimer);
        setChk('chk-pdf-ai-strategy', p.pdfShowAiStrategy);
    }
    
    // ===== APPLY WHITE LABEL =====
    if (state.whiteLabel) {
        const w = state.whiteLabel;
        
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val;
        };
        
        setVal('wl-lender-name', w.lenderName);
        setVal('wl-tagline', w.tagline);
        setVal('wl-header-bg', w.headerBg);
        setVal('wl-accent', w.accentColor);
        setVal('wl-header-text', w.headerText);
        setVal('wl-body-text', w.bodyText);
        setVal('wl-apply-link', w.applyLink);
        setVal('wl-apply-text', w.applyText);
        
        // Apply white label if function exists
        if (typeof applyWhiteLabel === 'function') {
            applyWhiteLabel();
        }
    }
    
    // ===== APPLY CLIENT FEATURES =====
    if (state.clientFeatures) {
        const c = state.clientFeatures;
        
        const setToggle = (id, active) => {
            const el = document.getElementById(id);
            if (!el) return;
            const isActive = el.classList.contains('active');
            if (active && !isActive) toggleFeatureToggle(el, el.dataset.feature);
            if (!active && isActive) toggleFeatureToggle(el, el.dataset.feature);
        };
        
        setToggle('chk-show-prequal', c.showPrequal);
        setToggle('chk-show-doc-upload', c.showDocUpload);
        setToggle('chk-show-tier-compare', c.showTierCompare);
        setToggle('chk-show-dti-calc', c.showDtiCalc);
        setToggle('chk-show-whatif-payoff', c.showWhatIfPayoff);
        setToggle('chk-show-testimonials', c.showTestimonials);
        
        const select = document.getElementById('select-tier-compare-mode');
        if (select && c.tierCompareMode) select.value = c.tierCompareMode;
        
        const testimonials = document.getElementById('lo-testimonials-json');
        if (testimonials && c.testimonialsJson) testimonials.value = c.testimonialsJson;
    }
    
    // ===== APPLY EMAIL TEMPLATES =====
    if (state.email) {
        const e = state.email;
        
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val;
        };
        
        setVal('email-subject', e.subject);
        setVal('email-template', e.body);
    }
    
    // Trigger recalculation
    if (typeof calculateHELOC === 'function') {
        calculateHELOC();
    }
}

// ===== TEMPLATE CRUD OPERATIONS =====

/**
 * Save a new template with metadata
 */
function saveQuoteTemplateV2() {
    // Show enhanced save dialog
    const name = prompt('Template name (e.g., "Investment HELOC", "Debt Consolidation"):');
    if (!name || !name.trim()) return;
    
    const description = prompt('Description (optional):') || '';
    const tagsInput = prompt('Tags (comma-separated, optional):') || '';
    const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t);
    
    const templates = getTemplates();
    
    // Check for duplicate names
    if (templates.some(t => t.name.toLowerCase() === name.trim().toLowerCase())) {
        if (!confirm(`A template named "${name.trim()}" already exists. Overwrite?`)) {
            return;
        }
        // Remove existing template with same name
        templates = templates.filter(t => t.name.toLowerCase() !== name.trim().toLowerCase());
    }
    
    const newTemplate = {
        id: generateTemplateId(),
        name: name.trim(),
        description: description.trim(),
        tags: tags,
        isDefault: false,
        isShared: false,
        userId: getCurrentUserId(),
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        usageCount: 0,
        state: captureTemplateState()
    };
    
    templates.push(newTemplate);
    
    if (saveTemplates(templates)) {
        loadTemplateListV2();
        showToast(`Template "${name.trim()}" saved!`, 'success');
    }
}

/**
 * Load a template by ID
 */
function loadQuoteTemplateV2(templateId) {
    if (!templateId) {
        showToast('Select a template first', 'error');
        return;
    }
    
    const templates = getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
        showToast('Template not found', 'error');
        return;
    }
    
    // Apply the template state
    applyTemplateState(template.state);
    
    // Update usage statistics
    template.lastUsedAt = new Date().toISOString();
    template.usageCount = (template.usageCount || 0) + 1;
    saveTemplates(templates);
    
    // Refresh the list to show updated stats
    loadTemplateListV2();
    
    showToast(`Template "${template.name}" loaded!`, 'success');
}

/**
 * Delete a template
 */
function deleteQuoteTemplateV2(templateId) {
    if (!templateId) {
        showToast('Select a template first', 'error');
        return;
    }
    
    const templates = getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
        showToast('Template not found', 'error');
        return;
    }
    
    if (!confirm(`Delete template "${template.name}"?`)) return;
    
    // Check if this was the default
    const defaultId = getDefaultTemplateId();
    if (defaultId === templateId) {
        setDefaultTemplateId(null);
    }
    
    const filtered = templates.filter(t => t.id !== templateId);
    
    if (saveTemplates(filtered)) {
        loadTemplateListV2();
        showToast('Template deleted', 'success');
    }
}

/**
 * Duplicate a template
 */
function duplicateTemplate(templateId) {
    if (!templateId) return;
    
    const templates = getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
        showToast('Template not found', 'error');
        return;
    }
    
    const newName = prompt('New template name:', template.name + ' (Copy)');
    if (!newName || !newName.trim()) return;
    
    // Check for duplicate name
    if (templates.some(t => t.name.toLowerCase() === newName.trim().toLowerCase())) {
        showToast('A template with that name already exists', 'error');
        return;
    }
    
    const duplicated = {
        ...template,
        id: generateTemplateId(),
        name: newName.trim(),
        description: template.description + ' (Duplicated from ' + template.name + ')',
        isDefault: false,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        usageCount: 0
    };
    
    templates.push(duplicated);
    
    if (saveTemplates(templates)) {
        loadTemplateListV2();
        showToast(`Template duplicated as "${newName.trim()}"`, 'success');
    }
}

/**
 * Set a template as the default
 */
function setDefaultTemplate(templateId) {
    if (!templateId) return;
    
    const templates = getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
        showToast('Template not found', 'error');
        return;
    }
    
    // Clear default from all templates
    templates.forEach(t => t.isDefault = false);
    
    // Set new default
    template.isDefault = true;
    setDefaultTemplateId(templateId);
    
    if (saveTemplates(templates)) {
        loadTemplateListV2();
        showToast(`"${template.name}" set as default template`, 'success');
    }
}

/**
 * Clear the default template
 */
function clearDefaultTemplate() {
    const templates = getTemplates();
    templates.forEach(t => t.isDefault = false);
    setDefaultTemplateId(null);
    
    if (saveTemplates(templates)) {
        loadTemplateListV2();
        showToast('Default template cleared', 'info');
    }
}

// ===== ENHANCED UI FUNCTIONS =====

/**
 * Load template list into the select dropdown with enhanced UI
 */
function loadTemplateListV2() {
    const templates = getTemplates();
    const select = document.getElementById('template-select-v2');
    const detailsPanel = document.getElementById('template-details-panel');
    
    if (!select) return;
    
    // Sort templates: default first, then by last used, then by name
    const sortedTemplates = [...templates].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        if (a.lastUsedAt && b.lastUsedAt) {
            return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
        }
        if (a.lastUsedAt) return -1;
        if (b.lastUsedAt) return 1;
        return a.name.localeCompare(b.name);
    });
    
    // Build options
    let html = '<option value="">— Select a template —</option>';
    
    if (sortedTemplates.length === 0) {
        html += '<option value="" disabled>No saved templates</option>';
    } else {
        // Group by default vs others
        const defaultTemplates = sortedTemplates.filter(t => t.isDefault);
        const otherTemplates = sortedTemplates.filter(t => !t.isDefault);
        
        if (defaultTemplates.length > 0) {
            html += '<optgroup label="⭐ Default Template">';
            defaultTemplates.forEach(t => {
                html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
            });
            html += '</optgroup>';
        }
        
        if (otherTemplates.length > 0) {
            html += '<optgroup label="Saved Templates">';
            otherTemplates.forEach(t => {
                const usage = t.usageCount ? ` (${t.usageCount} uses)` : '';
                html += `<option value="${t.id}">${escapeHtml(t.name)}${usage}</option>`;
            });
            html += '</optgroup>';
        }
    }
    
    select.innerHTML = html;
    
    // Clear details panel
    if (detailsPanel) {
        detailsPanel.innerHTML = '<p style="color: rgba(255,255,255,0.4); font-size: 10px; text-align: center;">Select a template to view details</p>';
    }
}

/**
 * Show template details in the details panel
 */
function showTemplateDetails(templateId) {
    const detailsPanel = document.getElementById('template-details-panel');
    if (!detailsPanel || !templateId) return;
    
    const templates = getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
        detailsPanel.innerHTML = '<p style="color: rgba(255,255,255,0.4); font-size: 10px; text-align: center;">Template not found</p>';
        return;
    }
    
    const createdDate = template.createdAt ? new Date(template.createdAt).toLocaleDateString() : 'Unknown';
    const lastUsedDate = template.lastUsedAt ? new Date(template.lastUsedAt).toLocaleDateString() : 'Never';
    const tagsHtml = template.tags && template.tags.length > 0 
        ? template.tags.map(t => `<span class="template-tag">${escapeHtml(t)}</span>`).join(' ')
        : '<span style="color: rgba(255,255,255,0.3);">No tags</span>';
    
    const isDefault = template.isDefault;
    const defaultBadge = isDefault ? '<span class="template-default-badge">⭐ DEFAULT</span>' : '';
    
    detailsPanel.innerHTML = `
        <div class="template-details">
            <div class="template-details-header">
                <strong>${escapeHtml(template.name)}</strong>
                ${defaultBadge}
            </div>
            ${template.description ? `<div class="template-details-desc">${escapeHtml(template.description)}</div>` : ''}
            <div class="template-details-tags">${tagsHtml}</div>
            <div class="template-details-stats">
                <span>📅 Created: ${createdDate}</span>
                <span>🕐 Last used: ${lastUsedDate}</span>
                <span>🔢 Uses: ${template.usageCount || 0}</span>
            </div>
            <div class="template-details-actions">
                <button class="btn-template-action" onclick="loadQuoteTemplateV2('${template.id}')">📂 Load</button>
                <button class="btn-template-action" onclick="duplicateTemplate('${template.id}')">📋 Duplicate</button>
                ${!isDefault ? `<button class="btn-template-action" onclick="setDefaultTemplate('${template.id}')">⭐ Set Default</button>` : `<button class="btn-template-action" onclick="clearDefaultTemplate()">❌ Clear Default</button>`}
                <button class="btn-template-action btn-template-danger" onclick="deleteQuoteTemplateV2('${template.id}')">🗑 Delete</button>
            </div>
        </div>
    `;
}

/**
 * Filter templates by search term
 */
function filterTemplates(searchTerm) {
    const templates = getTemplates();
    const select = document.getElementById('template-select-v2');
    
    if (!select) return;
    
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
        loadTemplateListV2();
        return;
    }
    
    const filtered = templates.filter(t => {
        const nameMatch = t.name.toLowerCase().includes(term);
        const descMatch = t.description && t.description.toLowerCase().includes(term);
        const tagMatch = t.tags && t.tags.some(tag => tag.toLowerCase().includes(term));
        return nameMatch || descMatch || tagMatch;
    });
    
    // Build filtered options
    let html = '<option value="">— Select a template —</option>';
    
    if (filtered.length === 0) {
        html += '<option value="" disabled>No matching templates</option>';
    } else {
        filtered.forEach(t => {
            const defaultIndicator = t.isDefault ? '⭐ ' : '';
            html += `<option value="${t.id}">${defaultIndicator}${escapeHtml(t.name)}</option>`;
        });
    }
    
    select.innerHTML = html;
}

// ===== EXPORT/IMPORT FUNCTIONS =====

/**
 * Export a template as JSON file
 */
function exportTemplate(templateId) {
    if (!templateId) {
        showToast('Select a template to export', 'error');
        return;
    }
    
    const templates = getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
        showToast('Template not found', 'error');
        return;
    }
    
    // Create export object
    const exportData = {
        ...template,
        exportedAt: new Date().toISOString(),
        exportedFrom: window.location.hostname,
        version: TEMPLATE_CONFIG.version
    };
    
    // Remove user-specific data
    delete exportData.userId;
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `heloc-template-${template.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`Template "${template.name}" exported!`, 'success');
}

/**
 * Export all templates
 */
function exportAllTemplates() {
    const templates = getTemplates();
    
    if (templates.length === 0) {
        showToast('No templates to export', 'error');
        return;
    }
    
    const exportData = {
        templates: templates.map(t => {
            const clean = { ...t };
            delete clean.userId;
            return clean;
        }),
        exportedAt: new Date().toISOString(),
        exportedFrom: window.location.hostname,
        version: TEMPLATE_CONFIG.version,
        count: templates.length
    };
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `heloc-templates-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`${templates.length} templates exported!`, 'success');
}

/**
 * Import templates from JSON file
 */
function importTemplates(file) {
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Handle both single template and batch imports
            let importedTemplates = [];
            
            if (data.templates && Array.isArray(data.templates)) {
                // Batch import
                importedTemplates = data.templates;
            } else if (data.state && data.name) {
                // Single template
                importedTemplates = [data];
            } else {
                showToast('Invalid template file format', 'error');
                return;
            }
            
            const existingTemplates = getTemplates();
            let importedCount = 0;
            let skippedCount = 0;
            
            importedTemplates.forEach(imported => {
                // Check for duplicate names
                const existingIndex = existingTemplates.findIndex(t => 
                    t.name.toLowerCase() === imported.name.toLowerCase()
                );
                
                const templateToAdd = {
                    ...imported,
                    id: generateTemplateId(),
                    userId: getCurrentUserId(),
                    importedAt: new Date().toISOString(),
                    isDefault: false, // Never import as default
                    usageCount: 0
                };
                
                if (existingIndex >= 0) {
                    // Replace existing
                    existingTemplates[existingIndex] = templateToAdd;
                } else {
                    // Add new
                    existingTemplates.push(templateToAdd);
                }
                
                importedCount++;
            });
            
            if (saveTemplates(existingTemplates)) {
                loadTemplateListV2();
                showToast(`Imported ${importedCount} template(s)`, 'success');
            }
            
        } catch (err) {
            console.error('Import error:', err);
            showToast('Error importing templates. Invalid file format.', 'error');
        }
    };
    
    reader.readAsText(file);
}

/**
 * Generate shareable URL for a template
 */
function generateTemplateShareUrl(templateId) {
    if (!templateId) {
        showToast('Select a template to share', 'error');
        return;
    }
    
    const templates = getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
        showToast('Template not found', 'error');
        return;
    }
    
    // Create minimal share object
    const shareData = {
        n: template.name,
        d: template.description || '',
        t: template.tags || [],
        s: template.state
    };
    
    // Compress and encode
    const json = JSON.stringify(shareData);
    const compressed = btoa(json); // Note: In production, use a proper compression library
    
    const url = `${window.location.origin}${window.location.pathname}?template=${encodeURIComponent(compressed)}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
        showToast('Share URL copied to clipboard!', 'success');
    }).catch(() => {
        prompt('Copy this share URL:', url);
    });
}

/**
 * Load template from URL parameter
 */
function loadTemplateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const templateParam = params.get('template');
    
    if (!templateParam) return;
    
    try {
        const json = atob(decodeURIComponent(templateParam));
        const data = JSON.parse(json);
        
        if (data.s) {
            // Apply the template state
            applyTemplateState(data.s);
            
            // Show notification
            showToast(`Loaded shared template: ${data.n || 'Unnamed'}`, 'success');
            
            // Ask if user wants to save it
            setTimeout(() => {
                if (confirm(`Would you like to save "${data.n || 'this template'}" to your templates?`)) {
                    const templates = getTemplates();
                    
                    // Check for duplicate name
                    let name = data.n || 'Shared Template';
                    let counter = 1;
                    while (templates.some(t => t.name.toLowerCase() === name.toLowerCase())) {
                        name = `${data.n || 'Shared Template'} (${counter})`;
                        counter++;
                    }
                    
                    templates.push({
                        id: generateTemplateId(),
                        name: name,
                        description: (data.d || '') + ' (Imported from shared link)',
                        tags: data.t || [],
                        isDefault: false,
                        isShared: false,
                        userId: getCurrentUserId(),
                        createdAt: new Date().toISOString(),
                        lastUsedAt: new Date().toISOString(),
                        usageCount: 1,
                        state: data.s
                    });
                    
                    if (saveTemplates(templates)) {
                        loadTemplateListV2();
                        showToast('Template saved!', 'success');
                    }
                }
            }, 1000);
        }
    } catch (err) {
        console.error('Error loading template from URL:', err);
    }
}

// ===== AUTO-LOAD DEFAULT TEMPLATE =====

/**
 * Auto-load default template on startup
 */
function autoLoadDefaultTemplate() {
    const defaultId = getDefaultTemplateId();
    if (!defaultId) return;
    
    const templates = getTemplates();
    const template = templates.find(t => t.id === defaultId);
    
    if (template) {
        applyTemplateState(template.state);
        
        // Update usage stats
        template.lastUsedAt = new Date().toISOString();
        template.usageCount = (template.usageCount || 0) + 1;
        saveTemplates(templates);
        
        showToast(`Default template "${template.name}" loaded`, 'info');
    }
}

// ===== UTILITY FUNCTIONS =====

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== BACKWARDS COMPATIBILITY =====

/**
 * Migrate old templates to new format
 */
function migrateOldTemplates() {
    const oldTemplates = localStorage.getItem('heloc_quote_templates');
    if (!oldTemplates) return;
    
    try {
        const old = JSON.parse(oldTemplates);
        if (!Array.isArray(old) || old.length === 0) return;
        
        // Check if already migrated
        const existing = getTemplates();
        if (existing.length > 0) return;
        
        const migrated = old.map((t, index) => ({
            id: generateTemplateId(),
            name: t.name || `Template ${index + 1}`,
            description: 'Migrated from old template format',
            tags: [],
            isDefault: false,
            isShared: false,
            userId: getCurrentUserId(),
            createdAt: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
            lastUsedAt: null,
            usageCount: 0,
            state: t.state || t // Handle both old formats
        }));
        
        if (saveTemplates(migrated)) {
            console.log(`Migrated ${migrated.length} old templates`);
            // Clear old templates
            localStorage.removeItem('heloc_quote_templates');
        }
    } catch (e) {
        console.error('Migration error:', e);
    }
}

// ===== INITIALIZATION =====

// Run migration on load
migrateOldTemplates();

// Check for template in URL on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadTemplateFromUrl();
        // Auto-load default after a short delay to allow page to initialize
        setTimeout(autoLoadDefaultTemplate, 500);
    });
} else {
    loadTemplateFromUrl();
    setTimeout(autoLoadDefaultTemplate, 500);
}
