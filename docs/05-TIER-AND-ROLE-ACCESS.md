# Above All Carbon HELOC — Tier & Role Access Control

## Roles

| Role | Description |
|------|-------------|
| `user` | Loan officer — standard access |
| `admin` | Internal admin — additional parser + email tools |
| `super_admin` | Eddie (platform owner) — full access, user management |

**Super Admin UUID**: `795aea13-6aba-45f2-97d4-04576f684557`
**Super Admin Email**: `barraganmortgage@gmail.com`

---

## Tiers

| Tier | Value | Description |
|------|-------|-------------|
| `carbon` | 0 | Foundation — core quote builder |
| `titanium` | 1 | Growth — leads pipeline, advanced calculators |
| `platinum` | 2 | Professional — full CRM, automations |
| `obsidian` | 3 | Enterprise — white label |
| `diamond` | 4 | Premium — HeyGen AI video, unlimited AI |

---

## Feature Access Matrix

| Feature | Carbon | Titanium | Platinum | Obsidian | Diamond |
|---------|:------:|:--------:|:--------:|:--------:|:-------:|
| **Quote Builder** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PDF Export** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Client Share Links** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **QR Code Generation** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Bonzo (basic)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Rates Configuration** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **LO Profile** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **AI (15 calls/day)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Local Ezra KB** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Leads Pipeline** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Debt Consolidation Calc** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Refi Comparison** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Break-Even Analysis** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Apply Link** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Address Autocomplete** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Ezra AI on Client Pages** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Deal Radar** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **AI (20 calls/day)** | — | ✅ | ✅ | ✅ | ✅ |
| **SMS Templates** | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Full GHL Integration** | 🔒 | 🔒 | ✅ | ✅ | ✅ |
| **Bonzo Full Sync** | 🔒 | 🔒 | ✅ | ✅ | ✅ |
| **n8n Workflows** | 🔒 | 🔒 | ✅ | ✅ | ✅ |
| **Outbound Webhooks** | 🔒 | 🔒 | ✅ | ✅ | ✅ |
| **Lender Portal Parser** | 🔒 | 🔒 | ✅ | ✅ | ✅ |
| **Link Click Tracking** | 🔒 | 🔒 | ✅ | ✅ | ✅ |
| **AI (50 calls/day)** | — | — | ✅ | ✅ | ✅ |
| **Custom AI Prompts** | 🔒 | 🔒 | ✅ | ✅ | ✅ |
| **White Label Branding** | 🔒 | 🔒 | 🔒 | ✅ | ✅ |
| **Company Settings** | 🔒 | 🔒 | 🔒 | ✅ | ✅ |
| **HeyGen AI Video** | 🔒 | 🔒 | 🔒 | 🔒 | ✅ |
| **Unlimited AI** | — | — | — | — | ✅ |

---

## Role Access Matrix

| Tab / Section | user | admin | super_admin |
|---------------|:----:|:-----:|:-----------:|
| Client (Quotes) | ✅ | ✅ | ✅ |
| Quotes Library | ✅ | ✅ | ✅ |
| Leads Pipeline | ✅ | ✅ | ✅ |
| Rates | ✅ | ✅ | ✅ |
| LO Profile | ✅ | ✅ | ✅ |
| Integrations (Bonzo only) | ✅ | — | — |
| Integrations (all) | — | ✅ | ✅ |
| Settings | — | ✅ | ✅ |
| Lead Parser | — | ✅ | ✅ |
| Email Templates | — | ✅ | ✅ |
| Super Admin Dashboard | — | — | ✅ |
| User Management | — | — | ✅ |
| API Key Management | — | — | ✅ |

**Note**: `user` role sees Bonzo integration section only. Admin and super_admin see all integration subsections.

---

## Integration Subsection Access

| Subsection ID | Minimum Access |
|---------------|---------------|
| `int-bonzo` | user (carbon) |
| `int-radar` | user (titanium) |
| `int-ai` | user (titanium basic) |
| `int-ghl` | admin (platinum) |
| `int-n8n` | admin (platinum) |
| `int-crm` | admin (platinum) |
| `int-crm-inbound` | admin (platinum) |
| `int-crm-fub` | admin (platinum) |
| `int-webhooks` | admin (platinum) |
| `int-heygen` | super_admin (diamond) |

---

## How Tier Gating Works

### Locked Tab Behavior
Tier-locked tabs are **NOT hidden** — they display an upgrade overlay:
```
"This feature requires [Tier] or higher"
[Upgrade button]
```

This is intentional: users can see what they're missing and be prompted to upgrade.

### Implementation
```javascript
// Tabs registered as tier-locked:
var _tierLockedTabs = {
    'leads': 1,        // requires titanium (1)
    'integrations': 0, // carbon (0) = always visible
    'heygen': 4,       // requires diamond (4)
    // etc.
};

// switchTab() checks tier before switching:
function switchTab(tabId) {
    var requiredTier = _tierLockedTabs[tabId];
    var userTierNum = tierToNumber(window.currentUserTier);
    if (userTierNum < requiredTier) {
        showUpgradeOverlay(tabId, requiredTier);
        return;
    }
    // ... proceed with tab switch
}
```

### applyTierAccess(tier)
Called on auth-ready. Applies CSS show/hide to tier-gated UI elements based on current tier value. Higher tiers inherit all lower tier features.

### applyRoleAccess(role)
Called on auth-ready. Shows/hides tabs and sections based on role. Super admin sees all tabs.

### applyIntegrationAccess(role)
Called on auth-ready. Filters integration subsections visible to the user. Regular users only see Bonzo; admins/super_admin see all integrations based on their tier.

---

## Tier Number Mapping
```javascript
function tierToNumber(tier) {
    var map = { carbon: 0, titanium: 1, platinum: 2, obsidian: 3, diamond: 4 };
    return map[tier] ?? 0;
}
```

---

## Impersonation (Super Admin)

- Super admin can "View As" any user
- Duration: 1 hour (auto-expires)
- Read-only mode option (cannot save changes)
- Orange impersonation banner shown while active
- `getEffectiveUser()` in main.js applies impersonation state
- `stopImpersonation()` exits and restores super admin context
- All actions performed under the impersonated user's permissions and tier
