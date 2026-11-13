'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Users,
  Layers,
  QrCode,
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface PlatformModule {
  id: string;
  name: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  description: string;
  highlights: string[];
  metrics: { label: string; value: string }[];
  routeHref: string;
  routeLabel: string;
}

const modules: PlatformModule[] = [
  {
    id: 'feature-multi-event',
    name: 'Multi-Event Management',
    badge: 'Core Engine',
    icon: CalendarDays,
    headline: 'Orchestrate Concurrent Festivals & Cultural Gatherings',
    description:
      'Manage multiple concurrent events from a unified portal. Seamlessly switch between Rathayatra, Krishnashtami, and weekend community gatherings without cross-event data contamination.',
    highlights: [
      'Isolated event schemas with shared master contact identity resolution',
      'Unified event timeline and calendar scheduling',
      'Dynamic festival status management and real-time archival',
      'Multi-venue coordination with venue-specific capacity thresholds',
    ],
    metrics: [
      { label: 'Active Events', value: '3+' },
      { label: 'Isolation Guarantee', value: '100%' },
      { label: 'Setup Time', value: '< 2 min' },
    ],
    routeHref: '/admin/dashboard',
    routeLabel: 'Open Admin Dashboard',
  },
  {
    id: 'feature-crm',
    name: 'Registration & Volunteer CRM',
    badge: 'Directory & Identity',
    icon: Users,
    headline: 'Unified Master Directory with Smart Contact Deduplication',
    description:
      'Centralize volunteer profiles across all events. Our PostgreSQL engine normalizes mobile identities, detects duplicate registrations, and strictly respects permanent Not-Interested preferences.',
    highlights: [
      'E.164 phone normalization and Indian 10-digit mobile verification',
      'Permanent Not-Interested exclusions with cryptographic audit trail',
      'Cross-event volunteer history and participation tracking',
      'Defensive identity conflict resolution preventing split records',
    ],
    metrics: [
      { label: 'Deduplication Rate', value: '99.8%' },
      { label: 'Active Profiles', value: '10,000+' },
      { label: 'Query Latency', value: '< 25ms' },
    ],
    routeHref: '/admin/master_dashboard',
    routeLabel: 'Explore Master CRM',
  },
  {
    id: 'feature-service-shift',
    name: 'Service & Shift Allocation',
    badge: 'Dynamic Dispatch',
    icon: Layers,
    headline: 'Fair Workload Allocation with Dynamic Operator Capacity',
    description:
      'Intelligent dispatch algorithm balances calling tasks and service rosters across operators according to individual configured capacities (1–500 contacts) with dry-run verification.',
    highlights: [
      'Configurable per-operator capacity limits with automatic overflow protection',
      'Interactive dry-run preview before executing bulk assignments',
      'Gender-safe seva allocation respecting institutional guidelines',
      'Live operator toggle and task re-balancing in under 1 second',
    ],
    metrics: [
      { label: 'Max Operator Capacity', value: '500' },
      { label: 'Assignment Speed', value: '1,000/s' },
      { label: 'Allocation Balance', value: '100%' },
    ],
    routeHref: '/admin/operators',
    routeLabel: 'Manage Operators & Shifts',
  },
  {
    id: 'feature-checkin-visitor',
    name: 'Check-in & Visitor Tracking',
    badge: 'Gate Operations',
    icon: QrCode,
    headline: 'Instant QR Code Validation & Resilient Gate Check-in',
    description:
      'Ultra-fast gate scanning handles thousands of festival attendees per hour. Includes offline PWA synchronization, meal token verification, and real-time visitor logs.',
    highlights: [
      'Sub-100ms QR scanner with immediate visual & audio feedback',
      'Offline-first PWA sync for areas with spotty cellular reception',
      'Prasad / Annadanam meal voucher validation',
      'Real-time visitor logs with volunteer-assisted check-in support',
    ],
    metrics: [
      { label: 'Scan Latency', value: '< 90ms' },
      { label: 'Offline Resiliency', value: 'Yes' },
      { label: 'Peak Gate Flow', value: '120/min' },
    ],
    routeHref: '/qr',
    routeLabel: 'Launch Gate QR Scanner',
  },
  {
    id: 'feature-reports-analytics',
    name: 'Reports & Analytics',
    badge: 'Telemetry',
    icon: BarChart3,
    headline: 'Actionable Telemetry for Leadership & Coordinators',
    description:
      'Transform event operations into clear insights. Track calling desk conversion rates, peak gate rush hours, service department fulfillment, and export comprehensive CSV audits.',
    highlights: [
      'Live attendee velocity curves and hourly surge prediction',
      'Operator calling desk response breakdown and notes audit',
      'Department-level seva fulfillment and attendance verification',
      'One-click CSV data export for institutional reporting',
    ],
    metrics: [
      { label: 'Telemetry Freshness', value: 'Real-time' },
      { label: 'Export Formats', value: 'CSV / JSON' },
      { label: 'Audit Retention', value: 'Complete' },
    ],
    routeHref: '/visitor',
    routeLabel: 'View Visitor Telemetry',
  },
  {
    id: 'feature-org-ready',
    name: 'Organization Ready',
    badge: 'Enterprise Security',
    icon: ShieldCheck,
    headline: 'Rock-Solid PostgreSQL Security & Institutional Reliability',
    description:
      'Engineered for large religious organizations, temples, and NGOs. Backed by PostgreSQL Row-Level Security, strict advisory locks, and audited database migrations.',
    highlights: [
      'PostgreSQL advisory transaction locks preventing race conditions',
      'Role-Based Access Control (Admin, Operator, Gate Volunteer, Reception)',
      'Automated transaction rollback on schema violation or integrity breach',
      'Multi-tenant event isolation adhering to data privacy standards',
    ],
    metrics: [
      { label: 'Concurrency Safety', value: '100%' },
      { label: 'Security Grade', value: 'Enterprise' },
      { label: 'Audit Compliance', value: '143 Checks' },
    ],
    routeHref: '/contacts-register',
    routeLabel: 'View Public Portal',
  },
];

