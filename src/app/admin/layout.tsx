'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  ShieldAlert, LayoutDashboard, Users, LogOut, 
  Loader2, Menu, X, ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import NotificationBell from '@/components/notification-bell';
import ThemeToggle from '@/components/theme-toggle';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(pathname === '/admin' ? true : null);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 1. Session verification & gatekeeper check
  useEffect(() => {
    if (pathname === '/admin') return;

    async function verifyAdminAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          setIsAdmin(false);
          router.push('/admin');
          return;
        }

        // Verify if user exists in the admins table
        const { data: adminRecord, error } = await supabase
          .from('admins')
          .select('id, email')
          .eq('id', session.user.id)
          .single();

        if (error || !adminRecord) {
          console.warn('Unauthorized admin access attempt:', session.user.email);
          await supabase.auth.signOut();
          setIsAdmin(false);
          router.push('/admin');
          return;
        }

        setAdminEmail(adminRecord.email);
        setIsAdmin(true);
      } catch (err) {
        console.error('Admin verification exception:', err);
        setIsAdmin(false);
        router.push('/admin');
      }
    }

    verifyAdminAuth();

    // Set up auth state change listener to catch signouts
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (pathname === '/admin') return;
      if (event === 'SIGNED_OUT') {
        setIsAdmin(false);
        router.push('/admin');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  // 2. Sign Out Handler
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/admin');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Render loading state while checking authorization
  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-indigo-400">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <p className="text-slate-500 text-sm">Verifying administrator authorization...</p>
      </div>
    );
  }

  // Render error/unauthorized state briefly before redirect
  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-red-400 p-6 text-center">
        <ShieldAlert className="w-12 h-12 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
        <p className="text-slate-500 text-sm max-w-xs">
          You do not have administrative privileges. Redirecting to admin login...
        </p>
      </div>
    );
  }

  const sidebarLinks = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Registrations', path: '/admin/registrations', icon: Users },
  ];

  if (pathname === '/admin') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground relative">
      {/* BACKGROUND DECORATIONS */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-900/5 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-900/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-900 bg-slate-950/60 backdrop-blur-md shrink-0 transition-colors">
        {/* Brand Header */}
        <div className="h-16 px-6 border-b border-slate-900 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight text-slate-100 block">Rathayatra Admin</span>
            <span className="text-[10px] text-purple-400 font-semibold block -mt-0.5">Control Center</span>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-4 py-6 space-y-1.5">
          {sidebarLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.path;
            return (
              <Link key={link.path} href={link.path}>
                <span className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-purple-950/40 border border-purple-500/25 text-slate-100 shadow-[0_0_15px_rgba(139,92,246,0.1)]'
                    : 'text-slate-500 border border-transparent hover:bg-slate-900/50 hover:text-slate-100'
                }`}>
                  <Icon className="w-5 h-5" />
                  {link.name}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/40 transition-colors">
          <div className="px-3 py-2 rounded-xl bg-slate-900/30 border border-slate-800/40 mb-3 truncate">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Signed in as</p>
            <p className="text-xs text-slate-300 font-medium truncate">{adminEmail}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 hover:text-slate-100 hover:bg-red-950/20 hover:border-red-500/40 text-sm font-bold transition-all cursor-pointer"
          >
            <LogOut className="w-4.5 h-4.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* --- MOBILE DRAWERS --- */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"
            />
            {/* Drawer Content */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-64 bg-slate-950 border-r border-slate-900 z-50 p-6 flex flex-col justify-between md:hidden transition-colors"
            >
              <div className="space-y-8">
                {/* Close and Brand Header */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <span className="font-extrabold text-sm tracking-tight text-slate-100">Rathayatra Admin</span>
                  </div>
                  <button 
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 rounded-lg bg-slate-900 text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Nav Links */}
                <nav className="space-y-1.5">
                  {sidebarLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.path;
                    return (
                      <Link key={link.path} href={link.path} onClick={() => setMobileMenuOpen(false)}>
                        <span className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                          isActive 
                            ? 'bg-purple-950/40 border border-purple-500/25 text-slate-100'
                            : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-100'
                        }`}>
                          <Icon className="w-5 h-5" />
                          {link.name}
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Drawer Footer */}
              <div className="space-y-4">
                <div className="px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800/40 truncate">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Signed in as</p>
                  <p className="text-xs text-slate-300 font-medium truncate">{adminEmail}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 hover:text-slate-100 hover:bg-red-950/20 text-sm font-bold transition-all cursor-pointer"
                >
                  <LogOut className="w-4.5 h-4.5" />
                  Sign Out
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* --- MAIN PAGE WRAPPER --- */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Header Bar */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-900 flex justify-between items-center bg-slate-950/40 backdrop-blur-md sticky top-0 z-30 transition-colors">
          {/* Mobile hamburger */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-slate-900 text-slate-500 hover:text-slate-100 border border-slate-800 md:hidden cursor-pointer"
              aria-label="Open sidebar menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-extrabold text-lg text-slate-100 capitalize hidden sm:block">
              {pathname.split('/').pop()}
            </h2>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <NotificationBell />
            
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-900">
              <div className="w-8 h-8 rounded-full bg-purple-900/30 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs uppercase">
                {adminEmail.charAt(0) || 'A'}
              </div>
            </div>
          </div>
        </header>

        {/* Content Panel */}
        <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
