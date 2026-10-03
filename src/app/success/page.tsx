'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, RotateCcw, Sparkles, ExternalLink, Play, MessageCircle } from 'lucide-react';
import { KRISHNASHTAMI_WHATSAPP_COMMUNITY } from '@/lib/constants/community-links';

function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

export default function RedoneSuccessPage() {
  const [gender, setGender] = useState<'Male' | 'Female' | null>(null);
  const [isFeedback, setIsFeedback] = useState<boolean>(false);
  const [isContactsRegister, setIsContactsRegister] = useState<boolean>(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const typeParam = params.get('type') || params.get('form');
        if (typeParam === 'feedback') {
          setIsFeedback(true);
        }
        if (typeParam === 'contacts_register') {
          setIsContactsRegister(true);
        }

        const rawData = sessionStorage.getItem('krishnashtami_last_registration');
        if (rawData) {
          const parsed = JSON.parse(rawData);
          if (parsed.gender === 'Male' || parsed.gender === 'Female') {
            setGender(parsed.gender);
          }
        }
      } catch (err) {
        console.error('Error reading registration session:', err);
      }
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const whatsappUrl = gender === 'Male'
    ? KRISHNASHTAMI_WHATSAPP_COMMUNITY.male
    : gender === 'Female'
    ? KRISHNASHTAMI_WHATSAPP_COMMUNITY.female
    : null;

  const buttonLabel = gender === 'Male'
    ? 'Join Male WhatsApp Community'
    : gender === 'Female'
    ? 'Join Female WhatsApp Community'
    : 'Join Krishnashtami WhatsApp Community';

  // Dedicated clean view for Feedback Form Submission
  if (isFeedback) {
    return (
      <div className="dark min-h-screen bg-[#030014] text-slate-100 overflow-x-hidden">
        <main className="relative min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-purple overflow-hidden">
          {/* Decorative background glow orbs */}
          <div className="absolute top-1/6 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[140px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute top-1/3 left-10 w-96 h-96 bg-pink-600/10 rounded-full blur-[100px] pointer-events-none" />

          {/* Decorative Grid */}
          <div 
            className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" 
          />

          <div className="relative z-10 w-full max-w-xl flex flex-col items-center space-y-8 my-auto">
            
            {/* Feedback Success Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="w-full glass-card rounded-3xl p-8 sm:p-12 text-center border border-purple-500/20 shadow-2xl backdrop-blur-xl bg-slate-950/80 relative overflow-hidden flex flex-col items-center space-y-6"
            >
              {/* Top Glowing Accent Bar */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-purple-500 to-indigo-500" />

              {/* Glowing Badge */}
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-xs font-bold tracking-wide shadow-inner">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                Feedback — Submission Confirmed
              </span>

              {/* Animated Ripple Checkmark Circle */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.15 }}
                className="w-20 h-20 bg-purple-950/80 border border-purple-500/40 rounded-full flex items-center justify-center relative shadow-lg shadow-purple-500/20 my-2"
              >
                <CheckCircle2 className="w-12 h-12 text-purple-400" />
                <motion.div
                  className="absolute inset-0 rounded-full border border-purple-400"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.45, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'easeOut' }}
                />
              </motion.div>

              {/* Header Title & Subtitle */}
              <div className="space-y-2 max-w-md">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                  Feedback Submitted!
                </h1>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                  Thank you for your response. Your feedback details have been successfully recorded.
                </p>
              </div>

              {/* Action Button */}
              <div className="w-full pt-2">
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('feedback_registration_draft');
                      sessionStorage.clear();
                    }
                    window.location.href = '/feedback?reset=true';
                  }}
                  className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/20 active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Submit Another Response
                </button>
              </div>
            </motion.div>

            {/* Footer */}
            <footer className="text-center text-xs text-slate-500 space-y-1 pt-2">
              <p className="text-amber-400 font-bold text-sm tracking-wide">Hare Krishna</p>
              <p>© 2026 Hare Krishna Movement. All rights reserved.</p>
            </footer>

          </div>
        </main>
      </div>
    );
  }

  // Contacts Register Success View (light theme, dark-mode proof explicit hex styles)
  if (isContactsRegister) {
    return (
      <div style={{ backgroundColor: '#f8fafc', color: '#172033' }} className="min-h-screen overflow-x-hidden">
        <main className="relative min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
          {/* Subtle background accents */}
          <div className="absolute top-1/4 left-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

          <div className="relative z-10 w-full max-w-xl flex flex-col items-center space-y-8 my-auto">

            {/* Success Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#172033' }}
              className="w-full rounded-3xl p-8 sm:p-12 text-center border shadow-2xl relative overflow-hidden flex flex-col items-center space-y-6"
            >
              {/* Top Accent Bar */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

              {/* Badge */}
              <span
                style={{ backgroundColor: '#eef2ff', borderColor: '#c7d2fe', color: '#4338ca' }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-xs font-bold tracking-wide"
              >
                <Sparkles style={{ color: '#4f46e5' }} className="w-4 h-4" />
                Registration Confirmed
              </span>

              {/* Animated Checkmark */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.15 }}
                style={{ backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }}
                className="w-20 h-20 border rounded-full flex items-center justify-center relative shadow-md my-2"
              >
                <CheckCircle2 style={{ color: '#4338ca' }} className="w-12 h-12" />
                <motion.div
                  style={{ borderColor: '#818cf8' }}
                  className="absolute inset-0 rounded-full border"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.45, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'easeOut' }}
                />
              </motion.div>

              {/* Title */}
              <div className="space-y-2 max-w-md">
                <h1 style={{ color: '#172033' }} className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                  Registration Successful!
                </h1>
                <p style={{ color: '#334155' }} className="text-sm sm:text-base leading-relaxed">
                  Your contact details have been successfully recorded. Our team will reach out to you soon.
                </p>
              </div>

              {/* Info Box */}
              <div
                style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}
                className="w-full border rounded-2xl p-5 text-left text-xs sm:text-sm space-y-2"
              >
                <p style={{ color: '#4338ca' }} className="font-semibold flex items-center gap-2">
                  <Sparkles style={{ color: '#4f46e5' }} className="w-4 h-4" />
                  What happens next?
                </p>
                <p style={{ color: '#475569' }} className="leading-relaxed">
                  Our co-ordinators will review your contact details and reach out regarding upcoming events and workshops.
                </p>
              </div>

              {/* Action Button */}
              <div className="w-full pt-2">
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('contacts_register_draft');
                    }
                    window.location.href = '/contacts-register?reset=true';
                  }}
                  style={{ color: '#ffffff' }}
                  className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 cursor-pointer"
                >
                  <RotateCcw style={{ color: '#ffffff' }} className="w-4 h-4" />
                  Register Another Contact
                </button>
              </div>
            </motion.div>

            {/* Footer */}
            <footer className="text-center text-xs space-y-1 pt-2">
              <p style={{ color: '#4338ca' }} className="font-bold text-sm tracking-wide">Hare Krishna</p>
              <p style={{ color: '#475569' }}>© 2026 Hare Krishna Movement. All rights reserved.</p>
            </footer>

          </div>
        </main>
      </div>
    );
  }

  // Untouched Default Krishnashtami Success View
  return (
    <div className="dark min-h-screen bg-[#030014] text-slate-100 overflow-x-hidden">
      <main className="relative min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-purple overflow-hidden">
        {/* Decorative background glow orbs */}
        <div className="absolute top-1/6 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/3 left-10 w-96 h-96 bg-pink-600/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Decorative Grid */}
        <div 
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" 
        />

        <div className="relative z-10 w-full max-w-3xl flex flex-col items-center space-y-8 my-auto">
          
          {/* Main Success & Gratitude Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full glass-card rounded-3xl p-8 sm:p-12 text-center border border-purple-500/20 shadow-2xl backdrop-blur-xl bg-slate-950/80 relative overflow-hidden flex flex-col items-center space-y-6"
          >
            {/* Top Glowing Accent Bar */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-purple-500 to-indigo-500" />

            {/* Glowing Badge */}
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-xs font-bold tracking-wide shadow-inner">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              Krishnashtami 2026 — Registration Confirmed
            </span>

            {/* Animated Ripple Checkmark Circle */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.15 }}
              className="w-20 h-20 bg-purple-950/80 border border-purple-500/40 rounded-full flex items-center justify-center relative shadow-lg shadow-purple-500/20 my-2"
            >
              <CheckCircle2 className="w-12 h-12 text-purple-400" />
              <motion.div
                className="absolute inset-0 rounded-full border border-purple-400"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.45, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeOut' }}
              />
            </motion.div>

            {/* Header Title & Subtitle */}
            <div className="space-y-2 max-w-xl">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Thank You for Registering!
              </h1>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                With the divine blessings of Lord Krishna, your registration details for Krishnashtami 2026 have been successfully recorded.
              </p>
            </div>

            {/* Gender-Based WhatsApp Community Link Section */}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full max-w-md py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-600/20"
              >
                <MessageCircle className="w-5 h-5" />
                {buttonLabel}
                <ExternalLink className="w-4 h-4 opacity-80" />
              </a>
            )}

            {/* Message Detail Box */}
            <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-left text-xs sm:text-sm text-slate-300 space-y-2">
              <p className="font-semibold text-purple-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                What happens next?
              </p>
              <p className="text-slate-300 leading-relaxed">
                Our co-ordinators will review your registration. If you selected a volunteer slot or opted for prasadam, our team will get in touch with slot details and service information.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="w-full pt-2">
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('feedback_registration_draft');
                    localStorage.removeItem('krishnashtami_registration_draft');
                    sessionStorage.clear();
                  }
                  window.location.href = '/?reset=true';
                }}
                className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/20 active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Submit Another Response
              </button>
            </div>

          </motion.div>

          {/* Festival Memories & Official YouTube Section */}
          <div className="w-full space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center justify-center gap-2">
                <YoutubeIcon className="w-6 h-6 text-red-500" />
                Explore Festival Kirtans & Celebrations
              </h2>
              <p className="text-xs text-slate-400">
                Watch official highlights and celebrations on our YouTube channels
              </p>
            </div>

            {/* YouTube Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              
              {/* Card 1: Golden Temple */}
              <a
                href="https://www.youtube.com/@HareKrishnaGoldenTempleHyd"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Watch Hare Krishna Golden Temple YouTube Memories"
                className="group glass-card rounded-2xl p-5 border border-slate-800 hover:border-red-500/40 bg-slate-950/70 hover:bg-slate-900/90 transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between space-y-4 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-950/50 border border-red-500/30 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                      <YoutubeIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-red-400 transition-colors">
                        Golden Temple
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Hare Krishna Golden Temple
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors" />
                </div>

                <div className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md">
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Watch Videos</span>
                </div>
              </a>

              {/* Card 2: Heritage Tower */}
              <a
                href="https://www.youtube.com/@HareKrishnaHeritageTower"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Watch Hare Krishna Heritage Tower YouTube Memories"
                className="group glass-card rounded-2xl p-5 border border-slate-800 hover:border-red-500/40 bg-slate-950/70 hover:bg-slate-900/90 transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between space-y-4 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-950/50 border border-red-500/30 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                      <YoutubeIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-red-400 transition-colors">
                        Heritage Tower
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Hare Krishna Heritage Tower
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors" />
                </div>

                <div className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md">
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Watch Videos</span>
                </div>
              </a>

            </div>
          </div>

          {/* Footer Info */}
          <footer className="text-center text-xs text-slate-500 space-y-1 pt-2">
            <p className="text-amber-400 font-bold text-sm tracking-wide">Hare Krishna</p>
            <p>© 2026 Hare Krishna Movement. All rights reserved.</p>
          </footer>

        </div>
      </main>
    </div>
  );
}
