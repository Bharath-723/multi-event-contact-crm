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

    // 1. Listen for the controllerchange event to reload the page once the new SW takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    // 2. Helper function to monitor state changes of an installing worker
    const trackInstalling = (worker: ServiceWorker) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          setWaitingWorker(worker);
          setShowBanner(true);
        }
      });
    };

    // 3. Register/Inspect service worker registration
    navigator.serviceWorker.ready.then((reg) => {
      // If there's already a waiting worker, show the banner
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setShowBanner(true);
        return;
      }

      // If a worker is installing, track its progress
      if (reg.installing) {
        trackInstalling(reg.installing);
        return;
      }

      // Listen for new service workers installing in the future
      reg.addEventListener('updatefound', () => {
        if (reg.installing) {
          trackInstalling(reg.installing);
        }
      });
    });

    // 4. Periodically check for updates on the server (every 10 minutes)
    const updateInterval = setInterval(() => {
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch((err) => {
          console.debug('Service Worker update check failed:', err);
        });
      });
    }, 10 * 60 * 1000);

    return () => clearInterval(updateInterval);
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      // Send message to waiting service worker to skipWaiting
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
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
              {/* Styled HKM Branding Indicator */}
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-650 to-indigo-600 text-white shadow-md">
                <Sparkles className="h-4 w-4 text-purple-200 animate-pulse" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold tracking-wider text-purple-400 uppercase">
                  HKM Rathayatra
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  Update Available
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
            A new version of the Volunteer Registration app is available. Update now to access the latest features and fixes.
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full mt-1">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2 px-3 rounded-xl border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 font-semibold text-xs transition-all text-center cursor-pointer"
            >
              Dismiss
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
