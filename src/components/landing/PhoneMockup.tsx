'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface PhoneMockupProps {
  className?: string;
}

export default function PhoneMockup({ className = '' }: PhoneMockupProps) {
  return (
    <div
      className={`relative select-none ${className}`}
      style={{
        perspective: '1200px',
      }}
    >
      {/* 3D Angled Phone Container */}
      <div
        className="transition-transform duration-700 ease-out hover:[transform:rotateY(-6deg)_rotateX(1deg)_rotateZ(1deg)]"
        style={{
          transform: 'rotateY(-12deg) rotateX(2deg) rotateZ(3deg)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Smartphone Chassis Frame */}
        <div className="relative w-full rounded-[1.8rem] sm:rounded-[2.3rem] xl:rounded-[2.6rem] bg-[#1a1226] p-1.5 sm:p-2 xl:p-2.5 shadow-[0_25px_60px_rgba(25,8,48,0.45)] border-2 border-[#3d2c5e]">
          {/* Dynamic Island / Speaker Pill at Top */}
          <div className="absolute top-2 sm:top-2.5 xl:top-3 left-1/2 -translate-x-1/2 w-10 sm:w-13 xl:w-16 h-2.5 sm:h-3 xl:h-3.5 bg-black rounded-full z-30 flex items-center justify-between px-1.5 sm:px-2">
            <div className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-[#1b1528] ring-1 ring-[#3a2c54]" />
            <div className="w-1.5 sm:w-2 h-0.5 sm:h-1 rounded-full bg-[#1b1528]" />
          </div>

          {/* Screen Canvas */}
          <div className="relative rounded-[1.4rem] sm:rounded-[1.9rem] xl:rounded-[2.1rem] overflow-hidden bg-white p-2 sm:p-3 xl:p-4 pt-4 sm:pt-6 xl:pt-7 flex flex-col items-center justify-between aspect-[9/18.5] min-h-[190px] sm:min-h-[250px] xl:min-h-[300px] border border-slate-100 shadow-inner">
            {/* Top Brand Indicator */}
            <div className="flex flex-col items-center gap-0.5 w-full mt-0.5 sm:mt-1">
              <span className="font-extrabold text-[#231241] text-[9px] sm:text-[11px] xl:text-xs tracking-wider">
                MECM
              </span>
              <span className="text-[7px] sm:text-[8px] xl:text-[9px] text-[#71658e] font-medium tracking-wide">
                GATE PASS
              </span>
            </div>

            {/* Center QR Code Container with Emerald Scan Reticles */}
            <div className="relative w-full my-auto flex flex-col items-center justify-center p-1.5 sm:p-2.5 xl:p-3 bg-gradient-to-b from-[#faf8fe] to-white rounded-lg sm:rounded-xl xl:rounded-2xl border border-[#efe9f8] shadow-xs">
              {/* Corner 1: Top-Left Green Bracket */}
              <div className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 border-t-2 border-l-2 border-emerald-500 rounded-tl-xs pointer-events-none" />
              {/* Corner 2: Top-Right Green Bracket */}
              <div className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 border-t-2 border-r-2 border-emerald-500 rounded-tr-xs pointer-events-none" />
              {/* Corner 3: Bottom-Left Green Bracket */}
              <div className="absolute bottom-1 left-1 sm:bottom-1.5 sm:left-1.5 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 border-b-2 border-l-2 border-emerald-500 rounded-bl-xs pointer-events-none" />
              {/* Corner 4: Bottom-Right Green Bracket */}
              <div className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 border-b-2 border-r-2 border-emerald-500 rounded-br-xs pointer-events-none" />

              {/* High-Fidelity SVG QR Code */}
              <svg
                viewBox="0 0 100 100"
                className="w-14 h-14 sm:w-20 sm:h-20 xl:w-24 xl:h-24 text-[#20123a]"
                fill="currentColor"
              >
                {/* Top-Left Finder Pattern */}
                <rect x="5" y="5" width="28" height="28" rx="4" />
                <rect x="9" y="9" width="20" height="20" fill="white" rx="2" />
                <rect x="13" y="13" width="12" height="12" rx="2" />

                {/* Top-Right Finder Pattern */}
                <rect x="67" y="5" width="28" height="28" rx="4" />
                <rect x="71" y="9" width="20" height="20" fill="white" rx="2" />
                <rect x="75" y="13" width="12" height="12" rx="2" />

                {/* Bottom-Left Finder Pattern */}
                <rect x="5" y="67" width="28" height="28" rx="4" />
                <rect x="9" y="71" width="20" height="20" fill="white" rx="2" />
                <rect x="13" y="75" width="12" height="12" rx="2" />

                {/* Data Matrix Modules (Dense, authentic QR look) */}
                <rect x="38" y="7" width="6" height="6" />
                <rect x="48" y="7" width="6" height="12" />
                <rect x="58" y="13" width="5" height="5" />
                <rect x="38" y="18" width="6" height="6" />
                <rect x="58" y="24" width="5" height="9" />

                <rect x="7" y="38" width="6" height="6" />
                <rect x="18" y="38" width="12" height="6" />
                <rect x="35" y="35" width="8" height="8" rx="1" />
                <rect x="48" y="35" width="6" height="6" />
                <rect x="58" y="38" width="12" height="6" />
                <rect x="75" y="38" width="6" height="12" />
                <rect x="85" y="38" width="8" height="6" />

                <rect x="7" y="48" width="12" height="6" />
                <rect x="24" y="48" width="6" height="12" />
                <rect x="35" y="48" width="10" height="10" rx="1" />
                <rect x="50" y="48" width="8" height="6" />
                <rect x="64" y="48" width="6" height="6" />
                <rect x="85" y="48" width="8" height="8" />

                <rect x="7" y="58" width="6" height="6" />
                <rect x="35" y="63" width="6" height="12" />
                <rect x="45" y="60" width="14" height="6" />
                <rect x="64" y="58" width="6" height="12" />
                <rect x="75" y="65" width="18" height="6" />

                <rect x="38" y="80" width="12" height="6" />
                <rect x="54" y="74" width="6" height="12" />
                <rect x="64" y="75" width="8" height="14" />
                <rect x="78" y="75" width="6" height="6" />
                <rect x="88" y="85" width="6" height="6" />
              </svg>
            </div>

            {/* Bottom Status: Check-in Successful Badge */}
            <div className="flex flex-col items-center justify-center mt-0.5 sm:mt-1">
              <div className="w-5 h-5 sm:w-6 sm:h-6 xl:w-7 xl:h-7 rounded-full bg-[#22c55e] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(34,197,94,0.35)] mb-0.5 sm:mb-1">
                <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 xl:w-4 xl:h-4 stroke-[3]" />
              </div>
              <span className="font-extrabold text-[#111827] text-[8px] sm:text-[10px] xl:text-xs tracking-tight leading-tight">
                Check-in
              </span>
              <span className="font-extrabold text-[#111827] text-[8px] sm:text-[10px] xl:text-xs tracking-tight leading-tight">
                Successful
              </span>
            </div>

            {/* Screen Glass Glare Gradient */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 100%)',
              }}
            />
          </div>
        </div>

        {/* Realistic Phone Drop Shadow on table */}
        <div className="w-[85%] mx-auto h-5 sm:h-6 -mt-2 bg-gradient-to-r from-transparent via-[#2b0c54]/30 to-transparent blur-md rounded-full pointer-events-none" />
      </div>
    </div>
  );
}

