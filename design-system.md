# Above All CRM Design System

## Carbon HELOC Theme (Primary — v12)

The flagship HELOC tool uses a navy/gold professional theme with glassmorphism accents.

### CSS Variables
```css
:root {
    --accent-color: #d4a84b;
    --accent-dark: #b8922e;
    --navy: #1a2b4b;
    --navy-deep: #0f172a;
    --text-dark: #1e293b;
    --text-light: #64748b;
    --border: #e2e8f0;
    --bg-section: #f8fafc;
    --font-heading: 'DM Sans', sans-serif;
    --font-body: 'Inter', sans-serif;
}
```

### Typography
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Page title (h1) | DM Sans | 900 | 24px |
| Section headers (h3) | DM Sans | 800 | 11px uppercase |
| Labels | DM Sans | 700 | 8px uppercase |
| Data values | DM Sans | 800 | 16px |
| Body text | Inter | 400-500 | 10-12px |
| Table cells | Inter | 500 | 10px |

### Premium Header
```css
.premium-header {
    background: linear-gradient(135deg, var(--navy) 0%, var(--navy-deep) 50%, #2d4a7c 100%);
    padding: 20px 40px;
    color: white;
    text-align: center;
    position: relative;
    overflow: hidden;
}
.premium-header::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: radial-gradient(ellipse at 30% 50%, rgba(212,168,75,0.15), transparent 70%);
}
```

### Admin Panel (Dark Mode)
```css
#admin-panel {
    max-width: 950px;
    margin: 0 auto 20px auto;
    padding: 20px;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border-radius: 12px;
    color: white;
    border: 1px solid rgba(255,255,255,0.1);
}
```

### Floating Toolbar
```css
#floating-toolbar {
    position: fixed;
    top: 20px; right: 20px;
    display: flex; gap: 10px;
    z-index: 1000;
    background: rgba(30,41,59,0.95);
    padding: 10px 15px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.1);
}
.toolbar-btn {
    background: linear-gradient(135deg, var(--accent-color), var(--accent-dark));
    color: white; border: none;
    padding: 8px 14px; border-radius: 6px;
    font-family: var(--font-heading); font-weight: 700;
    cursor: pointer; font-size: 11px;
    transition: transform 0.2s;
}
```

## Proposal Layout Components

### Valuation Blocks
```css
.valuation-blocks {
    display: flex; gap: 10px;
    margin-bottom: 15px; flex-wrap: wrap;
}
.data-block {
    flex: 1; min-width: 120px;
    background: var(--bg-section);
    border: 1px solid var(--border);
    border-radius: 8px; padding: 10px;
    text-align: center;
}
.data-block.highlight {
    background: linear-gradient(135deg, rgba(212,168,75,0.1), rgba(212,168,75,0.05));
    border-color: var(--accent-color);
}
.gold { color: var(--accent-color); }
```

### Rate Matrix Tables
```css
table {
    width: 100%; border-collapse: collapse;
    font-size: 10px; margin-bottom: 10px;
}
th {
    background: var(--navy);
    color: white; padding: 6px 8px;
    font-family: var(--font-heading);
    font-weight: 700; font-size: 8px;
    text-transform: uppercase; letter-spacing: 0.5px;
}
td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
tr:hover { background: rgba(212,168,75,0.05); }
tr.selected-row {
    background: linear-gradient(135deg, rgba(212,168,75,0.15), rgba(212,168,75,0.05)) !important;
    font-weight: 700;
}
```

### Tier Headers
```css
.tier-header {
    background: linear-gradient(135deg, var(--navy), var(--navy-deep));
    color: white; padding: 6px 10px;
    border-radius: 6px; font-size: 10px;
    font-family: var(--font-heading); font-weight: 800;
    margin-bottom: 5px;
}
```

### Quote Snapshot (Selected Option)
```css
.quote-snapshot {
    background: linear-gradient(135deg, var(--navy) 0%, var(--navy-deep) 100%);
    border-radius: 10px; padding: 15px 20px;
    color: white; flex: 1; min-width: 250px;
}
.snapshot-row {
    display: flex; justify-content: space-between;
    padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1);
    font-size: 11px;
}
.snapshot-row.final {
    border-bottom: none; padding-top: 8px;
    font-size: 16px; font-weight: 800;
    color: var(--accent-color);
}
```

