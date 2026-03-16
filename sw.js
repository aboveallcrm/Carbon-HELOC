/**
 * Service Worker for Above All Carbon HELOC Quote Tool
 * Provides caching, offline functionality, push notifications, and background sync
 */

const CACHE_NAME = 'aac-heloc-v12';
const STATIC_ASSETS = [
  './js/main.js',
  './js/auth.js',
  './js/supabase-client.js',
  './js/supabase-quotes.js',
  './js/link-shortener-universal.js',
  './js/carbon-commands-v3.js',
  './js/carbon-commands-v3.css',
  './js/ezra-chat.js',
  './js/pwa-install.js',
  './js/dom-cache.js',
  './offline.html',
  './manifest.json',
  './favicon.ico',
  './favicon.png',
  './favicon-96x96.png',
  './favicon-192x192.png',
  './favicon-512x512.png',
  './apple-touch-icon.png',
  './above-all-crm-logo.svg',
  './above-all-crm-horizontal.svg'
];

// Offline fallback page
const OFFLINE_PAGE = './offline.html';

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => {
        console.log('[SW] Cache install error:', err);
      })
  );
  
  // Enable navigation preload if available
  if (self.registration.navigationPreload) {
    self.registration.navigationPreload.enable();
  }
  
  self.skipWaiting();
});

// Activate event - clean up old caches, then claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
      .then(() => {
        // Force-reload all open client pages to pick up fresh HTML
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            if (client.url && client.url.includes('client-quote')) {
              client.navigate(client.url);
            }
          });
        });
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip external API calls, CDN resources, and fonts
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('esm.sh') ||
      url.hostname.includes('api.heygen.com') ||
      url.hostname.includes('filesafe.space')) {
    return;
  }

  // NEVER cache client-quote.html — always go to network, no fallback
  if (url.pathname.includes('client-quote')) {
    return;
  }

  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Cache-first for static assets with stale-while-revalidate
  event.respondWith(handleStaticAsset(request));
});

// Handle navigation requests with network-first + offline fallback
async function handleNavigation(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    throw new Error('Network response not ok');
  } catch (error) {
    // Fall back to cache
    const cached = await caches.match(request);
    if (cached) return cached;
    
    // Last resort: return main app page
    const fallback = await caches.match('./AboveAllCarbon_HELOC_v12_FIXED.html');
    if (fallback) return fallback;
    
    // Ultimate fallback: simple offline message
    return new Response(
      '<!DOCTYPE html><html><head><title>Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;text-align:center;padding:40px 20px;"><h1>You\'re Offline</h1><p>Please check your internet connection and try again.</p><button onclick="location.reload()" style="padding:12px 24px;font-size:16px;cursor:pointer;">Retry</button></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// Handle static assets with cache-first + background update
async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  
  // Return cached immediately if available
  if (cached) {
    // Update cache in background
    fetch(request).then(response => {
      if (response.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }
  
  // No cache: fetch and store
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return 404 for failed requests
    return new Response('Not found', { status: 404 });
  }
}

// Background sync for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-quotes') {
    event.waitUntil(syncQuotes());
  }
});

async function syncQuotes() {
  console.log('[SW] Background sync triggered');
}

// ============================================
// PUSH NOTIFICATIONS - Enhanced for Schedule Requests
// ============================================

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[SW] Push event received but no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'Above All CRM',
      body: event.data.text(),
      data: {}
    };
  }

  const title = data.title || 'Above All CRM';
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || './favicon-192x192.png',
    badge: data.badge || './favicon-64x64.png',
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || {},
    vibrate: data.vibrate || [200, 100, 200],
    renotify: data.renotify || false,
    timestamp: data.timestamp || Date.now()
  };

  // Add click action if URL provided
  if (data.data?.url) {
    options.data.url = data.data.url;
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const action = event.action;

  // Handle specific actions
  if (action === 'call') {
    // Open dialer with phone number
    event.waitUntil(
      clients.openWindow('tel:' + notificationData.phone)
    );
    return;
  }

  if (action === 'view') {
    // Open specific quote or lead page
    event.waitUntil(
      clients.openWindow(notificationData.url || '/')
    );
    return;
  }

  if (action === 'dismiss') {
    // Just close the notification
    return;
  }

  // Default: open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it
        for (const client of clientList) {
          if (client.url.includes('AboveAllCarbon_HELOC_v12_FIXED.html') && 'focus' in client) {
            client.focus();
            // Post message to client about the notification
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: notificationData
            });
            return;
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(notificationData.url || './AboveAllCarbon_HELOC_v12_FIXED.html');
        }
      })
  );
});

// Handle notification close (dismiss without click)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification);
});

// ============================================
// MESSAGE HANDLING FROM CLIENT
// ============================================

self.addEventListener('message', (event) => {
  const data = event.data;
  
  if (!data) return;

  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_NAME });
      break;
      
    case 'SCHEDULE_REQUEST':
      // Handle schedule request from client
      console.log('[SW] Schedule request received:', data.payload);
      break;
      
    default:
      console.log('[SW] Unknown message type:', data.type);
  }
});

// ============================================
// PERIODIC SYNC (for background updates)
// ============================================

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-schedule-requests') {
    event.waitUntil(checkPendingScheduleRequests());
  }
});

async function checkPendingScheduleRequests() {
  // This would check for pending schedule requests
  console.log('[SW] Checking pending schedule requests');
}

console.log('[SW] Service Worker loaded:', CACHE_NAME);
