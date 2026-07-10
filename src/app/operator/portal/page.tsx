'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Phone, Search, Loader2, Clock, PhoneCall,
  Users, MessageSquare, Save, X, RefreshCw,
  ChevronLeft, ChevronRight, MessageCircle,
  CheckCircle2, XCircle, PhoneMissed, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AssignmentStatus } from '@/lib/types';
import Link from 'next/link';

// ─── New 4-Status System ──────────────────────────────────────────────────────
const STATUS_OPTIONS: AssignmentStatus[] = [
  'Pending', 'Coming', 'Not Coming', 'Callback Required',
];

const STATUS_META: Record<AssignmentStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  'Pending':           { label: 'Pending',           color: 'text-yellow-400',  bg: 'bg-yellow-950/30',  border: 'border-yellow-500/30', icon: <Clock className="w-3 h-3" /> },
  'Coming':            { label: 'Coming',             color: 'text-green-400',   bg: 'bg-green-950/30',   border: 'border-green-500/30',  icon: <CheckCircle2 className="w-3 h-3" /> },
  'Not Coming':        { label: 'Not Coming',         color: 'text-red-400',     bg: 'bg-red-950/30',     border: 'border-red-500/30',    icon: <XCircle className="w-3 h-3" /> },
  'Callback Required': { label: 'Callback Required',  color: 'text-blue-400',    bg: 'bg-blue-950/30',    border: 'border-blue-500/30',   icon: <PhoneMissed className="w-3 h-3" /> },
};

