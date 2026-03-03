/**
 * Performance optimizations for Above All Carbon HELOC Quote Tool
 * Runtime performance enhancements
 */

// Performance monitoring
const PerformanceMonitor = {
    marks: {},
    
    mark(name) {
        if (window.performance) {
            performance.mark(name);
            this.marks[name] = Date.now();
        }
    },
    
    measure(name, startMark, endMark) {
        if (window.performance && performance.measure) {
            try {
                performance.measure(name, startMark, endMark);
                const entries = performance.getEntriesByName(name);
                if (entries.length > 0) {
                    console.log(`[Perf] ${name}: ${entries[0].duration.toFixed(2)}ms`);
                }
            } catch (e) {
                // Ignore measurement errors
            }
        }
    },
    
    // Log long tasks
    observeLongTasks() {
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.duration > 50) {
                            console.warn(`[Perf] Long task detected: ${entry.duration.toFixed(2)}ms`);
                        }
                    }
                });
                observer.observe({ entryTypes: ['longtask'] });
            } catch (e) {
                // Long task observer not supported
            }
        }
    }
};

// Lazy load non-critical components
const LazyLoader = {
    elements: new Map(),
    
    init() {
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.load(entry.target);
                        this.observer.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: '50px',
                threshold: 0.01
            });
        }
    },
    
    observe(element, callback) {
        if (this.observer) {
            this.elements.set(element, callback);
            this.observer.observe(element);
        } else {
            // Fallback: load immediately
            callback(element);
        }
    },
    
    load(element) {
        const callback = this.elements.get(element);
        if (callback) {
            callback(element);
            this.elements.delete(element);
        }
    }
};

// Debounce and throttle utilities
const RateLimiter = {
    debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },
    
    throttle(fn, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    // Schedule non-critical work during idle time
    scheduleIdleWork(fn, timeout = 2000) {
        if ('requestIdleCallback' in window) {
            return requestIdleCallback(fn, { timeout });
        } else {
            return setTimeout(fn, 1);
        }
    }
};

// Memory management
const MemoryManager = {
    // Clean up DOM references for removed elements
    cleanup() {
        // Force garbage collection hint (not guaranteed)
        if (window.gc) {
            window.gc();
        }
    },
    
    // Remove event listeners from detached DOM nodes
    purgeDetachedNodes() {
        const allNodes = document.querySelectorAll('*');
        allNodes.forEach(node => {
            if (!document.contains(node)) {
                // Node is detached, clean up
                node._eventListeners = null;
            }
        });
    }
};

// Optimize animations
const AnimationOptimizer = {
    // Use requestAnimationFrame for smooth animations
    raf(callback) {
        return requestAnimationFrame(callback);
    },
    
    // Cancel animation frame
    cancelRaf(id) {
        cancelAnimationFrame(id);
    },
    
    // Batch DOM reads and writes
    batchDOM(operations) {
        // Read phase
        const reads = operations.filter(op => op.type === 'read');
        const readResults = reads.map(op => op.fn());
        
        // Write phase
        const writes = operations.filter(op => op.type === 'write');
        writes.forEach(op => op.fn(readResults));
    }
};

// Network optimization
const NetworkOptimizer = {
    // Cache API responses
    cache: new Map(),
    
    async fetchWithCache(url, options = {}, ttl = 60000) {
        const key = url + JSON.stringify(options);
        const cached = this.cache.get(key);
        
        if (cached && Date.now() - cached.timestamp < ttl) {
            return cached.data;
        }
        
        const response = await fetch(url, options);
        const data = await response.json();
        
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        
        return data;
    },
    
    // Prefetch resources
    prefetch(url) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
    },
    
    // Preload critical resources
    preload(url, as = 'script') {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = url;
        link.as = as;
        document.head.appendChild(link);
    }
};

// Initialize performance optimizations
function initPerformanceOptimizations() {
    PerformanceMonitor.mark('perf-init-start');
    
    // Initialize lazy loader
    LazyLoader.init();
    
    // Start observing long tasks
    PerformanceMonitor.observeLongTasks();
    
    // Optimize scroll events
    const scrollHandler = RateLimiter.throttle(() => {
        // Scroll handling logic
    }, 16); // ~60fps
    
    window.addEventListener('scroll', scrollHandler, { passive: true });
    
    // Optimize resize events
    const resizeHandler = RateLimiter.debounce(() => {
        // Resize handling logic
    }, 250);
    
    window.addEventListener('resize', resizeHandler, { passive: true });
    
    // Schedule non-critical initialization
    RateLimiter.scheduleIdleWork(() => {
        // Initialize non-critical features
        console.log('[Perf] Idle work completed');
    });
    
    PerformanceMonitor.mark('perf-init-end');
    PerformanceMonitor.measure('perf-init', 'perf-init-start', 'perf-init-end');
    
    // Expose performance utilities globally
    window.PerformanceUtils = {
        monitor: PerformanceMonitor,
        lazyLoader: LazyLoader,
        rateLimiter: RateLimiter,
        memory: MemoryManager,
        animation: AnimationOptimizer,
        network: NetworkOptimizer
    };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPerformanceOptimizations);
} else {
    initPerformanceOptimizations();
}

// Export for module usage
export { PerformanceMonitor, LazyLoader, RateLimiter, MemoryManager, AnimationOptimizer, NetworkOptimizer };
