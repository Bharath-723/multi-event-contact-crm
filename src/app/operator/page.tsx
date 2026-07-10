'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Headset, Mail, Lock, Loader2, AlertCircle, PhoneCall } from 'lucide-react';
import { motion } from 'framer-motion';

export default function OperatorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check if already authenticated
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/operators/me');
        if (res.ok) {
          router.push('/operator/portal');
          return;
        }
      } catch {
        // not authenticated, stay on login
      } finally {
        setChecking(false);
      }
    }
    check();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setErrorMsg('Please enter email and password.'); return; }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/operators/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || 'Login failed.'); return; }
      router.push('/operator/portal');
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-purple">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </main>
    );
  }

  return (
    <main className="relative min-h-[100dvh] flex items-center justify-center py-4 sm:py-12 px-4 bg-gradient-purple overflow-hidden">
      <div className="absolute top-1/4 left-10 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-3xl p-6 sm:p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />

          <div className="text-center mb-6">
            <div className="inline-flex p-3 bg-purple-950/50 rounded-2xl border border-purple-500/20 mb-3 text-purple-400">
              <Headset className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground">Operator Portal</h1>
            <p className="text-slate-500 text-sm mt-1">Sign in to view and manage your assigned contacts</p>
          </div>

          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-200 text-xs flex gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Mail className="w-5 h-5" />
              </span>
              <input
                id="operator-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Operator Email"
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-foreground text-sm placeholder-slate-500"
              />
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Lock className="w-5 h-5" />
              </span>
              <input
                id="operator-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-foreground text-sm placeholder-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              id="operator-login-btn"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.2)]"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
              ) : (
                <><PhoneCall className="w-4 h-4" /> Sign In to Portal</>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-600 mt-5">
            This portal is for authorized call operators only.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
