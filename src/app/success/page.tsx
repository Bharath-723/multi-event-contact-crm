'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Calendar, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { COMMUNITY_LINKS } from '@/lib/constants/community-links';

export default function SuccessPage() {
  const [lastReg, setLastReg] = useState<{ interestedToVolunteer: 'Yes' | 'No'; volunteerSlotTime: string; gender?: string } | null>(null);

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

  const communityLink = lastReg?.gender === 'Female' ? COMMUNITY_LINKS.female : COMMUNITY_LINKS.male;

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
              Thank you for registering. We look forward to seeing you and serving together at the grand festival on    19-july-2026.
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

            {/* WhatsApp Community Card */}
            <div className="mb-6 p-5 rounded-2xl bg-purple-950/20 border border-purple-500/10 text-center relative overflow-hidden space-y-4">
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/20 to-transparent" />
              
              <div className="w-12 h-12 rounded-full bg-green-950/40 border border-green-500/20 flex items-center justify-center mx-auto text-[#25D366]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6"
                >
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.33 4.982L2 22l5.233-1.371a9.994 9.994 0 004.78 1.218h.004c5.502 0 9.985-4.479 9.986-9.985a9.96 9.96 0 00-2.926-7.062A9.97 9.97 0 0012.012 2zm5.718 13.962c-.244.686-1.42 1.258-1.956 1.341-.479.075-.972.115-3.076-.714-2.502-.988-4.108-3.529-4.232-3.695-.125-.165-1.01-1.34-1.01-2.557 0-1.217.636-1.815.862-2.062.227-.247.495-.309.661-.309.165 0 .33.003.475.01.149.007.348-.056.545.422.2.489.683 1.666.743 1.79.059.122.099.264.019.425-.08.162-.12.261-.24.402-.12.142-.25.316-.356.425-.119.122-.244.254-.105.492.138.238.614 1.013 1.314 1.637.902.802 1.66 1.05 1.899 1.168.238.119.376.1.515-.062.138-.162.604-.703.766-.944.162-.241.323-.201.545-.119.221.082 1.402.66 1.643.78.241.12.402.181.462.284.059.102.059.59-.185 1.276z"/>
                </svg>
              </div>

              <div className="space-y-1">
                <h3 className="text-white font-bold text-base">Stay Connected</h3>
                <p className="text-slate-300 text-xs leading-relaxed max-w-sm mx-auto">
                  Kindly join our official WhatsApp community to receive important updates about the Rathayatra Festival, volunteer coordination, announcements, and important event notifications.
                </p>
              </div>

              <a
                href={communityLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join our official WhatsApp community"
                className="inline-flex w-full items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-slate-950 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-green-950/20 active:scale-[0.98] hover:scale-[1.02] cursor-pointer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.33 4.982L2 22l5.233-1.371a9.994 9.994 0 004.78 1.218h.004c5.502 0 9.985-4.479 9.986-9.985a9.96 9.96 0 00-2.926-7.062A9.97 9.97 0 0012.012 2zm5.718 13.962c-.244.686-1.42 1.258-1.956 1.341-.479.075-.972.115-3.076-.714-2.502-.988-4.108-3.529-4.232-3.695-.125-.165-1.01-1.34-1.01-2.557 0-1.217.636-1.815.862-2.062.227-.247.495-.309.661-.309.165 0 .33.003.475.01.149.007.348-.056.545.422.2.489.683 1.666.743 1.79.059.122.099.264.019.425-.08.162-.12.261-.24.402-.12.142-.25.316-.356.425-.119.122-.244.254-.105.492.138.238.614 1.013 1.314 1.637.902.802 1.66 1.05 1.899 1.168.238.119.376.1.515-.062.138-.162.604-.703.766-.944.162-.241.323-.201.545-.119.221.082 1.402.66 1.643.78.241.12.402.181.462.284.059.102.059.59-.185 1.276z"/>
                </svg>
                Join WhatsApp Community
              </a>
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
