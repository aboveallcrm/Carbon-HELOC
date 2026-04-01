/**
 * Integration Health Dashboard
 * Admin UI for monitoring all backend integrations
 * Version: 1.0.0
 */

(function() {
    'use strict';

    // Dashboard state
    let isOpen = false;
    let refreshInterval = null;
    let selectedService = null;
    
    // Service metadata
    const SERVICE_INFO = {
        supabase: {
            name: 'Supabase',
            icon: '🔷',
            description: 'Database, Auth & Edge Functions',
            color: '#3ecf8e',
            tests: ['Auth Session', 'Database Query', 'Edge Functions']
        },
        n8n: {
            name: 'n8n',
            icon: '⚡',
            description: 'Workflow Automation',
            color: '#ff6d5a',
            tests: ['Webhook Connectivity', 'Payload Delivery', 'Response Handling']
        },
        bonzo: {
            name: 'Bonzo CRM',
            icon: '🟠',
            description: 'Lead Management & Campaigns',
            color: '#f97316',
            tests: ['API Authentication', 'Campaign List', 'Contact Sync']
        },
        ghl: {
            name: 'GoHighLevel',
            icon: '🟢',
            description: 'CRM & Pipeline Management',
            color: '#10b981',
            tests: ['API Key Valid', 'Location Access', 'Pipeline Connection']
        },
        automations: {
            name: 'Automations',
            icon: '🤖',
            description: 'Trigger Workflows & Sequences',
            color: '#8b5cf6',
            tests: ['Quote Sent Trigger', 'Lead Created Trigger', 'Engagement Alerts', 'Follow-up Sequence']
        }
    };

    /**
     * Create Dashboard HTML
     */
    function createDashboard() {
        const dashboard = document.createElement('div');
        dashboard.id = 'ihm-dashboard';
        dashboard.className = 'ihm-dashboard';
        dashboard.innerHTML = `
            <div class="ihm-dashboard-overlay" onclick="IntegrationHealthDashboard.close()"></div>
            <div class="ihm-dashboard-panel">
                <div class="ihm-dashboard-header">
                    <div class="ihm-dashboard-title">
                        <span class="ihm-dashboard-icon">🏥</span>
                        <div>
                            <h2>Integration Health Monitor</h2>
                            <span class="ihm-dashboard-subtitle">Real-time service status & diagnostics</span>
                        </div>
                    </div>
                    <div class="ihm-dashboard-actions">
                        <button class="ihm-btn ihm-btn-secondary" onclick="IntegrationHealthDashboard.runAllTests()">
                            🔄 Run All Tests
                        </button>
                        <button class="ihm-btn ihm-btn-secondary" onclick="IntegrationHealthMonitor.exportLogs()">
                            📥 Export Logs
                        </button>
                        <button class="ihm-btn ihm-btn-close" onclick="IntegrationHealthDashboard.close()">&times;</button>
                    </div>
                </div>
                
                <div class="ihm-dashboard-content">
                    <!-- Overview Cards -->
                    <div class="ihm-overview-grid" id="ihm-overview">
                        ${Object.entries(SERVICE_INFO).map(([key, info]) => `
                            <div class="ihm-service-card" data-service="${key}" onclick="IntegrationHealthDashboard.selectService('${key}')">
                                <div class="ihm-service-header">
                                    <span class="ihm-service-icon" style="background: ${info.color}20; color: ${info.color}">${info.icon}</span>
                                    <div class="ihm-service-status" id="status-${key}">
                                        <span class="ihm-status-indicator ihm-status-unknown"></span>
                                        <span class="ihm-status-text">Checking...</span>
                                    </div>
                                </div>
                                <h3 class="ihm-service-name">${info.name}</h3>
                                <p class="ihm-service-desc">${info.description}</p>
                                <div class="ihm-service-metrics">
                                    <div class="ihm-metric">
                                        <span class="ihm-metric-label">Latency</span>
                                        <span class="ihm-metric-value" id="latency-${key}">--</span>
                                    </div>
                                    <div class="ihm-metric">
                                        <span class="ihm-metric-label">Last Check</span>
                                        <span class="ihm-metric-value" id="lastcheck-${key}">--</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <!-- Detail Panel -->
                    <div class="ihm-detail-panel" id="ihm-detail-panel">
                        <div class="ihm-detail-empty">
                            <span class="ihm-detail-empty-icon">📊</span>
                            <p>Select a service to view detailed diagnostics</p>
                        </div>
                    </div>
                    
                    <!-- Recent Activity -->
                    <div class="ihm-activity-section">
                        <h3 class="ihm-section-title">
                            <span>📋</span>
                            Recent Activity
                            <button class="ihm-btn ihm-btn-small" onclick="IntegrationHealthDashboard.clearActivity()">Clear</button>
                        </h3>
                        <div class="ihm-activity-list" id="ihm-activity-list">
                            <div class="ihm-activity-empty">No recent activity</div>
                        </div>
                    </div>
                </div>
                
                <div class="ihm-dashboard-footer">
                    <div class="ihm-footer-status">
                        <span id="ihm-monitor-status">🔴 Monitoring Stopped</span>
                        <span class="ihm-footer-divider">|</span>
                        <span id="ihm-last-updated">Never</span>
                    </div>
                    <div class="ihm-footer-actions">
                        <button class="ihm-btn ihm-btn-text" onclick="IntegrationHealthDashboard.toggleMonitoring()" id="ihm-toggle-monitor">
                            Start Monitoring
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        return dashboard;
    }

    /**
     * Create Detail Panel for Selected Service
     */
    function createDetailPanel(service) {
        const info = SERVICE_INFO[service];
        const health = IntegrationHealthMonitor.getHealthStatus()[service];
        
        return `
            <div class="ihm-detail-header">
                <span class="ihm-detail-icon" style="background: ${info.color}20; color: ${info.color}">${info.icon}</span>
                <div>
                    <h3>${info.name}</h3>
                    <span class="ihm-detail-status ${health?.status || 'unknown'}">${health?.status?.toUpperCase() || 'UNKNOWN'}</span>
                </div>
                <button class="ihm-btn ihm-btn-primary" onclick="IntegrationHealthDashboard.runTest('${service}')">
                    🔄 Test Now
                </button>
            </div>
            
            <div class="ihm-detail-section">
                <h4>Configuration Guide</h4>
                <div class="ihm-config-guide">
                    ${getConfigGuide(service)}
                </div>
            </div>
            
            <div class="ihm-detail-section">
                <h4>Test Details</h4>
                <div class="ihm-test-list">
                    ${info.tests.map((test, i) => `
                        <div class="ihm-test-item">
                            <span class="ihm-test-number">${i + 1}</span>
                            <span class="ihm-test-name">${test}</span>
                            <span class="ihm-test-status" id="test-${service}-${i}">⏳ Pending</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="ihm-detail-section">
                <h4>Recent Errors</h4>
                <div class="ihm-error-list" id="errors-${service}">
                    ${getRecentErrors(service)}
                </div>
            </div>
            
            <div class="ihm-detail-actions">
                <button class="ihm-btn ihm-btn-secondary" onclick="IntegrationHealthMonitor.showConfigGuide('${service}')">
                    📖 Configuration Help
                </button>
                <button class="ihm-btn ihm-btn-secondary" onclick="IntegrationHealthDashboard.viewLogs('${service}')">
                    📄 View Logs
                </button>
            </div>
        `;
    }

    /**
     * Get configuration guide for service
     */
    function getConfigGuide(service) {
        const guides = {
            supabase: `
                <ol>
                    <li>Verify Supabase project is active at <a href="https://app.supabase.com" target="_blank">app.supabase.com</a></li>
                    <li>Check project URL: <code>https://czzabvfzuxhpdcowgvam.supabase.co</code></li>
                    <li>Verify edge functions are deployed: <code>supabase functions list</code></li>
                    <li>Check RLS policies are configured correctly</li>
                </ol>
            `,
            n8n: `
                <ol>
                    <li>Verify n8n instance is running at <a href="https://n8n.srv1290585.hstgr.cloud/" target="_blank">n8n dashboard</a></li>
                    <li>Check webhook URL is configured in Integrations tab</li>
                    <li>Test webhook with sample payload</li>
                    <li>Verify workflows are active and not in error state</li>
                </ol>
            `,
            bonzo: `
                <ol>
                    <li>Get API key from <a href="https://app.getbonzo.com" target="_blank">Bonzo Settings → API</a></li>
                    <li>Use JWT token (apiKey2), not Xcode hash</li>
                    <li>Verify API base URL: <code>https://app.getbonzo.com/api/v3</code></li>
                    <li>Test with: <code>supabase functions invoke bonzo-proxy</code></li>
                </ol>
            `,
            ghl: `
                <ol>
                    <li>Get API key from <a href="https://app.gohighlevel.com" target="_blank">GHL Settings → Integrations → Private Integrations</a></li>
                    <li>Verify your Location ID matches your GHL sub-account URL</li>
                    <li>Check pipeline and stage IDs are configured</li>
                    <li>Verify API version: Contacts use 2021-07-28, Conversations use 2021-04-15</li>
                </ol>
            `,
            automations: `
                <ol>
                    <li>Verify n8n webhook is configured for automation triggers</li>
                    <li>Check that click notifications table has proper triggers</li>
                    <li>Test quote sent webhook manually</li>
                    <li>Verify follow-up sequences are scheduled correctly</li>
                </ol>
            `
        };
        return guides[service] || '<p>No configuration guide available</p>';
    }

    /**
     * Get recent errors for service
     */
    function getRecentErrors(service) {
        const logs = IntegrationHealthMonitor.getErrorLog(5);
        const serviceLogs = logs.filter(l => l.service === service && l.level === 'error');
        
        if (serviceLogs.length === 0) {
            return '<div class="ihm-no-errors">✅ No recent errors</div>';
        }
        
        return serviceLogs.map(log => `
            <div class="ihm-error-item">
                <span class="ihm-error-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
                <span class="ihm-error-message">${log.message}</span>
            </div>
        `).join('');
    }

    /**
     * Update dashboard UI
     */
    function updateDashboard() {
        if (!isOpen) return;
        
        const health = IntegrationHealthMonitor.getHealthStatus();
        
        // Update service cards
        Object.entries(health).forEach(([service, status]) => {
            const statusEl = document.getElementById(`status-${service}`);
            const latencyEl = document.getElementById(`latency-${service}`);
            const lastCheckEl = document.getElementById(`lastcheck-${service}`);
            
            if (statusEl) {
                const indicator = statusEl.querySelector('.ihm-status-indicator');
                const text = statusEl.querySelector('.ihm-status-text');
                
                indicator.className = `ihm-status-indicator ihm-status-${status.status}`;
                text.textContent = status.status === 'healthy' ? 'Healthy' : 
                                   status.status === 'unhealthy' ? 'Issues' :
                                   status.status === 'critical' ? 'Critical' :
                                   status.status === 'degraded' ? 'Degraded' : 'Unknown';
            }
            
            if (latencyEl) {
                latencyEl.textContent = status.latency > 0 ? `${status.latency}ms` : '--';
            }
            
            if (lastCheckEl && status.lastCheck) {
                const date = new Date(status.lastCheck);
                const now = new Date();
                const diff = Math.floor((now - date) / 1000);
                
                if (diff < 60) lastCheckEl.textContent = 'Just now';
                else if (diff < 3600) lastCheckEl.textContent = `${Math.floor(diff / 60)}m ago`;
                else lastCheckEl.textContent = `${Math.floor(diff / 3600)}h ago`;
            }
        });
        
        // Update monitoring status
        const isMonitoring = IntegrationHealthMonitor.isMonitoring();
        const monitorStatus = document.getElementById('ihm-monitor-status');
        const toggleBtn = document.getElementById('ihm-toggle-monitor');
        
        if (monitorStatus) {
            monitorStatus.textContent = isMonitoring ? '🟢 Monitoring Active' : '🔴 Monitoring Stopped';
        }
        if (toggleBtn) {
            toggleBtn.textContent = isMonitoring ? 'Stop Monitoring' : 'Start Monitoring';
        }
        
        document.getElementById('ihm-last-updated').textContent = new Date().toLocaleTimeString();
    }

    /**
     * Add activity log entry
     */
    function addActivity(message, type = 'info') {
        const list = document.getElementById('ihm-activity-list');
        if (!list) return;
        
        const empty = list.querySelector('.ihm-activity-empty');
        if (empty) empty.remove();
        
        const item = document.createElement('div');
        item.className = `ihm-activity-item ihm-activity-${type}`;
        item.innerHTML = `
            <span class="ihm-activity-time">${new Date().toLocaleTimeString()}</span>
            <span class="ihm-activity-message">${message}</span>
        `;
        
        list.insertBefore(item, list.firstChild);
        
        // Keep only last 20 items
        while (list.children.length > 20) {
            list.removeChild(list.lastChild);
        }
    }

    /**
     * Listen for test events
     */
    function setupEventListeners() {
        window.addEventListener('ihm:test-complete', (e) => {
            const { service, result } = e.detail;
            
            if (result.success) {
                addActivity(`${SERVICE_INFO[service].name} test passed (${result.latency}ms)`, 'success');
            } else {
                addActivity(`${SERVICE_INFO[service].name} test failed: ${result.error.message}`, 'error');
            }
            
            updateDashboard();
        });
    }

    /**
     * Public API
     */
    window.IntegrationHealthDashboard = {
        open: () => {
            if (isOpen) return;
            
            let dashboard = document.getElementById('ihm-dashboard');
            if (!dashboard) {
                dashboard = createDashboard();
                document.body.appendChild(dashboard);
                setupEventListeners();
            }
            
            dashboard.classList.add('ihm-dashboard-open');
            isOpen = true;
            
            // Initial update
            updateDashboard();
            
            // Auto-refresh every 5 seconds
            refreshInterval = setInterval(updateDashboard, 5000);
            
            // Run tests if not already monitoring
            if (!IntegrationHealthMonitor.isMonitoring()) {
                IntegrationHealthMonitor.testAll();
            }
        },
        
        close: () => {
            const dashboard = document.getElementById('ihm-dashboard');
            if (dashboard) {
                dashboard.classList.remove('ihm-dashboard-open');
            }
            isOpen = false;
            
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        },
        
        toggle: () => {
            if (isOpen) IntegrationHealthDashboard.close();
            else IntegrationHealthDashboard.open();
        },
        
        selectService: (service) => {
            selectedService = service;
            
            // Update active state on cards
            document.querySelectorAll('.ihm-service-card').forEach(card => {
                card.classList.toggle('ihm-service-active', card.dataset.service === service);
            });
            
            // Show detail panel
            const panel = document.getElementById('ihm-detail-panel');
            if (panel) {
                panel.innerHTML = createDetailPanel(service);
            }
        },
        
        runTest: async (service) => {
            addActivity(`Running test for ${SERVICE_INFO[service].name}...`, 'info');
            await IntegrationHealthMonitor.testService(service);
        },
        
        runAllTests: async () => {
            addActivity('Running all integration tests...', 'info');
            await IntegrationHealthMonitor.testAll();
        },
        
        toggleMonitoring: () => {
            if (IntegrationHealthMonitor.isMonitoring()) {
                IntegrationHealthMonitor.stopMonitoring();
                addActivity('Monitoring stopped', 'warning');
            } else {
                IntegrationHealthMonitor.startMonitoring();
                addActivity('Monitoring started', 'success');
            }
            updateDashboard();
        },
        
        clearActivity: () => {
            const list = document.getElementById('ihm-activity-list');
            if (list) {
                list.innerHTML = '<div class="ihm-activity-empty">No recent activity</div>';
            }
        },
        
        viewLogs: (service) => {
            const logs = IntegrationHealthMonitor.getErrorLog(20);
            console.log(`=== ${service.toUpperCase()} LOGS ===`);
            console.table(logs.filter(l => l.service === service));
            alert(`View ${service} logs in browser console (F12)`);
        }
    };

    // Add dashboard styles
    const styles = document.createElement('style');
    styles.textContent = `
        .ihm-dashboard {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1000000;
            display: none;
            font-family: var(--font-heading, system-ui);
        }
        
        .ihm-dashboard.ihm-dashboard-open {
            display: block;
        }
        
        .ihm-dashboard-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
        }
        
        .ihm-dashboard-panel {
            position: absolute;
            top: 20px;
            left: 20px;
            right: 20px;
            bottom: 20px;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        
        .ihm-dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ihm-dashboard-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .ihm-dashboard-icon {
            font-size: 32px;
        }
        
        .ihm-dashboard-title h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            color: #fff;
        }
        
        .ihm-dashboard-subtitle {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
        }
        
        .ihm-dashboard-actions {
            display: flex;
            gap: 10px;
        }
        
        .ihm-btn {
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            font-family: inherit;
        }
        
        .ihm-btn-primary {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
        }
        
        .ihm-btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.9);
        }
        
        .ihm-btn-text {
            background: transparent;
            color: rgba(255, 255, 255, 0.7);
        }
        
        .ihm-btn-small {
            padding: 4px 10px;
            font-size: 11px;
        }
        
        .ihm-btn-close {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            width: 32px;
            height: 32px;
            padding: 0;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .ihm-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .ihm-dashboard-content {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }
        
        .ihm-overview-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .ihm-service-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 16px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .ihm-service-card:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(255, 255, 255, 0.15);
            transform: translateY(-2px);
        }
        
        .ihm-service-card.ihm-service-active {
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.1);
        }
        
        .ihm-service-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        
        .ihm-service-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }
        
        .ihm-service-status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 600;
        }
        
        .ihm-status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        
        .ihm-status-healthy { background: #10b981; box-shadow: 0 0 8px #10b981; }
        .ihm-status-unhealthy { background: #f59e0b; }
        .ihm-status-critical { background: #ef4444; animation: ihm-pulse 1s infinite; }
        .ihm-status-degraded { background: #f59e0b; }
        .ihm-status-unknown { background: #6b7280; }
        
        @keyframes ihm-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .ihm-service-name {
            margin: 0 0 4px 0;
            font-size: 16px;
            font-weight: 700;
            color: #fff;
        }
        
        .ihm-service-desc {
            margin: 0 0 12px 0;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
        }
        
        .ihm-service-metrics {
            display: flex;
            gap: 16px;
        }
        
        .ihm-metric {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        
        .ihm-metric-label {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .ihm-metric-value {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
        }
        
        .ihm-detail-panel {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
            min-height: 200px;
        }
        
        .ihm-detail-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 200px;
            color: rgba(255, 255, 255, 0.4);
        }
        
        .ihm-detail-empty-icon {
            font-size: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        
        .ihm-detail-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ihm-detail-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        
        .ihm-detail-status {
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
        }
        
        .ihm-detail-status.healthy { background: rgba(16, 185, 129, 0.2); color: #10b981; }
        .ihm-detail-status.unhealthy { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
        .ihm-detail-status.critical { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .ihm-detail-status.unknown { background: rgba(107, 114, 128, 0.2); color: #6b7280; }
        
        .ihm-detail-section {
            margin-bottom: 20px;
        }
        
        .ihm-detail-section h4 {
            margin: 0 0 12px 0;
            font-size: 13px;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.7);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .ihm-config-guide ol {
            margin: 0;
            padding-left: 20px;
            color: rgba(255, 255, 255, 0.7);
            font-size: 13px;
            line-height: 1.8;
        }
        
        .ihm-config-guide code {
            background: rgba(255, 255, 255, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
        }
        
        .ihm-config-guide a {
            color: #3b82f6;
            text-decoration: none;
        }
        
        .ihm-test-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .ihm-test-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
        }
        
        .ihm-test-number {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
        }
        
        .ihm-test-name {
            flex: 1;
            font-size: 13px;
        }
        
        .ihm-test-status {
            font-size: 12px;
        }
        
        .ihm-error-list {
            max-height: 150px;
            overflow-y: auto;
        }
        
        .ihm-no-errors {
            color: #10b981;
            font-size: 13px;
            padding: 12px;
        }
        
        .ihm-error-item {
            display: flex;
            gap: 12px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 12px;
        }
        
        .ihm-error-time {
            color: rgba(255, 255, 255, 0.4);
            font-family: monospace;
            white-space: nowrap;
        }
        
        .ihm-error-message {
            color: rgba(255, 255, 255, 0.7);
        }
        
        .ihm-detail-actions {
            display: flex;
            gap: 10px;
            padding-top: 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ihm-activity-section {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 16px;
        }
        
        .ihm-section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.9);
        }
        
        .ihm-section-title button {
            margin-left: auto;
        }
        
        .ihm-activity-list {
            max-height: 200px;
            overflow-y: auto;
        }
        
        .ihm-activity-empty {
            color: rgba(255, 255, 255, 0.4);
            font-size: 13px;
            padding: 20px;
            text-align: center;
        }
        
        .ihm-activity-item {
            display: flex;
            gap: 12px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 12px;
        }
        
        .ihm-activity-success { color: #10b981; }
        .ihm-activity-error { color: #ef4444; }
        .ihm-activity-warning { color: #f59e0b; }
        .ihm-activity-info { color: #3b82f6; }
        
        .ihm-activity-time {
            color: rgba(255, 255, 255, 0.4);
            font-family: monospace;
            white-space: nowrap;
        }
        
        .ihm-dashboard-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 12px;
        }
        
        .ihm-footer-status {
            display: flex;
            align-items: center;
            gap: 12px;
            color: rgba(255, 255, 255, 0.6);
        }
        
        .ihm-footer-divider {
            color: rgba(255, 255, 255, 0.2);
        }
    `;
    document.head.appendChild(styles);

})();
