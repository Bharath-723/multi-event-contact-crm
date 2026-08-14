'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CheckCircle2, AlertCircle, Loader2, X,
  UserCheck, RefreshCw, Smartphone, Check, HelpCircle, Shield,
  UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFestival } from '@/lib/contexts/FestivalContext';
import { getRegistrationSource } from '@/lib/source-resolver';

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

  // States for confirmation & success modal
  const [showSuccess, setShowSuccess] = useState<SuccessCheckIn | null>(null);
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
    const sourceConfig = getRegistrationSource(selectedEventId);
    const channelName = `visitor_checkins_${selectedEventId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: sourceConfig.visitsTable },
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



  // ── Debounced Live Search Effect ──────────────────────────────────────────
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const digits = query.replace(/\D/g, '');
    if (digits.length >= 6 && selectedEventId) {
      const timer = setTimeout(() => {
        setLoadingSearch(true);
        setSearchError(null);
        getHeaders().then((headers) => {
          fetch(`/api/visitor/search?q=${encodeURIComponent(digits)}&festival_event_id=${selectedEventId}`, { headers })
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
        });
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setSearchError(null);
    }
  }, [query, selectedEventId, getHeaders]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleQueryChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    setQuery(digits);
  };

  // ── Direct Check-in Handler from Autocomplete item ──────────────────────────
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  const handleDirectCheckIn = async (item: SearchResult) => {
    if (!selectedEventId || checkingInId) return;
    setCheckingInId(item.id);
    setErrorCheckIn(null);

    try {
      const headers = await getHeaders();
      const res = await fetch('/api/visitor/check-in', {
        method: 'POST',
        headers,
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

      // 1. Instant stats update
      setStats((prev) => ({
        ...prev,
        visited: prev.visited + 1,
        remaining: Math.max(0, prev.remaining - 1),
        volunteer_visited: item.interested_to_volunteer ? prev.volunteer_visited + 1 : prev.volunteer_visited,
        dinner_count: item.interested_to_dinner ? prev.dinner_count + 1 : prev.dinner_count,
      }));

      const nowIso = new Date().toISOString();
      const newLogEntry: VisitorLog = {
        id: data.visit.id || `log-${item.id}`,
        visited_at: data.visit.visited_at || nowIso,
        visit_method: 'MANUAL_SEARCH',
        registration_no: item.registration_no || '—',
        full_name: item.full_name || 'Visitor Check-In',
        phone: item.phone,
        checked_in_by: data.visit.checked_in_by || 'Admin',
        status: 'Visited',
      };
      setLogs((prev) => [newLogEntry, ...prev]);

      setShowSuccess({
        regNo: item.phone,
        name: item.full_name,
        operator: data.visit.checked_in_by || 'Admin',
        time: new Date(data.visit.visited_at || nowIso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      });

      // 3. Clear query & input immediately for next entry
      setQuery('');
      setResults([]);
    } catch {
      setErrorCheckIn('Network error. Please try again.');
    } finally {
      setCheckingInId(null);
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
              ? <><span className="text-purple-400 font-semibold">{selectedFestival.festival_name} {selectedFestival.event_year}</span> · Type mobile number for instant lookup</>
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
            {/* Left Side: Live Autocomplete Input & Results */}
            <div className="lg:col-span-7 space-y-3">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 pointer-events-none">
                  <Smartphone className="w-5 h-5" />
                </span>
                <input
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

    </div>
  );
}
