'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search, Clock, CheckCircle2, AlertCircle, Loader2, X,
  UserCheck, RefreshCw, Smartphone, Check, HelpCircle, Shield,
  UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFestival } from '@/lib/contexts/FestivalContext';

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

interface VisitorLog {
  id: string;
  visited_at: string;
  visit_method: string;
  registration_no: string;
  full_name: string;
  phone: string;
  checked_in_by: string;
  status: string;
}

interface DashboardStats {
  registered: number;
  visited: number;
  remaining: number;
  volunteer_visited: number;
  dinner_count: number;
  todays_visits: number;
}

interface SuccessCheckIn {
  regNo: string;
  name: string;
  operator: string;
  time: string;
}

const ZERO_STATS: DashboardStats = {
  registered: 0, visited: 0, remaining: 0,
  volunteer_visited: 0, dinner_count: 0, todays_visits: 0,
};

export default function AdminVisitorPage() {
  const { selectedEventId, selectedFestival } = useFestival();

  const [query, setQuery] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedVisitor, setSelectedVisitor] = useState<SearchResult | null>(null);

  // States for confirmation & success modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState<SuccessCheckIn | null>(null);
  const [checkInRemarks, setCheckInRemarks] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [errorCheckIn, setErrorCheckIn] = useState<string | null>(null);

  // Stats & Log states — initialised to zero, show loading until first fetch
  const [stats, setStats] = useState<DashboardStats>(ZERO_STATS);
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsAuthorized, setLogsAuthorized] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Track which event we last fetched so stale responses are discarded
  const lastFetchedEventId = useRef<string | null | undefined>(undefined);

  // ── Helper: admin auth headers ─────────────────────────────────────────────
  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    };
  }, []);

  // ── Core data loader ───────────────────────────────────────────────────────
  const loadStatsAndLogs = useCallback(async (eventId: string | null) => {
    // An unset/null festival means context hasn't resolved yet — bail out.
    if (!eventId) return;

    // Mark which event we are loading so stale responses can be dropped.
    const thisEventId = eventId;
    lastFetchedEventId.current = thisEventId;

    setLoadingStats(true);
    setLoadingLogs(true);

    try {
      const headers = await getHeaders();
      const param = `festival_event_id=${thisEventId}`;

      // Parallel fetch
      const [statsRes, logsRes] = await Promise.all([
        fetch(`/api/visitor/stats?${param}`, { headers }),
        fetch(`/api/visitor/logs?limit=50&${param}`, { headers }),
      ]);

      // Discard if the festival changed while we were fetching
      if (lastFetchedEventId.current !== thisEventId) return;

      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.stats ?? ZERO_STATS);
      } else {
        setStats(ZERO_STATS);
      }
      setLoadingStats(false);

      if (logsRes.ok) {
        const d = await logsRes.json();
        setLogs(d.logs ?? []);
        setLogsAuthorized(true);
      } else if (logsRes.status === 401) {
        setLogsAuthorized(false);
      } else {
        setLogs([]);
      }
      setLoadingLogs(false);

    } catch (err) {
      console.error('Failed to load visitor data:', err);
      if (lastFetchedEventId.current === thisEventId) {
        setStats(ZERO_STATS);
        setLogs([]);
        setLoadingStats(false);
        setLoadingLogs(false);
      }
    }
  }, [getHeaders]);

  // ── Festival switch effect ─────────────────────────────────────────────────
  // When selectedEventId changes:
  // 1. Immediately clear stale data and show loading
  // 2. Clear search results
  // 3. Reload stats + logs for the new festival
  // 4. Re-create the realtime channel keyed to the new festival
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStats(ZERO_STATS);
    setLogs([]);
    setResults([]);
    setSelectedVisitor(null);
    setQuery('');
    setSearchError(null);
    setShowSuccess(null);
    setErrorCheckIn(null);
    setLoadingStats(true);
    setLoadingLogs(true);

    if (!selectedEventId) {
      setLoadingStats(false);
      setLoadingLogs(false);
      return;
    }

    // Fetch data for the new festival
    loadStatsAndLogs(selectedEventId);

    // Realtime subscription keyed to this specific festival so we don't
    // cross-contaminate when switching festivals. The channel name includes
    // the festival ID so Supabase creates a new subscription per festival.
    const channelName = `visitor_checkins_${selectedEventId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visitor_visits' },
        () => {
          // Re-fetch stats and logs scoped to the current festival only
          loadStatsAndLogs(selectedEventId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedEventId, loadStatsAndLogs]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const searchVal = query.trim().replace(/\s+/g, ' ');
    if (!searchVal) {
      setResults([]);
      setSelectedVisitor(null);
      setSearchError(null);
      return;
    }
    if (!selectedEventId) {
      setSearchError('Please select a festival before searching.');
      return;
    }

    setLoadingSearch(true);
    setSearchError(null);
    setErrorCheckIn(null);
    setResults([]);
    setSelectedVisitor(null);
    try {
      const headers = await getHeaders();
      const searchUrl = `/api/visitor/search?q=${encodeURIComponent(searchVal)}&festival_event_id=${selectedEventId}`;
      const res = await fetch(searchUrl, { headers });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || `Search failed (HTTP ${res.status}). Please try again.`);
        return;
      }
      const registrations = data.registrations ?? [];
      setResults(registrations);
      if (registrations.length === 1) {
        setSelectedVisitor(registrations[0]);
      }
    } catch (err) {
      console.error('[Search] Network error:', err);
      setSearchError('Network error. Please check your connection and try again.');
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (!val.trim()) {
      setResults([]);
      setSelectedVisitor(null);
      setSearchError(null);
    }
  };

  // ── Check-in ───────────────────────────────────────────────────────────────
  const handleApproveCheckIn = async () => {
    if (!selectedVisitor || !selectedEventId) return;
    setCheckingIn(true);
    setErrorCheckIn(null);

    try {
      const headers = await getHeaders();
      const res = await fetch('/api/visitor/check-in', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          registration_id: selectedVisitor.id,
          festival_event_id: selectedEventId,   // ← required for festival isolation
          remarks: checkInRemarks,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorCheckIn(data.error || 'Check-in failed');
        if (data.details) {
          setSelectedVisitor(prev => prev ? {
            ...prev,
            visit: {
              id: 'existing',
              visited_at: data.details.visited_at,
              visit_method: data.details.visit_method,
              visited_by_admin: data.details.checked_in_by === 'Admin',
              remarks: null,
              operator_name: data.details.checked_in_by,
            }
          } : null);
        }
        return;
      }

      // Success
      setShowConfirm(false);
      setCheckInRemarks('');

      const updatedVisitor = {
        ...selectedVisitor,
        visit: {
          id: data.visit.id,
          visited_at: data.visit.visited_at,
          visit_method: 'MANUAL_SEARCH',
          visited_by_admin: true,
          remarks: checkInRemarks || null,
          operator_name: data.visit.checked_in_by,
        }
      };
      setSelectedVisitor(updatedVisitor);
      setResults(prev => prev.map(r => r.id === selectedVisitor.id ? updatedVisitor : r));

      setShowSuccess({
        regNo: data.visit.registration_no,
        name: data.visit.full_name,
        operator: data.visit.checked_in_by,
        time: new Date(data.visit.visited_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      });

      // Stats will refresh via the realtime INSERT subscription
    } catch {
      setErrorCheckIn('Network error. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Shield className="w-7 h-7 text-purple-400" />
            Visitor Check-In Center
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {selectedFestival
              ? <><span className="text-purple-400 font-semibold">{selectedFestival.festival_name} {selectedFestival.event_year}</span> · Manual search, check-in &amp; live logs</>
              : 'Select a festival above to begin'
            }
          </p>
        </div>
        <button
          onClick={() => {
            if (selectedEventId) loadStatsAndLogs(selectedEventId);
          }}
          className="self-start px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Sync Data
        </button>
      </div>

      {/* No festival selected */}
      {!selectedEventId && (
        <div className="glass-card rounded-2xl p-12 text-center border border-slate-900">
          <HelpCircle className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-semibold">No Festival Selected</p>
          <p className="text-slate-600 text-xs mt-1">Use the festival selector in the header to choose a festival.</p>
        </div>
      )}

      {selectedEventId && (
        <>
          {/* STATISTICS STRIP */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total Registered', value: stats.registered, color: 'text-purple-400', bg: 'bg-purple-950/20 border-purple-500/10' },
              { label: 'Checked In', value: stats.visited, color: 'text-green-400', bg: 'bg-green-950/20 border-green-500/10' },
              { label: 'Remaining', value: stats.remaining, color: 'text-yellow-450', bg: 'bg-yellow-950/20 border-yellow-500/10' },
              { label: 'Volunteers Checked In', value: stats.volunteer_visited, color: 'text-blue-400', bg: 'bg-blue-950/20 border-blue-500/10' },
              { label: 'Prasadam Count', value: stats.dinner_count, color: 'text-indigo-400', bg: 'bg-indigo-950/20 border-indigo-500/10' },
            ].map((card) => (
              <div key={card.label} className={`glass-card rounded-xl p-3 text-center border ${card.bg}`}>
                {loadingStats
                  ? <div className="flex justify-center py-1"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
                  : <p className={`text-xl font-black ${card.color}`}>{card.value}</p>
                }
                <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5 tracking-wider">{card.label}</p>
              </div>
            ))}
          </div>

          {/* SEARCH AND RESULTS ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Side: Search & Details Card */}
            <div className="lg:col-span-7 space-y-4">
              {/* Large Search Input */}
              <form onSubmit={handleSearch} className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 pointer-events-none">
                  <Search className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Search by Reg No (REG-YYYY-000000), Phone, or Name..."
                  className="w-full pl-11 pr-24 py-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-xl"
                />
                <button
                  type="submit"
                  disabled={loadingSearch || !query.trim()}
                  className="absolute right-2.5 top-2 bottom-2 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {loadingSearch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                </button>
              </form>

              {/* Inline Search Error */}
              {searchError && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-950/30 border border-red-500/30 text-red-400 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {searchError}
                </div>
              )}

              {/* Search Result List (if multiple results found) */}
              {results.length > 1 && !selectedVisitor && (
                <div className="glass-card rounded-2xl p-4 space-y-2 border border-slate-900">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Multiple Visitors Found ({results.length})</p>
                  <div className="divide-y divide-slate-900/60 max-h-52 overflow-y-auto pr-1">
                    {results.map((res) => (
                      <div
                        key={res.id}
                        onClick={() => setSelectedVisitor(res)}
                        className="flex justify-between items-center py-2.5 px-2 hover:bg-slate-900/40 rounded-xl cursor-pointer transition-all"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-200">{res.full_name}</p>
                          <p className="text-xs text-slate-500">{res.registration_no} · {res.phone}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          res.visit ? 'text-green-400 bg-green-950/20 border-green-500/20' : 'text-yellow-400 bg-yellow-950/20 border-yellow-500/20'
                        }`}>
                          {res.visit ? 'Visited' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Success Check-In Card */}
              <AnimatePresence>
                {showSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 bg-green-950/40 border border-green-500/30 rounded-2xl flex flex-col items-center text-center space-y-2.5 relative overflow-hidden"
                  >
                    <div className="absolute top-2 right-2">
                      <button onClick={() => setShowSuccess(null)} className="text-green-500 hover:text-green-300">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-green-900/30 border border-green-500/20 flex items-center justify-center text-green-400">
                      <Check className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-green-400">✓ Visitor Checked In Successfully</h3>
                      <p className="text-slate-100 text-xs font-bold mt-1">{showSuccess.name}</p>
                      <p className="text-slate-400 text-[10px] mt-0.5">ID: {showSuccess.regNo}</p>
                    </div>
                    <div className="w-full border-t border-green-550/10 pt-2 text-[10px] text-green-400/80 flex justify-between px-6">
                      <span>Checked In By: <strong>{showSuccess.operator}</strong></span>
                      <span>Time: <strong>{showSuccess.time}</strong></span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Selected Visitor Details Card */}
              {selectedVisitor ? (
                <div className="glass-card rounded-2xl p-5 border border-slate-900 space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-purple-400 bg-purple-950/40 border border-purple-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
                        {selectedVisitor.registration_no}
                      </span>
                      <h2 className="text-lg font-black text-slate-100 mt-1">{selectedVisitor.full_name}</h2>
                      <p className="text-xs text-slate-500">{selectedVisitor.phone}</p>
                    </div>

                    {/* Visit status indicator */}
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 flex items-center gap-1.5 ${
                      selectedVisitor.visit
                        ? 'text-green-400 bg-green-950/30 border-green-500/25'
                        : 'text-yellow-450 bg-yellow-950/30 border-yellow-500/25'
                    }`}>
                      {selectedVisitor.visit ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                      {selectedVisitor.visit ? 'Already Checked In' : 'Pending Check-In'}
                    </span>
                  </div>

                  {/* Detailed fields grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs border-t border-b border-slate-900 py-4">
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Age &amp; Gender</p>
                      <p className="text-slate-200 mt-0.5">{selectedVisitor.age} Years · {selectedVisitor.gender}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Occupation</p>
                      <p className="text-slate-200 mt-0.5 truncate">{selectedVisitor.occupation || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Area of Stay</p>
                      <p className="text-slate-200 mt-0.5 truncate">{selectedVisitor.area_of_stay || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Company / College</p>
                      <p className="text-slate-200 mt-0.5 truncate">{selectedVisitor.company_college}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Volunteer Option</p>
                      <p className={`mt-0.5 font-semibold ${selectedVisitor.interested_to_volunteer ? 'text-purple-400' : 'text-slate-400'}`}>
                        {selectedVisitor.interested_to_volunteer ? `Yes (${selectedVisitor.volunteer_slot_time || 'Pending'})` : 'No'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Prasadam</p>
                      <p className="text-slate-200 mt-0.5">{selectedVisitor.interested_to_dinner ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Transportation Required</p>
                      <p className="text-slate-200 mt-0.5">{selectedVisitor.transportation_required || 'No'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Current Operator Status</p>
                      <p className={`mt-0.5 font-semibold ${
                        selectedVisitor.operator_status === 'Coming' ? 'text-green-400' :
                        selectedVisitor.operator_status === 'Not Coming' ? 'text-red-400' :
                        selectedVisitor.operator_status === 'Callback Required' ? 'text-blue-400' : 'text-yellow-405'
                      }`}>{selectedVisitor.operator_status || 'Pending'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Assigned Operator</p>
                      <p className="text-slate-200 mt-0.5">{selectedVisitor.assigned_operator?.name || 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-bold uppercase text-[9px]">Registration Date</p>
                      <p className="text-slate-200 mt-0.5">
                        {new Date(selectedVisitor.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {/* Already Checked-in breakdown display */}
                  {selectedVisitor.visit && (
                    <div className="p-3.5 bg-slate-900/50 border border-slate-800 rounded-xl space-y-2">
                      <p className="text-xs font-extrabold text-green-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Check-In Recorded
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                        <div>Checked In Time: <strong className="text-slate-200">{new Date(selectedVisitor.visit.visited_at).toLocaleString('en-IN', { hour12: true })}</strong></div>
                        <div>Checked In By: <strong className="text-slate-200">{selectedVisitor.visit.operator_name}</strong></div>
                        <div>Method: <strong className="text-slate-200">{selectedVisitor.visit.visit_method}</strong></div>
                        {selectedVisitor.visit.remarks && <div className="col-span-2 mt-1 italic">Remarks: &ldquo;{selectedVisitor.visit.remarks}&rdquo;</div>}
                      </div>
                    </div>
                  )}

                  {/* Error messages */}
                  {errorCheckIn && (
                    <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
                      <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-400 mt-0.5" />
                      <span>{errorCheckIn}</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {!selectedVisitor.visit ? (
                      <button
                        onClick={() => { setShowConfirm(true); setErrorCheckIn(null); }}
                        className="flex-1 py-3.5 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-sm transition-all cursor-pointer shadow-lg shadow-green-950/30 flex items-center justify-center gap-2"
                      >
                        <UserCheck className="w-5 h-5" /> Approve Visit
                      </button>
                    ) : (
                      <button
                        disabled
                        className="flex-1 py-3.5 rounded-xl bg-slate-850 text-slate-500 border border-slate-800 text-sm font-bold opacity-60 flex items-center justify-center gap-2 cursor-not-allowed"
                      >
                        Already Checked In
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedVisitor(null)}
                      className="px-5 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 transition-all font-semibold text-sm cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : results.length > 1 ? (
                null
              ) : !loadingSearch && query ? (
                <div className="glass-card rounded-2xl p-10 text-center border border-slate-900">
                  <UserX className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-400 font-semibold">No visitor records found</p>
                  <p className="text-slate-600 text-xs mt-1">Make sure you have typed the exact ID or correct phone number.</p>
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-10 text-center border border-slate-900 bg-slate-950/20">
                  <Smartphone className="w-12 h-12 text-slate-800 mx-auto mb-3" />
                  <p className="text-slate-400 font-semibold">Ready to Check In</p>
                  <p className="text-slate-600 text-xs mt-1">Type details in the search box to lookup visitor registration.</p>
                </div>
              )}
            </div>

            {/* Right Side: Visitor Logs (Realtime) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-300 uppercase tracking-wider">Live Check-In Logs</h2>
                <span className="text-[10px] text-purple-400 font-bold bg-purple-950/40 border border-purple-500/20 px-2 py-0.5 rounded">
                  Realtime Active
                </span>
              </div>

              <div className="glass-card rounded-2xl p-4 border border-slate-900 flex flex-col min-h-[350px] max-h-[550px] overflow-hidden">
                {!logsAuthorized ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <HelpCircle className="w-8 h-8 text-slate-700 mb-2" />
                    <p className="text-sm font-semibold text-slate-400">Authentication Required</p>
                    <p className="text-xs text-slate-600 mt-1">Admin authorization is required to view live check-in logs.</p>
                  </div>
                ) : loadingLogs ? (
                  <div className="flex-1 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-purple-400" /></div>
                ) : logs.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <HelpCircle className="w-8 h-8 text-slate-700 mb-2" />
                    <p className="text-sm font-semibold">No check-ins yet.</p>
                    <p className="text-xs text-slate-600">Visitor check-in logs will appear here live.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {logs.map((log) => (
                      <div key={log.id} className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl space-y-1.5 transition-all">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-bold text-slate-200">{log.full_name}</p>
                            <p className="text-[10px] text-slate-500 font-semibold">{log.registration_no} · {log.phone}</p>
                          </div>
                          <span className="text-[9px] text-slate-500 font-medium">
                            {new Date(log.visited_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[9px] text-slate-500 border-t border-slate-900/60 pt-1">
                          <span>By: <strong className="text-purple-400/80">{log.checked_in_by}</strong></span>
                          <span>Method: <strong className="text-slate-400">{log.visit_method}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* CONFIRMATION DIALOG (MODAL) */}
      <AnimatePresence>
        {showConfirm && selectedVisitor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-card rounded-2xl p-6 relative border border-slate-800"
            >
              <h3 className="font-extrabold text-slate-100 text-base mb-2">Approve Visitor Check-in?</h3>

              <div className="space-y-3 mt-4 text-xs">
                <div className="p-3 bg-slate-900/50 rounded-xl space-y-1">
                  <div><span className="text-slate-500">ID:</span> <strong className="text-slate-200 font-bold">{selectedVisitor.registration_no}</strong></div>
                  <div><span className="text-slate-500">Name:</span> <strong className="text-slate-200 font-bold">{selectedVisitor.full_name}</strong></div>
                  {selectedFestival && (
                    <div><span className="text-slate-500">Festival:</span> <strong className="text-purple-400">{selectedFestival.festival_name} {selectedFestival.event_year}</strong></div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Remarks (Optional)</label>
                  <input
                    type="text"
                    value={checkInRemarks}
                    onChange={(e) => setCheckInRemarks(e.target.value)}
                    placeholder="e.g. checked in manually, entry gate 1..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-850 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleApproveCheckIn}
                  disabled={checkingIn}
                  className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {checkingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Approve
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={checkingIn}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold hover:text-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