interface OperatorInfo {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

interface RegistrationData {
  id: string;
  full_name: string;
  phone: string;
  age?: number;
  gender?: string;
  area_of_stay?: string | null;
  occupation?: string | null;
  company_college?: string;
  created_at: string;
}

interface Assignment {
  id: string;
  registration_id: string;
  operator_id: string;
  assigned_at: string;
  called_at?: string | null;
  status: AssignmentStatus;
  remarks?: string | null;
  is_active: boolean;
  updated_at: string;
  registrations: RegistrationData | null;
}

interface Stats {
  total_assigned: number;
  total_pending: number;
  total_coming: number;
  total_not_coming: number;
  total_callback: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

function waLink(phone: string): string {
  const digits = sanitizePhone(phone);
  return `https://wa.me/91${digits}`;
}

// ─── Remarks Modal ────────────────────────────────────────────────────────────
function RemarksModal({
  assignmentId,
  currentRemarks,
  onSave,
  onClose,
}: {
  assignmentId: string;
  currentRemarks: string;
  onSave: (id: string, remarks: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(currentRemarks);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(assignmentId, text); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-400" /> Add Notes
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Coming with family, Needs transport, Will call back after 6pm..."
          rows={4}
          className="w-full px-3 py-2.5 rounded-xl glass-input text-sm text-foreground placeholder-slate-500 resize-none"
        />
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold cursor-pointer disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-sm font-semibold cursor-pointer">Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Contact Card ─────────────────────────────────────────────────────────────
function ContactCard({
  assignment,
  onStatusChange,
  onRemarks,
}: {
  assignment: Assignment;
  onStatusChange: (id: string, status: AssignmentStatus) => Promise<void>;
  onRemarks: (id: string, current: string) => void;
}) {
  const reg = assignment.registrations;
  const [updating, setUpdating] = useState(false);
  const meta = STATUS_META[assignment.status] ?? STATUS_META['Pending'];

  const handleStatus = async (status: AssignmentStatus) => {
    if (status === assignment.status) return;
    setUpdating(true);
    try { await onStatusChange(assignment.id, status); }
    finally { setUpdating(false); }
  };

  if (!reg) return null;

  const cleanPhone = sanitizePhone(reg.phone);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-4 space-y-3"
    >
      {/* Header: Name + Status Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-100 text-sm leading-snug truncate">{reg.full_name}</p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
            {reg.age && reg.gender && (
              <span className="text-[11px] text-slate-500">{reg.age} · {reg.gender}</span>
            )}
            {reg.occupation && (
              <span className="text-[11px] text-slate-500 truncate max-w-[140px]">{reg.occupation}</span>
            )}
            {reg.area_of_stay && (
              <span className="text-[11px] text-purple-400 truncate max-w-[140px]">{reg.area_of_stay}</span>
            )}
          </div>
        </div>
        {/* Status Badge */}
        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 ${meta.color} ${meta.bg} ${meta.border}`}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* Notes */}
      {assignment.remarks && (
        <p className="text-[11px] text-slate-400 italic bg-slate-900/30 rounded-lg px-3 py-2 border border-slate-800/30 leading-relaxed">
          &ldquo;{assignment.remarks}&rdquo;
        </p>
      )}

      {/* Action Row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Call */}
        <a
          href={`tel:+91${cleanPhone}`}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-green-950/30 border border-green-500/25 text-green-400 text-xs font-bold hover:bg-green-950/50 active:bg-green-950/70 transition-all"
          aria-label={`Call ${reg.full_name}`}
        >
          <Phone className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">+91 {cleanPhone}</span>
        </a>

        {/* WhatsApp */}
        <a
          href={waLink(reg.phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/25 text-emerald-400 text-xs font-bold hover:bg-emerald-950/50 active:bg-emerald-950/70 transition-all"
          aria-label={`WhatsApp ${reg.full_name}`}
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
          <span>WhatsApp</span>
        </a>

        {/* Status Dropdown */}
        <div className="relative col-span-2">
          {updating && (
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none z-10">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            </div>
          )}
          <select
            value={assignment.status}
            onChange={(e) => handleStatus(e.target.value as AssignmentStatus)}
            disabled={updating}
            className={`w-full px-3 py-2.5 rounded-xl glass-input text-xs font-semibold cursor-pointer disabled:opacity-60 ${meta.color}`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="text-slate-100 bg-slate-900 font-normal">{s}</option>
            ))}
          </select>
        </div>

        {/* Notes Button */}
        <button
          onClick={() => onRemarks(assignment.id, assignment.remarks || '')}
          className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-700/30 text-slate-400 text-xs font-semibold hover:text-slate-100 hover:border-slate-600/40 active:bg-slate-900/80 transition-all cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {assignment.remarks ? 'Edit Notes' : 'Add Notes'}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card rounded-xl p-4 text-center flex flex-col items-center gap-1.5">
      <div className={color}>{icon}</div>
      <p className={`text-xl font-extrabold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
    </div>
  );
}

// ─── Filter Tab Bar ───────────────────────────────────────────────────────────
const FILTER_TABS: { label: string; value: string; color: string; activeClass: string }[] = [
  { label: 'All',               value: '',                  color: 'text-slate-400',  activeClass: 'bg-slate-700/50 text-slate-100 border-slate-600/50' },
  { label: 'Pending',           value: 'Pending',           color: 'text-yellow-400', activeClass: 'bg-yellow-950/40 text-yellow-300 border-yellow-500/40' },
  { label: 'Coming',            value: 'Coming',            color: 'text-green-400',  activeClass: 'bg-green-950/40 text-green-300 border-green-500/40' },
  { label: 'Not Coming',        value: 'Not Coming',        color: 'text-red-400',    activeClass: 'bg-red-950/40 text-red-300 border-red-500/40' },
  { label: 'Callback',          value: 'Callback Required', color: 'text-blue-400',   activeClass: 'bg-blue-950/40 text-blue-300 border-blue-500/40' },
];

// ─── Main Portal Page ─────────────────────────────────────────────────────────
export default function OperatorPortalPage() {
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Stats>({ total_assigned: 0, total_pending: 0, total_coming: 0, total_not_coming: 0, total_callback: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [remarksModal, setRemarksModal] = useState<{ id: string; current: string } | null>(null);
  const LIMIT = 20;
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadData = useCallback(async (searchVal = search, pageVal = page, statusVal = statusFilter) => {
    try {
      const params = new URLSearchParams({ page: String(pageVal), limit: String(LIMIT) });
      if (searchVal.trim()) params.set('search', searchVal.trim());
      if (statusVal) params.set('status', statusVal);
      const res = await fetch(`/api/assignments/my?${params}`);
      if (!res.ok) return;
      const d = await res.json();
      setAssignments(d.assignments ?? []);
      setStats({
        total_assigned:   d.stats?.total_assigned   ?? 0,
        total_pending:    d.stats?.total_pending    ?? 0,
        total_coming:     d.stats?.total_coming     ?? 0,
        total_not_coming: d.stats?.total_not_coming ?? 0,
        total_callback:   d.stats?.total_callback   ?? 0,
      });
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [search, page, statusFilter]);

  // Load operator info
  useEffect(() => {
    fetch('/api/operators/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.operator) setOperator(d.operator);
    });
  }, []);

  // Initial load
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLoading(true); loadData(); }, [loadData]);

  // Realtime subscription to contact_assignments
  useEffect(() => {
    realtimeRef.current = supabase
      .channel('operator_assignments_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_assignments' }, () => {
        loadData();
      })
      .subscribe();
    return () => {
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    };
  }, [loadData]);

  const handleStatusChange = async (id: string, status: AssignmentStatus) => {
    const res = await fetch(`/api/assignments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setAssignments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      // Optimistic stats update
      const old = assignments.find(a => a.id === id)?.status;
      setStats(prev => {
        const s = { ...prev };
        if (old === 'Pending') s.total_pending = Math.max(0, s.total_pending - 1);
        if (old === 'Coming') s.total_coming = Math.max(0, s.total_coming - 1);
        if (old === 'Not Coming') s.total_not_coming = Math.max(0, s.total_not_coming - 1);
        if (old === 'Callback Required') s.total_callback = Math.max(0, s.total_callback - 1);
        if (status === 'Pending') s.total_pending++;
        if (status === 'Coming') s.total_coming++;
        if (status === 'Not Coming') s.total_not_coming++;
        if (status === 'Callback Required') s.total_callback++;
        return s;
      });
    }
  };

  const handleRemarksSave = async (id: string, remarks: string) => {
    const res = await fetch(`/api/assignments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks }),
    });
    if (res.ok) {
      setAssignments(prev => prev.map(a => a.id === id ? { ...a, remarks } : a));
    }
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    setLoading(true);
    loadData(val, 1, statusFilter);
  };

