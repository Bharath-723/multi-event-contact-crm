'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Headset, LogOut, Loader2, ShieldAlert, PhoneCall } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface OperatorInfo {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  is_active: boolean;
}

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'ok' | 'denied'>('loading');

  // Skip layout for operator login page itself
  const isLoginPage = pathname === '/admin/operator';

  const loadSession = useCallback(async () => {
    if (isLoginPage) { setAuthState('ok'); return; }
    try {
      const res = await fetch('/api/operators/me');
      if (res.ok) {
        const d = await res.json();
        setOperator(d.operator);
        setAuthState('ok');
      } else {
        setAuthState('denied');
        router.push('/admin/operator');
      }
    } catch {
      setAuthState('denied');
      router.push('/admin/operator');
    }
  }, [isLoginPage, router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadSession(); }, [loadSession]);

  const handleLogout = async () => {
    await fetch('/api/operators/logout', { method: 'POST' });
    router.push('/admin/operator');
  };

  if (isLoginPage) return <>{children}</>;

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-purple-400">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
      </div>
    );
  }

  if (authState === 'denied') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-red-400 p-6 text-center">
        <ShieldAlert className="w-12 h-12 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
        <p className="text-slate-500 text-sm max-w-xs">You must be an authorized operator. Redirecting to login...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Top Nav Bar ───────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-30 h-14 px-4 sm:px-6 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md flex items-center justify-between"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white">
            <Headset className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-sm text-slate-100 block leading-none">Operator Portal</span>
            <span className="text-[10px] text-purple-400 font-semibold">Contact Management</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {operator && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/50 border border-slate-800/40">
              <div className="w-6 h-6 rounded-full bg-purple-900/40 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-[10px]">
                {operator.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-slate-300 font-medium">{operator.name}</span>
            </div>
          )}
          <Link href="/admin/operator/portal" className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-purple-400 transition-all" aria-label="Portal home">
            <PhoneCall className="w-4 h-4" />
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-950/20 text-xs font-bold transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </motion.header>

      {/* ─── Page Content ─────────────────────────────────────────── */}
      <main className="min-h-[calc(100vh-3.5rem)] p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
