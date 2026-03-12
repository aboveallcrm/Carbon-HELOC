/**
 * Integration Health Monitor (IHM)
 * Automated testing system for all backend service connections
 * Version: 1.0.0
 */

(function() {
    'use strict';

    // Configuration
    const IHM_CONFIG = {
        // Test intervals (in milliseconds)
        intervals: {
            supabase: 30000,      // 30 seconds
            n8n: 60000,           // 1 minute
            bonzo: 120000,        // 2 minutes
            ghl: 120000,          // 2 minutes
            automation: 300000    // 5 minutes
        },
        
        // Retry configuration
        retry: {
            maxAttempts: 3,
            backoffMultiplier: 2,
            initialDelay: 1000
        },
        
        // Alert thresholds
        thresholds: {
            warning: 2,   // consecutive failures
            critical: 5,  // consecutive failures
            responseTime: 5000 // ms
        },
        
        // Notification settings
        notifications: {
            enabled: true,
            toastDuration: 8000,
            persistErrors: true
        }
    };

    // Health status storage
    const healthStatus = {
        supabase: { status: 'unknown', lastCheck: null, failures: 0, latency: 0 },
        n8n: { status: 'unknown', lastCheck: null, failures: 0, latency: 0 },
        bonzo: { status: 'unknown', lastCheck: null, failures: 0, latency: 0 },
        ghl: { status: 'unknown', lastCheck: null, failures: 0, latency: 0 },
        automations: { status: 'unknown', lastCheck: null, failures: 0, latency: 0 }
    };

    // Error log storage
    const errorLog = [];
    const MAX_ERROR_LOG = 100;

    // Test result history
    const testHistory = [];
    const MAX_HISTORY = 50;

    /**
     * Utility Functions
     */
    const utils = {
        generateId: () => 'ihm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        
        formatTimestamp: (date) => {
            return new Date(date).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        },
        
        formatDuration: (ms) => {
            if (ms < 1000) return ms + 'ms';
            return (ms / 1000).toFixed(2) + 's';
        },
        
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        
        deepClone: (obj) => JSON.parse(JSON.stringify(obj))
    };

    /**
     * Logging System
     */
    const logger = {
        log: (level, service, message, details = {}) => {
            const entry = {
                id: utils.generateId(),
                timestamp: new Date().toISOString(),
                level,
                service,
                message,
                details,
                userAgent: navigator.userAgent,
                url: window.location.href
            };
            
            errorLog.unshift(entry);
            if (errorLog.length > MAX_ERROR_LOG) {
                errorLog.pop();
            }
            
            // Also log to console
            console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
                `[IHM:${level.toUpperCase()}] ${service}: ${message}`,
                details
            );
            
            return entry;
        },
        
        error: (service, message, details) => logger.log('error', service, message, details),
        warn: (service, message, details) => logger.log('warn', service, message, details),
        info: (service, message, details) => logger.log('info', service, message, details),
        success: (service, message, details) => logger.log('success', service, message, details),
        
        getRecent: (count = 10, level = null) => {
            let logs = errorLog;
            if (level) {
                logs = logs.filter(l => l.level === level);
            }
            return logs.slice(0, count);
        },
        
        export: () => {
            return JSON.stringify(errorLog, null, 2);
        }
    };

    /**
     * Alert System
     */
    const alertSystem = {
        show: (options) => {
            const {
                type = 'info',
                title,
                message,
                service,
                actions = [],
                persistent = false
            } = options;
            
            // Create alert element
            const alertId = utils.generateId();
            const alertEl = document.createElement('div');
            alertEl.id = alertId;
            alertEl.className = `ihm-alert ihm-alert-${type}`;
            alertEl.innerHTML = `
                <div class="ihm-alert-header">
                    <span class="ihm-alert-icon">${alertSystem.getIcon(type)}</span>
                    <span class="ihm-alert-title">${title}</span>
                    <button class="ihm-alert-close" onclick="IntegrationHealthMonitor.dismissAlert('${alertId}')">&times;</button>
                </div>
                <div class="ihm-alert-body">
                    <p>${message}</p>
                    ${service ? `<span class="ihm-alert-service">Service: ${service}</span>` : ''}
                    ${actions.length > 0 ? `
                        <div class="ihm-alert-actions">
                            ${actions.map(a => `<button onclick="${a.handler}">${a.label}</button>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
            
            // Add to container
            let container = document.getElementById('ihm-alert-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'ihm-alert-container';
                document.body.appendChild(container);
            }
            
            container.appendChild(alertEl);
            
            // Auto-dismiss if not persistent
            if (!persistent) {
                setTimeout(() => alertSystem.dismiss(alertId), IHM_CONFIG.notifications.toastDuration);
            }
            
            return alertId;
        },
        
        getIcon: (type) => {
            const icons = {
                success: '✅',
                warning: '⚠️',
                error: '❌',
                info: 'ℹ️',
                critical: '🚨'
            };
            return icons[type] || icons.info;
        },
        
        dismiss: (alertId) => {
            const alert = document.getElementById(alertId);
            if (alert) {
                alert.classList.add('ihm-alert-hiding');
                setTimeout(() => alert.remove(), 300);
            }
        },
        
        // Service-specific alerts with actionable fixes
        serviceDown: (service, error, recoveryActions) => {
            const fixes = alertSystem.getFixes(service, error);
            
            return alertSystem.show({
                type: healthStatus[service].failures >= IHM_CONFIG.thresholds.critical ? 'critical' : 'error',
                title: `${service.toUpperCase()} Connection Failed`,
                message: `Unable to connect to ${service}. ${error.message || 'Unknown error'}`,
                service,
                actions: [
                    { label: 'Retry Now', handler: `IntegrationHealthMonitor.testService('${service}')` },
                    { label: 'View Details', handler: `IntegrationHealthMonitor.showErrorDetails('${service}')` },
                    ...fixes
                ],
                persistent: healthStatus[service].failures >= IHM_CONFIG.thresholds.critical
            });
        },
        
        serviceRecovered: (service) => {
            return alertSystem.show({
                type: 'success',
                title: `${service.toUpperCase()} Connection Restored`,
                message: `Connection to ${service} is now working normally.`,
                service
            });
        },
        
        getFixes: (service, error) => {
            const fixes = {
                supabase: [
                    { label: 'Check Supabase Dashboard', handler: 'window.open("https://app.supabase.com", "_blank")' },
                    { label: 'Verify API Keys', handler: 'IntegrationHealthMonitor.showConfigGuide("supabase")' }
                ],
                n8n: [
                    { label: 'Check n8n Instance', handler: 'IntegrationHealthMonitor.openN8nDashboard()' },
                    { label: 'Test Webhook', handler: 'IntegrationHealthMonitor.testN8nWebhook()' }
                ],
                bonzo: [
                    { label: 'Verify Bonzo API Key', handler: 'IntegrationHealthMonitor.showConfigGuide("bonzo")' },
                    { label: 'Check Bonzo Status', handler: 'window.open("https://status.getbonzo.com", "_blank")' }
                ],
                ghl: [
                    { label: 'Check GHL Connection', handler: 'IntegrationHealthMonitor.showConfigGuide("ghl")' },
                    { label: 'Verify Location ID', handler: 'IntegrationHealthMonitor.showConfigGuide("ghl")' }
                ]
            };
            
            return fixes[service] || [];
        }
    };

    /**
     * Test Runners
     */
    const testers = {
        // Supabase Connection Test
        supabase: async () => {
            const startTime = performance.now();
            
            try {
                // Check if Supabase client exists
                if (!window._supabase) {
                    throw new Error('Supabase client not initialized');
                }
                
                // Test 1: Basic connectivity (auth check)
                const { data: authData, error: authError } = await window._supabase.auth.getSession();
                if (authError) throw authError;
                
                // Test 2: Database connectivity (lightweight query)
                const { data: dbData, error: dbError } = await window._supabase
                    .from('profiles')
                    .select('id')
                    .limit(1)
                    .single();
                
                // Test 3: Edge function connectivity
                const { data: funcData, error: funcError } = await window._supabase.functions.invoke('ai-proxy', {
                    body: { action: 'check_status' }
                });
                
                const latency = Math.round(performance.now() - startTime);
                
                return {
                    success: true,
                    latency,
                    details: {
                        auth: !!authData,
                        database: !dbError,
                        edgeFunctions: !funcError,
                        session: authData?.session ? 'active' : 'none'
                    }
                };
            } catch (error) {
                const latency = Math.round(performance.now() - startTime);
                return {
                    success: false,
                    latency,
                    error: {
                        message: error.message,
                        code: error.code,
                        status: error.status
                    }
                };
            }
        },
        
        // n8n Webhook Test
        n8n: async () => {
            const startTime = performance.now();
            
            try {
                // Get n8n webhook URL from user integrations
                const { data: integrationData, error: integrationError } = await window._supabase
                    .from('user_integrations')
                    .select('metadata')
                    .eq('provider', 'heloc_settings')
                    .single();
                
                if (integrationError || !integrationData?.metadata?.n8n?.webhookUrl) {
                    return {
                        success: false,
                        error: {
                            message: 'n8n webhook URL not configured',
                            code: 'NOT_CONFIGURED'
                        }
                    };
                }
                
                const webhookUrl = integrationData.metadata.n8n.webhookUrl;
                
                // Send test ping to n8n
                const testPayload = {
                    event: 'health_check',
                    timestamp: new Date().toISOString(),
                    source: 'carbon_heloc_monitor',
                    testId: utils.generateId()
                };
                
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(testPayload)
                });
                
                const latency = Math.round(performance.now() - startTime);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return {
                    success: true,
                    latency,
                    details: {
                        webhookUrl: webhookUrl.replace(/\/[^\/]*$/, '/...'), // Mask full URL
                        responseStatus: response.status,
                        testPayload: testPayload.testId
                    }
                };
            } catch (error) {
                const latency = Math.round(performance.now() - startTime);
                return {
                    success: false,
                    latency,
                    error: {
                        message: error.message,
                        code: error.name === 'TypeError' ? 'NETWORK_ERROR' : 'UNKNOWN'
                    }
                };
            }
        },
        
        // Bonzo CRM Test
        bonzo: async () => {
            const startTime = performance.now();
            
            try {
                // Get Bonzo API key
                const { data: integrationData, error: integrationError } = await window._supabase
                    .from('user_integrations')
                    .select('metadata')
                    .eq('provider', 'heloc_settings')
                    .single();
                
                const bonzoConfig = integrationData?.metadata?.bonzo;
                
                if (!bonzoConfig?.apiKey2) {
                    return {
                        success: false,
                        error: {
                            message: 'Bonzo API key not configured',
                            code: 'NOT_CONFIGURED'
                        }
                    };
                }
                
                // Test Bonzo API via edge function (to avoid CORS)
                const { data, error } = await window._supabase.functions.invoke('bonzo-proxy', {
                    body: {
                        action: 'list_campaigns',
                        payload: {}
                    }
                });
                
                const latency = Math.round(performance.now() - startTime);
                
                if (error) throw error;
                
                return {
                    success: true,
                    latency,
                    details: {
                        apiVersion: 'v3',
                        campaignsAvailable: Array.isArray(data?.data),
                        authMethod: 'JWT'
                    }
                };
            } catch (error) {
                const latency = Math.round(performance.now() - startTime);
                return {
                    success: false,
                    latency,
                    error: {
                        message: error.message,
                        code: error.code || 'API_ERROR'
                    }
                };
            }
        },
        
        // GoHighLevel Test
        ghl: async () => {
            const startTime = performance.now();
            
            try {
                // Get GHL configuration
                const { data: integrationData, error: integrationError } = await window._supabase
                    .from('user_integrations')
                    .select('metadata')
                    .eq('provider', 'heloc_settings')
                    .single();
                
                const ghlConfig = integrationData?.metadata?.ghl;
                
                if (!ghlConfig?.apiKey || !ghlConfig?.locationId) {
                    return {
                        success: false,
                        error: {
                            message: 'GHL API key or Location ID not configured',
                            code: 'NOT_CONFIGURED'
                        }
                    };
                }
                
                // Test GHL API via edge function
                const { data, error } = await window._supabase.functions.invoke('ghl-proxy', {
                    body: {
                        action: 'get_location',
                        locationId: ghlConfig.locationId
                    }
                });
                
                const latency = Math.round(performance.now() - startTime);
                
                if (error) throw error;
                
                return {
                    success: true,
                    latency,
                    details: {
                        locationId: ghlConfig.locationId,
                        locationName: data?.data?.name || 'Unknown',
                        apiVersion: '2021-07-28'
                    }
                };
            } catch (error) {
                const latency = Math.round(performance.now() - startTime);
                return {
                    success: false,
                    latency,
                    error: {
                        message: error.message,
                        code: error.code || 'API_ERROR'
                    }
                };
            }
        },
        
        // Automation Trigger Test
        automations: async () => {
            const startTime = performance.now();
            const results = {
                quoteSent: false,
                leadCreated: false,
                engagementAlert: false,
                followUpSequence: false
            };
            
            try {
                // Test 1: Check if automation webhooks are registered
                const { data: hooks, error: hooksError } = await window._supabase
                    .from('user_integrations')
                    .select('metadata')
                    .eq('provider', 'webhook_config')
                    .single();
                
                if (!hooksError && hooks?.metadata?.webhook_token) {
                    results.quoteSent = true;
                    results.leadCreated = true;
                }
                
                // Test 2: Check n8n workflow connectivity
                const n8nResult = await testers.n8n();
                results.followUpSequence = n8nResult.success;
                
                // Test 3: Check click notification system
                const { data: clickNotif, error: clickError } = await window._supabase
                    .from('click_notifications')
                    .select('id')
                    .limit(1);
                
                results.engagementAlert = !clickError;
                
                const latency = Math.round(performance.now() - startTime);
                
                const allPassed = Object.values(results).every(v => v);
                
                return {
                    success: allPassed,
                    latency,
                    details: results,
                    warning: allPassed ? null : 'Some automation triggers may not be fully configured'
                };
            } catch (error) {
                const latency = Math.round(performance.now() - startTime);
                return {
                    success: false,
                    latency,
                    error: {
                        message: error.message,
                        code: 'AUTOMATION_TEST_FAILED'
                    }
                };
            }
        }
    };

    /**
     * Main Test Orchestrator
     */
    const testRunner = {
        run: async (service) => {
            const tester = testers[service];
            if (!tester) {
                throw new Error(`Unknown service: ${service}`);
            }
            
            const testId = utils.generateId();
            const startTime = Date.now();
            
            logger.info(service, `Starting health check`, { testId });
            
            // Run test with retry logic
            let result = null;
            let attempts = 0;
            
            while (attempts < IHM_CONFIG.retry.maxAttempts) {
                attempts++;
                result = await tester();
                
                if (result.success) {
                    break;
                }
                
                if (attempts < IHM_CONFIG.retry.maxAttempts) {
                    const delay = IHM_CONFIG.retry.initialDelay * Math.pow(IHM_CONFIG.retry.backoffMultiplier, attempts - 1);
                    logger.warn(service, `Retry ${attempts}/${IHM_CONFIG.retry.maxAttempts} after ${delay}ms`, { testId });
                    await utils.sleep(delay);
                }
            }
            
            // Update health status
            const previousStatus = healthStatus[service].status;
            
            if (result.success) {
                healthStatus[service] = {
                    status: 'healthy',
                    lastCheck: new Date().toISOString(),
                    failures: 0,
                    latency: result.latency
                };
                
                if (previousStatus === 'unhealthy' || previousStatus === 'critical') {
                    logger.success(service, `Service recovered`, { testId, latency: result.latency });
                    alertSystem.serviceRecovered(service);
                } else {
                    logger.info(service, `Health check passed`, { testId, latency: result.latency });
                }
            } else {
                healthStatus[service].failures++;
                healthStatus[service].lastCheck = new Date().toISOString();
                healthStatus[service].latency = result.latency;
                
                if (healthStatus[service].failures >= IHM_CONFIG.thresholds.critical) {
                    healthStatus[service].status = 'critical';
                } else if (healthStatus[service].failures >= IHM_CONFIG.thresholds.warning) {
                    healthStatus[service].status = 'unhealthy';
                } else {
                    healthStatus[service].status = 'degraded';
                }
                
                logger.error(service, `Health check failed`, { 
                    testId, 
                    error: result.error,
                    failures: healthStatus[service].failures 
                });
                
                if (healthStatus[service].failures >= IHM_CONFIG.thresholds.warning) {
                    alertSystem.serviceDown(service, result.error);
                }
            }
            
            // Record test history
            testHistory.unshift({
                testId,
                service,
                timestamp: new Date().toISOString(),
                success: result.success,
                latency: result.latency,
                error: result.error || null
            });
            
            if (testHistory.length > MAX_HISTORY) {
                testHistory.pop();
            }
            
            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('ihm:test-complete', {
                detail: { service, result, healthStatus: utils.deepClone(healthStatus) }
            }));
            
            return result;
        },
        
        runAll: async () => {
            const services = Object.keys(testers);
            const results = {};
            
            for (const service of services) {
                results[service] = await testRunner.run(service);
                // Small delay between tests to avoid overwhelming the system
                await utils.sleep(500);
            }
            
            return results;
        }
    };

    /**
     * Scheduler for continuous monitoring
     */
    const scheduler = {
        intervals: {},
        
        start: (service) => {
            if (scheduler.intervals[service]) {
                clearInterval(scheduler.intervals[service]);
            }
            
            const interval = IHM_CONFIG.intervals[service];
            
            // Run immediately
            testRunner.run(service);
            
            // Schedule recurring tests
            scheduler.intervals[service] = setInterval(() => {
                testRunner.run(service);
            }, interval);
            
            logger.info('scheduler', `Started monitoring for ${service}`, { interval });
        },
        
        startAll: () => {
            Object.keys(IHM_CONFIG.intervals).forEach(service => {
                scheduler.start(service);
            });
            logger.info('scheduler', 'Started all monitoring');
        },
        
        stop: (service) => {
            if (scheduler.intervals[service]) {
                clearInterval(scheduler.intervals[service]);
                delete scheduler.intervals[service];
                logger.info('scheduler', `Stopped monitoring for ${service}`);
            }
        },
        
        stopAll: () => {
            Object.keys(scheduler.intervals).forEach(service => {
                scheduler.stop(service);
            });
            logger.info('scheduler', 'Stopped all monitoring');
        },
        
        isRunning: (service) => !!scheduler.intervals[service]
    };

    /**
     * Public API
     */
    window.IntegrationHealthMonitor = {
        // Configuration
        config: IHM_CONFIG,
        
        // Status
        getHealthStatus: () => utils.deepClone(healthStatus),
        getErrorLog: (count, level) => logger.getRecent(count, level),
        getTestHistory: (count) => testHistory.slice(0, count || MAX_HISTORY),
        
        // Testing
        testService: (service) => testRunner.run(service),
        testAll: () => testRunner.runAll(),
        
        // Scheduling
        startMonitoring: (service) => service ? scheduler.start(service) : scheduler.startAll(),
        stopMonitoring: (service) => service ? scheduler.stop(service) : scheduler.stopAll(),
        isMonitoring: (service) => scheduler.isRunning(service),
        
        // Alerts
        dismissAlert: (alertId) => alertSystem.dismiss(alertId),
        showErrorDetails: (service) => {
            const logs = logger.getRecent(5);
            const serviceLogs = logs.filter(l => l.service === service);
            console.table(serviceLogs);
            alertSystem.show({
                type: 'info',
                title: `${service.toUpperCase()} Error Details`,
                message: `Recent errors logged. Check console for details.`,
                service
            });
        },
        
        // Configuration guides
        showConfigGuide: (service) => {
            const guides = {
                supabase: '1. Check Supabase dashboard\n2. Verify project URL and anon key\n3. Check RLS policies\n4. Verify edge functions are deployed',
                n8n: '1. Verify n8n instance is running\n2. Check webhook URL in integrations\n3. Test webhook with curl\n4. Check n8n execution logs',
                bonzo: '1. Get API key from Bonzo Settings\n2. Verify JWT token (not Xcode)\n3. Check API base URL\n4. Test with bonzo-proxy edge function',
                ghl: '1. Get API key from GHL Settings\n2. Verify Location ID\n3. Check pipeline/stage IDs\n4. Test connection in integrations tab'
            };
            
            alertSystem.show({
                type: 'info',
                title: `${service.toUpperCase()} Configuration Guide`,
                message: guides[service] || 'No guide available',
                service,
                persistent: true
            });
        },
        
        openN8nDashboard: () => {
            window.open('https://n8n.srv1290585.hstgr.cloud/', '_blank');
        },
        
        testN8nWebhook: async () => {
            const result = await testers.n8n();
            if (result.success) {
                showToast('n8n webhook test successful!', 'success');
            } else {
                showToast('n8n webhook test failed: ' + result.error.message, 'error');
            }
        },
        
        // Logging
        exportLogs: () => {
            const data = logger.export();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ihm-logs-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },
        
        // Initialize
        init: () => {
            logger.info('system', 'Integration Health Monitor initialized');
            
            // Add CSS styles
            const styles = document.createElement('style');
            styles.textContent = `
                #ihm-alert-container {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    z-index: 100000;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    max-width: 400px;
                }
                
                .ihm-alert {
                    background: linear-gradient(135deg, #1e293b, #0f172a);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    padding: 16px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
                    animation: ihm-alert-in 0.3s ease-out;
                    font-family: var(--font-heading, system-ui);
                }
                
                .ihm-alert-hiding {
                    animation: ihm-alert-out 0.3s ease-in forwards;
                }
                
                .ihm-alert-success { border-left: 4px solid #10b981; }
                .ihm-alert-warning { border-left: 4px solid #f59e0b; }
                .ihm-alert-error { border-left: 4px solid #ef4444; }
                .ihm-alert-critical { border-left: 4px solid #dc2626; background: linear-gradient(135deg, #450a0a, #1e293b); }
                .ihm-alert-info { border-left: 4px solid #3b82f6; }
                
                .ihm-alert-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                }
                
                .ihm-alert-icon {
                    font-size: 20px;
                }
                
                .ihm-alert-title {
                    flex: 1;
                    font-weight: 700;
                    font-size: 14px;
                    color: #fff;
                }
                
                .ihm-alert-close {
                    background: none;
                    border: none;
                    color: rgba(255,255,255,0.5);
                    font-size: 20px;
                    cursor: pointer;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                
                .ihm-alert-close:hover {
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                }
                
                .ihm-alert-body {
                    color: rgba(255,255,255,0.8);
                    font-size: 13px;
                    line-height: 1.5;
                }
                
                .ihm-alert-body p {
                    margin: 0 0 8px 0;
                }
                
                .ihm-alert-service {
                    display: inline-block;
                    background: rgba(255,255,255,0.1);
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 10px;
                }
                
                .ihm-alert-actions {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    margin-top: 10px;
                }
                
                .ihm-alert-actions button {
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    border: none;
                    color: white;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .ihm-alert-actions button:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                }
                
                @keyframes ihm-alert-in {
                    from { opacity: 0; transform: translateX(100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                
                @keyframes ihm-alert-out {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100%); }
                }
            `;
            document.head.appendChild(styles);
            
            // Auto-start monitoring if user is authenticated
            if (window._supabase) {
                window._supabase.auth.getSession().then(({ data }) => {
                    if (data.session) {
                        scheduler.startAll();
                    }
                });
            }
            
            return IntegrationHealthMonitor;
        }
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', IntegrationHealthMonitor.init);
    } else {
        IntegrationHealthMonitor.init();
    }

})();
