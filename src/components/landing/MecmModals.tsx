'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  CheckCircle2,
  Send,
  LayoutDashboard,
  Users,
  Headphones,
  QrCode,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface MecmModalsProps {
  watchDemoOpen: boolean;
  onCloseWatchDemo: () => void;
  requestDemoOpen: boolean;
  onCloseRequestDemo: () => void;
  getStartedOpen: boolean;
  onCloseGetStarted: () => void;
}

export default function MecmModals({
  watchDemoOpen,
  onCloseWatchDemo,
  requestDemoOpen,
  onCloseRequestDemo,
  getStartedOpen,
  onCloseGetStarted,
}: MecmModalsProps) {
  // Video player demo state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);

  // Request demo modal form state
  const [demoForm, setDemoForm] = useState({
    name: '',
    email: '',
    organization: '',
    scale: '1000-5000',
    notes: '',
  });
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseWatchDemo();
        onCloseRequestDemo();
        onCloseGetStarted();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCloseWatchDemo, onCloseRequestDemo, onCloseGetStarted]);

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoForm.name || !demoForm.email) return;
    setDemoLoading(true);
    setTimeout(() => {
      setDemoLoading(false);
      setDemoSubmitted(true);
    }, 600);
  };

  const chapters = [
    { title: '1. Multi-Event Overview', time: '0:00' },
    { title: '2. Dynamic Volunteer CRM', time: '1:15' },
    { title: '3. Operator Dispatch & Calling', time: '2:40' },
    { title: '4. QR Gate Check-in & Sync', time: '3:55' },
  ];

  return (
    <>
      {/* ----------------- 1. Watch Demo Video Modal ----------------- */}
      {watchDemoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-4xl bg-[#1d1233] border border-[#3e256b] rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#251544] border-b border-[#3e256b] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
                  <Play className="w-3 h-3 fill-white ml-0.5" />
                </div>
                <h3 className="font-extrabold text-white text-base tracking-tight">
                  MECM Platform Interactive Product Tour
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseWatchDemo}
                className="p-1.5 rounded-full hover:bg-white/10 text-purple-300 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player Display Canvas */}
            <div className="relative aspect-video w-full bg-[#0d061c] flex items-center justify-center overflow-hidden group">
              {/* Animated visual dashboard preview simulation */}
              <div className="absolute inset-0 p-6 sm:p-10 flex flex-col justify-between opacity-90">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                    <span className="text-xs font-mono text-purple-300">
                      LIVE DEMO SIMULATION • CHAPTER {activeChapter + 1}: {chapters[activeChapter].title}
                    </span>
                  </div>
                  <span className="text-xs font-mono bg-purple-900/60 border border-purple-500/40 px-2 py-0.5 rounded text-purple-200">
                    HD 1080p
                  </span>
                </div>

                {/* Simulated dynamic telemetry visual */}
                <div className="my-auto text-center space-y-4">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200 text-sm">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>Real-Time Concurrency & Gate Validation</span>
                  </div>
                  <h4 className="text-2xl sm:text-3xl font-black text-white">
                    {chapters[activeChapter].title}
                  </h4>
                  <p className="text-purple-300/80 text-sm max-w-lg mx-auto">
                    Demonstrating automated operator capacity management, dry-run previews, and
                    instant offline-first gate QR token validation.
                  </p>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-fuchsia-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${(activeChapter + 1) * 25}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-purple-300/80 font-mono">
                    <span>{chapters[activeChapter].time}</span>
                    <span>05:15</span>
                  </div>
                </div>
              </div>

              {/* Player Controls Overlay */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-1.5 hover:text-purple-400 transition-colors"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1.5 hover:text-purple-400 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <span className="text-xs font-mono text-purple-200">
                    MECM System Walkthrough
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (document.fullscreenElement) {
                        document.exitFullscreen();
                      } else {
                        document.documentElement.requestFullscreen?.();
                      }
                    }}
                    className="p-1.5 hover:text-purple-400 transition-colors"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Chapter Selection Bar */}
            <div className="px-6 py-3 bg-[#241443] border-t border-[#3e256b] grid grid-cols-2 sm:grid-cols-4 gap-2">
              {chapters.map((ch, idx) => (
                <button
                  key={ch.title}
                  type="button"
                  onClick={() => setActiveChapter(idx)}
                  className={`text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeChapter === idx
                      ? 'bg-purple-600 text-white font-bold shadow-xs'
                      : 'hover:bg-white/10 text-purple-300'
                  }`}
                >
                  <span className="block truncate">{ch.title}</span>
                  <span className="text-[10px] opacity-75">{ch.time}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- 2. Request Demo Modal ----------------- */}
      {requestDemoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#ded5ee] text-[#1c0f33]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onCloseRequestDemo}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-2xl font-black text-[#1c0f33] tracking-tight mb-1">
              Request Platform Demo
            </h3>
            <p className="text-xs sm:text-sm text-[#5a4d75] mb-6">
              Experience MECM configured with your upcoming festival numbers.
            </p>

            {demoSubmitted ? (
              <div className="py-8 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h4 className="text-xl font-bold text-[#231241]">
                  Demo Request Received!
                </h4>
                <p className="text-sm text-[#5a4d75]">
                  Thank you, <span className="font-semibold text-[#3c126d]">{demoForm.name}</span>.
                  We will contact you at <span className="font-semibold text-[#3c126d]">{demoForm.email}</span> within 24 hours.
                </p>
                <button
                  type="button"
                  onClick={onCloseRequestDemo}
                  className="mt-4 px-6 py-2.5 rounded-xl bg-[#3c126d] text-white text-xs font-bold"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleDemoSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#3a2c53] uppercase mb-1">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={demoForm.name}
                    onChange={(e) => setDemoForm({ ...demoForm, name: e.target.value })}
                    placeholder="e.g. Ramesh Patel"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] text-sm outline-hidden bg-[#faf9fd]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3a2c53] uppercase mb-1">
                    Work / Temple Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={demoForm.email}
                    onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })}
                    placeholder="ramesh@temple.org"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] text-sm outline-hidden bg-[#faf9fd]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#3a2c53] uppercase mb-1">
                      Organization
                    </label>
                    <input
                      type="text"
                      value={demoForm.organization}
                      onChange={(e) => setDemoForm({ ...demoForm, organization: e.target.value })}
                      placeholder="HKM Temple"
                      className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] text-sm outline-hidden bg-[#faf9fd]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#3a2c53] uppercase mb-1">
                      Scale
                    </label>
                    <select
                      value={demoForm.scale}
                      onChange={(e) => setDemoForm({ ...demoForm, scale: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] text-sm outline-hidden bg-[#faf9fd]"
                    >
                      <option value="100-1000">100 - 1,000</option>
                      <option value="1000-5000">1,000 - 5,000</option>
                      <option value="5000+">5,000+</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3a2c53] uppercase mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={demoForm.notes}
                    onChange={(e) => setDemoForm({ ...demoForm, notes: e.target.value })}
                    placeholder="Specific requirements or upcoming dates..."
                    className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] text-sm outline-hidden bg-[#faf9fd] resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={demoLoading}
                  className="w-full py-3 rounded-xl bg-[#3c126d] hover:bg-[#4d188a] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  {demoLoading ? <span>Submitting...</span> : <span>Send Demo Request</span>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ----------------- 3. Get Started Portal Selector Modal ----------------- */}
      {getStartedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#ded5ee] text-[#1c0f33]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onCloseGetStarted}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#7934c9] mb-1">
              <Sparkles className="w-4 h-4 text-[#8b5cf6]" />
              <span>Launch Environment</span>
            </div>
            <h3 className="text-2xl font-black text-[#1c0f33] tracking-tight">
              Select Your Access Portal
            </h3>
            <p className="text-xs sm:text-sm text-[#5a4d75] mb-6">
              Choose the operational portal that corresponds to your team role:
            </p>

            <div className="space-y-2.5">
              <Link
                href="/admin/dashboard"
                onClick={onCloseGetStarted}
                className="group p-3.5 rounded-2xl bg-[#faf7fd] hover:bg-[#f2ecfa] border border-[#eee4f8] flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#ede4f9] text-[#6d2fb5] flex items-center justify-center shrink-0">
                    <LayoutDashboard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#231241] group-hover:text-[#521b9b]">
                      Admin Operations Dashboard
                    </h4>
                    <p className="text-xs text-[#71658e]">
                      Full event control, volunteer distribution, live telemetry
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#6d2fb5]">Launch →</span>
              </Link>

              <Link
                href="/admin/master_dashboard"
                onClick={onCloseGetStarted}
                className="group p-3.5 rounded-2xl bg-[#faf7fd] hover:bg-[#f2ecfa] border border-[#eee4f8] flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#ede4f9] text-[#6d2fb5] flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#231241] group-hover:text-[#521b9b]">
                      Master Contact CRM
                    </h4>
                    <p className="text-xs text-[#71658e]">
                      Deduplication, phone identity resolution, privacy flags
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#6d2fb5]">Launch →</span>
              </Link>

              <Link
                href="/operator/portal"
                onClick={onCloseGetStarted}
                className="group p-3.5 rounded-2xl bg-[#faf7fd] hover:bg-[#f2ecfa] border border-[#eee4f8] flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#ede4f9] text-[#6d2fb5] flex items-center justify-center shrink-0">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#231241] group-hover:text-[#521b9b]">
                      Operator Calling Desk
                    </h4>
                    <p className="text-xs text-[#71658e]">
                      Daily queue, calling notes, status normalizer
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#6d2fb5]">Launch →</span>
              </Link>

              <Link
                href="/qr"
                onClick={onCloseGetStarted}
                className="group p-3.5 rounded-2xl bg-[#faf7fd] hover:bg-[#f2ecfa] border border-[#eee4f8] flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#ede4f9] text-[#6d2fb5] flex items-center justify-center shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#231241] group-hover:text-[#521b9b]">
                      Gate Pass QR Scanner
                    </h4>
                    <p className="text-xs text-[#71658e]">
                      High-speed attendee entry and offline sync
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#6d2fb5]">Launch →</span>
              </Link>

              <Link
                href="/visitor"
                onClick={onCloseGetStarted}
                className="group p-3.5 rounded-2xl bg-[#faf7fd] hover:bg-[#f2ecfa] border border-[#eee4f8] flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#ede4f9] text-[#6d2fb5] flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#231241] group-hover:text-[#521b9b]">
                      Visitor Reception Desk
                    </h4>
                    <p className="text-xs text-[#71658e]">
                      Walk-in attendees, meal vouchers, visitor logs
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#6d2fb5]">Launch →</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

