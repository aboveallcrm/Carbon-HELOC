/**
 * ============================================================================
 * TEMPLATE CLOUD SYNC MODULE
 * AboveAllCarbon HELOC - Supabase Integration
 * ============================================================================
 * 
 * This module provides cloud synchronization capabilities for Quote Templates.
 * It is designed to be enabled in the future when Supabase is fully configured.
 * 
 * DATABASE SCHEMA (for Supabase):
 * 
 * CREATE TABLE quote_templates (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
 *   name TEXT NOT NULL,
 *   description TEXT,
 *   tags TEXT[],
 *   is_default BOOLEAN DEFAULT false,
 *   is_shared BOOLEAN DEFAULT false,
 *   shared_with UUID[], -- Array of user IDs for team sharing
 *   template_data JSONB NOT NULL,
 *   usage_count INTEGER DEFAULT 0,
 *   last_used_at TIMESTAMP WITH TIME ZONE,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
 *   version TEXT DEFAULT '2.0'
 * );
 * 
 * -- Indexes for performance
 * CREATE INDEX idx_quote_templates_user_id ON quote_templates(user_id);
 * CREATE INDEX idx_quote_templates_is_default ON quote_templates(user_id, is_default);
 * CREATE INDEX idx_quote_templates_shared ON quote_templates(is_shared) WHERE is_shared = true;
 * 
 * -- Row Level Security (RLS) Policies
 * ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;
 * 
 * -- Users can read their own templates
 * CREATE POLICY "Users can read own templates" ON quote_templates
 *   FOR SELECT USING (auth.uid() = user_id);
 * 
 * -- Users can read templates shared with them
 * CREATE POLICY "Users can read shared templates" ON quote_templates
 *   FOR SELECT USING (auth.uid() = ANY(shared_with));
 * 
 * -- Users can insert their own templates
 * CREATE POLICY "Users can insert own templates" ON quote_templates
 *   FOR INSERT WITH CHECK (auth.uid() = user_id);
 * 
 * -- Users can update their own templates
 * CREATE POLICY "Users can update own templates" ON quote_templates
 *   FOR UPDATE USING (auth.uid() = user_id);
 * 
 * -- Users can delete their own templates
 * CREATE POLICY "Users can delete own templates" ON quote_templates
 *   FOR DELETE USING (auth.uid() = user_id);
 * ============================================================================
 */

