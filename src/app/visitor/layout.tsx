'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import ThemeToggle from '@/components/theme-toggle';

export default function VisitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground relative flex flex-col">
      {/* BACKGROUND DECORATIONS */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-900/5 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-900/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* --- PUBLIC BRAND HEADER --- */}
      <header className="h-16 px-4 sm:px-6 border-b border-slate-900 flex justify-between items-center bg-slate-950/40 backdrop-blur-md sticky top-0 z-30 transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight text-slate-100 block">Rathayatra Festival</span>
            <span className="text-[10px] text-purple-400 font-semibold block -mt-0.5">Visitor Check-In Center</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </header>

      {/* --- CONTENT AREA --- */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
