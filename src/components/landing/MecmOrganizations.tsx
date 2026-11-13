'use client';

import React from 'react';
import {
  ShieldAlert,
  Lock,
  Database,
  Cpu,
  RefreshCw,
  Server,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';

interface TrustPillar {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge: string;
}

const pillars: TrustPillar[] = [
  {
    icon: Lock,
    title: 'PostgreSQL Row-Level Security',
    description:
      'Every query runs under strict RLS policies. Operator roles access only their assigned contacts, while administrators retain full cross-event observability.',
    badge: 'Zero-Trust Architecture',
  },
  {
    icon: Cpu,
    title: 'Transactional Advisory Locks',
    description:
      'High-concurrency assignments execute with atomic PostgreSQL advisory locks, completely preventing double-allocation and race conditions under heavy load.',
    badge: 'Concurrency Safe',
  },
  {
    icon: ShieldAlert,
    title: 'Permanent Not-Interested Exclusions',
    description:
      'Institutional respect for attendee privacy. When a contact opts out, an irreversible atomic state is set across all past, present, and future festivals.',
    badge: '100% Privacy Compliance',
  },
  {
    icon: Database,
    title: 'Dynamic Capacity Balancing',
    description:
      'Every operator has an enforced capacity limit (1–500). System automatically rejects over-allocation and maintains balanced service distribution.',
    badge: 'Capacity Guard',
  },
  {
    icon: RefreshCw,
    title: 'Offline-First PWA Synchronization',
    description:
      'Event grounds with congested mobile data are no obstacle. Gate passes are verified locally and batch-synced once network connection is restored.',
    badge: 'Offline Resilient',
  },
  {
    icon: Server,
    title: 'Production-Hardened Migrations',
    description:
      'All database mutations pass rigorous 18-scenario preflight checks and 143 test assertions before deployment, ensuring zero downtime.',
    badge: '143/143 Verified',
  },
];

export default function MecmOrganizations() {
  return (
    <section id="organizations" className="py-16 sm:py-24 bg-[#faf8fe] relative">
      <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f2ecfa] border border-[#dccff2] text-[#4b1d7f] text-xs font-semibold mb-4">
            <span>Enterprise Reliability</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#1c0f33] tracking-tight">
            Institutional Trust & Military-Grade Reliability
          </h2>
          <p className="mt-4 text-[#5a4d75] text-base sm:text-lg">
            Built from the ground up to protect volunteer identities, enforce organizational
            boundaries, and guarantee uninterrupted operations when thousands arrive at once.
          </p>
        </div>

        {/* 6 Grid Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {pillars.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="bg-white rounded-2xl p-6 sm:p-7 border border-[#eee4f8] shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#f2ebfc] text-[#6e28b8] flex items-center justify-center">
                      <Icon className="w-5 h-5 stroke-[2]" />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#f4effc] text-[#551f8f]">
                      {p.badge}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-[#231241] text-lg tracking-tight mb-2">
                    {p.title}
                  </h3>
                  <p className="text-[#5a4d75] text-sm leading-relaxed">
                    {p.description}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-[#f4ecfb] flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Production Hardened</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Banner */}
        <div className="mt-12 sm:mt-16 bg-gradient-to-r from-[#3c126d] via-[#4d188a] to-[#5e1ea8] rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="space-y-2 text-center lg:text-left">
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
              Ready to modernize your organization's event operations?
            </h3>
            <p className="text-purple-200 text-sm sm:text-base max-w-2xl">
              Experience zero data loss, instant volunteer dispatch, and effortless gate
              tracking on your next festival or community drive.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/admin/dashboard"
              className="px-6 py-3 rounded-xl bg-white hover:bg-purple-50 text-[#3c126d] font-bold text-sm shadow-md transition-all active:scale-98"
            >
              Access Admin Portal
            </Link>
            <Link
              href="/contacts-register"
              className="px-6 py-3 rounded-xl bg-[#2a0c4f] hover:bg-[#20083c] text-white border border-purple-400/30 font-bold text-sm transition-all active:scale-98"
            >
              Public Registration
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
