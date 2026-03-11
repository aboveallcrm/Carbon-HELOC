/**
 * PWA Install Prompt & Push Notification Manager
 * Handles Add to Home Screen, Service Worker registration, and Push Notifications
 */

(function() {
    'use strict';

    // ==================== CONFIGURATION ====================
    const CONFIG = {
        debug: false,
        swPath: './sw.js',
        vapidPublicKey: null, // Will be set from server
    };

    // ==================== STATE ====================
    let deferredPrompt = null;
    let isInstalled = false;
    let swRegistration = null;

    // ==================== INITIALIZATION ====================
    function init() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA] Service Worker not supported');
            return;
        }

        registerServiceWorker();
        setupInstallPrompt();
        setupPushNotifications();
        checkInstalledStatus();
    }

    // ==================== SERVICE WORKER ====================
    async function registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register(CONFIG.swPath);
            swRegistration = registration;
            
            console.log('[PWA] Service Worker registered:', registration.scope);

            // Handle updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available
                        showUpdateNotification();
                    }
                });
            });

        } catch (error) {
            console.error('[PWA] Service Worker registration failed:', error);
        }
    }

    // ==================== INSTALL PROMPT ====================
    function setupInstallPrompt() {
        // Capture the install prompt event (Android/Chrome)
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Store the event for later use
            deferredPrompt = e;
            
            // Update UI in profile tab if it exists
            updateInstallButtonUI();
        });

        // Handle app installed
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed');
            isInstalled = true;
            deferredPrompt = null;
            showToast('🎉 App installed! Access it from your home screen.', 'success');
            updateInstallButtonUI();
        });
        
        // Update UI on load
        updateInstallButtonUI();
    }
    
    // Update the install button in Profile tab
    function updateInstallButtonUI() {
        const installBtn = document.getElementById('pwa-install-btn');
        const installStatus = document.getElementById('pwa-install-status');
        
        if (isRunningStandalone()) {
            // Already installed
            if (installBtn) {
                installBtn.textContent = '✅ Installed';
                installBtn.disabled = true;
                installBtn.style.background = '#10b981';
            }
            if (installStatus) installStatus.textContent = 'App is installed on your device';
        } else if (deferredPrompt) {
            // Can install (Android/Chrome)
            if (installBtn) {
                installBtn.textContent = '📱 Install App';
                installBtn.disabled = false;
                installBtn.style.background = '';
            }
            if (installStatus) installStatus.textContent = 'Click to add to home screen';
        } else {
            // iOS or can't install
            if (installBtn) {
                installBtn.textContent = '📱 View Install Instructions';
                installBtn.disabled = false;
            }
            if (installStatus) installStatus.textContent = 'iOS: Use Share → Add to Home Screen';
        }
    }
    
    // ==================== iOS SPECIFIC ====================
    function isRunningStandalone() {
        return window.navigator.standalone === true || 
               window.matchMedia('(display-mode: standalone)').matches;
    }
    
    function showIOSInstallPrompt() {
        // Remove any existing prompt first
        const existing = document.getElementById('pwa-ios-prompt');
        if (existing) existing.remove();
        
        const prompt = document.createElement('div');
        prompt.id = 'pwa-ios-prompt';
        prompt.innerHTML = `
            <div class="pwa-ios-backdrop"></div>
            <div class="pwa-ios-modal">
                <button class="pwa-ios-close" onclick="PWA.dismissIOSPrompt()">×</button>
                <div class="pwa-ios-header">
                    <div class="pwa-ios-icon">📱</div>
                    <h3>Add to Home Screen</h3>
                    <p>Install Above All CRM like a native app</p>
                </div>
                <div class="pwa-ios-steps">
                    <div class="pwa-ios-step">
                        <div class="pwa-ios-step-num">1</div>
                        <div class="pwa-ios-step-text">
                            <strong>Tap the Share button</strong>
                            <div class="pwa-ios-share-icon">⬆️</div>
                            <small>at the bottom of Safari</small>
                        </div>
                    </div>
                    <div class="pwa-ios-step">
                        <div class="pwa-ios-step-num">2</div>
                        <div class="pwa-ios-step-text">
                            <strong>Scroll and tap</strong>
                            <div class="pwa-ios-a2hs-text">Add to Home Screen</div>
                            <small>in the share menu</small>
                        </div>
                    </div>
                    <div class="pwa-ios-step">
                        <div class="pwa-ios-step-num">3</div>
                        <div class="pwa-ios-step-text">
                            <strong>Tap Add</strong>
                            <small>in the top right corner</small>
                        </div>
                    </div>
                </div>
                <div class="pwa-ios-benefits">
                    <div class="pwa-ios-benefit">⚡ Instant access from home screen</div>
                    <div class="pwa-ios-benefit">🔔 Push notifications for client calls</div>
                    <div class="pwa-ios-benefit">📴 Works offline</div>
                </div>
                <button class="pwa-ios-btn-gotit" onclick="PWA.dismissIOSPrompt()">Got it!</button>
            </div>
        `;
        document.body.appendChild(prompt);
        
        requestAnimationFrame(() => {
            prompt.classList.add('pwa-ios-visible');
        });
    }
    
    function hideIOSPrompt() {
        const prompt = document.getElementById('pwa-ios-prompt');
        if (prompt) {
            prompt.classList.remove('pwa-ios-visible');
            setTimeout(() => prompt.remove(), 300);
        }
    }
    
    function dismissIOSPrompt() {
        hideIOSPrompt();
        const dismissUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
        localStorage.setItem('pwa_install_dismissed', dismissUntil.toString());
    }

    function showInstallPrompt() {
        // Don't show if already dismissed recently
        if (getInstallDismissed()) return;

        const prompt = document.createElement('div');
        prompt.id = 'pwa-install-prompt';
        prompt.innerHTML = `
            <div class="pwa-prompt-content">
                <div class="pwa-prompt-icon">📱</div>
                <div class="pwa-prompt-text">
                    <h4>Add to Home Screen</h4>
                    <p>Install Above All CRM for quick access and instant notifications</p>
                </div>
                <div class="pwa-prompt-actions">
                    <button class="pwa-btn-install" onclick="PWA.install()">
                        <span>Install</span>
                    </button>
                    <button class="pwa-btn-dismiss" onclick="PWA.dismissInstall()">
                        <span>Not Now</span>
                    </button>
                </div>
                <button class="pwa-btn-close" onclick="PWA.dismissInstall()">×</button>
            </div>
        `;
        document.body.appendChild(prompt);

        // Animate in
        requestAnimationFrame(() => {
            prompt.classList.add('pwa-prompt-visible');
        });
    }

    function hideInstallPrompt() {
        const prompt = document.getElementById('pwa-install-prompt');
        if (prompt) {
            prompt.classList.remove('pwa-prompt-visible');
            setTimeout(() => prompt.remove(), 300);
        }
    }

    async function installApp() {
        if (!deferredPrompt) {
            console.log('[PWA] No install prompt available');
            return;
        }

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for user choice
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Install prompt outcome:', outcome);

        // Clear the deferred prompt
        deferredPrompt = null;
        hideInstallPrompt();
    }

    function dismissInstall() {
        hideInstallPrompt();
        // Remember dismissal for 7 days
        const dismissUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
        localStorage.setItem('pwa_install_dismissed', dismissUntil.toString());
    }

    function getInstallDismissed() {
        const dismissed = localStorage.getItem('pwa_install_dismissed');
        if (!dismissed) return false;
        return Date.now() < parseInt(dismissed);
    }

    function checkInstalledStatus() {
        // Check if running as installed PWA
        if (window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true) {
            isInstalled = true;
            document.body.classList.add('pwa-installed');
        }
    }

    // ==================== PUSH NOTIFICATIONS ====================
    function setupPushNotifications() {
        if (!('PushManager' in window)) {
            console.log('[PWA] Push notifications not supported');
            return;
        }

        // Check permission on load
        checkNotificationPermission();
    }

    async function checkNotificationPermission() {
        if (!('Notification' in window)) return;

        const permission = Notification.permission;
        
        if (permission === 'granted') {
            await subscribeToPush();
        } else if (permission === 'default') {
            // Show permission request after user interaction
            showPushPermissionPrompt();
        }
    }

    function showPushPermissionPrompt() {
        // Only show if not already dismissed
        if (localStorage.getItem('push_permission_dismissed')) return;

        const prompt = document.createElement('div');
        prompt.id = 'pwa-push-prompt';
        prompt.innerHTML = `
            <div class="pwa-prompt-content">
                <div class="pwa-prompt-icon">🔔</div>
                <div class="pwa-prompt-text">
                    <h4>Enable Notifications</h4>
                    <p>Get instant alerts when clients request calls or schedule appointments</p>
                </div>
                <div class="pwa-prompt-actions">
                    <button class="pwa-btn-install" onclick="PWA.requestPushPermission()">
                        <span>Enable</span>
                    </button>
                    <button class="pwa-btn-dismiss" onclick="PWA.dismissPushPrompt()">
                        <span>Maybe Later</span>
                    </button>
                </div>
                <button class="pwa-btn-close" onclick="PWA.dismissPushPrompt()">×</button>
            </div>
        `;
        document.body.appendChild(prompt);

        requestAnimationFrame(() => {
            prompt.classList.add('pwa-prompt-visible');
        });
    }

    function hidePushPrompt() {
        const prompt = document.getElementById('pwa-push-prompt');
        if (prompt) {
            prompt.classList.remove('pwa-prompt-visible');
            setTimeout(() => prompt.remove(), 300);
        }
    }

    function dismissPushPrompt() {
        hidePushPrompt();
        localStorage.setItem('push_permission_dismissed', 'true');
    }

    async function requestPushPermission() {
        hidePushPrompt();
        
        try {
            const permission = await Notification.requestPermission();
            
            if (permission === 'granted') {
                await subscribeToPush();
                showToast('🔔 Notifications enabled! You\'ll get alerts for schedule requests.', 'success');
            } else {
                showToast('Notifications disabled. You can enable them in settings.', 'info');
            }
        } catch (error) {
            console.error('[PWA] Push permission error:', error);
        }
    }

    async function subscribeToPush() {
        if (!swRegistration) return;

        try {
            // Get VAPID key from server
            const vapidKey = await getVapidPublicKey();
            if (!vapidKey) {
                console.log('[PWA] No VAPID key available');
                return;
            }

            const subscription = await swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });

            // Send subscription to server
            await savePushSubscription(subscription);
            
            console.log('[PWA] Push subscription created');
        } catch (error) {
            console.error('[PWA] Push subscription failed:', error);
        }
    }

    async function getVapidPublicKey() {
        // Try to get from window config first
        if (window.PWA_VAPID_KEY) {
            return window.PWA_VAPID_KEY;
        }
        
        // Otherwise fetch from API
        try {
            const response = await fetch('/functions/v1/push-config');
            const data = await response.json();
            return data.vapidPublicKey;
        } catch (error) {
            console.log('[PWA] Could not fetch VAPID key');
            return null;
        }
    }

    async function savePushSubscription(subscription) {
        try {
            const sb = window._supabase;
            if (!sb) return;

            await sb.from('push_subscriptions').upsert({
                user_id: window.currentUserId,
                subscription: subscription,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });
        } catch (error) {
            console.error('[PWA] Save subscription error:', error);
        }
    }

    async function unsubscribeFromPush() {
        if (!swRegistration) return;

        try {
            const subscription = await swRegistration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                console.log('[PWA] Push subscription removed');
            }
        } catch (error) {
            console.error('[PWA] Unsubscribe error:', error);
        }
    }

    // ==================== UTILITY FUNCTIONS ====================
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    function showUpdateNotification() {
        const toast = document.createElement('div');
        toast.className = 'pwa-update-toast';
        toast.innerHTML = `
            <span>🔄 New version available</span>
            <button onclick="location.reload()">Update</button>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 100);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 10000);
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `pwa-toast pwa-toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ==================== PROFILE TAB UI ====================
    function showInstallUI() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        if (isRunningStandalone()) {
            showToast('✅ App is already installed!', 'success');
            return;
        }
        
        if (deferredPrompt) {
            // Android/Chrome - trigger install
            installApp();
        } else if (isIOS && isSafari) {
            // iOS - show instructions modal
            showIOSInstallPrompt();
        } else {
            // Other browsers
            showToast('📱 Use your browser\'s menu to add this page to your home screen', 'info');
        }
    }

    // ==================== PUBLIC API ====================
    window.PWA = {
        install: installApp,
        dismissInstall: dismissInstall,
        requestPushPermission: requestPushPermission,
        dismissPushPrompt: dismissPushPrompt,
        subscribeToPush: subscribeToPush,
        unsubscribeFromPush: unsubscribeFromPush,
        isInstalled: () => isInstalled,
        getRegistration: () => swRegistration,
        showInstallUI: showInstallUI,
        // iOS specific
        dismissIOSPrompt: dismissIOSPrompt,
        showIOSInstallPrompt: showIOSInstallPrompt,
        isRunningStandalone: isRunningStandalone
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