const TemplateCloudSync = {
    // Configuration
    config: {
        enabled: false, // Set to true when Supabase is configured
        syncInterval: 5 * 60 * 1000, // 5 minutes
        conflictResolution: 'server-wins', // 'server-wins' | 'client-wins' | 'manual'
    },
    
    // State
    state: {
        lastSync: null,
        syncInProgress: false,
        pendingChanges: [],
        isOnline: navigator.onLine
    },
    
    /**
     * Initialize cloud sync
     */
    init() {
        // Check if Supabase is available
        if (!window._supabase) {
            console.log('TemplateCloudSync: Supabase not available');
            return;
        }
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.state.isOnline = true;
            this.sync();
        });
        
        window.addEventListener('offline', () => {
            this.state.isOnline = false;
        });
        
        // Start periodic sync
        if (this.config.enabled) {
            setInterval(() => this.sync(), this.config.syncInterval);
            // Initial sync
            this.sync();
        }
    },
    
    /**
     * Enable cloud sync
     */
    enable() {
        this.config.enabled = true;
        this.sync();
        console.log('TemplateCloudSync: Enabled');
    },
    
    /**
     * Disable cloud sync
     */
    disable() {
        this.config.enabled = false;
        console.log('TemplateCloudSync: Disabled');
    },
    
    /**
     * Sync local templates with cloud
     */
    async sync() {
        if (!this.config.enabled || !this.state.isOnline || this.state.syncInProgress) {
            return;
        }
        
        const supabase = window._supabase;
        const userId = getCurrentUserId();
        
        if (!supabase || !userId) {
            console.log('TemplateCloudSync: Cannot sync - no supabase or user');
            return;
        }
        
        this.state.syncInProgress = true;
        
        try {
            // Get cloud templates
            const { data: cloudTemplates, error: fetchError } = await supabase
                .from('quote_templates')
                .select('*')
                .eq('user_id', userId);
            
            if (fetchError) throw fetchError;
            
            // Get local templates
            const localTemplates = getTemplates();
            
            // Merge templates
            const merged = await this.mergeTemplates(localTemplates, cloudTemplates || []);
            
            // Save merged to local
            saveTemplates(merged.local);
            
            // Push changes to cloud
            await this.pushToCloud(merged.cloudChanges);
            
            // Update last sync time
            this.state.lastSync = new Date().toISOString();
            localStorage.setItem(TEMPLATE_CONFIG.lastSyncKey, this.state.lastSync);
            
            // Refresh UI
            loadTemplateListV2();
            
            console.log('TemplateCloudSync: Sync completed');
            
        } catch (error) {
            console.error('TemplateCloudSync: Sync failed', error);
        } finally {
            this.state.syncInProgress = false;
        }
    },
    
    /**
     * Merge local and cloud templates
     */
    async mergeTemplates(local, cloud) {
        const merged = [];
        const cloudChanges = [];
        
        // Create maps for easier lookup
        const localMap = new Map(local.map(t => [t.id, t]));
        const cloudMap = new Map(cloud.map(t => [t.id, t]));
        
        // Process all unique IDs
        const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
        
        for (const id of allIds) {
            const localTpl = localMap.get(id);
            const cloudTpl = cloudMap.get(id);
            
            if (localTpl && !cloudTpl) {
                // Local only - push to cloud
                merged.push(localTpl);
                cloudChanges.push({ action: 'insert', template: this.toCloudFormat(localTpl) });
                
            } else if (!localTpl && cloudTpl) {
                // Cloud only - add to local
                const converted = this.fromCloudFormat(cloudTpl);
                merged.push(converted);
                
            } else {
                // Both exist - resolve conflict
                const localTime = new Date(localTpl.updatedAt || localTpl.createdAt);
                const cloudTime = new Date(cloudTpl.updated_at);
                
                let winner;
                
                switch (this.config.conflictResolution) {
                    case 'server-wins':
                        winner = cloudTime > localTime ? 'cloud' : 'local';
                        break;
                    case 'client-wins':
                        winner = localTime > cloudTime ? 'local' : 'cloud';
                        break;
                    case 'manual':
                        // TODO: Implement manual conflict resolution UI
                        winner = cloudTime > localTime ? 'cloud' : 'local';
                        break;
                    default:
                        winner = cloudTime > localTime ? 'cloud' : 'local';
                }
                
                if (winner === 'local') {
                    merged.push(localTpl);
                    cloudChanges.push({ action: 'update', template: this.toCloudFormat(localTpl) });
                } else {
                    merged.push(this.fromCloudFormat(cloudTpl));
                }
            }
        }
        
        return { local: merged, cloudChanges };
    },
    
    /**
     * Push changes to cloud
     */
    async pushToCloud(changes) {
        const supabase = window._supabase;
        if (!supabase) return;
        
        for (const change of changes) {
            try {
                if (change.action === 'insert') {
                    await supabase.from('quote_templates').insert(change.template);
                } else if (change.action === 'update') {
                    await supabase
                        .from('quote_templates')
                        .update(change.template)
                        .eq('id', change.template.id);
                }
            } catch (error) {
                console.error('TemplateCloudSync: Failed to push change', error);
            }
        }
    },
    
    /**
     * Upload a single template to cloud
     */
    async uploadTemplate(templateId) {
        if (!this.config.enabled) {
            showToast('Cloud sync is not enabled', 'error');
            return;
        }
        
        const supabase = window._supabase;
        const userId = getCurrentUserId();
        
        if (!supabase || !userId) {
            showToast('Not logged in', 'error');
            return;
        }
        
        const templates = getTemplates();
        const template = templates.find(t => t.id === templateId);
        
        if (!template) {
            showToast('Template not found', 'error');
            return;
        }
        
        try {
            const cloudData = this.toCloudFormat(template);
            
            const { error } = await supabase
                .from('quote_templates')
                .upsert(cloudData, { onConflict: 'id' });
            
            if (error) throw error;
            
            showToast('Template uploaded to cloud', 'success');
            
        } catch (error) {
            console.error('TemplateCloudSync: Upload failed', error);
            showToast('Failed to upload template', 'error');
        }
    },
    
    /**
     * Download templates from cloud
     */
    async downloadTemplates() {
        if (!this.config.enabled) {
            showToast('Cloud sync is not enabled', 'error');
            return;
        }
        
        const supabase = window._supabase;
        const userId = getCurrentUserId();
        
        if (!supabase || !userId) {
            showToast('Not logged in', 'error');
            return;
        }
        
        try {
            const { data, error } = await supabase
                .from('quote_templates')
                .select('*')
                .eq('user_id', userId);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                const converted = data.map(t => this.fromCloudFormat(t));
                
                // Merge with local
                const local = getTemplates();
                const merged = [...local];
                
                for (const cloudTpl of converted) {
                    const existingIndex = merged.findIndex(t => t.id === cloudTpl.id);
                    if (existingIndex >= 0) {
                        merged[existingIndex] = cloudTpl;
                    } else {
                        merged.push(cloudTpl);
                    }
                }
                
                saveTemplates(merged);
                loadTemplateListV2();
                
                showToast(`Downloaded ${data.length} template(s) from cloud`, 'success');
            } else {
                showToast('No templates found in cloud', 'info');
            }
            
        } catch (error) {
            console.error('TemplateCloudSync: Download failed', error);
            showToast('Failed to download templates', 'error');
        }
    },
    
    /**
     * Share template with team member
     */
    async shareTemplate(templateId, targetUserId) {
        if (!this.config.enabled) {
            showToast('Cloud sync is not enabled', 'error');
            return;
        }
        
        const supabase = window._supabase;
        
        if (!supabase) {
            showToast('Supabase not available', 'error');
            return;
        }
        
        try {
            // Get current shared_with array
            const { data, error: fetchError } = await supabase
                .from('quote_templates')
                .select('shared_with, is_shared')
                .eq('id', templateId)
                .single();
            
            if (fetchError) throw fetchError;
            
            const sharedWith = data.shared_with || [];
            
            if (!sharedWith.includes(targetUserId)) {
                sharedWith.push(targetUserId);
            }
            
            const { error } = await supabase
                .from('quote_templates')
                .update({ 
                    is_shared: true, 
                    shared_with: sharedWith,
                    updated_at: new Date().toISOString()
                })
                .eq('id', templateId);
            
            if (error) throw error;
            
            showToast('Template shared successfully', 'success');
            
        } catch (error) {
            console.error('TemplateCloudSync: Share failed', error);
            showToast('Failed to share template', 'error');
        }
    },
    
    /**
     * Convert local template format to cloud format
     */
    toCloudFormat(local) {
        return {
            id: local.id,
            user_id: getCurrentUserId(),
            name: local.name,
            description: local.description,
            tags: local.tags || [],
            is_default: local.isDefault || false,
            is_shared: local.isShared || false,
            template_data: local.state,
            usage_count: local.usageCount || 0,
            last_used_at: local.lastUsedAt,
            created_at: local.createdAt,
            updated_at: new Date().toISOString(),
            version: local.version || '2.0'
        };
    },
    
    /**
     * Convert cloud format to local template format
     */
    fromCloudFormat(cloud) {
        return {
            id: cloud.id,
            name: cloud.name,
            description: cloud.description,
            tags: cloud.tags || [],
            isDefault: cloud.is_default,
            isShared: cloud.is_shared,
            userId: cloud.user_id,
            createdAt: cloud.created_at,
            lastUsedAt: cloud.last_used_at,
            usageCount: cloud.usage_count,
            state: cloud.template_data,
            version: cloud.version || '2.0',
            syncedFromCloud: true
        };
    },
    
    /**
     * Get sync status
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            lastSync: this.state.lastSync || localStorage.getItem(TEMPLATE_CONFIG.lastSyncKey),
            isOnline: this.state.isOnline,
            syncInProgress: this.state.syncInProgress
        };
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    TemplateCloudSync.init();
});

// Expose to window for debugging
window.TemplateCloudSync = TemplateCloudSync;
