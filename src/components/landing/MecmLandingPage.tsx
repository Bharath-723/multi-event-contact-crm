'use client';

import React, { useState } from 'react';
import MecmNavbar from './MecmNavbar';
import MecmHero from './MecmHero';
import MecmPlatformFeatures from './MecmPlatformFeatures';
import MecmUseCases from './MecmUseCases';
import MecmOrganizations from './MecmOrganizations';
import MecmContactDemo from './MecmContactDemo';
import MecmFooter from './MecmFooter';
import MecmModals from './MecmModals';

export default function MecmLandingPage() {
  const [watchDemoOpen, setWatchDemoOpen] = useState(false);
  const [requestDemoOpen, setRequestDemoOpen] = useState(false);
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  const scrollTo = (id: string) => {
    if (id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setActiveSection('home');
      return;
    }
    const elem = document.getElementById(id);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#faf8fe] text-[#1c0f33] selection:bg-[#c084fc]/30 selection:text-[#3c126d] font-sans antialiased">
      {/* ----------------- Top Sticky Navbar ----------------- */}
      <MecmNavbar
        activeSection={activeSection}
        onRequestDemo={() => setRequestDemoOpen(true)}
        onGetStarted={() => setGetStartedOpen(true)}
      />

      <main>
        {/* ----------------- Hero Section with Laptop & Phone Mockups ----------------- */}
        <MecmHero
          onExplorePlatform={() => scrollTo('features')}
          onWatchDemo={() => setWatchDemoOpen(true)}
          onSelectFeature={(targetId) => scrollTo(targetId)}
        />

        {/* ----------------- Platform Features Deep-Dive ----------------- */}
        <MecmPlatformFeatures />

        {/* ----------------- High-Touch Use Cases ----------------- */}
        <MecmUseCases />

        {/* ----------------- Enterprise Security & Organizations ----------------- */}
        <MecmOrganizations />

        {/* ----------------- Contact & Direct Portal Access ----------------- */}
        <MecmContactDemo />
      </main>

      {/* ----------------- Comprehensive Brand Footer ----------------- */}
      <MecmFooter />

      {/* ----------------- Interactive Modals ----------------- */}
      <MecmModals
        watchDemoOpen={watchDemoOpen}
        onCloseWatchDemo={() => setWatchDemoOpen(false)}
        requestDemoOpen={requestDemoOpen}
        onCloseRequestDemo={() => setRequestDemoOpen(false)}
        getStartedOpen={getStartedOpen}
        onCloseGetStarted={() => setGetStartedOpen(false)}
      />
    </div>
  );
}

