'use client';

import React, { useState } from 'react';
import { useFestival } from '@/lib/contexts/FestivalContext';
import {
  CheckCircle2, AlertCircle, Loader2, X,
  UserCheck, Smartphone, Check, Shield, UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  id: string;
  registration_no: string;
  full_name: string;
  phone: string;
  age: number;
  gender: string;
  occupation: string | null;
  area_of_stay: string | null;
  interested_to_volunteer: boolean;
  interested_to_dinner: boolean;
  transportation_required: string | null;
  operator_status: string | null;
  created_at: string;
  company_college: string;
  volunteer_slot_time: string | null;
  assigned_operator: { id: string; name: string } | null;
  visit: {
    id: string;
    visited_at: string;
    visit_method: string;
    visited_by_admin: boolean;
    remarks: string | null;
    operator_name: string;
  } | null;
}

interface SuccessCheckIn {
  regNo: string;
  name: string;
  operator: string;
  time: string;
}

export default function OperatorVisitorPage() {
  const { selectedEventId } = useFestival();
  const [query, setQuery] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  // States for confirmation & success modal
  const [showSuccess, setShowSuccess] = useState<SuccessCheckIn | null>(null);
  const [errorCheckIn, setErrorCheckIn] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── Debounced Live Search Effect ──────────────────────────────────────────
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    const digits = query.replace(/\D/g, '');
    if (digits.length >= 6 && selectedEventId) {
      const timer = setTimeout(() => {
        setLoadingSearch(true);
        setSearchError(null);
        fetch(`/api/visitor/search?q=${encodeURIComponent(digits)}&festival_event_id=${selectedEventId}`)
          .then((res) => res.json())
          .then((data) => {
            setResults(data.registrations ?? []);
          })
          .catch((err) => {
            console.error('[Autocomplete Error]:', err);
            setSearchError('Network error while searching mobile number.');
          })
          .finally(() => {
            setLoadingSearch(false);
          });
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setSearchError(null);
    }
  }, [query, selectedEventId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleQueryChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    setQuery(digits);
  };

  // ── Direct Check-in Handler ─────────────────────────────────────────────
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  const handleDirectCheckIn = async (item: SearchResult) => {
    if (!selectedEventId || checkingInId) return;
    setCheckingInId(item.id);
    setErrorCheckIn(null);

    try {
      const res = await fetch('/api/visitor/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_id: item.id,
          festival_event_id: selectedEventId,
          remarks: 'MANUAL_SEARCH',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorCheckIn(data.error || 'Check-in failed');
        if (data.details) {
          setResults((prev) =>
            prev.map((r) =>
              r.id === item.id
                ? {
                    ...r,
                    visit: {
                      id: 'existing',
                      visited_at: data.details.visited_at,
                      visit_method: data.details.visit_method,
                      visited_by_admin: data.details.checked_in_by === 'Admin',
                      remarks: null,
                      operator_name: data.details.checked_in_by,
                    },
                  }
                : r
            )
          );
        }
        return;
      }

      const nowIso = new Date().toISOString();
      setShowSuccess({
        regNo: item.phone,
        name: item.full_name,
        operator: data.visit.checked_in_by || 'Operator',
        time: new Date(data.visit.visited_at || nowIso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      });

      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch {
      setErrorCheckIn('Network error. Please try again.');
    } finally {
      setCheckingInId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-4 md:p-6 pb-12 text-slate-100">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Visitor Check-In
          </h1>
          <p className="text-slate-500 text-xs mt-1">Type mobile number for instant lookup &amp; check-in</p>
        </div>
        <a
          href="/operator/portal"
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-450 hover:text-slate-100 transition-all text-xs font-semibold"
        >
          ← Back to Call Portal
        </a>
      </div>

      {/* MOBILE NUMBER INPUT */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 pointer-events-none">
          <Smartphone className="w-5 h-5" />
        </span>
        <input
          ref={inputRef}
          type="tel"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Enter mobile number"
          maxLength={10}
          className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-950 border border-purple-500/30 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-2xl"
        />
      </div>

      {/* Inline Errors */}
      {searchError && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-950/30 border border-red-500/30 text-red-400 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {searchError}
        </div>
      )}
      {errorCheckIn && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-950/30 border border-red-500/30 text-red-400 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorCheckIn}
        </div>
      )}

      {/* Success Notification */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-green-950/40 border border-green-500/30 rounded-2xl flex flex-col items-center text-center space-y-2 relative overflow-hidden"
          >
            <button onClick={() => setShowSuccess(null)} className="absolute top-2 right-2 text-green-500 hover:text-green-300">
              <X className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-full bg-green-900/30 border border-green-500/20 flex items-center justify-center text-green-400">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-green-400">Marked Visited Successfully</h3>
              <p className="text-slate-400 text-xs mt-0.5">Mobile: +91 {showSuccess.regNo}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Autocomplete Results Area */}
      {loadingSearch ? (
        <div className="p-4 text-center text-slate-400 text-xs flex items-center justify-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> Searching mobile number...
        </div>
      ) : results.length > 0 ? (
        <div className="bg-slate-950 border border-purple-500/30 rounded-2xl p-2 space-y-2 shadow-2xl">
          {results.map((res) => (
            <div key={res.id} className="flex items-center justify-between p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl hover:border-purple-500/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <Smartphone className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="font-extrabold text-sm text-slate-100">+91 {res.phone}</p>
                  <p className="text-[11px] text-slate-400">{res.full_name} {res.company_college ? `· ${res.company_college}` : ''}</p>
                </div>
              </div>

              {res.visit ? (
                <span className="px-3.5 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-extrabold flex items-center gap-1.5 shrink-0">
                  <CheckCircle2 className="w-4 h-4" /> Already Visited
                </span>
              ) : (
                <button
                  onClick={() => handleDirectCheckIn(res)}
                  disabled={checkingInId === res.id}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 active:scale-95 cursor-pointer transition-all shrink-0"
                >
                  {checkingInId === res.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  Visited
                </button>
              )}
            </div>
          ))}
        </div>
      ) : query.length === 10 ? (
        <div className="p-6 text-center bg-slate-950 border border-slate-800 rounded-2xl space-y-1 shadow-2xl">
          <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto mb-2">
            <UserX className="w-5 h-5" />
          </div>
          <h4 className="font-extrabold text-red-400 text-sm tracking-wider">NOT FOUND</h4>
          <p className="text-xs text-slate-400">No registration found for this mobile number.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center border border-slate-900 bg-slate-950/20">
          <Smartphone className="w-10 h-10 text-slate-800 mx-auto mb-2" />
          <p className="text-slate-400 font-semibold text-sm">Enter Mobile Number</p>
          <p className="text-slate-600 text-xs mt-1">Start typing to see matching registrations &amp; mark visited.</p>
        </div>
      )}
    </div>
  );
}
