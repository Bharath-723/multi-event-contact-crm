'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Shield, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isRedirectingToDashboard, setIsRedirectingToDashboard] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Check if user is already logged in as admin
  useEffect(() => {
    async function checkCurrentSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Verify admin table
          const { data: adminRecord, error: adminErr } = await supabase
            .from('admins')
            .select('id')
            .eq('id', session.user.id)
            .single();

          if (adminRecord && !adminErr) {
            setIsRedirectingToDashboard(true);
            router.push('/admin/dashboard');
            return;
          }
        }
      } catch (err) {
        console.error('Session check error:', err);
      } finally {
        setCheckingSession(false);
      }
    }
    checkCurrentSession();
  }, [router]);

  // 2. Handle Login Submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Step A: Sign in via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Authentication failed. No user found.');
      }

      // Step B: Check if the logged-in user is listed in the 'admins' table
      const { data: adminRecord, error: adminError } = await supabase
        .from('admins')
        .select('id')
        .eq('id', authData.user.id)
        .single();

      if (adminError || !adminRecord) {
        // Sign out user since they are authenticated but not authorized admins
        await supabase.auth.signOut();
        throw new Error('Access denied. You do not have administrator privileges.');
      }

      // Success! Route to dashboard
      setIsRedirectingToDashboard(true);
      router.push('/admin/dashboard');
      
    } catch (err) {
      console.error('Login error:', err);
      const message = err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSession || isRedirectingToDashboard) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#0b66a5] text-center p-6 animate-pulse">
        <div className="relative max-w-sm flex flex-col items-center p-8 bg-[#0b66a5] rounded-3xl">
          {/* Logo */}
          <div className="mb-6 relative w-[200px] h-[129px] overflow-hidden">
            <Image 
              src="/hkm-logo.png" 
              alt="Hare Krishna Movement" 
              width={200} 
              height={129} 
              priority
              className="object-contain"
            />
          </div>
          <h2 className="text-xl font-bold text-white mb-2 tracking-wide">
            Loading Dashboard...
          </h2>
          <p className="text-white/95 text-sm mb-6">
            Please wait...
          </p>
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-white/20" />
            <div className="absolute inset-0 rounded-full border-4 border-t-[#f1a817] animate-spin" />
          </div>
        </div>
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
          className="glass-card rounded-3xl p-5 sm:p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
          
          <div className="text-center mb-5 sm:mb-8">
            <div className="inline-flex p-2.5 sm:p-3 bg-purple-950/50 rounded-2xl border border-purple-500/20 mb-2 sm:mb-3 text-purple-400">
              <Shield className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">Admin Portal</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">Sign in to manage registrations & analytics</p>
          </div>

          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 sm:mb-5 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-200 text-xs flex gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Mail className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full pl-11 pr-4 py-2.5 sm:py-3 rounded-xl glass-input text-foreground text-sm placeholder-slate-500"
              />
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Lock className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full pl-11 pr-4 py-2.5 sm:py-3 rounded-xl glass-input text-foreground text-sm placeholder-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.2)]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 animate-spin" /> Verifying Credentials...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </main>
  );
}
