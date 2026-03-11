/**
 * Service Worker for Above All Carbon HELOC Quote Tool
 * Provides caching, offline functionality, push notifications, and background sync
 */

const CACHE_NAME = 'aac-heloc-v3';
const STATIC_ASSETS = [
  './AboveAllCarbon_HELOC_v12_FIXED.html',
  './client-quote.html',
  './js/main.js',
  './js/auth.js',
  './js/supabase-client.js',
  './js/supabase-quotes.js',
  './js/link-shortener-universal.js',
  './js/carbon-commands-v3.js',
  './js/carbon-commands-v3.css',
  './manifest.json'
];

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
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Supabase API calls and other dynamic content
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cached version and update in background
        fetch(request)
          .then((response) => {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response);
            });
          })
          .catch(() => {});
        return cached;
      }

      // Network request
      return fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return offline fallback if available
          if (request.mode === 'navigate') {
            return caches.match('./AboveAllCarbon_HELOC_v12_FIXED.html');
          }
        });
    })
  );
});

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
