# Template System Enhancement - Patch Instructions

## Changes Required in AboveAllCarbon_HELOC_v12_FIXED.html

---

## 1. ADD CSS STYLES (Add before closing `</style>` tag)

```css
/* ==========================================================================
   ENHANCED TEMPLATE SYSTEM v2.0 STYLES
   ========================================================================== */

/* Template Details Panel Styles */
.template-details {
    font-family: var(--font-body);
}

.template-details-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 11px;
    color: white;
}

.template-details-desc {
    font-size: 9px;
    color: rgba(255,255,255,0.6);
    margin-bottom: 8px;
    line-height: 1.4;
}

.template-details-tags {
    margin-bottom: 8px;
}

.template-tag {
    display: inline-block;
    background: rgba(6,182,212,0.2);
    color: #22d3ee;
    font-size: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    margin-right: 4px;
    margin-bottom: 4px;
}

.template-default-badge {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: #0f172a;
    font-size: 7px;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 700;
}

.template-details-stats {
    display: flex;
    gap: 12px;
    font-size: 8px;
    color: rgba(255,255,255,0.5);
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.template-details-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.btn-template-action {
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    padding: 4px 10px;
    border-radius: 4px;
    font-family: var(--font-heading);
    font-size: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-template-action:hover {
    background: rgba(255,255,255,0.2);
    transform: translateY(-1px);
}

.btn-template-danger {
    background: rgba(239,68,68,0.2);
    color: #fca5a5;
}

.btn-template-danger:hover {
    background: rgba(239,68,68,0.3);
}

/* Template Select Optgroup Styling */
#template-select-v2 optgroup {
    background: #1e293b;
    color: #94a3b8;
    font-family: var(--font-heading);
    font-size: 9px;
    font-weight: 600;
}

#template-select-v2 option {
    background: #0f172a;
    color: white;
    padding: 4px;
}
```

---

## 2. REPLACE TEMPLATE HTML SECTION

**FIND (around line 5494-5520):**
```html
<!-- Quote Templates (Diamond exclusive) -->
<div id="quote-templates-section" class="control-section"
    style="display:none; background: linear-gradient(135deg, rgba(6,182,212,0.1), rgba(8,145,178,0.1)); border-color: #06b6d4;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
            <h4 style="font-family: var(--font-heading); color: #06b6d4; margin:0; font-size: 11px;">📑
                Quote Templates</h4>
            <span
                style="font-size: 7px; background: #06b6d4; color: #0f172a; padding: 2px 6px; border-radius: 8px; font-weight: 700;">DIAMOND</span>
        </div>
        <button class="btn"
            style="background: linear-gradient(135deg, #06b6d4, #0891b2); font-size: 9px; padding: 4px 12px;"
            onclick="saveQuoteTemplate()">💾 Save Current</button>
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
        <select id="template-select"
            style="flex:1; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(6,182,212,0.3); border-radius: 4px; padding: 6px 8px; font-family: var(--font-heading); font-size: 9px;">
            <option value="">— Select a template —</option>
        </select>
        <button class="btn" style="background: #06b6d4; font-size: 9px; padding: 4px 12px;"
            onclick="loadQuoteTemplate()">📂 Load</button>
        <button class="btn" style="background: #ef4444; font-size: 9px; padding: 4px 10px;"
            onclick="deleteQuoteTemplate()">🗑</button>
    </div>
    <p style="font-size: 7px; color: rgba(255,255,255,0.4); margin: 6px 0 0 0;">Save rate configurations as
        reusable templates. Client info is not saved — only rates, options, and scenarios.</p>
</div>
```

