'use client';

import React from 'react';
import Link from 'next/link';
import LotusLogo from './LotusLogo';

export default function MecmFooter() {
  const scrollTo = (id: string) => {
    if (id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const elem = document.getElementById(id);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <footer className="bg-[#241443] text-white pt-16 pb-12 border-t border-[#3a2366] relative overflow-hidden">
      {/* Soft Ambient Glow in background */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 pb-12 border-b border-[#3b2468]">
          {/* Brand Info (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <LotusLogo size={36} />
              <div>
                <span className="font-black text-white text-2xl tracking-tight block leading-none">
                  MECM
                </span>
                <span className="text-purple-300 text-xs font-medium tracking-tight">
                  Multi-Event CRM Platform
                </span>
              </div>
            </div>

            <p className="text-purple-200/80 text-sm leading-relaxed max-w-sm">
              A unified, scalable platform to plan, run and manage multiple events,
              volunteers and visitors with ease. Engineered specifically for temples,
              communities, and high-touch cultural organizations.
            </p>

            <div className="pt-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#391e66] border border-[#522c91] text-purple-200 text-xs font-semibold">
                <span>✦ Production Hardened & Verified</span>
              </span>
            </div>
          </div>

          {/* Col 1: Platform */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-white text-sm tracking-wide uppercase">
              Platform
            </h4>
            <ul className="space-y-2 text-sm text-purple-200/75">
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('features')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Multi-Event Engine
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('features')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Volunteer CRM
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('features')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Shift & Task Allocation
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('features')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Gate QR Scanner
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('features')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Reports & Analytics
                </button>
              </li>
            </ul>
          </div>

          {/* Col 2: Operational Portals */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-white text-sm tracking-wide uppercase">
              Live Portals
            </h4>
            <ul className="space-y-2 text-sm text-purple-200/75">
              <li>
                <Link href="/admin/dashboard" className="hover:text-white transition-colors">
                  Admin Dashboard
                </Link>
              </li>
              <li>
                <Link href="/admin/master_dashboard" className="hover:text-white transition-colors">
                  Master CRM Directory
                </Link>
              </li>
              <li>
                <Link href="/operator/portal" className="hover:text-white transition-colors">
                  Operator Calling Desk
                </Link>
              </li>
              <li>
                <Link href="/qr" className="hover:text-white transition-colors">
                  Gate QR Scanner
                </Link>
              </li>
              <li>
                <Link href="/visitor" className="hover:text-white transition-colors">
                  Visitor Reception Desk
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Public & Festivals */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-white text-sm tracking-wide uppercase">
              Festivals & Public
            </h4>
            <ul className="space-y-2 text-sm text-purple-200/75">
              <li>
                <Link href="/contacts-register" className="hover:text-white transition-colors">
                  Volunteer Registration
                </Link>
              </li>
              <li>
                <Link href="/krishnashtami-complete" className="hover:text-white transition-colors">
                  Krishnashtami 2026 Archive
                </Link>
              </li>
              <li>
                <Link href="/rathayatra-complete" className="hover:text-white transition-colors">
                  Rathayatra 2026 Archive
                </Link>
              </li>
              <li>
                <Link href="/feedback" className="hover:text-white transition-colors">
                  Volunteer Feedback
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('contact')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Request Institutional Demo
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-purple-300/70">
          <p>
            © 2026 MECM — Multi-Event CRM Platform. Built for Temples • Communities • Organizations.
          </p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => scrollTo('home')}
              className="hover:text-white transition-colors"
            >
              Back to Top ↑
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

