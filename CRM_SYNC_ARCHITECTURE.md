# CRM Sync Architecture for Above All Carbon HELOC

## Overview
This document outlines the architecture for syncing leads between the Carbon HELOC tool and various CRM platforms.

## Supported CRMs

### Tier 1 (Native Integration)
1. **GoHighLevel (GHL)** - Full bidirectional sync
2. **Salesforce** - Full bidirectional sync
3. **HubSpot** - Full bidirectional sync
4. **Follow Up Boss (FUB)** - Full bidirectional sync

### Tier 2 (Webhook/API)
5. **Bonzo** - Outbound sync + inbound webhook
6. **Zapier** - Trigger-based sync
7. **n8n** - Workflow automation
8. **Make (Integromat)** - Workflow automation

### Tier 3 (File/Email)
9. **LeadMailbox** - Email parsing
10. **CSV Import/Export** - Manual sync

---

## Database Schema

### Leads Table Enhancements
```sql
-- Existing fields: id, user_id, name, email, phone, address, credit_score, home_value, mortgage_balance, status, source, created_at, updated_at

-- NEW CRM Sync Fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_id VARCHAR(255); -- CRM's lead ID
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_source VARCHAR(50); -- 'ghl', 'salesforce', 'hubspot', etc.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_pipeline_id VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_stage_id VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_assigned_to VARCHAR(100); -- User ID in CRM
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'pending'; -- 'synced', 'pending', 'error', 'conflict'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sync_error TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sync_direction VARCHAR(10); -- 'inbound', 'outbound', 'bidirectional'

-- NEW Status Management Fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rate_lock_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS funded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS competitor_name VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualification_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS loan_amount DECIMAL(12,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS monthly_payment DECIMAL(10,2);
```

### Lead Status Logs Table
```sql
CREATE TABLE lead_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_status_logs_lead_id ON lead_status_logs(lead_id);
CREATE INDEX idx_status_logs_changed_at ON lead_status_logs(changed_at);
```

### Lead Communications Table
```sql
CREATE TABLE lead_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    type VARCHAR(20) NOT NULL, -- 'email', 'sms', 'call', 'meeting', 'note'
    direction VARCHAR(10) NOT NULL, -- 'inbound', 'outbound'
    subject VARCHAR(255),
    content TEXT,
    status VARCHAR(20) DEFAULT 'sent', -- 'draft', 'sent', 'delivered', 'read', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_communications_lead_id ON lead_communications(lead_id);
CREATE INDEX idx_communications_type ON lead_communications(type);
CREATE INDEX idx_communications_created_at ON lead_communications(created_at);
```

### CRM Integrations Table
```sql
CREATE TABLE crm_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    crm_type VARCHAR(50) NOT NULL, -- 'ghl', 'salesforce', 'hubspot', 'fub', 'bonzo'
    is_active BOOLEAN DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}', -- API keys, webhooks, field mappings
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_enabled BOOLEAN DEFAULT true,
    sync_direction VARCHAR(20) DEFAULT 'bidirectional', -- 'inbound', 'outbound', 'bidirectional'
    field_mappings JSONB DEFAULT '{}', -- Custom field mappings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, crm_type)
);

CREATE INDEX idx_crm_integrations_user_id ON crm_integrations(user_id);
```

### CRM Sync Queue Table
```sql
CREATE TABLE crm_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    crm_integration_id UUID NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
    operation VARCHAR(20) NOT NULL, -- 'create', 'update', 'delete'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    priority INTEGER DEFAULT 5, -- 1-10, lower is higher priority
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sync_queue_status ON crm_sync_queue(status);
CREATE INDEX idx_sync_queue_lead_id ON crm_sync_queue(lead_id);
CREATE INDEX idx_sync_queue_created_at ON crm_sync_queue(created_at);
```

---

## Sync Workflows

### 1. Outbound Sync (Carbon → CRM)

```
Lead Updated in Carbon
    ↓
Trigger: Database webhook or application event
    ↓
Check: Is CRM integration active for this user?
    ↓
Create entry in crm_sync_queue
    ↓
Edge Function: process-crm-sync (scheduled or triggered)
    ↓
Transform data to CRM format (using field_mappings)
    ↓
Send to CRM API
    ↓
Update lead.sync_status = 'synced'
    ↓
Log success/failure
```

### 2. Inbound Sync (CRM → Carbon)

```
Webhook received from CRM
    ↓
Edge Function: handle-crm-webhook
    ↓
Verify webhook signature
    ↓
Transform CRM data to Carbon format
    ↓
Find or create lead (match by external_id or email/phone)
    ↓
Update lead in Carbon
    ↓
Create lead_status_log entry
    ↓
Return 200 OK to CRM
```

### 3. Bidirectional Conflict Resolution

```
Conflict detected (both systems modified since last sync)
    ↓
Check conflict resolution strategy:
    - "carbon_wins" - Carbon version takes precedence
    - "crm_wins" - CRM version takes precedence
    - "newest_wins" - Most recent timestamp wins
    - "manual" - Flag for manual review
    ↓
Apply resolution
    ↓
Log conflict and resolution
    ↓
Notify user if manual intervention needed
```

