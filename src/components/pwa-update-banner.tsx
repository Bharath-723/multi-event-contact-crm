'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PwaUpdateBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV !== 'production'
    ) {
      return;
    }

    // 1. Listen for controllerchange (fires when the new SW calls skipWaiting() and activates)
    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[PWA] Controller changed. Reloading page for new version...');
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // 2. Track service worker installation states to catch when it enters waiting (installed) state
    const trackInstalling = (worker: ServiceWorker) => {
      if (worker.state === 'installed') {
        console.log('[PWA] Worker is already installed (waiting). Showing banner...');
        setWaitingWorker(worker);
        setShowBanner(true);
        return;
      }
      worker.addEventListener('statechange', () => {
        console.log('[PWA] Installing worker state changed:', worker.state);
        if (worker.state === 'installed') {
          setWaitingWorker(worker);
          setShowBanner(true);
        }
      });
    };

    // 3. Register the Service Worker with updateViaCache: 'none'
    // This tells Android Chrome / Samsung Internet to bypass HTTP cache for sw.js
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        console.log('[PWA] Service Worker registered successfully scope:', reg.scope);

        // Force check for update immediately on load
        reg.update().catch((err) => {
          console.warn('[PWA] Manual SW update check failed on register:', err);
        });

        // A. Check if there is already a waiting worker
        if (reg.waiting) {
          console.log('[PWA] Found an existing waiting worker.');
          setWaitingWorker(reg.waiting);
          setShowBanner(true);
        }

        // B. Check if there is an installing worker currently
        if (reg.installing) {
          console.log('[PWA] Found an active installing worker.');
          trackInstalling(reg.installing);
        }

        // C. Listen for future updates
        reg.addEventListener('updatefound', () => {
          console.log('[PWA] Update found. New service worker installing...');
          if (reg.installing) {
            trackInstalling(reg.installing);
          }
        });
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });

    // 4. Periodically check for updates on the server (every 5 minutes)
    const updateInterval = setInterval(() => {
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch((err) => {
          console.debug('[PWA] Periodic SW update check failed:', err);
        });
      });
    }, 5 * 60 * 1000);

    // 5. Trigger update check when app transitions to visible (e.g. opened from background on Android)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.ready.then((reg) => {
          console.log('[PWA] App visible. Triggering immediate update check...');
          reg.update().catch((err) => {
            console.debug('[PWA] Visibility SW update check failed:', err);
          });
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(updateInterval);
    };
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      console.log('[PWA] User triggered update. Activating new Service Worker...');
      // Post message to waiting service worker to skipWaiting
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Fallback reload if worker reference is lost but banner was shown
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed z-50 bottom-4 right-4 left-4 md:left-auto md:w-96 p-4 rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.15)] flex flex-col gap-3"
        >
          {/* Header with HKM Branding & Close */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-605 to-indigo-600 text-white shadow-md">
                <Sparkles className="h-4 w-4 text-purple-200 animate-pulse" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold tracking-wider text-purple-400 uppercase">
                  HKM Rathayatra
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  New Version Available
                </span>
              </div>
            </div>
            
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg hover:bg-slate-900 text-slate-500 hover:text-slate-200 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Banner Description */}
          <p className="text-xs text-slate-400 text-left leading-relaxed">
            A newer version of Rathayatra is available.
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full mt-1">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2 px-3 rounded-xl border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 font-semibold text-xs transition-all text-center cursor-pointer"
            >
              Later
            </button>
            <button
              onClick={handleUpdate}
              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs transition-all shadow-md shadow-purple-500/10 hover:shadow-purple-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3 animate-spin-slow" />
              Update Now
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
