# Mobile Optimization Guide

**Platform**: Above All Carbon HELOC  
**Version**: v12  
**Last Updated**: March 2026

---

## 📱 Overview

This guide covers mobile optimization for the Above All Carbon HELOC platform, ensuring a seamless experience for loan officers using tablets and phones.

---

## 🎯 Design Principles

### Mobile-First Approach
1. **Touch-First**: All interactions optimized for touch
2. **Performance**: Fast load times on mobile networks
3. **Accessibility**: Readable text, sufficient contrast
4. **Responsive**: Adapts to any screen size

### Breakpoints

| Breakpoint | Width | Target Devices |
|------------|-------|----------------|
| `xs` | < 380px | Small phones |
| `sm` | 380-768px | Phones, small tablets |
| `md` | 768-1024px | Tablets, large phones |
| `lg` | > 1024px | Desktop, laptops |

```css
/* Mobile First Media Queries */
/* Base styles for mobile */

/* Small phones */
@media (min-width: 380px) { }

/* Tablets */
@media (min-width: 768px) { }

/* Desktop */
@media (min-width: 1024px) { }
```

---

## 🎨 UI Components

### Toolbar (Floating)

**Mobile Behavior:**
- Collapses to hamburger menu on screens < 768px
- Bottom-positioned for thumb reachability
- Swipe-up to expand full menu
- Drag handle hidden on mobile

```css
@media (max-width: 768px) {
    #floating-toolbar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        top: auto;
        flex-direction: row;
        justify-content: space-around;
        padding: 8px;
        border-radius: 16px 16px 0 0;
    }
    
    .toolbar-drag-handle {
        display: none;
    }
    
    .toolbar-btn {
        flex: 1;
        min-height: 44px;
        font-size: 12px;
        padding: 8px;
    }
    
    /* Hide text labels, show icons only */
    .toolbar-btn span {
        display: none;
    }
}
```

### Settings Panel (Admin)

**Mobile Behavior:**
- Full-screen overlay on mobile
- Bottom sheet style (slides up from bottom)
- Close button always visible
- Scrollable content area

```css
@media (max-width: 768px) {
    #admin-panel {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-width: 100%;
        border-radius: 0;
    }
    
    .admin-content {
        padding: 16px;
        padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
}
```

### Command Palette

**Mobile Behavior:**
- Full-width bottom sheet
- 85% viewport height
- Rounded top corners only
- Larger touch targets

Already implemented in `carbon-commands-v3.css`:
```css
@media (max-width: 768px) {
    .carbon-palette {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        top: auto;
        width: 100%;
        max-width: 100%;
        border-radius: 16px 16px 0 0;
        max-height: 85vh;
    }
}
```

### Ezra Chat Widget

**Mobile Behavior:**
- Full-screen panel when open
- Smaller orb button (46px vs 56px)
- Safe area support for notch devices
- Horizontal scrollable chips

Already implemented in `client-quote.html` and `ezra-chat.js`.

---

## 👆 Touch Targets

### Minimum Sizes

| Element | Minimum Size | Padding |
|---------|--------------|---------|
| Buttons | 44×44px | 12px |
| Form inputs | 44px height | 12px 16px |
| Checkboxes/Radio | 24×24px | 10px touch area |
| Links | 44×44px | 8px |
| Toolbar icons | 44×44px | 8px |

### CSS Implementation

```css
/* Touch-friendly buttons */
.btn, .toolbar-btn, button {
    min-height: 44px;
    min-width: 44px;
    padding: 12px 16px;
}

/* Form inputs */
input, select, textarea {
    min-height: 44px;
    font-size: 16px; /* Prevents iOS zoom */
}

/* Touch feedback */
@media (hover: none) {
    .btn:active, .toolbar-btn:active {
        transform: scale(0.98);
        opacity: 0.8;
    }
}
```

---

## 📐 Safe Area Support

### Notch & Home Indicator

```css
/* Safe area insets for notch devices */
.safe-area-top {
    padding-top: env(safe-area-inset-top, 0);
}

.safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom, 0);
}

.safe-area-left {
    padding-left: env(safe-area-inset-left, 0);
}

.safe-area-right {
    padding-right: env(safe-area-inset-right, 0);
}

/* Apply to fixed elements */
#floating-toolbar {
    padding-bottom: max(8px, env(safe-area-inset-bottom, 8px));
}

#admin-panel {
    padding-top: env(safe-area-inset-top, 0);
}
```

### Viewport Meta Tag

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

---

## 🚀 Performance

### Loading Optimization

