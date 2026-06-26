'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Avoid Hydration Mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />;
  }

  const themes = [
    { name: 'light', label: 'Light', icon: Sun },
    { name: 'dark', label: 'Dark', icon: Moon },
    { name: 'system', label: 'System', icon: Monitor },
  ];

  const currentTheme = themes.find((t) => t.name === theme) || themes[2];
  const Icon = currentTheme.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-850 text-slate-500 hover:text-slate-100 hover:border-slate-700 transition-all cursor-pointer"
        aria-label="Toggle theme"
      >
        <Icon className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop to close */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 w-32 rounded-xl bg-slate-950 border border-slate-900 shadow-xl z-50 overflow-hidden py-1 transition-colors"
            >
              {themes.map((t) => {
                const TIcon = t.icon;
                const isSelected = theme === t.name;
                return (
                  <button
                    key={t.name}
                    onClick={() => {
                      setTheme(t.name);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-purple-950/60 text-purple-300 font-bold border-l-2 border-purple-500' 
                        : 'text-slate-500 hover:bg-slate-900 hover:text-slate-100'
                    }`}
                  >
                    <TIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
