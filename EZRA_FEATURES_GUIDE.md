# Ezra Features Guide - Where to Find Everything

## 🔍 How to Access Ezra

1. **Open the HTML app** in your browser
2. **Look for the golden orb** (✨) in the bottom-right corner
3. **Click the orb** to open Ezra chat

---

## ⚡ Token Balance Display

### Where to Find It
- **Location**: Inside the Ezra chat widget, in the header
- **Look for**: "⚡ 0" (or your current balance) next to "EZRA" title
- **Color coding**:
  - 🟢 Green = Healthy balance (>50 tokens)
  - 🟠 Amber = Low balance (<50 tokens)
  - 🔴 Red = Critical balance (<20 tokens)

### How to Test It
1. Open Ezra chat
2. Look at the header - you should see "⚡ 0" or your balance
3. **Click the token badge** to open purchase modal

### If Token Balance Doesn't Show
1. Open browser console (F12)
2. Check for errors
3. Look for messages starting with "🔑 Token System:"
4. If no messages, scripts may not be loading

---

## 🏗️ Quote Builder

### Where to Find It
- **Location**: Inside Ezra chat, in the quick command buttons
- **Look for**: "💰 Build Quote" button (horizontal scrollable row of buttons)

### How to Access
**Method 1 - Quick Command:**
1. Open Ezra chat
2. Find "💰 Build Quote" in the quick command buttons
3. Click it

**Method 2 - Type Command:**
1. Open Ezra chat
2. Type: "build quote" or "Build Quote"
3. Press Enter

### Quote Builder Steps
Once opened, you'll see a 6-step wizard:
1. **Welcome** - Introduction
2. **Select Client** - Choose from pipeline or enter manually
3. **Import Rates** - Paste Figure/Nifty Door rates
4. **Cash Needed** - Enter loan amount
5. **Quote Style** - Select preset (Simple, Compare, Complete, etc.)
6. **Review** - Generate final quote

---

## 🤖 Enterprise AI Commands

### Available Commands
Type any of these in Ezra chat:

| Command | What It Does | Token Cost |
|---------|--------------|------------|
| "build quote" | Opens quote builder | Free |
| "generate strategy" | Creates sales strategy | 10 tokens |
| "sales script" | Generates sales script | 15 tokens |
| "handle objections" | Objection responses | 8 tokens |
| "draft email" | Email templates | 12 tokens |
| "competitive analysis" | Compare vs competitors | 20 tokens |

### Quick Command Buttons
Scroll the horizontal button row in Ezra to find:
- 🚀 Quick Quote
- 💰 Build Quote
- 🏗️ Structure Deal
- 🎯 Recommend Program
- 🛡️ Handle Objection
- 📝 Client Script
- ✉️ Draft Message
- ⚖️ Compare Scenarios

---

## 🧪 Testing Checklist for Enterprise

### Token System Test
```
1. Open Ezra chat
2. Check header shows "⚡" with balance
3. Click token badge → Purchase modal opens
4. Close modal
5. Type "generate strategy"
6. Should process (if you have tokens) or show "Insufficient Tokens"
```

### Quote Builder Test
```
1. Open Ezra chat
2. Click "💰 Build Quote" button
3. Quote builder modal should open
4. Step through all 6 steps
5. Click "Generate Quote" at end
6. Modal closes, quote updates
```

### AI Command Test
```
1. Open Ezra chat
2. Type: "generate strategy for this client"
3. Ezra should:
   - Check tokens
   - Generate AI response
   - Deduct tokens
   - Show result
```

---

## 🐛 Troubleshooting

### Token Balance Not Showing
**Check:**
1. Browser console for errors
2. Network tab - are scripts loading?
3. Look for "token-system.js" and "token-system-init.js" in Sources

**Fix:**
```javascript
// In console, try manually initializing:
window.TokenSystem.fetchBalance()
```

### Quote Builder Not Opening
**Check:**
1. Is `window.QuoteBuilder` defined?
2. Check console for errors

**Fix:**
```javascript
// In console, check if loaded:
window.QuoteBuilder

// Try starting manually:
window.QuoteBuilder.start()
```

### AI Commands Not Working
**Check:**
1. Are you logged in?
2. Check console for "🔑 Token System:" messages
3. Look for API errors

**Enterprise Bypass (for testing):**
If token system is blocking AI calls during testing, check if there's a bypass for Enterprise tier in the code.

---

## 📍 Visual Map

```
┌─────────────────────────────────────┐
│  🤖 EZRA    ⚡ 500          − ×     │  ← Header with token balance
├─────────────────────────────────────┤
│                                     │
│  [Chat messages appear here]        │
│                                     │
├─────────────────────────────────────┤
│  🚀 💰 🏗️ 🎯 1️⃣ 2️⃣ 3️⃣ 🛡️ 📝     │  ← Quick commands (scrollable)
├─────────────────────────────────────┤
│  [Type message...]        [Send]    │
└─────────────────────────────────────┘
         ↑
    Click "💰 Build Quote"
         ↓
┌─────────────────────────────────────┐
│  🏗️ Quote Builder                  │
│  Step 1 of 6                        │
│  [Progress bar]                     │
│                                     │
│  [Step content]                     │
│                                     │
│  [← Back]    [Continue →]           │
└─────────────────────────────────────┘
```

---

## 🎯 Enterprise-Specific Notes

As an Enterprise user:
- You get **2,000 tokens/month** automatically
- Token consumption is tracked but shouldn't block you initially
- All AI features should be available
- If tokens run out, you can purchase more or wait for monthly refill

### Check Your Tier
```javascript
// In browser console:
window.EzraState?.userTier
// Should return: "enterprise"
```