**REPLACE WITH:**
```html
<!-- Quote Templates (Diamond exclusive) - ENHANCED v2.0 -->
<div id="quote-templates-section" class="control-section"
    style="display:none; background: linear-gradient(135deg, rgba(6,182,212,0.1), rgba(8,145,178,0.1)); border-color: #06b6d4;">
    
    <!-- Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
            <h4 style="font-family: var(--font-heading); color: #06b6d4; margin:0; font-size: 11px;">📑
                Quote Templates</h4>
            <span
                style="font-size: 7px; background: #06b6d4; color: #0f172a; padding: 2px 6px; border-radius: 8px; font-weight: 700;">DIAMOND</span>
            <span style="font-size: 7px; color: rgba(255,255,255,0.4);">v2.0</span>
        </div>
        <button class="btn"
            style="background: linear-gradient(135deg, #06b6d4, #0891b2); font-size: 9px; padding: 4px 12px;"
            onclick="saveQuoteTemplateV2()">💾 Save Current</button>
    </div>
    
    <!-- Search/Filter -->
    <div style="margin-bottom:10px;">
        <input type="text" id="template-search" placeholder="🔍 Search templates..." 
            oninput="filterTemplates(this.value)"
            style="width:100%; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(6,182,212,0.3); 
                   border-radius: 4px; padding: 6px 10px; font-family: var(--font-heading); font-size: 10px;">
    </div>
    
    <!-- Template Selection -->
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
        <select id="template-select-v2"
            onchange="showTemplateDetails(this.value)"
            style="flex:1; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(6,182,212,0.3); 
                   border-radius: 4px; padding: 6px 8px; font-family: var(--font-heading); font-size: 9px;">
            <option value="">— Select a template —</option>
        </select>
        <button class="btn" style="background: #06b6d4; font-size: 9px; padding: 4px 12px;"
            onclick="loadQuoteTemplateV2(document.getElementById('template-select-v2').value)">📂 Load</button>
    </div>
    
    <!-- Template Details Panel -->
    <div id="template-details-panel" 
        style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; margin-bottom: 10px; min-height: 60px;">
        <p style="color: rgba(255,255,255,0.4); font-size: 10px; text-align: center; margin: 0;">
            Select a template to view details
        </p>
    </div>
    
    <!-- Bulk Actions -->
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; padding-top:10px; border-top: 1px solid rgba(255,255,255,0.1);">
        <button class="btn" style="background: rgba(255,255,255,0.1); font-size: 8px; padding: 3px 10px;"
            onclick="exportAllTemplates()">📥 Export All</button>
        <label class="btn" style="background: rgba(255,255,255,0.1); font-size: 8px; padding: 3px 10px; cursor:pointer;">
            📤 Import
            <input type="file" accept=".json" style="display:none;" 
                onchange="importTemplates(this.files[0]); this.value='';">
        </label>
        <button class="btn" style="background: rgba(255,255,255,0.1); font-size: 8px; padding: 3px 10px;"
            onclick="generateTemplateShareUrl(document.getElementById('template-select-v2').value)">🔗 Share</button>
    </div>
    
    <!-- Help Text -->
    <p style="font-size: 7px; color: rgba(255,255,255,0.4); margin: 6px 0 0 0;">
        Save complete rate configurations including presentation settings, white label, and client features. 
        Templates include usage tracking and can be set as default for auto-load on startup.
    </p>
</div>
```

---

## 3. REPLACE OLD TEMPLATE FUNCTIONS

**FIND (around line 16742-16851):**
```javascript
// ===== QUOTE TEMPLATES (Diamond exclusive) =====
function _captureTemplateState() {
    // ... existing code ...
}

function _applyTemplateState(state) {
    // ... existing code ...
}

function _loadTemplateList() {
    // ... existing code ...
}

function saveQuoteTemplate() {
    // ... existing code ...
}

function loadQuoteTemplate() {
    // ... existing code ...
}

function deleteQuoteTemplate() {
    // ... existing code ...
}
```

**REPLACE WITH:**
```javascript
// Include the contents of enhanced-template-system.js here
// Then add backwards compatibility wrappers:

// ===== BACKWARDS COMPATIBILITY WRAPPERS =====
function saveQuoteTemplate() {
    saveQuoteTemplateV2();
}

function loadQuoteTemplate() {
    loadQuoteTemplateV2(document.getElementById('template-select-v2')?.value);
}

function deleteQuoteTemplate() {
    deleteQuoteTemplateV2(document.getElementById('template-select-v2')?.value);
}

function _loadTemplateList() {
    loadTemplateListV2();
}
```

---

## 4. UPDATE TIER DISPLAY CODE

**FIND (around line 8899-8903):**
```javascript
// ---- DIAMOND (level >= 4): Quote Templates, Advanced Analytics ----
var templatesSection = document.getElementById('quote-templates-section');
if (templatesSection) {
    templatesSection.style.display = level >= 4 ? '' : 'none';
    if (level >= 4) _loadTemplateList();
}
```

**REPLACE WITH:**
```javascript
// ---- DIAMOND (level >= 4): Quote Templates, Advanced Analytics ----
var templatesSection = document.getElementById('quote-templates-section');
if (templatesSection) {
    templatesSection.style.display = level >= 4 ? '' : 'none';
    if (level >= 4) {
        loadTemplateListV2();
        migrateOldTemplates();
    }
}
```

---

## 5. ADD JAVASCRIPT FILES

Add these script tags before the closing `</body>` tag:

```html
<!-- Enhanced Template System v2.0 -->
<script src="enhanced-template-system.js"></script>
<script src="template-cloud-sync.js"></script>
```

Or inline the JavaScript code directly in the HTML file.

---

## Summary of Changes

| File | Change Type | Description |
|------|-------------|-------------|
| AboveAllCarbon_HELOC_v12_FIXED.html | Add | CSS styles for template UI |
| AboveAllCarbon_HELOC_v12_FIXED.html | Replace | Template HTML section (lines ~5494-5520) |
| AboveAllCarbon_HELOC_v12_FIXED.html | Replace | Template JavaScript functions (lines ~16742-16851) |
| AboveAllCarbon_HELOC_v12_FIXED.html | Modify | Tier display code (lines ~8899-8903) |
| New file | Create | enhanced-template-system.js |
| New file | Create | template-cloud-sync.js |
