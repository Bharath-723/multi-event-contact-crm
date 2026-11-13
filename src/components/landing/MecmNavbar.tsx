'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import LotusLogo from './LotusLogo';

interface MecmNavbarProps {
  onRequestDemo: () => void;
  onGetStarted: () => void;
  activeSection?: string;
}

export default function MecmNavbar({
  onRequestDemo,
  onGetStarted,
  activeSection = 'home',
}: MecmNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
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
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? 'bg-[#faf8fe]/95 backdrop-blur-md shadow-[0_4px_25px_rgba(40,15,70,0.06)] border-b border-[#ede2f7]'
          : 'bg-[#faf8fe]/80 backdrop-blur-xs border-b border-[#ebdff8]/40'
      }`}
    >
      <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16 h-16 sm:h-18 lg:h-20 flex items-center justify-between">
        {/* ----------------- Left: Brand & Subtitle ----------------- */}
        <div
          onClick={() => scrollTo('home')}
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group select-none shrink-0"
        >
          <LotusLogo size={34} className="transition-transform group-hover:scale-105 shrink-0" />
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="font-black text-[#21113b] text-xl sm:text-2xl tracking-tight">
              MECM
            </span>
            <span className="hidden md:inline-block text-[#d2c7e4] text-lg font-light">
              |
            </span>
            <span className="hidden md:inline-block text-[#645885] text-xs sm:text-sm font-medium tracking-tight whitespace-nowrap">
              Multi-Event CRM Platform
            </span>
          </div>
        </div>

        {/* ----------------- Center: Desktop Navigation Links ----------------- */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          {/* Home - Active Pill Style from Reference */}
          <button
            type="button"
            onClick={() => scrollTo('home')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all cursor-pointer ${
              activeSection === 'home'
                ? 'bg-[#ece4fa] text-[#411b7d] shadow-[inset_0_1px_2px_rgba(100,50,160,0.06)]'
                : 'text-[#4e426b] hover:text-[#2a1152] hover:bg-[#f3edf9]'
            }`}
          >
            Home
          </button>

          <button
            type="button"
            onClick={() => scrollTo('features')}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
              activeSection === 'features'
                ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                : 'text-[#4e426b] hover:text-[#2a1152] hover:bg-[#f3edf9]'
            }`}
          >
            Features
          </button>

          <button
            type="button"
            onClick={() => scrollTo('use-cases')}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
              activeSection === 'use-cases'
                ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                : 'text-[#4e426b] hover:text-[#2a1152] hover:bg-[#f3edf9]'
            }`}
          >
            Use Cases
          </button>

          <button
            type="button"
            onClick={() => scrollTo('organizations')}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
              activeSection === 'organizations'
                ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                : 'text-[#4e426b] hover:text-[#2a1152] hover:bg-[#f3edf9]'
            }`}
          >
            Organizations
          </button>

          <button
            type="button"
            onClick={() => scrollTo('contact')}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
              activeSection === 'contact'
                ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                : 'text-[#4e426b] hover:text-[#2a1152] hover:bg-[#f3edf9]'
            }`}
          >
            Contact
          </button>
        </nav>

        {/* ----------------- Right: Actions & Mobile Hamburger ----------------- */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Request Demo Button (hidden on mobile, visible from sm) */}
          <button
            type="button"
            onClick={onRequestDemo}
            className="hidden sm:inline-flex group px-3.5 sm:px-4 xl:px-5 py-2 sm:py-2.5 rounded-full bg-white hover:bg-[#faf7fe] text-[#2b124e] border border-[#d8caea] hover:border-[#bda6dc] text-xs sm:text-sm font-semibold shadow-2xs transition-all duration-200 items-center gap-1.5 cursor-pointer hover:shadow-xs active:scale-98"
          >
            <span>Request Demo</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#542194] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>

          {/* Get Started Button */}
          <button
            type="button"
            onClick={onGetStarted}
            className="px-3.5 sm:px-5 xl:px-6 py-2 sm:py-2.5 rounded-full bg-[#39126a] hover:bg-[#4d188a] text-white text-xs sm:text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-98 whitespace-nowrap"
          >
            Get Started
          </button>

          {/* Hamburger Toggle (Visible below lg: tablet & mobile) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-[#39126a] hover:bg-[#f3edf9] focus:outline-hidden cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Menu className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
        </div>
      </div>

      {/* ----------------- Mobile Drawer Menu ----------------- */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white/98 border-b border-[#ede2f7] px-4 pt-3 pb-6 shadow-xl animate-in slide-in-from-top-4 duration-200">
          <div className="flex flex-col space-y-2">
            <button
              type="button"
              onClick={() => scrollTo('home')}
              className={`text-left px-4 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                activeSection === 'home'
                  ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                  : 'text-[#4e426b] font-medium hover:bg-[#f3edf9]'
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => scrollTo('features')}
              className={`text-left px-4 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                activeSection === 'features'
                  ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                  : 'text-[#4e426b] font-medium hover:bg-[#f3edf9]'
              }`}
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollTo('use-cases')}
              className={`text-left px-4 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                activeSection === 'use-cases'
                  ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                  : 'text-[#4e426b] font-medium hover:bg-[#f3edf9]'
              }`}
            >
              Use Cases
            </button>
            <button
              type="button"
              onClick={() => scrollTo('organizations')}
              className={`text-left px-4 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                activeSection === 'organizations'
                  ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                  : 'text-[#4e426b] font-medium hover:bg-[#f3edf9]'
              }`}
            >
              Organizations
            </button>
            <button
              type="button"
              onClick={() => scrollTo('contact')}
              className={`text-left px-4 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                activeSection === 'contact'
                  ? 'bg-[#ece4fa] text-[#411b7d] font-semibold'
                  : 'text-[#4e426b] font-medium hover:bg-[#f3edf9]'
              }`}
            >
              Contact
            </button>

            <div className="pt-3 border-t border-[#ede2f7] flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onRequestDemo();
                }}
                className="w-full py-2.5 rounded-full bg-white text-[#2b124e] border border-[#d8caea] text-sm font-semibold flex items-center justify-center gap-1.5"
              >
                <span>Request Demo</span>
                <ArrowUpRight className="w-4 h-4 text-[#542194]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onGetStarted();
                }}
                className="w-full py-2.5 rounded-full bg-[#39126a] text-white text-sm font-semibold"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

