'use client';

import React from 'react';
import { useFestival } from '@/lib/contexts/FestivalContext';
import { Calendar, Sparkles } from 'lucide-react';

export default function FestivalSelector() {
  const {
    events,
    selectedEventId,
    selectedYear,
    availableYears,
    setSelectedEventId,
    setSelectedYear,
    loading,
  } = useFestival();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
        <div className="w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading events...</span>
      </div>
    );
  }

  // Filter events for the currently selected year
  const eventsForYear = events.filter((e) => e.event_year === selectedYear);

  return (
    <div className="flex items-center gap-2.5 bg-slate-900/80 border border-purple-500/20 rounded-xl px-3 py-1.5 backdrop-blur-md shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
        <Calendar className="w-3.5 h-3.5 text-purple-400" />
        <select
          value={selectedYear}
          onChange={(e) => {
            const yr = parseInt(e.target.value, 10);
            setSelectedYear(yr);
            // Default to first event in selected year
            const firstEventInYear = events.find((ev) => ev.event_year === yr);
            if (firstEventInYear) {
              setSelectedEventId(firstEventInYear.id);
            }
          }}
          className="bg-transparent text-slate-100 font-bold focus:outline-none cursor-pointer hover:text-purple-300 transition-colors"
          aria-label="Select Year"
        >
          {availableYears.map((yr) => (
            <option key={yr} value={yr} className="bg-slate-950 text-slate-100">
              {yr}
            </option>
          ))}
        </select>
      </div>

      <span className="text-slate-700">|</span>

      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <select
          value={selectedEventId || ''}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="bg-transparent text-slate-100 font-bold focus:outline-none cursor-pointer hover:text-amber-300 transition-colors"
          aria-label="Select Festival Event"
        >
          {eventsForYear.map((ev) => (
            <option key={ev.id} value={ev.id} className="bg-slate-950 text-slate-100">
              {ev.festival_name} {ev.registration_open ? '• (Active Reg)' : '• (Archived)'}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