  const handleFilterTab = (val: string) => {
    setStatusFilter(val);
    setPage(1);
    setLoading(true);
    loadData(search, 1, val);
  };

  const totalPages = Math.ceil(total / LIMIT);

  // Completion gauge (Coming / Assigned)
  const completionPct = stats.total_assigned > 0
    ? Math.round((stats.total_coming / stats.total_assigned) * 100)
    : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-8">
      {/* ── Welcome Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Welcome back</p>
            <h1 className="text-xl font-extrabold text-slate-100 truncate">{operator?.name ?? '...'}</h1>
            {operator?.email && <p className="text-xs text-slate-500 mt-0.5 truncate">{operator.email}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/operator/visitor"
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-950/40 border border-purple-500/25 text-purple-400 hover:text-purple-300 text-xs font-bold transition-all"
            >
              Visitor Check-In
            </Link>
            {/* Completion Gauge */}
            {stats.total_assigned > 0 && (
              <div className="hidden sm:flex flex-col items-center">
                <div className="relative w-12 h-12">
                  <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="18" fill="none" stroke="rgb(30,41,59)" strokeWidth="4" />
                    <circle cx="22" cy="22" r="18" fill="none" stroke="rgb(34,197,94)" strokeWidth="4"
                      strokeDasharray={`${2 * Math.PI * 18}`}
                      strokeDashoffset={`${2 * Math.PI * 18 * (1 - completionPct / 100)}`}
                      strokeLinecap="round" className="transition-all duration-700" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-green-400">{completionPct}%</span>
                </div>
                <span className="text-[9px] text-slate-500 mt-0.5">Coming</span>
              </div>
            )}
            <button onClick={() => { setLoading(true); loadData(); }}
              className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40 text-slate-400 hover:text-purple-400 transition-all cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Stats Grid: 4 Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Assigned"    value={stats.total_assigned}    color="text-purple-400"  icon={<Users className="w-5 h-5" />} />
        <StatCard label="Pending"     value={stats.total_pending}     color="text-yellow-400" icon={<Clock className="w-5 h-5" />} />
        <StatCard label="Coming"      value={stats.total_coming}      color="text-green-400"  icon={<CheckCircle2 className="w-5 h-5" />} />
        <StatCard label="Not Coming"  value={stats.total_not_coming}  color="text-red-400"    icon={<XCircle className="w-5 h-5" />} />
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/90 border border-slate-800 focus:border-purple-500/50 text-slate-100 placeholder-slate-500 text-sm focus:outline-none backdrop-blur-sm shadow-lg"
        />
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex gap-1.5 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-slate-500 self-center shrink-0 ml-0.5" />
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => handleFilterTab(tab.value)}
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
              statusFilter === tab.value
                ? tab.activeClass
                : `bg-slate-900/40 border-slate-800/40 ${tab.color} hover:border-slate-700/50`
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Contact List ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-500 font-semibold">
            {total} contact{total !== 1 ? 's' : ''}
            {search && ` · "${search}"`}
            {statusFilter && ` · ${statusFilter}`}
          </p>
          <div className="flex items-center gap-1">
            <PhoneCall className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-purple-400 font-semibold">Your Contacts Only</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <PhoneCall className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 font-semibold">
              {search || statusFilter ? 'No contacts match your filter.' : 'No contacts assigned to you yet.'}
            </p>
            {!search && !statusFilter && (
              <p className="text-slate-600 text-sm mt-1">Ask your admin to assign contacts.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => (
              <ContactCard
                key={a.id}
                assignment={a}
                onStatusChange={handleStatusChange}
                onRemarks={(id, current) => setRemarksModal({ id, current })}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 py-2">
            <button
              onClick={() => { const p = Math.max(1, page - 1); setPage(p); loadData(search, p, statusFilter); }}
              disabled={page === 1}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-400 font-semibold">Page {page} of {totalPages}</span>
            <button
              onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); loadData(search, p, statusFilter); }}
              disabled={page === totalPages}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Remarks Modal */}
      <AnimatePresence>
        {remarksModal && (
          <RemarksModal
            key="remarks-modal"
            assignmentId={remarksModal.id}
            currentRemarks={remarksModal.current}
            onSave={handleRemarksSave}
            onClose={() => setRemarksModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
