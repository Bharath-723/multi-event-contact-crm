'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Phone, Search, Loader2, CheckCircle, Clock, PhoneCall,
  Users, TrendingUp, MessageSquare, Save, X, RefreshCw,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AssignmentStatus } from '@/lib/types';

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
  interested_to_volunteer?: boolean;
  interested_to_dinner?: boolean;
  transportation_required?: string | null;
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
  total_completed: number;
  total_called: number;
  call_success_pct: number;
}

const STATUS_OPTIONS: AssignmentStatus[] = [
  'Pending', 'Called', 'Confirmed', 'No Answer',
  'Wrong Number', 'Callback Required', 'Completed', 'Visited',
];

const STATUS_COLORS: Record<AssignmentStatus, string> = {
  'Pending':           'text-yellow-400 bg-yellow-950/30 border-yellow-500/20',
  'Called':            'text-blue-400 bg-blue-950/30 border-blue-500/20',
  'Confirmed':         'text-green-400 bg-green-950/30 border-green-500/20',
  'No Answer':         'text-red-400 bg-red-950/30 border-red-500/20',
  'Wrong Number':      'text-red-500 bg-red-950/30 border-red-500/20',
  'Callback Required': 'text-orange-400 bg-orange-950/30 border-orange-500/20',
  'Completed':         'text-emerald-400 bg-emerald-950/30 border-emerald-500/20',
  'Visited':           'text-purple-400 bg-purple-950/30 border-purple-500/20',
};

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
            <MessageSquare className="w-4 h-4 text-purple-400" /> Add Remarks
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Coming with family, Needs transport, Will attend evening..."
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