### CTA Button
```css
.btn-apply {
    display: inline-block;
    background: linear-gradient(135deg, var(--accent-color), var(--accent-dark));
    color: white; padding: 12px 30px;
    border-radius: 8px; font-weight: 800;
    font-family: var(--font-heading); font-size: 13px;
    text-decoration: none; letter-spacing: 0.5px;
    transition: transform 0.2s;
}
.btn-apply:hover { transform: scale(1.03); }
```

### Analysis Boxes
```css
.analysis-box {
    display: none; /* toggled via .visible */
    background: var(--bg-section);
    border: 1px solid var(--border);
    border-radius: 8px; padding: 12px;
    margin: 10px 0; font-size: 10px;
}
.analysis-box.visible { display: block; }
.analysis-title {
    font-family: var(--font-heading);
    font-weight: 800; font-size: 11px;
    margin-bottom: 8px; color: var(--text-dark);
}
```

### Disclaimer
```css
.client-disclaimer {
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: 6px; padding: 10px;
    margin: 12px 0; font-size: 8px;
    color: #92400e; text-align: center;
}
```

## Footer Structure

```css
footer {
    background: linear-gradient(135deg, var(--navy) 0%, var(--navy-deep) 100%);
    color: white; padding: 15px 30px; border-radius: 0 0 8px 8px;
}
.footer-main {
    display: flex; align-items: center; gap: 15px;
    padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.15);
}
.footer-headshot { width: 60px; height: 60px; border-radius: 50%; border: 2px solid var(--accent-color); }
.company-logo-footer { height: 45px; margin-left: auto; }
.footer-legal { margin-top: 10px; font-size: 7px; color: rgba(255,255,255,0.6); text-align: center; }
.footer-stars { color: var(--accent-color); font-size: 10px; margin-top: 3px; }
```

## Password Modal

```css
#password-modal {
    display: none; position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8);
    z-index: 9999;
    justify-content: center; align-items: center;
}
.password-box {
    background: linear-gradient(135deg, #1e293b, #0f172a);
    padding: 30px; border-radius: 12px;
    text-align: center; max-width: 350px;
    border: 1px solid rgba(212,168,75,0.3);
}
```

## Theme Variants (Legacy/Future)

### Obsidian (Dark Premium)
```css
body.obsidian {
    --bg-deep: #0d1117;
    --bg-card: rgba(20, 20, 28, 0.95);
    --primary: #a855f7;
    --primary-gold: #d4a84b;
}
```

### Carbon (Dark Gold)
```css
body.carbon {
    --bg-deep: #1a1a1a;
    --bg-card: rgba(30, 30, 30, 0.98);
    --primary: #d4a84b;
}
```

### Titanium (Dark Blue)
```css
body.titanium {
    --bg-deep: #0f1419;
    --primary: #60a5fa;
}
```

### Emerald (Dark Green)
```css
body.emerald {
    --bg-deep: #021a14;
    --primary: #10b981;
}
```

## Print Styles

```css
@media print {
    @page { size: letter; margin: 0.25in; }
    body { padding: 0; margin: 0; background-color: #fff; font-size: 9px;
           -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    #admin-panel, #password-modal, #floating-toolbar { display: none !important; }
    .main-container { box-shadow: none; margin: 0; width: 100%; max-width: 100%; }
    .content-body { padding: 8px 20px; }
    .premium-header { padding: 12px 20px; }
    h1 { font-size: 18px; }
    .hide-on-print, .tool-protection { display: none !important; }
    .client-disclaimer { padding: 6px; font-size: 7px; }
    .valuation-blocks { gap: 5px; }
    .data-block { padding: 5px; }
    table { font-size: 8px; }
    th { padding: 3px 5px; font-size: 7px; }
    td { padding: 3px 5px; }
    footer { padding: 8px 15px; }
    .footer-headshot { width: 40px; height: 40px; }
    .company-logo-footer { height: 30px; }
}
```

## Responsive Breakpoints

```css
@media (max-width: 900px) {
    .premium-header { padding: 15px 20px; }
    .content-body { padding: 15px 20px; }
    .valuation-blocks { flex-direction: column; }
    .matrix-container { flex-direction: column; }
}

@media (max-width: 768px) {
    h1 { font-size: 18px; }
    .footer-main { flex-direction: column; text-align: center; }
    .company-logo-footer { margin-left: 0; }
    #floating-toolbar { right: 10px; top: 10px; max-width: 95%; }
}
```
