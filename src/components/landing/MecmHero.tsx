'use client';

import React from 'react';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import TempleSkyline from './TempleSkyline';
import LaptopMockup from './LaptopMockup';
import PhoneMockup from './PhoneMockup';
import MecmFeatureStrip from './MecmFeatureStrip';

interface MecmHeroProps {
  onExplorePlatform: () => void;
  onWatchDemo: () => void;
  onSelectFeature?: (id: string) => void;
}

export default function MecmHero({
  onExplorePlatform,
  onWatchDemo,
  onSelectFeature,
}: MecmHeroProps) {
  return (
    <section className="relative w-full overflow-hidden bg-gradient-to-b from-[#faf8fe] via-[#f5eefc] to-[#ede4fa] pt-3 sm:pt-6 lg:pt-6 xl:pt-8 pb-4 sm:pb-8 lg:pb-10 xl:pb-12">
      {/* ----------------- Background Ambient Glows & Waves ----------------- */}
      {/* Top Left Ethereal Lavender Glow */}
      <div className="absolute top-0 left-[-10%] w-[550px] h-[550px] rounded-full bg-purple-300/20 blur-[130px] pointer-events-none" />

      {/* Floating 4-Point Sparkle Elements */}
      <div className="absolute top-12 left-[6%] text-[#a855f7]/60 pointer-events-none animate-pulse">
        <Sparkles className="w-5 h-5" />
      </div>
      <div className="absolute top-40 left-[42%] text-[#c084fc]/50 pointer-events-none animate-pulse delay-700">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="absolute top-20 right-[10%] text-[#a855f7]/60 pointer-events-none animate-pulse delay-300">
        <Sparkles className="w-6 h-6" />
      </div>

      {/* ----------------- Hero Container (Full-Viewport Fluid Adaptive) ----------------- */}
      <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-8 xl:gap-12 2xl:gap-16 items-center">
          {/* ----------------- Left Content Column (5 cols) ----------------- */}
          <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-5 flex flex-col items-start space-y-4 sm:space-y-6 lg:space-y-5 xl:space-y-6 text-left z-20">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-[#f2ecfa] border border-[#dccff2] text-[#4b1d7f] text-xs sm:text-[13px] font-semibold tracking-wide shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-[#8b5cf6] fill-[#8b5cf6]/30 shrink-0" />
              <span>For Temples • Communities • Organizations</span>
            </div>

            {/* Main Headline */}
            <div className="space-y-1 sm:space-y-1.5 xl:space-y-2">
              <h1 className="font-black text-[#1c0f33] text-3xl sm:text-5xl lg:text-[2.6rem] xl:text-[3.3rem] 2xl:text-[4rem] tracking-tight leading-[1.08]">
                Multi-Event
              </h1>
              <h2 className="font-black text-[#481878] text-3xl sm:text-5xl lg:text-[2.6rem] xl:text-[3.3rem] 2xl:text-[4rem] tracking-tight leading-[1.08]">
                CRM Management System
              </h2>
            </div>

            {/* Description Subtitle */}
            <p className="text-[#5a4d75] text-sm sm:text-base lg:text-base xl:text-lg 2xl:text-xl font-normal leading-relaxed max-w-xl xl:max-w-2xl">
              A unified, scalable platform to plan, run and manage multiple events,
              volunteers and visitors with ease.
            </p>

            {/* Action CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1 sm:pt-2 w-full sm:w-auto">
              {/* Explore Platform CTA (Solid Deep Purple) */}
              <button
                type="button"
                onClick={onExplorePlatform}
                className="group flex-1 sm:flex-none px-6 sm:px-7 py-3 sm:py-3.5 rounded-xl bg-[#3c126d] hover:bg-[#4d188a] text-white text-sm sm:text-base font-semibold shadow-[0_6px_20px_rgba(60,18,109,0.28)] hover:shadow-[0_8px_25px_rgba(60,18,109,0.38)] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <span>Explore Platform</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              {/* Watch Demo CTA (Crisp White Button with Purple Border) */}
              <button
                type="button"
                onClick={onWatchDemo}
                className="group flex-1 sm:flex-none px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl bg-white hover:bg-[#faf7fe] text-[#2c1350] border border-[#d6c9ea] hover:border-[#bba4db] text-sm sm:text-base font-semibold shadow-2xs hover:shadow-xs transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer active:scale-98"
              >
                <div className="w-5 h-5 rounded-full bg-[#3c126d] text-white flex items-center justify-center text-[10px] pl-0.5 shadow-2xs group-hover:scale-105 transition-transform shrink-0">
                  <Play className="w-2.5 h-2.5 fill-white" />
                </div>
                <span>Watch Demo</span>
              </button>
            </div>
          </div>

          {/* ----------------- Right Visual Column (7 cols: Temple + Laptop + Phone) ----------------- */}
          <div className="lg:col-span-7 xl:col-span-7 2xl:col-span-7 relative w-full flex items-center justify-center lg:justify-end mt-6 sm:mt-8 lg:mt-0">
            <div className="relative w-full max-w-[440px] sm:max-w-[560px] md:max-w-[640px] lg:max-w-[700px] xl:max-w-[820px] 2xl:max-w-[920px] mx-auto lg:ml-auto lg:mr-0 flex items-center justify-center">
              {/* Background Temple Skyline Illustration */}
              <div className="absolute inset-x-0 bottom-2 sm:bottom-4 lg:bottom-6 xl:bottom-8 w-full h-auto pointer-events-none opacity-90 z-0">
                <TempleSkyline />
              </div>

              {/* Laptop 3D UI Mockup */}
              <div className="relative z-10 w-[84%] sm:w-[85%] lg:w-[86%] mr-[12%] sm:mr-[10%] lg:mr-[8%] shrink-0">
                <LaptopMockup />
              </div>

              {/* Phone Mockup Overlapping Front Right */}
              <div className="absolute right-0 bottom-[-4px] sm:bottom-1 lg:bottom-2 xl:bottom-4 z-20 w-[26%] sm:w-[25%] lg:w-[24%] min-w-[100px] max-w-[215px]">
                <PhoneMockup />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------- Six-Column Feature Strip (Floating Bar) ----------------- */}
      <div className="mt-6 sm:mt-8 lg:mt-8 xl:mt-10">
        <MecmFeatureStrip onSelectFeature={onSelectFeature} />
      </div>

      {/* ----------------- Decorative Bottom Wave Accents ----------------- */}
      {/* Bottom Left Rich Violet Curtain Curve */}
      <div
        className="absolute bottom-0 left-0 w-44 sm:w-64 lg:w-80 xl:w-[420px] 2xl:w-[500px] h-24 sm:h-36 lg:h-44 xl:h-52 pointer-events-none opacity-85 z-0"
        style={{
          background: 'radial-gradient(ellipse at bottom left, #7633c7 0%, #571e9a 45%, rgba(139, 92, 246, 0) 75%)',
          clipPath: 'ellipse(90% 70% at 0% 100%)',
        }}
      />

      {/* Bottom Right Rich Violet Wave Curl */}
      <div
        className="absolute bottom-0 right-0 w-44 sm:w-64 lg:w-80 xl:w-[420px] 2xl:w-[500px] h-24 sm:h-36 lg:h-44 xl:h-52 pointer-events-none opacity-85 z-0"
        style={{
          background: 'radial-gradient(ellipse at bottom right, #7b37cc 0%, #511794 45%, rgba(139, 92, 246, 0) 75%)',
          clipPath: 'ellipse(90% 70% at 100% 100%)',
        }}
      />
    </section>
  );
}