---

## Edge Functions

### 1. `handle-crm-webhook`
Receives webhooks from CRMs and processes inbound updates.

**Supported Webhooks:**
- GHL: Contact create/update/delete, opportunity stage change
- Salesforce: Lead/Contact update, Opportunity stage change
- HubSpot: Contact property change, Deal stage change
- FUB: Lead status change, Event created

### 2. `process-crm-sync`
Processes the sync queue and sends updates to CRMs.

**Features:**
- Batch processing (10 items per run)
- Retry logic with exponential backoff
- Error handling and logging
- Rate limiting per CRM

### 3. `sync-crm-batch`
Manual sync trigger for bulk operations.

**Use cases:**
- Initial CRM connection (sync all existing leads)
- Force re-sync after field mapping changes
- Daily full sync as backup

### 4. `crm-auth-callback`
OAuth callback handler for CRMs that require OAuth (Salesforce, HubSpot).

---

## Field Mappings

### Default Field Mappings by CRM

#### GoHighLevel (GHL)
```json
{
  "contact": {
    "firstName": "lead.first_name",
    "lastName": "lead.last_name",
    "email": "lead.email",
    "phone": "lead.phone",
    "address1": "lead.address",
    "customFields": {
      "credit_score": "lead.credit_score",
      "home_value": "lead.home_value",
      "mortgage_balance": "lead.mortgage_balance",
      "heloc_status": "lead.status",
      "loan_amount": "lead.loan_amount",
      "interest_rate": "lead.interest_rate"
    }
  },
  "opportunity": {
    "name": "HELOC - {lead.name}",
    "pipelineId": "config.pipeline_id",
    "stageId": "mapStatusToStage(lead.status)",
    "status": "open"
  }
}
```

#### Salesforce
```json
{
  "Lead": {
    "FirstName": "lead.first_name",
    "LastName": "lead.last_name",
    "Email": "lead.email",
    "Phone": "lead.phone",
    "Street": "lead.address",
    "LeadSource": "HELOC Quote Tool",
    "Status": "mapStatusToSalesforce(lead.status)",
    "custom": {
      "Credit_Score__c": "lead.credit_score",
      "Home_Value__c": "lead.home_value",
      "HELOC_Status__c": "lead.status"
    }
  }
}
```

#### HubSpot
```json
{
  "contact": {
    "firstname": "lead.first_name",
    "lastname": "lead.last_name",
    "email": "lead.email",
    "phone": "lead.phone",
    "address": "lead.address"
  },
  "deal": {
    "dealname": "HELOC - {lead.name}",
    "pipeline": "config.pipeline_id",
    "dealstage": "mapStatusToStage(lead.status)",
    "amount": "lead.loan_amount"
  }
}
```

---

## User Configuration

### Integration Setup Flow

1. **User selects CRM** from Integrations tab
2. **Enter API credentials** or OAuth authorization
3. **Test connection** (validate credentials)
4. **Configure field mappings** (optional, defaults provided)
5. **Select sync direction** (inbound, outbound, bidirectional)
6. **Initial sync** (optional: import all existing CRM leads)

### Configuration UI

```javascript
// Example configuration object stored in crm_integrations.config
{
  "api_key": "encrypted_api_key",
  "api_secret": "encrypted_secret",
  "webhook_url": "https://carbon-heloc.vercel.app/webhooks/ghl",
  "pipeline_id": "abc123",
  "stage_mappings": {
    "new": "stage_1",
    "quoted": "stage_2",
    "funded": "stage_won"
  },
  "field_mappings": { /* custom overrides */ },
  "sync_frequency": "realtime", // 'realtime', 'hourly', 'daily'
  "conflict_resolution": "newest_wins"
}
```

---

## Security Considerations

1. **API Key Encryption**: All API keys encrypted at rest using Supabase Vault
2. **Webhook Verification**: All inbound webhooks verified using HMAC signatures
3. **Rate Limiting**: Respect CRM API limits (configurable per CRM)
4. **Data Retention**: Sync logs retained for 90 days
5. **Access Control**: Users can only sync their own leads

---

## Monitoring & Alerts

### Metrics to Track
- Sync success rate
- Average sync latency
- Queue depth
- Error rate by CRM type
- Conflicts per day

### Alerts
- Sync failure rate > 5%
- Queue depth > 1000 items
- CRM API rate limit approaching
- Authentication failures

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Database schema updates
- Basic webhook handler
- GHL integration (most requested)

### Phase 2: Core CRMs (Week 3-4)
- Salesforce integration
- HubSpot integration
- Follow Up Boss integration

### Phase 3: Advanced Features (Week 5-6)
- Field mapping UI
- Conflict resolution UI
- Sync monitoring dashboard

### Phase 4: Automation (Week 7-8)
- Zapier native integration
- n8n workflow templates
- Advanced automation rules

---

## API Reference

See `CRM_API_REFERENCE.md` for detailed API documentation.
