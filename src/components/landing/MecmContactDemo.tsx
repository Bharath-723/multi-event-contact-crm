'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Send,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Building2,
  Calendar,
  Users,
  QrCode,
  LayoutDashboard,
  Headphones,
} from 'lucide-react';

export default function MecmContactDemo() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    eventScale: '1000-5000',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 700);
  };

  const portalLinks = [
    {
      title: 'Admin Operations Dashboard',
      description: 'Overall festival metrics, volunteer distribution, and live event stats.',
      href: '/admin/dashboard',
      icon: LayoutDashboard,
      badge: 'Admin Only',
    },
    {
      title: 'Master CRM & Contact Directory',
      description: 'Cross-event master database, identity resolution, and privacy flags.',
      href: '/admin/master_dashboard',
      icon: Users,
      badge: 'Admin Only',
    },
    {
      title: 'Operator Calling Desk',
      description: 'Daily calling queue, feedback notes logging, and contact updates.',
      href: '/operator/portal',
      icon: Headphones,
      badge: 'Operator Role',
    },
    {
      title: 'Gate Pass QR Scanner',
      description: 'High-speed badge scanning and real-time gate entry validation.',
      href: '/qr',
      icon: QrCode,
      badge: 'Gate Volunteer',
    },
    {
      title: 'Visitor Reception Desk',
      description: 'Search attendees, verify meal passes, and check in walk-in visitors.',
      href: '/visitor',
      icon: Calendar,
      badge: 'Reception Desk',
    },
    {
      title: 'Public Volunteer Registration',
      description: 'Live self-registration form for upcoming festivals and drives.',
      href: '/contacts-register',
      icon: Building2,
      badge: 'Public Portal',
    },
  ];

  return (
    <section id="contact" className="py-16 sm:py-24 bg-gradient-to-b from-[#f4eefa] to-[#faf8fe] relative">
      <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f2ecfa] border border-[#dccff2] text-[#4b1d7f] text-xs font-semibold mb-4">
            <span>Connect & Launch</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#1c0f33] tracking-tight">
            Schedule A Live Demo Or Access Portals
          </h2>
          <p className="mt-4 text-[#5a4d75] text-base sm:text-lg">
            Experience MECM tailored to your organization’s unique scale, or directly access any
            live system portal.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* ----------------- Left: Demo Request Form ----------------- */}
          <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-10 border border-[#eee4f8] shadow-[0_16px_45px_rgba(50,15,90,0.06)]">
            <h3 className="text-xl sm:text-2xl font-black text-[#1c0f33] mb-2">
              Request Platform Demo
            </h3>
            <p className="text-sm text-[#5a4d75] mb-6">
              Our engineering team will prepare an environment customized for your upcoming festival.
            </p>

            {submitted ? (
              <div className="py-12 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h4 className="text-xl font-bold text-[#231241]">
                  Demo Request Received!
                </h4>
                <p className="text-sm text-[#5a4d75] max-w-sm">
                  Thank you, <span className="font-semibold text-[#3c126d]">{formData.name}</span>.
                  Our team will reach out at <span className="font-semibold text-[#3c126d]">{formData.email}</span> within 24 hours.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="mt-4 text-xs font-semibold text-[#6e28b8] hover:underline"
                >
                  Submit another inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#3a2c53] uppercase tracking-wider mb-1.5">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/20 text-sm text-[#1f1635] outline-hidden transition-all bg-[#faf9fd]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3a2c53] uppercase tracking-wider mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="ramesh@temple.org"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/20 text-sm text-[#1f1635] outline-hidden transition-all bg-[#faf9fd]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#3a2c53] uppercase tracking-wider mb-1.5">
                      Organization / Temple
                    </label>
                    <input
                      type="text"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      placeholder="e.g. HKM Bangalore"
                      className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/20 text-sm text-[#1f1635] outline-hidden transition-all bg-[#faf9fd]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#3a2c53] uppercase tracking-wider mb-1.5">
                      Expected Attendance
                    </label>
                    <select
                      value={formData.eventScale}
                      onChange={(e) => setFormData({ ...formData, eventScale: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/20 text-sm text-[#1f1635] outline-hidden transition-all bg-[#faf9fd]"
                    >
                      <option value="100-1000">100 – 1,000 devotees</option>
                      <option value="1000-5000">1,000 – 5,000 attendees</option>
                      <option value="5000-20000">5,000 – 20,000 visitors</option>
                      <option value="20000+">20,000+ mega festival</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3a2c53] uppercase tracking-wider mb-1.5">
                    How can we help? (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Tell us about your upcoming event, volunteer count, or specific requirements..."
                    className="w-full px-4 py-2.5 rounded-xl border border-[#ded5ee] focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/20 text-sm text-[#1f1635] outline-hidden transition-all bg-[#faf9fd] resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-[#3c126d] hover:bg-[#4d188a] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-70"
                >
                  {loading ? (
                    <span>Submitting...</span>
                  ) : (
                    <>
                      <span>Submit Request</span>
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* ----------------- Right: Direct Access to Live Portals ----------------- */}
          <div className="lg:col-span-6 space-y-4">
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#7934c9]">
                Live Environment
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-[#1c0f33] mt-1">
                Direct Portal Launcher
              </h3>
              <p className="text-sm text-[#5a4d75]">
                Instantly navigate to any active operational subsystem within this platform.
              </p>
            </div>

            <div className="space-y-3">
              {portalLinks.map((portal) => {
                const Icon = portal.icon;
                return (
                  <Link
                    key={portal.title}
                    href={portal.href}
                    className="group bg-white rounded-2xl p-4 sm:p-5 border border-[#eee4f8] shadow-2xs hover:shadow-md hover:border-[#dbcbf2] transition-all flex items-center justify-between gap-4 block"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-[#f4ecfc] text-[#6e28b8] group-hover:bg-[#3c126d] group-hover:text-white transition-all flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[#231241] text-sm sm:text-base group-hover:text-[#521b9b] transition-colors">
                            {portal.title}
                          </h4>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#f4effc] text-[#5e239e]">
                            {portal.badge}
                          </span>
                        </div>
                        <p className="text-xs text-[#6e628b] mt-0.5">
                          {portal.description}
                        </p>
                      </div>
                    </div>

                    <ExternalLink className="w-4 h-4 text-[#8b5cf6] shrink-0 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

