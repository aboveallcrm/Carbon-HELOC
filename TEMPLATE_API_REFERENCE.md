# Template System v2.0 - API Reference

## Core Functions

### Template Management

#### `saveQuoteTemplateV2()`
Opens a series of prompts to save the current state as a new template.
- Prompts for: name, description, tags
- Validates for duplicate names
- Generates unique ID
- Saves to localStorage

#### `loadQuoteTemplateV2(templateId)`
Loads a template by ID and applies its state to the UI.
- Updates usage statistics
- Refreshes the template list
- Triggers `calculateHELOC()`

#### `deleteQuoteTemplateV2(templateId)`
Deletes a template after confirmation.
- Clears default if deleting default template
- Updates localStorage
- Refreshes the template list

#### `duplicateTemplate(templateId)`
Creates a copy of an existing template.
- Prompts for new name
- Prevents duplicate names
- Resets usage statistics

### Default Template

#### `setDefaultTemplate(templateId)`
Sets a template as the default (auto-loads on startup).
- Clears default flag from other templates
- Saves default ID to localStorage

#### `clearDefaultTemplate()`
Removes the default template setting.

#### `autoLoadDefaultTemplate()`
Automatically loads the default template on page load.
- Called automatically on initialization
- Updates usage statistics

### Search & Filter

#### `filterTemplates(searchTerm)`
Filters templates by name, description, or tags.
- Case-insensitive search
- Real-time filtering as user types

#### `showTemplateDetails(templateId)`
Displays detailed information about a template in the details panel.
- Shows name, description, tags
- Shows usage statistics
- Shows action buttons

### Import/Export

#### `exportTemplate(templateId)`
Exports a single template as a JSON file download.

#### `exportAllTemplates()`
Exports all templates as a backup JSON file.

#### `importTemplates(file)`
Imports templates from a JSON file.
- Handles both single and batch imports
- Prevents duplicate names (offers to replace)
- Generates new IDs for imported templates

#### `generateTemplateShareUrl(templateId)`
Creates a shareable URL with encoded template data.
- Copies to clipboard automatically
- Falls back to prompt if clipboard fails

#### `loadTemplateFromUrl()`
Automatically called on page load to check for template in URL.
- Decodes and applies template
- Offers to save imported template

### State Capture/Apply

#### `captureTemplateState()`
Captures the complete current state of the application.
Returns object with:
- `rates` - All rate configuration inputs
- `presentation` - Presentation output controls
- `whiteLabel` - White label settings
- `clientFeatures` - Client quote features
- `email` - Email templates

#### `applyTemplateState(state)`
Applies a captured state to the UI.
- Updates all form inputs
- Toggles switches
- Applies white label
- Triggers recalculation

## Utility Functions

#### `getTemplates()`
Returns array of templates from localStorage.

#### `saveTemplates(templates)`
Saves array of templates to localStorage.
- Limits to max templates
- Handles quota errors

#### `getDefaultTemplateId()`
Returns the ID of the default template.

#### `setDefaultTemplateId(templateId)`
Saves the default template ID.

#### `generateTemplateId()`
Generates a unique template ID.

#### `migrateOldTemplates()`
Migrates templates from old format to v2.
- Called automatically on load
- Clears old storage key after migration

## Cloud Sync (TemplateCloudSync)

### Configuration
```javascript
TemplateCloudSync.config = {
    enabled: false,           // Enable/disable cloud sync
    syncInterval: 300000,     // Sync interval in ms (5 min)
    conflictResolution: 'server-wins'  // Conflict resolution strategy
};
```

### Methods

#### `TemplateCloudSync.enable()`
Enables cloud synchronization.

#### `TemplateCloudSync.disable()`
Disables cloud synchronization.

#### `TemplateCloudSync.sync()`
Manually triggers a sync with Supabase.

#### `TemplateCloudSync.uploadTemplate(templateId)`
Uploads a single template to cloud.

#### `TemplateCloudSync.downloadTemplates()`
Downloads all cloud templates to local.

#### `TemplateCloudSync.shareTemplate(templateId, targetUserId)`
Shares a template with another user.

#### `TemplateCloudSync.getStatus()`
Returns current sync status.

## Storage Keys

| Key | Purpose |
|-----|---------|
| `heloc_quote_templates_v2` | Main templates array |
| `heloc_template_default_id` | Default template ID |
| `heloc_templates_last_sync` | Last cloud sync timestamp |

## Template Object Structure

```javascript
{
  id: "tpl_1234567890_abc123",      // Unique ID
  name: "Template Name",             // Display name
  description: "Description",        // Optional description
  tags: ["tag1", "tag2"],           // Array of tags
  isDefault: false,                  // Is default template
  isShared: false,                   // Is shared with team
  userId: "uuid",                    // Owner user ID
  createdAt: "2024-01-15T10:30:00Z", // Creation timestamp
  lastUsedAt: "2024-01-20T14:22:00Z", // Last used timestamp
  usageCount: 5,                     // Number of times loaded
  state: {                           // Captured state
    version: "2.0",
    capturedAt: "2024-01-15T10:30:00Z",
    rates: { /* rate inputs */ },
    presentation: { /* toggles */ },
    whiteLabel: { /* branding */ },
    clientFeatures: { /* features */ },
    email: { /* templates */ }
  }
}
```

## Events

The template system does not emit custom events, but it does:
- Call `calculateHELOC()` after applying state
- Call `showToast()` for user notifications
- Call `applyWhiteLabel()` when white label settings are applied

## Backwards Compatibility

Old functions are preserved as wrappers:
- `saveQuoteTemplate()` → `saveQuoteTemplateV2()`
- `loadQuoteTemplate()` → `loadQuoteTemplateV2()`
- `deleteQuoteTemplate()` → `deleteQuoteTemplateV2()`
- `_loadTemplateList()` → `loadTemplateListV2()`
