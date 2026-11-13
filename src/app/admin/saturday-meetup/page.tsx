'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CalendarCheck, PhoneCall, UserCheck, Users,
  Search, Download, Printer, RefreshCw, Loader2,
  AlertCircle, Clock, CheckCircle2, History, X,
  ChevronRight, Calendar
} from 'lucide-react';

interface SaturdayVisitorHistoryItem {
  id: string;
  weekly_period: string;
  meetup_date: string;
  meetup_date_label: string;
  total_visitors: number;
  total_attendance: number;
  archived_at: string;
}

interface SaturdayAttendanceItem {
  id: string;
  name: string;
  phone: string;
  gender: string;
  level: string;
  level_badge_class: string;
  classes_attended: number;
  chanting: number;
  attendance_type: 'Operator Coming + Admin Approved' | 'Operator Coming' | 'Admin Approved' | 'Approved Visitor';
  operator_name: string | null;
  operator_status: string | null;
  admin_approved: boolean;
  checked_in_at: string | null;
  approved_by_email: string | null;
}

interface MeetupMetrics {
  assigned_calls: number;
  coming: number;
  pending_calls: number;
  visitors: number;
  total_attendance: number;
}

export default function SaturdayMeetupPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MeetupMetrics>({
    assigned_calls: 0,
    coming: 0,
    pending_calls: 0,
    visitors: 0,
    total_attendance: 0,
  });
  const [attendance, setAttendance] = useState<SaturdayAttendanceItem[]>([]);
  const [weeklyPeriodLabel, setWeeklyPeriodLabel] = useState<string>('');
  const [visitorHistory, setVisitorHistory] = useState<SaturdayVisitorHistoryItem[]>([]);
  const [showVisitorHistory, setShowVisitorHistory] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGender, setSelectedGender] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');

  // 1. Fetch meet-up data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/saturday-meetup', {
        headers: {
          Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      setMetrics(data.metrics || {
        assigned_calls: 0,
        coming: 0,
        pending_calls: 0,
        visitors: 0,
        total_attendance: 0,
      });
      setAttendance(data.attendance || []);
      setWeeklyPeriodLabel(data.weekly_period_label || '');
      setVisitorHistory(data.visitor_history || []);
    } catch (err: unknown) {
      console.error('[Saturday Meet-up] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load meet-up data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // 2. Filter attendance rows
  const filteredAttendance = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return attendance.filter((item) => {
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''));

      const matchGender =
        selectedGender === 'ALL' || item.gender.toLowerCase() === selectedGender.toLowerCase();

      const matchLevel =
        selectedLevel === 'ALL' || item.level.toLowerCase().includes(selectedLevel.toLowerCase());

      const matchType =
        selectedType === 'ALL' || item.attendance_type.toLowerCase().includes(selectedType.toLowerCase());

      return matchSearch && matchGender && matchLevel && matchType;
    });
  }, [attendance, searchQuery, selectedGender, selectedLevel, selectedType]);

  // 3. Export CSV handler (All matching records)
  const handleExportCSV = () => {
    if (filteredAttendance.length === 0) return;

    const headers = ['Name', 'Phone Number', 'Gender', 'Level', 'Classes Attended', 'Chanting', 'Attendance Type', 'Operator', 'Admin Approved', 'Checked In At'];
    const rows = filteredAttendance.map((item) => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.phone}"`,
      `"${item.gender}"`,
      `"${item.level}"`,
      item.classes_attended,
      item.chanting,
      `"${item.attendance_type}"`,
      `"${item.operator_name || '—'}"`,
      item.admin_approved ? 'Yes' : 'No',
      item.checked_in_at ? `"${new Date(item.checked_in_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}"` : '—',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `saturday_meetup_attendance_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 4. Print Table handler (All matching records)
  const handlePrintTable = () => {
    if (filteredAttendance.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const tableRows = filteredAttendance.map((item, idx) => `
      <tr>
        <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
        <td style="font-weight: 700; color: #1e1b4b;">${item.name}</td>
        <td style="font-family: monospace;">${item.phone}</td>
        <td>${item.gender}</td>
        <td style="text-align: center; font-weight: 600;">${item.level}</td>
        <td style="text-align: center;">${item.classes_attended}</td>
        <td style="text-align: center;">${item.chanting}</td>
        <td>${item.attendance_type}</td>
        <td>${item.operator_name || '—'}</td>
        <td style="text-align: center;">${item.admin_approved ? 'Yes' : 'No'}</td>
        <td>${item.checked_in_at ? new Date(item.checked_in_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Saturday Meet-up Attendance Report</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            @media print {
              thead { display: table-header-group; }
              tr { page-break-inside: avoid; }
            }
            body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; padding: 16px; background: #fff; }
            h2 { color: #4f46e5; margin: 0 0 4px 0; font-size: 18px; }
            p.meta { color: #64748b; font-size: 11px; margin: 0 0 14px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; word-break: break-word; }
            th { background-color: #e0e7ff; color: #3730a3; font-weight: 700; }
            tr:nth-child(even) { background-color: #f8fafc; }
          </style>
        </head>
        <body>
          <h2>Saturday Meet-up Attendance Report (${weeklyPeriodLabel || 'Current Week'})</h2>
          <p class="meta">Total Attendance Records: ${filteredAttendance.length} • Generated on ${new Date().toLocaleString('en-IN')}</p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Phone Number</th>
                <th>Gender</th>
                <th>Level</th>
                <th>Classes</th>
                <th>Chanting</th>
                <th>Attendance Type</th>
                <th>Operator</th>
                <th>Approved</th>
                <th>Checked In At</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 pb-16">
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-950/40">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">
                Saturday Meet-up Dashboard
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Active Period: <strong className="text-purple-400 font-semibold">{weeklyPeriodLabel || 'Current Week'}</strong></span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">Weekly Rollover: <strong className="text-slate-300">Every Friday 00:00 IST</strong></span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/30 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-400' : ''}`} />
            Sync Data
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filteredAttendance.length === 0}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition-all text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md shadow-purple-950/30 active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV ({filteredAttendance.length})
          </button>
          <button
            onClick={handlePrintTable}
            disabled={filteredAttendance.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/30 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5 text-purple-400" />
            Print Table
          </button>
        </div>
      </div>

      {/* ── ERROR ALERT ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-red-300 flex items-center gap-3 text-xs">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── SUMMARY CARDS ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Assigned Calls */}
        <div className="glass-card rounded-2xl p-4 border border-blue-500/15 bg-blue-950/10 hover:border-blue-500/30 transition-all shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Assigned Calls</span>
            <div className="w-7 h-7 rounded-lg bg-blue-950/60 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <PhoneCall className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-500 my-1" />
            ) : (
              <span className="text-3xl font-black text-slate-100">{metrics.assigned_calls}</span>
            )}
            <span className="text-[11px] text-slate-500 font-medium">contacts assigned</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Active operator assignments from Master Dashboard</p>
        </div>

        {/* Card 2: Coming */}
        <div className="glass-card rounded-2xl p-4 border border-emerald-500/15 bg-emerald-950/10 hover:border-emerald-500/30 transition-all shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Coming</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-500 my-1" />
            ) : (
              <span className="text-3xl font-black text-emerald-400">{metrics.coming}</span>
            )}
            <span className="text-[11px] text-slate-500 font-medium">confirmed contacts</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Marked coming by operators + admin approved</p>
        </div>

        {/* Card 3: Pending Calls */}
        <div className="glass-card rounded-2xl p-4 border border-amber-500/15 bg-amber-950/10 hover:border-amber-500/30 transition-all shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Pending Calls</span>
            <div className="w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-500 my-1" />
            ) : (
              <span className="text-3xl font-black text-amber-400">{metrics.pending_calls}</span>
            )}
            <span className="text-[11px] text-slate-500 font-medium">calls pending</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Assigned contacts pending operator response</p>
        </div>

        {/* Card 4: Visitors (Clickable to open historical tracking) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowVisitorHistory(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowVisitorHistory(true);
            }
          }}
          className="glass-card rounded-2xl p-4 border border-purple-500/25 bg-purple-950/20 hover:border-purple-400/50 hover:bg-purple-950/30 transition-all shadow-lg relative overflow-hidden cursor-pointer group focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          title="Click to view historical Saturday Meetup visitor records"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Visitors</span>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 group-hover:bg-purple-500/30 group-hover:border-purple-400/50 transition-colors">
                <History className="w-2.5 h-2.5" /> History ↗
              </span>
              <div className="w-7 h-7 rounded-lg bg-purple-950/60 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:text-purple-300 transition-colors">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-500 my-1" />
            ) : (
              <span className="text-3xl font-black text-purple-300">{metrics.visitors}</span>
            )}
            <span className="text-[11px] text-slate-500 font-medium">approved walk-ins</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 flex items-center justify-between">
            <span>Approved walk-ins this week</span>
            <span className="text-purple-400 underline underline-offset-2 font-medium opacity-90 group-hover:opacity-100">
              View History
            </span>
          </p>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4 border border-slate-900 bg-slate-950/50 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="flex-1 relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by contact name or phone number..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs font-medium focus:outline-none focus:border-purple-500/50"
            />
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Level Filter */}
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-semibold focus:outline-none focus:border-purple-500/50 cursor-pointer"
            >
              <option value="ALL">All Levels</option>
              <option value="level-0/No level">level-0/No level</option>
              <option value="level-1/AOMC">level-1/AOMC</option>
              <option value="level-2/Foundation">level-2/Foundation</option>
              <option value="level-3/Prilims">level-3/Prilims</option>
              <option value="level-4/Enhance">level-4/Enhance</option>
            </select>

            {/* Gender Filter */}
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-semibold focus:outline-none focus:border-purple-500/50 cursor-pointer"
            >
              <option value="ALL">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            {/* Attendance Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-semibold focus:outline-none focus:border-purple-500/50 cursor-pointer"
            >
              <option value="ALL">All Sources</option>
              <option value="Operator">Operator Coming</option>
              <option value="Admin">Admin Approved</option>
              <option value="Visitor">Approved Visitor</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── ATTENDANCE TABLE ────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl border border-slate-900 bg-slate-950/40 overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-extrabold text-slate-200">
              Saturday Meet-up Attendance List
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-[10px] font-bold">
              {filteredAttendance.length} Attendees
            </span>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Deduplicated by canonical mobile number
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            <p className="text-xs font-medium">Assembling Saturday attendance roster...</p>
          </div>
        ) : filteredAttendance.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2 text-center text-slate-500">
            <CalendarCheck className="w-10 h-10 text-slate-800 mb-1" />
            <p className="text-sm font-semibold text-slate-400">No Attendees Found</p>
            <p className="text-xs text-slate-600 max-w-sm">
              Contacts marked &quot;Coming&quot; by operators or approved via Visitor Check-In will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/40 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Name</th>
                  <th className="py-3.5 px-4">Phone Number</th>
                  <th className="py-3.5 px-4">Gender</th>
                  <th className="py-3.5 px-4">Level</th>
                  <th className="py-3.5 px-4 text-center">Classes Attended</th>
                  <th className="py-3.5 px-4 text-center">Chanting</th>
                  <th className="py-3.5 px-4">Attendance Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/80 text-xs">
                {filteredAttendance.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                    {/* Name */}
                    <td className="py-3 px-4 font-bold text-slate-200">
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.admin_approved && (
                          <span title="Admin Verified Check-In" className="inline-flex text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      {item.operator_name && (
                        <p className="text-[10px] text-slate-500 font-normal">Op: {item.operator_name}</p>
                      )}
                    </td>

                    {/* Phone */}
                    <td className="py-3 px-4 text-slate-400 font-mono">
                      +91 {item.phone}
                    </td>

                    {/* Gender */}
                    <td className="py-3 px-4 text-slate-300">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.gender === 'Female'
                          ? 'bg-pink-950/40 text-pink-300 border border-pink-500/20'
                          : item.gender === 'Male'
                          ? 'bg-blue-950/40 text-blue-300 border border-blue-500/20'
                          : 'bg-slate-900 text-slate-400'
                      }`}>
                        {item.gender}
                      </span>
                    </td>

                    {/* Level */}
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold border ${item.level_badge_class}`}>
                        {item.level}
                      </span>
                    </td>

                    {/* Classes Attended */}
                    <td className="py-3 px-4 text-center">
                      <span className="font-extrabold text-slate-200 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {item.classes_attended}
                      </span>
                    </td>

                    {/* Chanting */}
                    <td className="py-3 px-4 text-center">
                      <span className="font-extrabold text-amber-400 px-2 py-0.5 rounded bg-amber-950/30 border border-amber-500/20">
                        {item.chanting}
                      </span>
                    </td>

                    {/* Attendance Source */}
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-block ${
                          item.attendance_type.includes('Both') || item.attendance_type.includes('+')
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                            : item.attendance_type === 'Operator Coming'
                            ? 'bg-blue-950/60 text-blue-300 border border-blue-500/30'
                            : item.attendance_type === 'Approved Visitor'
                            ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30'
                            : 'bg-teal-950/60 text-teal-300 border border-teal-500/30'
                        }`}>
                          {item.attendance_type}
                        </span>
                        {item.checked_in_at && (
                          <p className="text-[9px] text-slate-500">
                            Verified {new Date(item.checked_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── VISITOR HISTORY MODAL ────────────────────────────────────────────── */}
      {showVisitorHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowVisitorHistory(false)}
        >
          <div
            className="glass-card w-full max-w-2xl bg-slate-950 border border-purple-500/30 rounded-2xl p-6 shadow-2xl relative max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    Saturday Meetup Visitor History
                    <span className="text-[11px] font-semibold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-full">
                      Permanent Archive
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Historical record of Saturday Meetup walk-ins and total attendance by date.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowVisitorHistory(false)}
                className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / History List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {visitorHistory.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-xl border border-slate-900 bg-slate-900/30 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-purple-950/40 border border-purple-500/20 mx-auto flex items-center justify-center text-purple-400">
                    <CalendarCheck className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-200">No Past Meetup Records Yet</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    Visitor counts are permanently saved to history every Friday at 00:00 IST before weekly dashboard counters reset. Once the current week concludes, its final visitor totals will be archived here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span>{visitorHistory.length} Past Meetup{visitorHistory.length > 1 ? 's' : ''} Recorded</span>
                    <span className="text-[11px] text-slate-500">Sorted by most recent</span>
                  </div>
                  {visitorHistory.map((item) => (
                    <div
                      key={item.id || item.weekly_period}
                      className="p-4 rounded-xl bg-slate-900/60 border border-purple-500/20 hover:border-purple-500/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-purple-400" />
                          <span className="text-sm font-bold text-slate-100">
                            {item.meetup_date_label || item.meetup_date}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {item.weekly_period}
                          </span>
                        </div>
                        {item.archived_at && (
                          <p className="text-[10px] text-slate-500 pl-6">
                            Archived on {new Date(item.archived_at).toLocaleDateString('en-IN', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              timeZone: 'Asia/Kolkata',
                            })}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 pl-6 sm:pl-0">
                        <div className="text-right">
                          <div className="text-xs font-semibold text-purple-300 flex items-center justify-end gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            <span className="text-base font-black text-purple-200">{item.total_visitors}</span>
                            <span>Visitors</span>
                          </div>
                          {item.total_attendance > 0 && (
                            <p className="text-[10px] text-slate-400">
                              {item.total_attendance} total attendees
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Records are permanently preserved across weekly resets
              </span>
              <button
                onClick={() => setShowVisitorHistory(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
