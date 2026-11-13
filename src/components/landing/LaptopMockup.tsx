'use client';

import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Users,
  CheckSquare,
  BarChart3,
  Settings,
  ChevronDown,
  CalendarDays,
  UserCheck,
  Award,
  TrendingUp,
} from 'lucide-react';
import LotusLogo from './LotusLogo';

interface LaptopMockupProps {
  className?: string;
}

export default function LaptopMockup({ className = '' }: LaptopMockupProps) {
  return (
    <div
      className={`relative select-none ${className}`}
      style={{
        perspective: '1400px',
      }}
    >
      {/* 3D Tilted Laptop Container */}
      <div
        className="transition-transform duration-700 ease-out hover:[transform:rotateY(-4deg)_rotateX(2deg)]"
        style={{
          transform: 'rotateY(-7deg) rotateX(3deg) rotateZ(-0.5deg)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Laptop Display Lid (Top Shell) */}
        <div className="relative rounded-t-2xl sm:rounded-t-3xl bg-[#e3e6ee] p-2 sm:p-2.5 pb-0 shadow-[0_20px_50px_rgba(40,15,70,0.25)] border border-[#c8cdd9] border-b-0">
          {/* Top Bezel Center Camera Lens */}
          <div className="absolute top-1 sm:top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
            <div className="w-1.5 h-1.5 rounded-full bg-[#1e1333] ring-1 ring-slate-400/30 flex items-center justify-center">
              <div className="w-0.5 h-0.5 rounded-full bg-emerald-400/80" />
            </div>
          </div>

          {/* Screen Inner Frame */}
          <div className="relative rounded-t-xl sm:rounded-t-2xl overflow-hidden bg-[#22133f] border border-[#1b0d33] aspect-[16/10] w-full flex shadow-inner">
            {/* ----------------- Screen Sidebar ----------------- */}
            <div className="w-[28%] sm:w-[24%] bg-[#241443] border-r border-[#382361] p-2 sm:p-3 flex flex-col justify-between shrink-0">
              <div className="space-y-3 sm:space-y-4">
                {/* Brand / Logo */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <LotusLogo size={22} className="shrink-0" />
                  <span className="font-extrabold text-white text-[11px] sm:text-xs tracking-tight">
                    MECM
                  </span>
                </div>

                {/* Sidebar Navigation Items */}
                <nav className="space-y-0.5 sm:space-y-1">
                  {/* Dashboard - Active Item */}
                  <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:py-1.5 rounded-md sm:rounded-lg bg-[#5f2ba1] text-white font-medium text-[9px] sm:text-[11px] shadow-xs">
                    <LayoutDashboard className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white shrink-0" />
                    <span className="truncate">Dashboard</span>
                  </div>

                  {/* Events */}
                  <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:py-1.5 rounded-md text-[#c2b3e0] hover:text-white font-medium text-[9px] sm:text-[11px] transition-colors">
                    <Calendar className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="truncate">Events</span>
                  </div>

                  {/* Registrations */}
                  <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:py-1.5 rounded-md text-[#c2b3e0] hover:text-white font-medium text-[9px] sm:text-[11px] transition-colors">
                    <ClipboardList className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="truncate">Registrations</span>
                  </div>

                  {/* Volunteers */}
                  <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:py-1.5 rounded-md text-[#c2b3e0] hover:text-white font-medium text-[9px] sm:text-[11px] transition-colors">
                    <Users className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="truncate">Volunteers</span>
                  </div>

                  {/* Assignments */}
                  <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:py-1.5 rounded-md text-[#c2b3e0] hover:text-white font-medium text-[9px] sm:text-[11px] transition-colors">
                    <CheckSquare className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="truncate">Assignments</span>
                  </div>

                  {/* Reports */}
                  <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:py-1.5 rounded-md text-[#c2b3e0] hover:text-white font-medium text-[9px] sm:text-[11px] transition-colors">
                    <BarChart3 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="truncate">Reports</span>
                  </div>
                </nav>
              </div>

              {/* Bottom Settings */}
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 text-[#c2b3e0] text-[9px] sm:text-[11px] border-t border-[#382361]/60 pt-2">
                <Settings className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="truncate">Settings</span>
              </div>
            </div>

            {/* ----------------- Main Dashboard Canvas ----------------- */}
            <div className="flex-1 bg-[#f8f7fc] p-2.5 sm:p-4 flex flex-col justify-between overflow-hidden">
              {/* Header Bar */}
              <div className="flex items-center justify-between pb-1.5 sm:pb-2 border-b border-[#e9e1f5]">
                <h3 className="font-extrabold text-[#231241] text-[11px] sm:text-sm tracking-tight">
                  Event Overview
                </h3>

                <div className="flex items-center gap-1 px-2 py-0.5 sm:py-1 bg-white border border-[#ded5ee] rounded-md shadow-2xs text-[9px] sm:text-[11px] font-medium text-[#463962]">
                  <span>All Events</span>
                  <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#796996]" />
                </div>
              </div>

              {/* 4 Metric KPI Cards */}
              <div className="grid grid-cols-4 gap-1 sm:gap-2 my-1 sm:my-2">
                {/* Metric 1: Active Events */}
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-2 border border-[#eee6f7] shadow-2xs flex flex-col justify-between">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md bg-[#ede4f9] text-[#6d2fb5] flex items-center justify-center mb-0.5">
                    <CalendarDays className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </div>
                  <div>
                    <span className="font-extrabold text-[#231241] text-[11px] sm:text-base leading-tight block">
                      3
                    </span>
                    <span className="text-[#71658e] text-[7px] sm:text-[10px] leading-tight block truncate">
                      Active Events
                    </span>
                  </div>
                </div>

                {/* Metric 2: Registrations */}
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-2 border border-[#eee6f7] shadow-2xs flex flex-col justify-between">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md bg-[#fae6f4] text-[#b82a8b] flex items-center justify-center mb-0.5">
                    <UserCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </div>
                  <div>
                    <span className="font-extrabold text-[#231241] text-[11px] sm:text-base leading-tight block">
                      2,418
                    </span>
                    <span className="text-[#71658e] text-[7px] sm:text-[10px] leading-tight block truncate">
                      Registrations
                    </span>
                  </div>
                </div>

                {/* Metric 3: Volunteers */}
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-2 border border-[#eee6f7] shadow-2xs flex flex-col justify-between">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md bg-[#ede7fc] text-[#552599] flex items-center justify-center mb-0.5">
                    <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </div>
                  <div>
                    <span className="font-extrabold text-[#231241] text-[11px] sm:text-base leading-tight block">
                      642
                    </span>
                    <span className="text-[#71658e] text-[7px] sm:text-[10px] leading-tight block truncate">
                      Volunteers
                    </span>
                  </div>
                </div>

                {/* Metric 4: Task Completion */}
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-2 border border-[#eee6f7] shadow-2xs flex flex-col justify-between">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md bg-[#e2f7ea] text-[#16a34a] flex items-center justify-center mb-0.5">
                    <Award className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </div>
                  <div>
                    <span className="font-extrabold text-[#16a34a] text-[11px] sm:text-base leading-tight block">
                      98%
                    </span>
                    <span className="text-[#71658e] text-[7px] sm:text-[10px] leading-tight block truncate">
                      Task Completion
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Wave / Line Chart */}
              <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-2.5 border border-[#eee6f7] shadow-2xs flex-1 flex flex-col justify-between mb-1 sm:mb-2">
                <div className="flex items-center justify-between text-[8px] sm:text-[10px] text-[#71658e] mb-1">
                  <span className="font-semibold text-[#231241] flex items-center gap-1">
                    <TrendingUp className="w-2.5 h-2.5 text-purple-600" />
                    Visitor & Volunteer Flow
                  </span>
                  <span>Last 7 Days</span>
                </div>

                {/* SVG Spline Chart */}
                <div className="w-full h-14 sm:h-20 relative">
                  <svg
                    viewBox="0 0 300 90"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="chartWaveGradient" x1="0" y1="0" x2="0" y2="90" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                        <stop offset="50%" stopColor="#a855f7" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#ede9fe" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Subtle horizontal grid lines */}
                    <line x1="0" y1="20" x2="300" y2="20" stroke="#f1ecf9" strokeDasharray="3 3" />
                    <line x1="0" y1="50" x2="300" y2="50" stroke="#f1ecf9" strokeDasharray="3 3" />
                    <line x1="0" y1="80" x2="300" y2="80" stroke="#f1ecf9" strokeDasharray="3 3" />

                    {/* Shaded Area Under Line */}
                    <path
                      d="M0 65 Q40 68 70 42 T140 38 T210 20 T260 32 T300 18 L300 90 L0 90 Z"
                      fill="url(#chartWaveGradient)"
                    />

                    {/* Smooth Spline Curve */}
                    <path
                      d="M0 65 Q40 68 70 42 T140 38 T210 20 T260 32 T300 18"
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Prominent Data Points */}
                    <circle cx="70" cy="42" r="2.5" fill="#ffffff" stroke="#7c3aed" strokeWidth="2" />
                    <circle cx="140" cy="38" r="2.5" fill="#ffffff" stroke="#7c3aed" strokeWidth="2" />
                    <circle cx="210" cy="20" r="3.5" fill="#7c3aed" stroke="#ffffff" strokeWidth="2" />
                    <circle cx="260" cy="32" r="2.5" fill="#ffffff" stroke="#7c3aed" strokeWidth="2" />
                    <circle cx="300" cy="18" r="2.5" fill="#ffffff" stroke="#7c3aed" strokeWidth="2" />
                  </svg>
                </div>
              </div>

              {/* Lower Dual Widget Row: Bar Chart & Donut */}
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                {/* Bar Chart (Daily Gate Check-ins) */}
                <div className="col-span-2 bg-white rounded-md sm:rounded-lg p-1.5 sm:p-2 border border-[#eee6f7] shadow-2xs flex items-end justify-between gap-1 h-9 sm:h-12">
                  <div className="w-full bg-[#f4effc] rounded-xs h-full flex items-end justify-center">
                    <div className="w-2.5 sm:w-3.5 bg-[#8b5cf6] rounded-xs h-[45%]" />
                  </div>
                  <div className="w-full bg-[#f4effc] rounded-xs h-full flex items-end justify-center">
                    <div className="w-2.5 sm:w-3.5 bg-[#8b5cf6] rounded-xs h-[65%]" />
                  </div>
                  <div className="w-full bg-[#f4effc] rounded-xs h-full flex items-end justify-center">
                    <div className="w-2.5 sm:w-3.5 bg-[#7c3aed] rounded-xs h-[88%]" />
                  </div>
                  <div className="w-full bg-[#f4effc] rounded-xs h-full flex items-end justify-center">
                    <div className="w-2.5 sm:w-3.5 bg-[#8b5cf6] rounded-xs h-[72%]" />
                  </div>
                  <div className="w-full bg-[#f4effc] rounded-xs h-full flex items-end justify-center">
                    <div className="w-2.5 sm:w-3.5 bg-[#6d28d9] rounded-xs h-[95%]" />
                  </div>
                  <div className="w-full bg-[#f4effc] rounded-xs h-full flex items-end justify-center">
                    <div className="w-2.5 sm:w-3.5 bg-[#a78bfa] rounded-xs h-[55%]" />
                  </div>
                </div>

                {/* Donut Gauge Widget */}
                <div className="bg-white rounded-md sm:rounded-lg p-1 sm:p-1.5 border border-[#eee6f7] shadow-2xs flex items-center justify-center">
                  <div className="relative w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#ede4f9"
                        strokeWidth="3.5"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth="3.5"
                        strokeDasharray="78, 100"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-[7px] sm:text-[9px] font-bold text-[#3c126d]">
                      78%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Laptop Bottom Shelf / Keyboard Base Deck */}
        <div className="relative h-2.5 sm:h-4 bg-[#cfd3de] rounded-b-xl sm:rounded-b-2xl border-t border-[#b8becf] shadow-[0_20px_45px_rgba(35,12,65,0.28)] flex items-center justify-center">
          {/* Center Finger-Lid Opening Groove */}
          <div className="w-12 sm:w-16 h-1 sm:h-1.5 bg-[#a3aab8] rounded-b-md shadow-inner" />
        </div>

        {/* Soft Ambient Shadow on Table Surface */}
        <div className="w-[94%] mx-auto h-4 sm:h-6 -mt-1 bg-gradient-to-r from-transparent via-[#451e7a]/25 to-transparent blur-md rounded-full pointer-events-none" />
      </div>
    </div>
  );
}