export default function MecmPlatformFeatures() {
  const [activeTab, setActiveTab] = useState(modules[0].id);
  const activeModule = modules.find((m) => m.id === activeTab) || modules[0];
  const ActiveIcon = activeModule.icon;

  return (
    <section id="features" className="py-16 sm:py-24 bg-[#faf8fe] relative">
      <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f2ecfa] border border-[#dccff2] text-[#4b1d7f] text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5 text-[#8b5cf6]" />
            <span>Platform Pillars</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#1c0f33] tracking-tight">
            Comprehensive Management For Every Event Stage
          </h2>
          <p className="mt-4 text-[#5a4d75] text-base sm:text-lg">
            Purpose-built tools designed to work harmoniously together — from volunteer
            recruitment to gate check-in and post-event reporting.
          </p>
        </div>

        {/* Module Selection Pills (Horizontal Scroll on Mobile) */}
        <div className="flex items-center justify-start lg:justify-center gap-2 overflow-x-auto pb-4 mb-8 no-scrollbar">
          {modules.map((m) => {
            const Icon = m.icon;
            const isActive = m.id === activeTab;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveTab(m.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#3c126d] text-white shadow-md'
                    : 'bg-white hover:bg-[#f4ecfc] text-[#463864] border border-[#ede3f7]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#6e28b8]'}`} />
                <span>{m.name}</span>
              </button>
            );
          })}
        </div>

        {/* Active Module Showcase Card */}
        <div
          id={activeModule.id}
          className="bg-white rounded-3xl border border-[#ede3f7] shadow-[0_20px_50px_rgba(50,15,90,0.06)] p-6 sm:p-10 lg:p-12 transition-all duration-300"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Description Column */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#f2ecfa] text-[#6e28b8] flex items-center justify-center">
                  <ActiveIcon className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#7934c9]">
                    {activeModule.badge}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-[#1c0f33]">
                    {activeModule.headline}
                  </h3>
                </div>
              </div>

              <p className="text-[#5a4d75] text-base sm:text-lg leading-relaxed">
                {activeModule.description}
              </p>

              {/* Highlights Bullet List */}
              <div className="space-y-3 pt-2">
                {activeModule.highlights.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#8b5cf6] shrink-0 mt-0.5" />
                    <span className="text-sm sm:text-base text-[#382b52] font-medium">
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Button linking to real route */}
              <div className="pt-4">
                <Link
                  href={activeModule.routeHref}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3c126d] hover:bg-[#4d188a] text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all active:scale-98"
                >
                  <span>{activeModule.routeLabel}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Right Metric Grid Column */}
            <div className="lg:col-span-5 bg-gradient-to-br from-[#f8f5fd] to-[#f2e9fc] rounded-2xl p-6 sm:p-8 border border-[#eadbf8] flex flex-col justify-between space-y-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#6e28b8]">
                  Verified Benchmarks
                </span>
                <h4 className="text-lg font-extrabold text-[#231241] mt-1">
                  Engine Performance
                </h4>
              </div>

              <div className="space-y-4">
                {activeModule.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="bg-white/90 backdrop-blur-xs rounded-xl p-4 border border-[#eee4f8] shadow-2xs flex items-center justify-between"
                  >
                    <span className="text-xs sm:text-sm font-semibold text-[#5a4d75]">
                      {metric.label}
                    </span>
                    <span className="text-lg sm:text-xl font-black text-[#3c126d]">
                      {metric.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[#e2d2f4] flex items-center justify-between text-xs text-[#71658e]">
                <span>Status: Production Verified</span>
                <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Operational
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

