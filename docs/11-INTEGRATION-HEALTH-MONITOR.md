# Integration Health Monitor (IHM)

**Version**: 1.0.0  
**Purpose**: Automated testing system for all backend service connections and automations

---

## Overview

The Integration Health Monitor provides continuous monitoring of all third-party integrations:
- **Supabase** - Database, Auth, and Edge Functions
- **n8n** - Workflow automation webhooks
- **Bonzo CRM** - Lead management and campaigns
- **GoHighLevel** - CRM and pipeline management
- **Automations** - Trigger workflows and sequences

---

## Features

### 🔍 Continuous Monitoring
- Automatic health checks every 30 seconds to 5 minutes (configurable per service)
- Exponential backoff retry logic (3 attempts with increasing delays)
- Response time tracking and latency alerts

### 🚨 Real-Time Alerts
- Visual toast notifications for failures
- Persistent alerts for critical issues
- Actionable fix suggestions with direct links
- Service recovery notifications

### 📊 Dashboard
- Real-time status overview of all services
- Detailed diagnostics per service
- Recent activity log
- Test history and error logs
- One-click test execution

### 📝 Comprehensive Logging
- Structured error logging with timestamps
- User agent and URL tracking
- Exportable logs (JSON format)
- Last 100 errors retained

---

## Usage

### Opening the Dashboard

**Method 1: Command Palette**
- Press `Cmd/Ctrl + K` or `/`
- Type "health" or "/health"
- Select "Open Integration Health Monitor"

**Method 2: JavaScript API**
```javascript
IntegrationHealthDashboard.open();
```

### Running Tests

**Test All Services:**
```javascript
IntegrationHealthMonitor.testAll();
```

**Test Single Service:**
```javascript
IntegrationHealthMonitor.testService('supabase');
IntegrationHealthMonitor.testService('n8n');
IntegrationHealthMonitor.testService('bonzo');
IntegrationHealthMonitor.testService('ghl');
IntegrationHealthMonitor.testService('automations');
```

### Starting/Stopping Monitoring

```javascript
// Start all monitoring
IntegrationHealthMonitor.startMonitoring();

// Start specific service
IntegrationHealthMonitor.startMonitoring('supabase');

// Stop all monitoring
IntegrationHealthMonitor.stopMonitoring();

// Check if monitoring
IntegrationHealthMonitor.isMonitoring(); // returns boolean
```

### Getting Status

```javascript
// Get health status of all services
const status = IntegrationHealthMonitor.getHealthStatus();
console.log(status);
// {
//   supabase: { status: 'healthy', lastCheck: '...', failures: 0, latency: 245 },
//   n8n: { status: 'unhealthy', lastCheck: '...', failures: 3, latency: 0 },
//   ...
// }

// Get recent error logs
const errors = IntegrationHealthMonitor.getErrorLog(10); // last 10 errors

// Get test history
const history = IntegrationHealthMonitor.getTestHistory(20); // last 20 tests

// Export all logs
IntegrationHealthMonitor.exportLogs(); // downloads JSON file
```

---

## Configuration

### Default Intervals

| Service | Check Interval |
|---------|---------------|
| Supabase | 30 seconds |
| n8n | 1 minute |
| Bonzo | 2 minutes |
| GHL | 2 minutes |
| Automations | 5 minutes |

### Alert Thresholds

| Level | Consecutive Failures |
|-------|---------------------|
| Warning | 2 |
| Critical | 5 |
| Response Time Alert | > 5000ms |

### Retry Configuration

- **Max Attempts**: 3
- **Initial Delay**: 1000ms
- **Backoff Multiplier**: 2x

---

## Test Details

### Supabase Tests
1. **Auth Session** - Validates user session
2. **Database Query** - Lightweight query to profiles table
3. **Edge Functions** - Calls ai-proxy health check

### n8n Tests
1. **Webhook Connectivity** - Sends test payload to configured webhook
2. **Payload Delivery** - Validates request format
3. **Response Handling** - Checks HTTP response

### Bonzo Tests
1. **API Authentication** - Validates JWT token
2. **Campaign List** - Fetches available campaigns
3. **Contact Sync** - Tests contact API access

### GHL Tests
1. **API Key Valid** - Validates API key
2. **Location Access** - Checks location permissions
3. **Pipeline Connection** - Tests pipeline/stage access

### Automation Tests
1. **Quote Sent Trigger** - Validates webhook registration
2. **Lead Created Trigger** - Tests lead creation flow
3. **Engagement Alerts** - Checks click notification system
4. **Follow-up Sequence** - Validates n8n workflow connectivity

---

## Error Handling

### Error Log Structure

```javascript
{
  id: "ihm_1234567890_abc123",
  timestamp: "2026-03-11T20:30:00.000Z",
  level: "error",
  service: "n8n",
  message: "Webhook connection failed",
  details: {
    status: 404,
    url: "https://n8n..."
  },
  userAgent: "Mozilla/5.0...",
  url: "https://carbon-heloc.vercel.app/"
}
```

### Alert Types

| Type | Icon | Description |
|------|------|-------------|
| Success | ✅ | Service recovered |
| Warning | ⚠️ | Degraded performance |
| Error | ❌ | Service unhealthy |
| Critical | 🚨 | Multiple failures |
| Info | ℹ️ | General information |

---

## Troubleshooting

### Service Shows "Unknown"
- Monitoring hasn't started yet
- User not authenticated
- Check browser console for errors

### Tests Failing Consistently
1. Check service configuration in Integrations tab
2. Verify API keys are valid
3. Check service status pages
4. Review error logs for details

### Dashboard Not Opening
- Ensure JavaScript files are loaded
- Check for console errors
- Try refreshing the page

---

## API Reference

### IntegrationHealthMonitor

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | Object | Initialize and start monitoring |
| `testService(service)` | string | Promise | Test specific service |
| `testAll()` | - | Promise | Test all services |
| `startMonitoring(service?)` | string? | - | Start monitoring |
| `stopMonitoring(service?)` | string? | - | Stop monitoring |
| `isMonitoring()` | - | boolean | Check monitoring status |
| `getHealthStatus()` | - | Object | Get all service statuses |
| `getErrorLog(count, level)` | number, string? | Array | Get recent errors |
| `getTestHistory(count)` | number | Array | Get test history |
| `exportLogs()` | - | - | Download logs as JSON |
| `showConfigGuide(service)` | string | - | Show configuration help |

### IntegrationHealthDashboard

| Method | Parameters | Description |
|--------|-----------|-------------|
| `open()` | - | Open dashboard |
| `close()` | - | Close dashboard |
| `toggle()` | - | Toggle dashboard |
| `selectService(service)` | string | Show service details |
| `runTest(service)` | string | Run single test |
| `runAllTests()` | - | Run all tests |
| `toggleMonitoring()` | - | Start/stop monitoring |
| `clearActivity()` | - | Clear activity log |

---

## Events

### ihm:test-complete

Fired when a test completes:

```javascript
window.addEventListener('ihm:test-complete', (e) => {
  const { service, result, healthStatus } = e.detail;
  console.log(`${service} test:`, result.success ? 'passed' : 'failed');
});
```

---

## Files

| File | Purpose |
|------|---------|
| `js/integration-health-monitor.js` | Core monitoring engine |
| `js/integration-health-dashboard.js` | Admin dashboard UI |

---

## Future Enhancements

- [ ] Email notifications for critical alerts
- [ ] Slack/Discord webhook integration
- [ ] Historical uptime reporting
- [ ] Performance trend graphs
- [ ] Automated failover suggestions
- [ ] Integration with PagerDuty/Opsgenie
