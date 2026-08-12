'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Play, ExternalLink, Sparkles, Star } from 'lucide-react';

function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

export default function RathayatraCompletePage() {
  return (
    <div className="dark min-h-screen bg-[#030014] text-slate-100 overflow-x-hidden">
      <main className="relative min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-purple overflow-hidden">
        {/* Background Glow Orbs */}
        <div className="absolute top-1/6 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/3 left-10 w-96 h-96 bg-amber-600/5 rounded-full blur-[100px] pointer-events-none" />
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-3xl flex flex-col items-center space-y-8">

          {/* Main Completion Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full glass-card rounded-3xl p-8 sm:p-12 text-center border border-purple-500/20 shadow-2xl backdrop-blur-xl bg-slate-950/80 relative overflow-hidden flex flex-col items-center space-y-6"
          >
            {/* Top Accent Bar */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-purple-500 to-indigo-500" />

            {/* Badge */}
            <motion.span
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300 text-xs font-bold tracking-wide shadow-inner"
            >
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              Ratha Yatra 2026 — Festival Completed
            </motion.span>

            {/* Animated Heart */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.15 }}
              className="w-20 h-20 bg-purple-950/80 border border-purple-500/40 rounded-full flex items-center justify-center relative shadow-lg shadow-purple-500/20 my-2"
            >
              <Heart className="w-10 h-10 text-purple-400 fill-purple-400/30" />
              <motion.div
                className="absolute inset-0 rounded-full border border-purple-400"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.45, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeOut' }}
              />
            </motion.div>

            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-3 max-w-xl"
            >
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Jai Jagannath! 🙏
              </h1>
              <p className="text-amber-300 font-bold text-lg sm:text-xl tracking-wide">
                Ratha Yatra 2026 has been completed!
              </p>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                With the divine blessings of Lord Jagannath, Baladeva, and Subhadra Maharani, the grand Ratha Yatra festival of 2026 was celebrated beautifully.
              </p>
              <p className="text-slate-400 text-sm leading-relaxed">
                A heartfelt thank you to every volunteer, donor, and devotee who made this festival a divine success. Your seva will always be remembered.
              </p>
            </motion.div>

            {/* Registrations Closed Notice */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-left text-xs sm:text-sm text-slate-300 space-y-2"
            >
              <p className="font-semibold text-purple-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Registrations are now closed
              </p>
              <p className="text-slate-400 leading-relaxed">
                Volunteer registrations for Ratha Yatra 2026 have been closed. Thank you for your interest in serving the Lord. Stay connected with us for upcoming festivals and events.
              </p>
            </motion.div>
          </motion.div>

          {/* Festival Memories Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full space-y-5"
          >
            <div className="text-center space-y-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center justify-center gap-2">
                <YoutubeIcon className="w-6 h-6 text-red-500" />
                Festival Memories
              </h2>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                Relive the memories created during the festival.
              </p>
            </div>

            {/* YouTube Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              
              {/* Card 1: Golden Temple */}
              <a
                href="https://www.youtube.com/@HareKrishnaGoldenTempleHyd"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Watch Hare Krishna Golden Temple Hyderabad YouTube Channel"
                className="group glass-card rounded-2xl p-5 border border-slate-800 hover:border-red-500/40 bg-slate-950/70 hover:bg-slate-900/90 transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between space-y-4 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-950/50 border border-red-500/30 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                      <YoutubeIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-red-400 transition-colors">
                        Hare Krishna Golden Temple
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Golden Temple, Hyderabad
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors shrink-0" />
                </div>
                <div className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 group-hover:from-red-500 group-hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md">
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Watch Festival Memories</span>
                </div>
              </a>

              {/* Card 2: Heritage Tower */}
              <a
                href="https://www.youtube.com/@HareKrishnaHeritageTower"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Watch Hare Krishna Heritage Tower YouTube Channel"
                className="group glass-card rounded-2xl p-5 border border-slate-800 hover:border-red-500/40 bg-slate-950/70 hover:bg-slate-900/90 transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between space-y-4 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-950/50 border border-red-500/30 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                      <YoutubeIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-red-400 transition-colors">
                        Hare Krishna Heritage Tower
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Heritage Tower, Hyderabad
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors shrink-0" />
                </div>
                <div className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 group-hover:from-red-500 group-hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md">
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Watch Festival Memories</span>
                </div>
              </a>
            </div>
          </motion.div>

          {/* Footer */}
          <motion.footer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-center text-xs text-slate-500 space-y-1 pt-2"
          >
            <p className="text-amber-400 font-bold text-sm tracking-wide">Hare Krishna</p>
            <p>© 2026 Hare Krishna Movement. All rights reserved.</p>
          </motion.footer>
        </div>
      </main>
    </div>
  );
}