// ─── Contact Row ──────────────────────────────────────────────────────────────
function ContactRow({
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

  const handleStatus = async (status: AssignmentStatus) => {
    setUpdating(true);
    try { await onStatusChange(assignment.id, status); }
    finally { setUpdating(false); }
  };

  if (!reg) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-4 space-y-3"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-100 text-sm leading-snug">{reg.full_name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {reg.age && reg.gender && (
              <span className="text-[11px] text-slate-500">{reg.age} yrs · {reg.gender}</span>
            )}
            {reg.occupation && (
              <span className="text-[11px] text-slate-500">{reg.occupation}</span>
            )}
            {reg.area_of_stay && (
              <span className="text-[11px] text-purple-400">{reg.area_of_stay}</span>
            )}
          </div>
        </div>
        {/* Status Badge */}
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 ${STATUS_COLORS[assignment.status]}`}>
          {assignment.status}
        </span>
      </div>

      {/* Info chips */}
      <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
        <span className={`px-2 py-0.5 rounded border ${reg.interested_to_volunteer ? 'text-indigo-400 bg-indigo-950/30 border-indigo-500/20' : 'text-slate-600 bg-slate-900/40 border-slate-700/20'}`}>
          Volunteer: {reg.interested_to_volunteer ? 'Yes' : 'No'}
        </span>
        <span className={`px-2 py-0.5 rounded border ${reg.interested_to_dinner ? 'text-green-400 bg-green-950/30 border-green-500/20' : 'text-slate-600 bg-slate-900/40 border-slate-700/20'}`}>
          Dinner: {reg.interested_to_dinner ? 'Yes' : 'No'}
        </span>
        <span className={`px-2 py-0.5 rounded border ${reg.transportation_required === 'Yes' ? 'text-yellow-400 bg-yellow-950/30 border-yellow-500/20' : 'text-slate-600 bg-slate-900/40 border-slate-700/20'}`}>
          Transport: {reg.transportation_required || 'No'}
        </span>
      </div>

      {/* Remarks */}
      {assignment.remarks && (
        <p className="text-xs text-slate-500 italic bg-slate-900/30 rounded-lg px-3 py-2 border border-slate-800/30">
          &ldquo;{assignment.remarks}&rdquo;
        </p>
      )}

      {/* Action Row */}
      <div className="flex flex-wrap gap-2 pt-1">
        {/* ☎ Call Button */}
        <a
          href={`tel:+91${reg.phone}`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-950/30 border border-green-500/25 text-green-400 text-xs font-bold hover:bg-green-950/50 transition-all"
          aria-label={`Call ${reg.full_name}`}
        >
          <Phone className="w-3.5 h-3.5" /> +91 {reg.phone}
        </a>

        {/* Status Dropdown */}
        <div className="relative flex-1 min-w-[160px]">
          {updating && (
            <div className="absolute inset-y-0 right-2 flex items-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            </div>
          )}
          <select
            value={assignment.status}
            onChange={(e) => handleStatus(e.target.value as AssignmentStatus)}
            disabled={updating}
            className="w-full px-3 py-2 rounded-xl glass-input text-xs text-foreground cursor-pointer disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Remarks Button */}
        <button
          onClick={() => onRemarks(assignment.id, assignment.remarks || '')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-700/30 text-slate-400 text-xs font-semibold hover:text-slate-100 transition-all cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {assignment.remarks ? 'Edit Note' : 'Add Note'}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main Portal Page ─────────────────────────────────────────────────────────
export default function OperatorPortalPage() {
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Stats>({ total_assigned: 0, total_pending: 0, total_completed: 0, total_called: 0, call_success_pct: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [remarksModal, setRemarksModal] = useState<{ id: string; current: string } | null>(null);
  const LIMIT = 20;
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadData = useCallback(async (searchVal = search, pageVal = page) => {
    try {
      const params = new URLSearchParams({ page: String(pageVal), limit: String(LIMIT) });
      if (searchVal.trim()) params.set('search', searchVal.trim());
      const res = await fetch(`/api/assignments/my?${params}`);
      if (!res.ok) return;
      const d = await res.json();
      setAssignments(d.assignments ?? []);
      setStats(d.stats ?? {});
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

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
      setStats(prev => {
        const wasComplete = assignments.find(a => a.id === id)?.status === 'Completed';
        const nowComplete = status === 'Completed';
        const delta = nowComplete && !wasComplete ? 1 : wasComplete && !nowComplete ? -1 : 0;
        return { ...prev, total_completed: prev.total_completed + delta };
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
    loadData(val, 1);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Welcome back</p>
            <h1 className="text-xl font-extrabold text-slate-100">{operator?.name ?? '...'}</h1>
            {operator?.email && <p className="text-xs text-slate-500 mt-0.5">{operator.email}</p>}
          </div>
          <button onClick={() => { setLoading(true); loadData(); }}
            className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40 text-slate-400 hover:text-purple-400 transition-all cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Assigned', value: stats.total_assigned, icon: Users, color: 'text-purple-400' },
          { label: 'Pending', value: stats.total_pending, icon: Clock, color: 'text-yellow-400' },
          { label: 'Completed', value: stats.total_completed, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Success %', value: `${stats.call_success_pct}%`, icon: TrendingUp, color: 'text-indigo-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card rounded-xl p-4 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
            <p className="text-xl font-extrabold text-slate-100">{value}</p>
            <p className="text-[10px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative sticky top-14 z-20">
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name, phone, or registration ID..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/90 border border-slate-800 focus:border-purple-500/50 text-slate-100 placeholder-slate-500 text-sm focus:outline-none backdrop-blur-sm shadow-lg"
        />
      </div>

      {/* Contact List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-500 font-semibold">
            {total} assigned contact{total !== 1 ? 's' : ''}
            {search && ` · filtered`}
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
              {search ? 'No contacts match your search.' : 'No contacts assigned to you yet.'}
            </p>
            <p className="text-slate-600 text-sm mt-1">Ask your admin to assign contacts.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => (
              <ContactRow
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
              onClick={() => { setPage(p => Math.max(1, p-1)); loadData(search, Math.max(1, page-1)); }}
              disabled={page === 1}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-400 font-semibold">Page {page} of {totalPages}</span>
            <button
              onClick={() => { setPage(p => Math.min(totalPages, p+1)); loadData(search, Math.min(totalPages, page+1)); }}
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