```html
<!-- Preload critical resources -->
<link rel="preload" href="js/main.js" as="script">
<link rel="preload" href="css/main.css" as="style">

<!-- Lazy load non-critical -->
<script defer src="js/ezra-chat.js"></script>
<script defer src="js/integration-health-monitor.js"></script>
```

### CSS Optimization

```css
/* GPU acceleration for animations */
.animate {
    transform: translateZ(0);
    will-change: transform;
}

/* Contain paint for complex sections */
.quote-container {
    contain: layout style paint;
}
```

### Image Optimization

```html
<!-- Responsive images -->
<img src="logo.png" 
     srcset="logo-1x.png 1x, logo-2x.png 2x, logo-3x.png 3x"
     alt="Logo">
```

---

## 🧪 Testing Checklist

### iOS Safari
- [ ] No zoom when tapping input fields (font-size ≥ 16px)
- [ ] Smooth scrolling in all panels
- [ ] Safe area respected (notch devices)
- [ ] Touch targets work on first tap
- [ ] No text selection on UI elements
- [ ] Status bar color matches theme
- [ ] Bottom home indicator doesn't block buttons

### Android Chrome
- [ ] Touch feedback visible
- [ ] Smooth animations (60fps)
- [ ] Back button closes panels/modals
- [ ] No layout shifts on keyboard open
- [ ] Overscroll effects work
- [ ] Theme color matches app

### Both Platforms
- [ ] Works in landscape mode
- [ ] Works on tablets (iPad, Android tablets)
- [ ] No horizontal scroll
- [ ] Text readable at all sizes
- [ ] Toolbar accessible with one thumb
- [ ] Settings panel usable on small screens
- [ ] PDF export works
- [ ] Email send modal fits screen

### Devices to Test
| Device | Screen Size | Priority |
|--------|-------------|----------|
| iPhone SE | 375×667 | High |
| iPhone 14 Pro | 393×852 | High |
| iPhone 14 Pro Max | 430×932 | High |
| Samsung Galaxy S23 | 360×780 | High |
| iPad Mini | 768×1024 | Medium |
| iPad Pro 11" | 834×1194 | Medium |
| Pixel 7 | 412×915 | Medium |

---

## 🐛 Known Mobile Issues

### Issue: Toolbar Buttons Too Small on Mobile
**Status**: 🔲 To Fix  
**Priority**: High  
**Solution**: Implement collapsible toolbar with hamburger menu

### Issue: Settings Panel Overflow on Small Screens
**Status**: 🔲 To Fix  
**Priority**: High  
**Solution**: Convert to bottom sheet with scrollable content

### Issue: PDF Export Button Hidden on Mobile
**Status**: 🔲 To Fix  
**Priority**: Medium  
**Solution**: Always show PDF button in collapsed toolbar

### Issue: Touch Targets < 44px
**Status**: 🔲 To Fix  
**Priority**: Medium  
**Solution**: Audit and increase all touch targets

---

## 📱 PWA Configuration

### Manifest

```json
{
  "name": "Above All Carbon HELOC",
  "short_name": "Carbon HELOC",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a1628",
  "theme_color": "#0a1628",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" }
  ]
}
```

### Service Worker

See `sw.js` for offline support and caching strategy.

---

## 🎨 Mobile-Specific Styles

### Touch Highlight Removal

```css
/* Remove default tap highlight */
* {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
}

/* Allow text selection only on content */
p, h1, h2, h3, input, textarea {
    -webkit-user-select: text;
    user-select: text;
}

/* Prevent selection on UI */
button, .toolbar, .btn {
    -webkit-user-select: none;
    user-select: none;
}
```

### Smooth Scrolling

```css
/* Momentum scrolling on iOS */
.scrollable {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
}

/* Hide scrollbar but keep functionality */
.hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
    display: none;
}
```

---

## 📚 Related Documentation

- `MOBILE_IMPROVEMENTS.md` - Original mobile improvements summary
- `04-FEATURES-AND-TABS.md` - Feature documentation
- `08-CLIENT-QUOTE-PAGE.md` - Client page (also mobile-optimized)

---

## 🔧 Implementation Priority

### Week 1: Critical
1. Fix toolbar for mobile (collapsible)
2. Fix settings panel (bottom sheet)
3. Increase touch targets to 44px

### Week 2: Important
4. Test on iOS Safari
5. Test on Android Chrome
6. Fix any layout issues

### Week 3: Polish
7. Add haptic feedback
8. Optimize animations
9. Fine-tune spacing

---

*For questions or issues, refer to the troubleshooting guide or contact the development team.*
