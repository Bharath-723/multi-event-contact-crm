'use client';

import React from 'react';
import {
  CalendarDays,
  Users,
  Layers,
  QrCode,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';

interface FeatureItem {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  targetId: string;
}

const features: FeatureItem[] = [
  {
    id: 'multi-event',
    title: 'Multi-Event',
    subtitle: 'Management',
    icon: CalendarDays,
    targetId: 'feature-multi-event',
  },
  {
    id: 'crm',
    title: 'Registration',
    subtitle: '& Volunteer CRM',
    icon: Users,
    targetId: 'feature-crm',
  },
  {
    id: 'service-shift',
    title: 'Service &',
    subtitle: 'Shift Allocation',
    icon: Layers,
    targetId: 'feature-service-shift',
  },
  {
    id: 'checkin-visitor',
    title: 'Check-in &',
    subtitle: 'Visitor Tracking',
    icon: QrCode,
    targetId: 'feature-checkin-visitor',
  },
  {
    id: 'reports-analytics',
    title: 'Reports &',
    subtitle: 'Analytics',
    icon: BarChart3,
    targetId: 'feature-reports-analytics',
  },
  {
    id: 'org-ready',
    title: 'Organization',
    subtitle: 'Ready',
    icon: ShieldCheck,
    targetId: 'feature-org-ready',
  },
];

interface MecmFeatureStripProps {
  className?: string;
  onSelectFeature?: (id: string) => void;
}

export default function MecmFeatureStrip({
  className = '',
  onSelectFeature,
}: MecmFeatureStripProps) {
  const handleClick = (feature: FeatureItem) => {
    if (onSelectFeature) {
      onSelectFeature(feature.id);
    }
    const element = document.getElementById(feature.targetId) || document.getElementById('features');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className={`w-full max-w-[1720px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16 relative z-20 ${className}`}>
      {/* Floating White Card Container (Full-Width Aligned with Hero) */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-[0_16px_45px_rgba(55,20,105,0.09)] border border-[#ede3f7] py-3 sm:py-4 lg:py-5 xl:py-6 px-2 sm:px-4 lg:px-6 transition-all">
        {/* 6-Column Grid with Dividers */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-y-4 sm:gap-y-4 lg:gap-0 lg:divide-x lg:divide-[#ede3f8]">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.id}
                type="button"
                onClick={() => handleClick(feature)}
                className={`group flex flex-col items-center justify-center text-center px-2 sm:px-3 lg:px-2 xl:px-4 py-2 transition-all duration-300 rounded-xl hover:bg-[#faf6fe] cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#8b5cf6]/40 ${
                  idx % 2 === 0 ? 'border-r border-[#f3ebfa] md:border-r-0 lg:border-r-0' : ''
                }`}
              >
                {/* Purple Outline Icon with Subtle Background Glow */}
                <div className="w-10 h-10 sm:w-12 sm:h-12 xl:w-14 xl:h-14 rounded-2xl flex items-center justify-center text-[#6e28b8] group-hover:text-[#4f1692] group-hover:scale-110 transition-all duration-300 mb-1.5 sm:mb-2 relative">
                  <div className="absolute inset-0 bg-[#f4ebfc] rounded-2xl opacity-60 group-hover:opacity-100 group-hover:bg-[#eedcfb] transition-all" />
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 xl:w-7 xl:h-7 stroke-[1.8] relative z-10 transition-transform group-hover:rotate-1" />
                </div>

                {/* Title and Subtitle in Crisp Dark Purple */}
                <div className="leading-tight text-center">
                  <span className="block font-bold text-[#231241] group-hover:text-[#521b9b] text-[11px] sm:text-xs xl:text-sm tracking-tight transition-colors">
                    {feature.title}
                  </span>
                  <span className="block font-bold text-[#231241] group-hover:text-[#521b9b] text-[11px] sm:text-xs xl:text-sm tracking-tight transition-colors">
                    {feature.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

