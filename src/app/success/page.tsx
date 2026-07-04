'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Calendar, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function SuccessPage() {
  const [lastReg, setLastReg] = useState<{ interestedToVolunteer: 'Yes' | 'No'; volunteerSlotTime: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('rathayatra_last_registration');
      if (saved) {
        try {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setLastReg(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse registration session state:', e);
        }
      }
    }
  }, []);

  return (
    <div className="dark min-h-screen bg-[#030014] text-slate-100 overflow-x-hidden">
      <main className="relative min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-purple overflow-hidden">
        {/* Decorative Orbs */}
        <div className="absolute top-1/4 left-10 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="glass-card rounded-3xl p-8 text-center relative overflow-hidden"
          >
            {/* Top glow lines */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />

            {/* Success Checkmark Circle */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              className="w-20 h-20 bg-purple-950/60 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto mb-6 relative"
            >
              <CheckCircle2 className="w-12 h-12 text-purple-400" />
              <motion.div
                className="absolute inset-0 rounded-full border border-purple-500"
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 1.4, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
              />
            </motion.div>

            {/* Header */}
            <h1 className="text-3xl font-extrabold tracking-tight text-white mb-3">
              Registration Successful!
            </h1>

            <p className="text-slate-300 text-base mb-6 leading-relaxed">
              Thank you for registering. We look forward to seeing you and serving together at the grand festival on 19-july-2026.
            </p>

            <div className="border-t border-slate-800/80 my-6 pt-6 text-left space-y-4">
              <div className="flex gap-3 text-slate-300 text-sm">
                <Calendar className="w-5 h-5 text-purple-400 shrink-0" />
                <div>
                  <p className="font-semibold text-white">Event Details</p>
                  <p className="text-slate-400 text-xs">Rathayatra Festival 2026</p>

                  {lastReg?.interestedToVolunteer === 'Yes' && lastReg.volunteerSlotTime && (
                    <div className="mt-2.5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Volunteer Time Slot</p>
                      <p className="text-purple-300 text-sm font-semibold">{lastReg.volunteerSlotTime}</p>
                    </div>
                  )}
                </div>
              </div>

              {lastReg?.interestedToVolunteer === 'Yes' && (
                <div className="flex gap-3 text-slate-300 text-sm">
                  <Sparkles className="w-5 h-5 text-purple-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-white">Service Allocation</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Our volunteer coordination team will contact you regarding your service allocation before the event.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Back button */}
            <Link href="/">
              <button className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer group">
                Register Another Person
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
          </motion.div>

          <p className="text-center text-xs text-slate-500 mt-6">
            Need support? Please contact event coordinators at the helpdesk.
          </p>
        </div>
      </main>
    </div>
  );
}
