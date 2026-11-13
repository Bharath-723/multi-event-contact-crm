'use client';

import React from 'react';
import { Landmark, Users2, HeartHandshake, CalendarCheck2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface UseCase {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  points: string[];
  ctaLink: string;
  ctaText: string;
}

const useCases: UseCase[] = [
  {
    id: 'temples',
    title: 'Temples & Spiritual Centers',
    subtitle: 'Sacred festivals with effortless seva coordination',
    badge: 'Spiritual Organizations',
    icon: Landmark,
    description:
      'Harmonize volunteer seva, food prasad distribution, and darshan lines during peak festival days without chaos or volunteer exhaustion.',
    points: [
      'Devotee calling desk with structured feedback logging',
      'Annadanam & prasadam token management and verification',
      'Departmental volunteer rosters (Kitchen, Decoration, Security)',
      'Strict privacy and phone identity protection',
    ],
    ctaLink: '/admin/dashboard',
    ctaText: 'View Temple Setup',
  },
  {
    id: 'cultural-festivals',
    title: 'Cultural Festivals & Parades',
    subtitle: 'Rathayatra, Krishnashtami, and public processions',
    badge: 'Public Gatherings',
    icon: CalendarCheck2,
    description:
      'Manage massive public turnout across outdoor venues, street processions, and multi-day celebrations with instant mobile gate scanning.',
    points: [
      'Instant QR gate passes delivered directly to attendee phones',
      'High-velocity check-in with offline caching for field staff',
      'Emergency broadcast and volunteer coordinator messaging',
      'Multi-day attendance telemetry and repeat visitor metrics',
    ],
    ctaLink: '/krishnashtami-complete',
    ctaText: 'View Festival Showcase',
  },
  {
    id: 'non-profits',
    title: 'Non-Profits & Community Groups',
    subtitle: 'Mobilize volunteers for charitable initiatives',
    badge: 'Social Impact',
    icon: HeartHandshake,
    description:
      'Coordinate volunteer drives, relief distributions, and community outreach campaigns with transparent task allocation and capacity controls.',
    points: [
      'Fair workload balancing preventing volunteer burnout',
      'Self-service volunteer onboarding forms with auto-confirmation',
      'Live task status tracking and volunteer engagement history',
      'Auditable participation logs for donors and leadership',
    ],
    ctaLink: '/contacts-register',
    ctaText: 'Register Volunteer',
  },
  {
    id: 'large-conventions',
    title: 'Conferences & Large Gatherings',
    subtitle: 'Multi-track sessions and high-volume attendee flow',
    badge: 'Institutions',
    icon: Users2,
    description:
      'Streamline registration desks, badging, attendee access control, and volunteer station rotations across sprawling convention centers.',
    points: [
      'Fast attendee search by name, phone, or registration ID',
      'Role-based multi-tier credential verification',
      'VIP lounge and restricted area check-in validation',
      'Real-time attendance dashboard for event directors',
    ],
    ctaLink: '/visitor',
    ctaText: 'Inspect Visitor Desk',
  },
];

export default function MecmUseCases() {
  return (
    <section id="use-cases" className="py-16 sm:py-24 bg-gradient-to-b from-[#faf8fe] to-[#f4eefa] relative">
      <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f2ecfa] border border-[#dccff2] text-[#4b1d7f] text-xs font-semibold mb-4">
            <span>Tailored Solutions</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#1c0f33] tracking-tight">
            Built For The Demands Of High-Touch Communities
          </h2>
          <p className="mt-4 text-[#5a4d75] text-base sm:text-lg">
            From intimate community gatherings to mega-festivals with tens of thousands of devotees,
            MECM adapts effortlessly to your operating scale.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {useCases.map((uc) => {
            const Icon = uc.icon;
            return (
              <div
                key={uc.id}
                className="bg-white rounded-3xl p-6 sm:p-8 lg:p-10 border border-[#eee4f8] shadow-[0_12px_35px_rgba(50,15,90,0.05)] hover:shadow-[0_18px_45px_rgba(50,15,90,0.1)] transition-all duration-300 flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-[#f4ebfc] text-[#6e28b8] group-hover:bg-[#3c126d] group-hover:text-white transition-all flex items-center justify-center">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#f4effc] text-[#5c2199] border border-[#ebdff8]">
                      {uc.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-[#1c0f33] tracking-tight">
                      {uc.title}
                    </h3>
                    <p className="text-sm font-semibold text-[#7032ba] mt-0.5">
                      {uc.subtitle}
                    </p>
                  </div>

                  <p className="text-[#5a4d75] text-sm sm:text-base leading-relaxed">
                    {uc.description}
                  </p>

                  <ul className="space-y-2 pt-2 border-t border-[#f1e8f9]">
                    {uc.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#3a2c53]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] shrink-0 mt-1.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6 mt-4 border-t border-[#f4ecfb]">
                  <Link
                    href={uc.ctaLink}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-[#3c126d] hover:text-[#5e1ea8] transition-colors"
                  >
                    <span>{uc.ctaText}</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

