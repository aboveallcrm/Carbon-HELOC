/**
 * Ezra Admin Panel
 * Customization interface for loan officers
 * 
 * Features:
 * - Customize welcome messages
 * - Configure quick-action chips
 * - Set conversation flow preferences
 * - View analytics dashboard
 * - A/B test different approaches
 */

(function() {
    'use strict';

    const EzraAdmin = {
        // Default configuration
        config: {
            welcomeMessage: "Hi {clientName}! I'm **Ezra**, your AI guide to understanding this HELOC quote.",
            loName: "Your Loan Officer",
            loPhone: "",
            loEmail: "",
            accentColor: "#c5a059",
            autoOpen: false,
            autoOpenDelay: 5000,
            showTypingIndicator: true,
            enableAnalytics: true,
            customChips: [],
            handoffMessage: "I hope this helped! The next step would be to discuss this with {loName}.",
            topics: {
                heloc_basics: true,
                debt_consolidation: true,
                rate_comparison: true,
                qualification: true,
                timeline: true,
                risks: true
            }
        },

        // Analytics data
        analyticsData: [],

        // Initialize admin panel
        init() {
            this.loadConfig();
            this.createAdminPanel();
            this.attachEventListeners();
            console.log('[Ezra Admin] Initialized');
        },

        // Load configuration from localStorage
        loadConfig() {
            try {
                const saved = localStorage.getItem('ezra_admin_config');
                if (saved) {
                    this.config = { ...this.config, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.warn('[Ezra Admin] Failed to load config:', e);
            }
        },

        // Save configuration to localStorage
        saveConfig() {
            try {
                localStorage.setItem('ezra_admin_config', JSON.stringify(this.config));
                this.showToast('Settings saved successfully');
            } catch (e) {
                console.warn('[Ezra Admin] Failed to save config:', e);
                this.showToast('Failed to save settings', 'error');
            }
        },

        // Create admin panel UI
        createAdminPanel() {
            const panel = document.createElement('div');
            panel.id = 'ezra-admin-panel';
            panel.innerHTML = `
                <style>
                    #ezra-admin-panel {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        z-index: 10001;
                        font-family: 'Inter', sans-serif;
                    }
                    
                    .ezra-admin-toggle {
                        width: 50px;
                        height: 50px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #8b5cf6, #6366f1);
                        border: none;
                        cursor: pointer;
                        box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 24px;
                        transition: all 0.3s ease;
                    }
                    
                    .ezra-admin-toggle:hover {
                        transform: scale(1.05);
                    }
                    
                    .ezra-admin-modal {
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 90%;
                        max-width: 800px;
                        max-height: 90vh;
                        background: linear-gradient(135deg, #1e293b, #0f172a);
                        border: 1px solid rgba(139, 92, 246, 0.3);
                        border-radius: 20px;
                        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
                        display: none;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    
                    .ezra-admin-modal.open {
                        display: flex;
                    }
                    
                    .ezra-admin-header {
                        padding: 24px;
                        background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.1));
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    
                    .ezra-admin-header h2 {
                        margin: 0;
                        font-family: 'DM Sans', sans-serif;
                        font-size: 20px;
                        color: #a78bfa;
                    }
                    
                    .ezra-admin-close {
                        background: none;
                        border: none;
                        color: rgba(255, 255, 255, 0.6);
                        font-size: 28px;
                        cursor: pointer;
                        padding: 4px;
                    }
                    
                    .ezra-admin-tabs {
                        display: flex;
                        gap: 4px;
                        padding: 16px 24px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    
                    .ezra-admin-tab {
                        padding: 10px 20px;
                        background: rgba(255, 255, 255, 0.05);
                        border: none;
                        border-radius: 8px 8px 0 0;
                        color: rgba(255, 255, 255, 0.6);
                        font-family: 'DM Sans', sans-serif;
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    
                    .ezra-admin-tab:hover {
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                    }
                    
                    .ezra-admin-tab.active {
                        background: rgba(139, 92, 246, 0.3);
                        color: white;
                    }
                    
                    .ezra-admin-content {
                        flex: 1;
                        overflow-y: auto;
                        padding: 24px;
                    }
                    
                    .ezra-admin-section {
                        display: none;
                    }
                    
                    .ezra-admin-section.active {
                        display: block;
                    }
                    
                    .ezra-form-group {
                        margin-bottom: 20px;
                    }
                    
                    .ezra-form-label {
                        display: block;
                        font-size: 12px;
                        font-weight: 600;
                        color: rgba(255, 255, 255, 0.8);
                        margin-bottom: 8px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .ezra-form-input,
                    .ezra-form-textarea {
                        width: 100%;
                        background: rgba(0, 0, 0, 0.3);
                        border: 1px solid rgba(255, 255, 255, 0.15);
                        border-radius: 10px;
                        padding: 12px 16px;
                        color: white;
                        font-size: 14px;
                        transition: border-color 0.2s;
                    }
                    
                    .ezra-form-input:focus,
                    .ezra-form-textarea:focus {
                        outline: none;
                        border-color: #8b5cf6;
                    }
                    
                    .ezra-form-textarea {
                        min-height: 100px;
                        resize: vertical;
                    }
                    
                    .ezra-form-hint {
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.5);
                        margin-top: 6px;
                    }
                    
                    .ezra-checkbox-group {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 12px;
                    }
                    
                    .ezra-checkbox {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 10px 16px;
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    
                    .ezra-checkbox:hover {
                        background: rgba(255, 255, 255, 0.1);
                    }
                    
                    .ezra-checkbox input {
                        accent-color: #8b5cf6;
                    }
                    
                    .ezra-checkbox span {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.9);
                    }
                    
                    .ezra-analytics-card {
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: 12px;
                        padding: 20px;
                        margin-bottom: 16px;
                    }
                    
                    .ezra-analytics-title {
                        font-family: 'DM Sans', sans-serif;
                        font-size: 14px;
                        color: #a78bfa;
                        margin-bottom: 12px;
                    }
                    
                    .ezra-analytics-value {
                        font-size: 32px;
                        font-weight: 700;
                        color: white;
                    }
                    
                    .ezra-analytics-label {
                        font-size: 12px;
                        color: rgba(255, 255, 255, 0.5);
                    }
                    
                    .ezra-btn {
                        padding: 12px 24px;
                        border-radius: 10px;
                        font-family: 'DM Sans', sans-serif;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        border: none;
                    }
                    
                    .ezra-btn-primary {
                        background: linear-gradient(135deg, #8b5cf6, #6366f1);
                        color: white;
                    }
                    
                    .ezra-btn-primary:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
                    }
                    
                    .ezra-btn-secondary {
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                    }
                    
                    .ezra-btn-secondary:hover {
                        background: rgba(255, 255, 255, 0.15);
                    }
                    
                    .ezra-admin-footer {
                        padding: 20px 24px;
                        border-top: 1px solid rgba(255, 255, 255, 0.1);
                        display: flex;
                        justify-content: flex-end;
                        gap: 12px;
                    }
                    
                    .ezra-toast {
                        position: fixed;
                        bottom: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        padding: 12px 24px;
                        border-radius: 10px;
                        font-size: 14px;
                        font-weight: 500;
                        z-index: 10002;
                        animation: ezraToastIn 0.3s ease;
                    }
                    
                    .ezra-toast.success {
                        background: #10b981;
                        color: white;
                    }
                    
                    .ezra-toast.error {
                        background: #ef4444;
                        color: white;
                    }
                    
                    @keyframes ezraToastIn {
                        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                        to { opacity: 1; transform: translateX(-50%) translateY(0); }
                    }
                </style>
                
                <button class="ezra-admin-toggle" title="Ezra Admin">⚙️</button>
                
                <div class="ezra-admin-modal">
                    <div class="ezra-admin-header">
                        <h2>🤖 Ezra Admin Panel</h2>
                        <button class="ezra-admin-close">×</button>
                    </div>
                    
                    <div class="ezra-admin-tabs">
                        <button class="ezra-admin-tab active" data-tab="general">General</button>
                        <button class="ezra-admin-tab" data-tab="messages">Messages</button>
                        <button class="ezra-admin-tab" data-tab="topics">Topics</button>
                        <button class="ezra-admin-tab" data-tab="analytics">Analytics</button>
                    </div>
                    
                    <div class="ezra-admin-content">
                        <!-- General Settings -->
                        <div class="ezra-admin-section active" id="tab-general">
                            <div class="ezra-form-group">
                                <label class="ezra-form-label">Your Name</label>
                                <input type="text" class="ezra-form-input" id="ezra-admin-lo-name" 
                                    placeholder="Eddie Barragan" value="${this.config.loName}">
                            </div>
                            
                            <div class="ezra-form-group">
                                <label class="ezra-form-label">Phone</label>
                                <input type="text" class="ezra-form-input" id="ezra-admin-lo-phone" 
                                    placeholder="(555) 123-4567" value="${this.config.loPhone}">
                            </div>
                            
                            <div class="ezra-form-group">
                                <label class="ezra-form-label">Email</label>
                                <input type="email" class="ezra-form-input" id="ezra-admin-lo-email" 
                                    placeholder="you@company.com" value="${this.config.loEmail}">
                            </div>
                            
                            <div class="ezra-form-group">
                                <label class="ezra-form-label">Accent Color</label>
                                <input type="color" class="ezra-form-input" id="ezra-admin-color" 
                                    value="${this.config.accentColor}" style="height: 50px; cursor: pointer;">
                            </div>
                            
                            <div class="ezra-form-group">
                                <label class="ezra-form-checkbox">
                                    <input type="checkbox" id="ezra-admin-auto-open" 
                                        ${this.config.autoOpen ? 'checked' : ''}>
                                    <span>Auto-open Ezra after delay</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Messages -->
                        <div class="ezra-admin-section" id="tab-messages">
                            <div class="ezra-form-group">
                                <label class="ezra-form-label">Welcome Message</label>
                                <textarea class="ezra-form-textarea" id="ezra-admin-welcome" 
                                    placeholder="Enter welcome message...">${this.config.welcomeMessage}</textarea>
                                <div class="ezra-form-hint">Use {clientName} to insert the client's name</div>
                            </div>
                            
                            <div class="ezra-form-group">
                                <label class="ezra-form-label">Handoff Message</label>
                                <textarea class="ezra-form-textarea" id="ezra-admin-handoff" 
                                    placeholder="Enter handoff message...">${this.config.handoffMessage}</textarea>
                                <div class="ezra-form-hint">Use {loName} to insert your name</div>
                            </div>
                        </div>
                        
                        <!-- Topics -->
                        <div class="ezra-admin-section" id="tab-topics">
                            <div class="ezra-form-group">
                                <label class="ezra-form-label">Enabled Conversation Topics</label>
                                <div class="ezra-checkbox-group">
                                    ${Object.entries(this.config.topics).map(([key, enabled]) => `
                                        <label class="ezra-checkbox">
                                            <input type="checkbox" data-topic="${key}" 
                                                ${enabled ? 'checked' : ''}>
                                            <span>${this.formatTopicName(key)}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Analytics -->
                        <div class="ezra-admin-section" id="tab-analytics">
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                                <div class="ezra-analytics-card">
                                    <div class="ezra-analytics-title">Total Conversations</div>
                                    <div class="ezra-analytics-value" id="ezra-stats-total">0</div>
                                    <div class="ezra-analytics-label">All time</div>
                                </div>
                                <div class="ezra-analytics-card">
                                    <div class="ezra-analytics-title">Avg. Messages</div>
                                    <div class="ezra-analytics-value" id="ezra-stats-messages">0</div>
                                    <div class="ezra-analytics-label">Per conversation</div>
                                </div>
                                <div class="ezra-analytics-card">
                                    <div class="ezra-analytics-title">Completion Rate</div>
                                    <div class="ezra-analytics-value" id="ezra-stats-completion">0%</div>
                                    <div class="ezra-analytics-label">Reached handoff</div>
                                </div>
                            </div>
                            
                            <div class="ezra-analytics-card" style="margin-top: 20px;">
                                <div class="ezra-analytics-title">Top User Goals</div>
                                <div id="ezra-stats-goals" style="color: rgba(255,255,255,0.8); font-size: 14px;">
                                    No data yet
                                </div>
                            </div>
                            
                            <button class="ezra-btn ezra-btn-secondary" id="ezra-export-data" 
                                style="margin-top: 20px;">📊 Export Analytics Data</button>
                        </div>
                    </div>
                    
                    <div class="ezra-admin-footer">
                        <button class="ezra-btn ezra-btn-secondary" id="ezra-reset-defaults">Reset Defaults</button>
                        <button class="ezra-btn ezra-btn-primary" id="ezra-save-settings">Save Settings</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
        },

        // Format topic name for display
        formatTopicName(key) {
            return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        },

        // Attach event listeners
        attachEventListeners() {
            // Toggle button
            document.querySelector('.ezra-admin-toggle').onclick = () => {
                document.querySelector('.ezra-admin-modal').classList.toggle('open');
                this.loadAnalytics();
            };
            
            // Close button
            document.querySelector('.ezra-admin-close').onclick = () => {
                document.querySelector('.ezra-admin-modal').classList.remove('open');
            };
            
            // Tab switching
            document.querySelectorAll('.ezra-admin-tab').forEach(tab => {
                tab.onclick = () => {
                    document.querySelectorAll('.ezra-admin-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.ezra-admin-section').forEach(s => s.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
                };
            });
            
            // Save settings
            document.getElementById('ezra-save-settings').onclick = () => this.saveSettings();
            
            // Reset defaults
            document.getElementById('ezra-reset-defaults').onclick = () => this.resetDefaults();
            
            // Export data
            document.getElementById('ezra-export-data').onclick = () => this.exportData();
        },

        // Save settings from form
        saveSettings() {
            this.config.loName = document.getElementById('ezra-admin-lo-name').value;
            this.config.loPhone = document.getElementById('ezra-admin-lo-phone').value;
            this.config.loEmail = document.getElementById('ezra-admin-lo-email').value;
            this.config.accentColor = document.getElementById('ezra-admin-color').value;
            this.config.autoOpen = document.getElementById('ezra-admin-auto-open').checked;
            this.config.welcomeMessage = document.getElementById('ezra-admin-welcome').value;
            this.config.handoffMessage = document.getElementById('ezra-admin-handoff').value;
            
            // Save topics
            document.querySelectorAll('[data-topic]').forEach(checkbox => {
                this.config.topics[checkbox.dataset.topic] = checkbox.checked;
            });
            
            this.saveConfig();
        },

        // Reset to defaults
        resetDefaults() {
            if (confirm('Reset all settings to defaults?')) {
                localStorage.removeItem('ezra_admin_config');
                location.reload();
            }
        },

        // Load and display analytics
        loadAnalytics() {
            try {
                // Get all analytics from localStorage
                const sessions = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('ezra_analytics_')) {
                        const data = JSON.parse(localStorage.getItem(key));
                        sessions.push(data);
                    }
                }
                
                // Calculate stats
                const total = sessions.length;
                const avgMessages = total > 0 
                    ? Math.round(sessions.reduce((a, s) => a + (s.length || 0), 0) / total)
                    : 0;
                
                // Count goals
                const goalCounts = {};
                sessions.forEach(session => {
                    session.forEach(event => {
                        if (event.type === 'chip_clicked' && event.data.value.startsWith('goal_')) {
                            goalCounts[event.data.label] = (goalCounts[event.data.label] || 0) + 1;
                        }
                    });
                });
                
                // Update display
                document.getElementById('ezra-stats-total').textContent = total;
                document.getElementById('ezra-stats-messages').textContent = avgMessages;
                
                const goalsHtml = Object.entries(goalCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([goal, count]) => `<div>${goal}: ${count}</div>`)
                    .join('') || 'No data yet';
                document.getElementById('ezra-stats-goals').innerHTML = goalsHtml;
                
            } catch (e) {
                console.warn('[Ezra Admin] Failed to load analytics:', e);
            }
        },

        // Export analytics data
        exportData() {
            const data = {
                config: this.config,
                exportDate: new Date().toISOString(),
                sessions: []
            };
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('ezra_analytics_')) {
                    data.sessions.push({
                        sessionId: key,
                        events: JSON.parse(localStorage.getItem(key))
                    });
                }
            }
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ezra-analytics-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            this.showToast('Analytics data exported');
        },

        // Show toast notification
        showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `ezra-toast ${type}`;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
    };

    // Expose to global scope
    window.EzraAdmin = EzraAdmin;
})();
