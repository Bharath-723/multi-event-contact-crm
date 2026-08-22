'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  PhoneCall, Plus, Edit2, ToggleLeft, ToggleRight,
  Users, CheckCircle, Clock, TrendingUp, Eye,
  Loader2, AlertCircle, X, Save, Phone, Mail,
  User, Lock, RefreshCw, Headset, LogIn, Trash2,
  Zap, BarChart3, AlertTriangle, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ContactOperator } from '@/lib/types';
import { useFestival } from '@/lib/contexts/FestivalContext';
import { ContactSource } from '@/lib/source-resolver';
import { formatOperatorDisplayName } from '@/lib/status-normalizer';

// ─── Helper ──────────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

// ─── Operator Card ────────────────────────────────────────────────────────────
function OperatorCard({
  op,
  onEdit,
  onToggle,
  onViewAssigned,
  onUnassignAll,
  onRemove,
}: {
  op: ContactOperator;
  onEdit: (op: ContactOperator) => void;
  onToggle: (op: ContactOperator) => void;
  onViewAssigned: (op: ContactOperator) => void;
  onUnassignAll: (op: ContactOperator) => void;
  onRemove: (op: ContactOperator) => void;
}) {
  const statusColor = op.is_active
    ? 'text-green-400 bg-green-950/40 border-green-500/30'
    : 'text-slate-500 bg-slate-900/40 border-slate-700/30';

  const isFull = (op.total_assigned ?? 0) >= 40;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-5 flex flex-col gap-4 hover:shadow-[0_0_25px_rgba(139,92,246,0.1)] transition-all"
    >
      {/* Header: Name + Edit Pencil Icon beside Active/Disabled/Full Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-purple-950/50 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <Headset className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-100 text-sm truncate">{formatOperatorDisplayName(op.name)}</p>
            <p className="text-xs text-slate-500 truncate">{op.email}</p>
            <span className="inline-block mt-1.5 text-[9px] font-bold text-purple-400 bg-purple-950/30 border border-purple-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
              {op.operator_type === 'coordinator' ? 'Co-ordinator' : 'Operator'}
            </span>
            {op.phone ? (
              <a
                href={`tel:+91${op.phone}`}
                className="inline-flex items-center gap-1.5 mt-1.5 text-xs text-purple-400 hover:text-purple-300 font-semibold transition-colors"
                title="Call Operator"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>+91 {op.phone}</span>
              </a>
            ) : (
              <button
                onClick={() => onEdit(op)}
                className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-950/20 text-amber-400 hover:bg-amber-950/40 hover:text-amber-300 text-[10px] font-bold transition-all cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Mobile No.</span>
              </button>
            )}
          </div>
        </div>

        {/* Top-Right Badge + Edit Pencil Icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isFull ? (
            <span className="text-[10px] font-extrabold px-2 py-1 rounded-lg border text-amber-400 bg-amber-950/40 border-amber-500/30">
              FULL ({op.total_assigned}/40)
            </span>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${statusColor}`}>
              {op.is_active ? 'Active' : 'Disabled'}
            </span>
          )}
          <button
            onClick={() => onEdit(op)}
            className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-700/40 text-slate-400 hover:text-slate-100 transition-all cursor-pointer"
            title="Edit Operator"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-blue-400">{op.total_assigned ?? 0}</p>
          <p className="text-[10px] text-slate-500">Assigned</p>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-emerald-400">{op.total_coming ?? 0}</p>
          <p className="text-[10px] text-slate-500">Coming</p>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-red-400">{op.total_not_coming ?? 0}</p>
          <p className="text-[10px] text-slate-500">Not Coming</p>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-amber-400">{op.total_not_answered ?? 0}</p>
          <p className="text-[10px] text-slate-500">Not Answered</p>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-purple-400">{op.total_next_week ?? 0}</p>
          <p className="text-[10px] text-slate-500">Next Week</p>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-yellow-400">{op.total_pending ?? 0}</p>
          <p className="text-[10px] text-slate-500">Pending</p>
        </div>
      </div>

      {/* Completion Bar: Coming / Assigned */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-slate-500">Coming Rate</span>
          <span className="text-[11px] font-bold text-green-400">
            {op.total_assigned ? Math.round(((op.total_coming ?? 0) / op.total_assigned) * 100) : 0}%
          </span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${op.total_assigned ? Math.min(((op.total_coming ?? 0) / op.total_assigned) * 100, 100) : 0}%` }}
          />
        </div>
      </div>

      {op.last_login_at && (
        <p className="text-[10px] text-slate-600">
          Last login: {new Date(op.last_login_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* Action Buttons: View, Unassign All, Enable/Disable, Remove */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => onViewAssigned(op)}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-950/30 border border-purple-500/20 text-purple-400 text-xs font-semibold hover:bg-purple-950/50 transition-all cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" /> View
        </button>
        <button
          onClick={() => onUnassignAll(op)}
          disabled={(op.total_assigned ?? 0) === 0}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-950/30 border border-amber-500/20 text-amber-400 hover:bg-amber-950/50 text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Unassign all contacts for this operator"
        >
          <Trash2 className="w-3.5 h-3.5" /> Unassign All
        </button>
        <button
          onClick={() => onToggle(op)}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
            op.is_active
              ? 'bg-yellow-950/20 border-yellow-500/20 text-yellow-400 hover:bg-yellow-950/40'
              : 'bg-green-950/20 border-green-500/20 text-green-400 hover:bg-green-950/40'
          }`}
        >
          {op.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
          {op.is_active ? 'Disable' : 'Enable'}
        </button>
        <button
          onClick={() => onRemove(op)}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-950/20 border border-red-500/20 text-red-400 hover:bg-red-950/45 text-xs font-semibold transition-all cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" /> Remove
        </button>
      </div>
    </motion.div>
  );
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
function OperatorFormModal({
  mode,
  operator,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit';
  operator?: ContactOperator;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: operator?.name ?? '',
    email: operator?.email ?? '',
    phone: operator?.phone ?? '',
    password: '',
    confirmPassword: '',
    is_active: operator?.is_active ?? true,
    operator_type: operator?.operator_type ?? 'operator',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'add' && !form.password) { setError('Password is required'); return; }
    if (form.password && form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (form.password && form.password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      const auth = await getAuthHeader();
      const body: Record<string, unknown> = {
        name: form.name, email: form.email, phone: form.phone, is_active: form.is_active,
        operator_type: form.operator_type,
      };
      if (form.password) body.password = form.password;

      const res = await fetch(
        mode === 'add' ? '/api/operators' : `/api/operators/${operator!.id}`,
        {
          method: mode === 'add' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save operator'); return; }
      onSaved();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-2xl p-6 w-full max-w-md relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-purple-950/50 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Headset className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-100">
            {mode === 'add' ? 'Add New Operator' : 'Edit Operator'}
          </h2>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              required value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Full Name" className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm text-foreground placeholder-slate-500"
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="email" required value={form.email} onChange={(e) => set('email', e.target.value)}
              disabled={mode === 'edit'}
              placeholder="Email Address" className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm text-foreground placeholder-slate-500 disabled:opacity-50"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={form.phone} onChange={(e) => set('phone', e.target.value)}
              placeholder="Phone (optional)" className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm text-foreground placeholder-slate-500"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1.5 ml-1">Type of Operator *</label>
            <select
              value={form.operator_type} onChange={(e) => set('operator_type', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-sm focus:outline-none focus:border-indigo-500/50 cursor-pointer"
            >
              <option value="operator">Operator</option>
              <option value="coordinator">Co-ordinator</option>
            </select>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="password" value={form.password} onChange={(e) => set('password', e.target.value)}
              required={mode === 'add'}
              placeholder={mode === 'add' ? 'Password' : 'New Password (leave blank to keep)'}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm text-foreground placeholder-slate-500"
            />
          </div>
          {(mode === 'add' || form.password) && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)}
                required={!!form.password}
                placeholder="Confirm Password" className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm text-foreground placeholder-slate-500"
              />
            </div>
          )}
          <label className="flex items-center gap-3 cursor-pointer py-2">
            <div
              onClick={() => set('is_active', !form.is_active)}
              className={`w-10 h-5 rounded-full transition-all relative ${form.is_active ? 'bg-purple-600' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.is_active ? 'left-5' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-slate-300 font-medium">
              {form.is_active ? 'Active' : 'Disabled'}
            </span>
          </label>
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {loading ? 'Saving...' : 'Save Operator'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ─── View Assigned Modal (Source-Aware & Filtered by is_active=true) ─────────
function ViewAssignedModal({
  operator,
  contactSource,
  onClose,
  onUnassigned,
  onToast,
}: {
  operator: ContactOperator;
  contactSource: ContactSource;
  onClose: () => void;
  onUnassigned: () => void;
  onToast: (msg: string) => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const auth = await getAuthHeader();
      const res = await fetch(`/api/assignments?source=${contactSource}&operator_id=${operator.id}&limit=200`, {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        const d = await res.json();
        const list = (d.assignments ?? []).filter((a: Record<string, unknown>) => a.is_active !== false);
        setAssignments(list);
        setTotalCount(list.length);
      } else {
        setAssignments([]);
        setTotalCount(0);
      }
    } catch {
      setAssignments([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [operator.id, contactSource]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDirectUnassign = async (assignmentId: string) => {
    setUnassigningId(assignmentId);
    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/assignments/${assignmentId}?source=${contactSource}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      if (!res.ok) {
        const d = await res.json();
        onToast(d.error || 'Failed to unassign contact');
        return;
      }
      setAssignments((prev) => prev.filter((a) => (a.id as string) !== assignmentId));
      setTotalCount((prev) => Math.max(0, prev - 1));
      onToast('Contact unassigned.');
      onUnassigned();
    } catch {
      onToast('Network error. Please try again.');
    } finally {
      setUnassigningId(null);
    }
  };

  const statusColors: Record<string, string> = {
    Pending:            'text-yellow-400 bg-yellow-950/30 border-yellow-500/20',
    Coming:             'text-green-400  bg-green-950/30  border-green-500/20',
    'Not Coming':       'text-red-400    bg-red-950/30    border-red-500/20',
    'Not Answered':     'text-amber-400  bg-amber-950/30  border-amber-500/20',
    'Next Week':        'text-purple-400 bg-purple-950/30 border-purple-500/20',
    'Not Connected':    'text-amber-400  bg-amber-950/30  border-amber-500/20',
  };

  const sourceTitle =
    contactSource === 'krishnashtami'
      ? 'Krishnashtami 2026'
      : contactSource === 'feedback_contacts'
      ? 'Feedback Contacts'
      : 'Rathayatra 2026';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-purple-950/50 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Eye className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-100">{operator.name}</h2>
            <p className="text-xs text-slate-400">
              <span className="text-purple-400 font-bold">{sourceTitle}</span> · Active Assigned Contacts — {totalCount} total
            </p>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /></div>}
          {!loading && totalCount === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">No active contacts assigned for {sourceTitle}.</p>
          )}
          {assignments.map((a) => {
            const fc = (
              a.krishnashtami_registrations ||
              a.registrations ||
              a.feedback_contacts ||
              a.feedback_contact
            ) as Record<string, unknown> | null;

            const fullName = String(fc?.full_name ?? '—');
            const phone = String(fc?.phone ?? '—');
            const subDetail = fc?.college_name
              ? `${String(fc.college_name)} (${String(fc.branch ?? '')})`
              : fc?.company_college
              ? String(fc.company_college)
              : '';

            const statusClass = statusColors[(a.status as string)] ?? 'text-slate-400 bg-slate-900/40 border-slate-700/30';
            const notesText: string | null = typeof a.notes === 'string' ? a.notes : typeof a.remarks === 'string' ? a.remarks : null;
            const isUnassigningThis = unassigningId === (a.id as string);

            return (
              <div key={a.id as string} className="flex items-center justify-between gap-3 p-3 bg-slate-900/30 rounded-xl border border-slate-800/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">{fullName}</p>
                  <p className="text-xs text-slate-400">{phone}{subDetail ? ` · ${subDetail}` : ''}</p>
                  {notesText && <p className="text-xs text-slate-500 italic mt-0.5 truncate">&ldquo;{notesText}&rdquo;</p>}
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => handleDirectUnassign(a.id as string)}
                    disabled={isUnassigningThis}
                    className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-orange-500/50 hover:bg-orange-950/20 text-slate-400 hover:text-orange-400 text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    title="Unassign this contact immediately"
                  >
                    {isUnassigningThis ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Unassign'}
                  </button>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 ${statusClass}`}>
                    {String(a.status)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DryRunSummary {
  source: string;
  filters: {
    area_of_stay: string | null;
    company_college: string | null;
    occupation: string | null;
  };
  filter_options: {
    areas: string[];
    colleges: string[];
    occupations: string[];
  };
  total_unassigned: number;
  skipped_female: number;
  eligible_male: number;
  active_operators: number;
  total_capacity: number;
  currently_assigned: number;
  available_slots: number;
  will_assign: number;
  will_skip_capacity: number;
  will_skip: number;
  capacity_warning: boolean;
  operator_breakdown: Array<{ id: string; name: string; current: number; capacity: number; available: number }>;
}

interface BatchReport {
  total_unassigned: number;
  successfully_assigned: number;
  skipped_female: number;
  skipped_no_capacity: number;
  failed: number;
  distribution: Array<{ operator_id: string; operator_name: string; assigned_in_batch: number }>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactOperatorsPage() {
  const { selectedEventId } = useFestival();
  const [contactSource, setContactSourceState] = useState<ContactSource>('rathayatra');
  const [operators, setOperators] = useState<ContactOperator[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'operator' | 'coordinator'>('all');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editOp, setEditOp] = useState<ContactOperator | null>(null);
  const [viewOp, setViewOp] = useState<ContactOperator | null>(null);
  const [removeOp, setRemoveOp] = useState<ContactOperator | null>(null);
  const [removing, setRemoving] = useState(false);
  const [errorRemove, setErrorRemove] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Unassign All Modals
  const [unassignOperatorTarget, setUnassignOperatorTarget] = useState<ContactOperator | null>(null);
  const [showGlobalUnassignModal, setShowGlobalUnassignModal] = useState(false);
  const [unassigningBatch, setUnassigningBatch] = useState(false);

  // ── Auto Assign states ──────────────────────────────────────────────────────
  const [autoAssignStep, setAutoAssignStep] = useState<'idle' | 'loading-dry-run' | 'dry-run' | 'assigning' | 'report'>('idle');
  const [dryRunSummary, setDryRunSummary] = useState<DryRunSummary | null>(null);
  const [batchReport, setBatchReport] = useState<BatchReport | null>(null);
  const [autoAssignError, setAutoAssignError] = useState<string | null>(null);

  // Dry run filter state
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [selectedCollege, setSelectedCollege] = useState<string>('');
  const [selectedOccupation, setSelectedOccupation] = useState<string>('');

  const setContactSource = (newSource: ContactSource) => {
    // Immediate clean state reset when source changes
    setOperators([]);
    setViewOp(null);
    setEditOp(null);
    setRemoveOp(null);
    setUnassignOperatorTarget(null);
    setShowGlobalUnassignModal(false);
    setAutoAssignStep('idle');
    setDryRunSummary(null);
    setBatchReport(null);
    setSelectedArea('');
    setSelectedCollege('');
    setSelectedOccupation('');
    setContactSourceState(newSource);
  };

  // Sync initial contactSource with active selectedEventId
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selectedEventId === '7852cff8-e784-4e91-b990-a9838ea59ff1') {
      setContactSource('krishnashtami');
    } else if (selectedEventId === '4ce7287c-4aea-42f8-8d7d-03b698438e4c') {
      setContactSource('rathayatra');
    }
  }, [selectedEventId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleConfirmRemove = async () => {
    if (!removeOp) return;
    setRemoving(true);
    setErrorRemove(null);
    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/operators/${removeOp.id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      if (!res.ok) {
        const d = await res.json();
        setErrorRemove(d.error || 'Failed to remove operator');
        return;
      }
      setRemoveOp(null);
      loadOperators();
      toast('Operator removed successfully.');
    } catch {
      setErrorRemove('Network error. Please try again.');
    } finally {
      setRemoving(false);
    }
  };

  const loadOperators = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/operators?source=${contactSource}`, { headers: { Authorization: auth } });
      if (res.ok) {
        const d = await res.json();
        setOperators(d.operators ?? []);
      }
    } catch (err) {
      console.error('Failed to load operators:', err);
    } finally {
      setLoading(false);
    }
  }, [contactSource]);

  useEffect(() => { loadOperators(); }, [loadOperators]);

  // ── Unassign All Handlers ──────────────────────────────────────────────────
  const handleExecuteUnassignAll = async (operatorId?: string) => {
    setUnassigningBatch(true);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/assignments/unassign-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ source: contactSource, operator_id: operatorId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Failed to unassign contacts');
        return;
      }
      if (data.affected_count === 0) {
        toast('No active contacts to unassign.');
      } else {
        toast(data.message || `Unassigned ${data.affected_count} contacts.`);
      }
      setUnassignOperatorTarget(null);
      setShowGlobalUnassignModal(false);
      loadOperators();
    } catch {
      toast('Network error while unassigning contacts.');
    } finally {
      setUnassigningBatch(false);
    }
  };

  // ── Auto Assign handlers ────────────────────────────────────────────────────
  const fetchDryRun = async (area?: string, college?: string, occupation?: string) => {
    setAutoAssignStep('loading-dry-run');
    setAutoAssignError(null);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/assignments/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          dry_run: true,
          source: contactSource,
          area_of_stay: area !== undefined ? area : selectedArea,
          company_college: college !== undefined ? college : selectedCollege,
          occupation: occupation !== undefined ? occupation : selectedOccupation,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.summary) {
        setAutoAssignError(d.error || 'Failed to fetch dry-run summary');
        setAutoAssignStep('idle');
        return;
      }
      setDryRunSummary(d.summary);
      setAutoAssignStep('dry-run');
    } catch {
      setAutoAssignError('Network error. Please try again.');
      setAutoAssignStep('idle');
    }
  };

  const handleAutoAssignDryRun = async () => {
    await fetchDryRun(selectedArea, selectedCollege, selectedOccupation);
  };

  const handleExecuteAutoAssign = async () => {
    setAutoAssignStep('assigning');
    setAutoAssignError(null);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/assignments/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          dry_run: false,
          source: contactSource,
          area_of_stay: selectedArea || undefined,
          company_college: selectedCollege || undefined,
          occupation: selectedOccupation || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.report) {
        setAutoAssignError(d.error || 'Auto-assignment failed');
        setAutoAssignStep('dry-run');
        return;
      }
      setBatchReport(d.report);
      setAutoAssignStep('report');
      loadOperators();
    } catch {
      setAutoAssignError('Network error. Please try again.');
      setAutoAssignStep('dry-run');
    }
  };

  const closeAutoAssign = () => {
    setAutoAssignStep('idle');
    setDryRunSummary(null);
    setBatchReport(null);
    setAutoAssignError(null);
  };

  // Realtime subscription for contact assignments and operator updates
  useEffect(() => {
    const channel = supabase
      .channel('admin_operators_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'krishnashtami_contact_assignments' },
        () => { loadOperators(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_assignments' },
        () => { loadOperators(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedback_contact_assignments' },
        () => { loadOperators(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_operators' },
        () => { loadOperators(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOperators]);

  const handleToggle = async (op: ContactOperator) => {
    const auth = await getAuthHeader();
    const res = await fetch(`/api/operators/${op.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ is_active: !op.is_active }),
    });
    if (res.ok) {
      toast(op.is_active ? `${op.name} disabled.` : `${op.name} re-enabled.`);
      loadOperators();
    }
  };

  // Summary stats
  const totalOperators = operators.length;
  const activeOperators = operators.filter((o) => o.is_active).length;
  const totalAssigned = operators.reduce((s, o) => s + (o.total_assigned ?? 0), 0);
  const totalPending = operators.reduce((s, o) => s + (o.total_pending ?? 0), 0);
  const totalComing = operators.reduce((s, o) => s + (o.total_coming ?? 0), 0);
  const totalNotComing = operators.reduce((s, o) => s + (o.total_not_coming ?? 0), 0);
  const totalNotAnswered = operators.reduce((s, o) => s + (o.total_not_answered ?? 0), 0);
  const totalNextWeek = operators.reduce((s, o) => s + (o.total_next_week ?? 0), 0);

  // Development Assertion Check
  if (totalAssigned !== totalComing + totalNotComing + totalNotAnswered + totalNextWeek + totalPending) {
    console.error('[ASSIGNMENT COUNT INVARIANT VIOLATION]', {
      contactSource,
      totalAssigned,
      totalComing,
      totalNotComing,
      totalNotAnswered,
      totalNextWeek,
      totalPending,
      sum: totalComing + totalNotComing + totalNotAnswered + totalNextWeek + totalPending,
    });
  }

  const filteredOperators = operators.filter(op => {
    if (filterType === 'all') return true;
    return op.operator_type === filterType;
  });

  const sourceTitle =
    contactSource === 'krishnashtami'
      ? 'Krishnashtami 2026 Contact Assignments'
      : contactSource === 'feedback_contacts'
      ? 'Feedback Contact Assignments'
      : 'Rathayatra 2026 Contact Assignments';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <PhoneCall className="w-7 h-7 text-purple-400" />
            Contact Operators
          </h1>
          <p className="text-slate-400 text-xs font-semibold mt-1 flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded bg-purple-950/50 border border-purple-500/30 text-purple-300">
              Active Source: {sourceTitle}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Contact Source Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 border border-purple-500/30 rounded-xl px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Source:</span>
            <select
              value={contactSource}
              onChange={(e) => setContactSource(e.target.value as ContactSource)}
              className="bg-transparent text-slate-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="rathayatra" className="bg-slate-900 text-slate-100">Rathayatra 2026</option>
              <option value="krishnashtami" className="bg-slate-900 text-slate-100">Krishnashtami 2026</option>
              <option value="feedback_contacts" className="bg-slate-900 text-slate-100">Feedback Contacts</option>
            </select>
          </div>

          <a
            href={`/operator/portal?source=${contactSource}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40 text-slate-400 text-sm font-semibold hover:text-slate-100 transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4" /> Operator Portal
          </a>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | 'operator' | 'coordinator')}
            className="px-4 py-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40 text-slate-400 text-sm font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="operator">Operators Only</option>
            <option value="coordinator">Co-ordinators Only</option>
          </select>
          <button
            onClick={loadOperators}
            className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40 text-slate-400 hover:text-slate-100 transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowGlobalUnassignModal(true)}
            disabled={totalAssigned === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-950/30 border border-red-500/30 text-red-400 hover:bg-red-950/50 hover:text-red-300 text-sm font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" /> Unassign All
          </button>
          <button
            onClick={handleAutoAssignDryRun}
            disabled={autoAssignStep !== 'idle'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-400 hover:bg-amber-950/50 hover:text-amber-300 text-sm font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {autoAssignStep === 'loading-dry-run' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
            ) : autoAssignStep === 'assigning' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Assigning Contacts...</>
            ) : (
              <><Zap className="w-4 h-4" /> Auto Assign ({contactSource})</>
            )}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-bold transition-all cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.2)]"
          >
            <Plus className="w-4 h-4" /> Add Operator
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Total Operators', value: totalOperators, icon: Headset, color: 'text-purple-400' },
          { label: 'Active', value: activeOperators, icon: ToggleRight, color: 'text-green-400' },
          { label: 'Assigned', value: totalAssigned, icon: Users, color: 'text-blue-400' },
          { label: 'Coming', value: totalComing, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Not Coming', value: totalNotComing, icon: TrendingUp, color: 'text-red-400' },
          { label: 'Not Answered', value: totalNotAnswered, icon: Clock, color: 'text-amber-400' },
          { label: 'Next Week', value: totalNextWeek, icon: Clock, color: 'text-purple-400' },
          { label: 'Pending Calls', value: totalPending, icon: Clock, color: 'text-yellow-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card rounded-xl p-4 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-2 ${color}`} />
            <p className="text-xl font-extrabold text-slate-100">{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Operators Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      ) : filteredOperators.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Headset className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold">No operators found for this type.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOperators.map((op) => (
            <OperatorCard
              key={op.id}
              op={op}
              onEdit={setEditOp}
              onToggle={handleToggle}
              onViewAssigned={setViewOp}
              onUnassignAll={setUnassignOperatorTarget}
              onRemove={setRemoveOp}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showAdd && (
          <OperatorFormModal
            key="add-modal"
            mode="add"
            onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); loadOperators(); toast('Operator created successfully!'); }}
          />
        )}
        {editOp && (
          <OperatorFormModal
            key="edit-modal"
            mode="edit"
            operator={editOp}
            onClose={() => setEditOp(null)}
            onSaved={() => { setEditOp(null); loadOperators(); toast('Operator updated!'); }}
          />
        )}
        {viewOp && (
          <ViewAssignedModal
            key="view-modal"
            operator={viewOp}
            contactSource={contactSource}
            onClose={() => setViewOp(null)}
            onUnassigned={loadOperators}
            onToast={toast}
          />
        )}
        {/* Operator-level Unassign All Confirmation Modal */}
        {unassignOperatorTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-2xl p-6 w-full max-w-md relative"
            >
              <button onClick={() => setUnassignOperatorTarget(null)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-extrabold text-slate-100 mb-2">Unassign all contacts for this operator?</h2>
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  All <strong className="text-amber-400 font-bold">{unassignOperatorTarget.total_assigned ?? 0} active contact assignments</strong> for <span className="text-purple-400 font-bold">{contactSource}</span> belonging to <strong>{unassignOperatorTarget.name}</strong> will be removed. Registration records will remain intact.
                </p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleExecuteUnassignAll(unassignOperatorTarget.id)}
                    disabled={unassigningBatch}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
                  >
                    {unassigningBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Unassign All ({unassignOperatorTarget.total_assigned ?? 0})
                  </button>
                  <button
                    onClick={() => setUnassignOperatorTarget(null)}
                    disabled={unassigningBatch}
                    className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-xs font-semibold hover:text-slate-100 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Global Unassign All Confirmation Modal */}
        {showGlobalUnassignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-2xl p-6 w-full max-w-md relative"
            >
              <button onClick={() => setShowGlobalUnassignModal(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-extrabold text-slate-100 mb-2">Unassign all contacts?</h2>
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  All active contact assignments for <span className="text-purple-400 font-bold">{contactSource}</span> will be removed from operators. Registration/contact records will remain intact.
                </p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleExecuteUnassignAll()}
                    disabled={unassigningBatch}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
                  >
                    {unassigningBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Unassign All ({totalAssigned})
                  </button>
                  <button
                    onClick={() => setShowGlobalUnassignModal(false)}
                    disabled={unassigningBatch}
                    className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-xs font-semibold hover:text-slate-100 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Remove Operator Modal */}
        {removeOp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-2xl p-6 w-full max-w-md relative"
            >
              <button
                onClick={() => setRemoveOp(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-extrabold text-slate-100 mb-2">Remove Operator</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Operator</label>
                  <p className="text-sm font-bold text-slate-200 mt-0.5">{removeOp.name}</p>
                  <p className="text-xs text-slate-500">{removeOp.email}</p>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This action will permanently remove this operator.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  If the operator has assigned contacts, they will first be safely unassigned.
                </p>

                {errorRemove && (
                  <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
                    <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-red-400" />
                    {errorRemove}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleConfirmRemove}
                    disabled={removing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-60 border-none"
                  >
                    {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Remove Operator
                  </button>
                  <button
                    onClick={() => setRemoveOp(null)}
                    disabled={removing}
                    className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-xs font-semibold hover:text-slate-100 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Auto Assign Dialogs ──────────────────────────────────────────── */}
      <AnimatePresence>
        {/* Dry-Run Summary Dialog with Filter Controls */}
        {(autoAssignStep === 'dry-run' || autoAssignStep === 'loading-dry-run') && dryRunSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl p-6 w-full max-w-xl relative max-h-[90vh] flex flex-col"
            >
              <button onClick={closeAutoAssign} className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-amber-950/40 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-100">Auto Assign — Dry Run Preview</h2>
                  <p className="text-xs text-slate-500">Read-only preview. Choose filters before executing assignment.</p>
                </div>
              </div>

              {/* Dynamic Filter Controls (AND semantics) */}
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Candidate Filters (AND Semantics)
                  </span>
                  {(selectedArea || selectedCollege || selectedOccupation) && (
                    <button
                      onClick={() => {
                        setSelectedArea('');
                        setSelectedCollege('');
                        setSelectedOccupation('');
                        fetchDryRun('', '', '');
                      }}
                      className="text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-500 font-bold block mb-1">Area of Stay</label>
                    <select
                      value={selectedArea}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedArea(val);
                        fetchDryRun(val, selectedCollege, selectedOccupation);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="">All Areas</option>
                      {(dryRunSummary.filter_options?.areas || []).map((area) => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 font-bold block mb-1">College / Company</label>
                    <select
                      value={selectedCollege}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedCollege(val);
                        fetchDryRun(selectedArea, val, selectedOccupation);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="">All Colleges/Companies</option>
                      {(dryRunSummary.filter_options?.colleges || []).map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 font-bold block mb-1">Occupation</label>
                    <select
                      value={selectedOccupation}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedOccupation(val);
                        fetchDryRun(selectedArea, selectedCollege, val);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="">All Occupations</option>
                      {(dryRunSummary.filter_options?.occupations || []).map((occ) => (
                        <option key={occ} value={occ}>{occ}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 pr-1 space-y-4">
                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { label: 'Unassigned', value: dryRunSummary.total_unassigned, color: 'text-slate-100' },
                    { label: 'Eligible (Male)', value: dryRunSummary.eligible_male, color: 'text-blue-400' },
                    { label: 'Skipped (Female)', value: dryRunSummary.skipped_female, color: 'text-slate-400' },
                    { label: 'Active Operators', value: dryRunSummary.active_operators, color: 'text-purple-400' },
                    { label: 'Available Slots', value: dryRunSummary.available_slots, color: 'text-green-400' },
                    { label: 'Will Be Assigned', value: dryRunSummary.will_assign, color: 'text-amber-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-900/40 rounded-xl p-2.5 text-center">
                      <p className={`text-lg font-extrabold ${color}`}>{value}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Capacity warning */}
                {dryRunSummary.capacity_warning && (
                  <div className="p-3 bg-red-950/40 border border-red-500/25 rounded-xl flex gap-2 items-start">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <p className="text-xs text-red-300 leading-relaxed">
                      <strong>Capacity Warning:</strong> There are {dryRunSummary.eligible_male} eligible male registrations matching filters but only {dryRunSummary.available_slots} available slots across active operators.
                      {dryRunSummary.will_skip_capacity > 0 && <> <strong>{dryRunSummary.will_skip_capacity} registrations will be skipped</strong> due to capacity limit (40/operator).</> }
                    </p>
                  </div>
                )}

                {/* Operator breakdown */}
                {dryRunSummary.operator_breakdown.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Operator Capacities</p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {dryRunSummary.operator_breakdown.map((op) => {
                        const pct = Math.round((op.current / op.capacity) * 100);
                        const barColor = pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
                        const textColor = pct >= 100 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-green-400';
                        return (
                          <div key={op.id} className="flex items-center gap-3">
                            <p className="text-xs text-slate-300 w-28 shrink-0 truncate">{op.name}</p>
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <p className={`text-[10px] font-bold w-14 text-right shrink-0 ${textColor}`}>{op.current}/{op.capacity}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {dryRunSummary.active_operators === 0 && (
                <div className="mt-3 p-3 bg-amber-950/30 border border-amber-500/25 rounded-xl text-xs text-amber-300">
                  No active operators available. Create and enable operators before running auto-assignment.
                </div>
              )}

              {autoAssignError && (
                <div className="mt-3 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  {autoAssignError}
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-slate-800/60 mt-3">
                <button
                  onClick={handleExecuteAutoAssign}
                  disabled={dryRunSummary.will_assign === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Assign All ({dryRunSummary.will_assign} contacts)
                </button>
                <button
                  onClick={closeAutoAssign}
                  className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-xs font-semibold hover:text-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Assigning Progress Dialog */}
        {autoAssignStep === 'assigning' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-2xl p-8 w-full max-w-sm text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-950/40 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-4">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
              <h2 className="text-base font-extrabold text-slate-100 mb-2">Assigning Contacts...</h2>
              <p className="text-xs text-slate-400">Revalidating candidates &amp; executing atomic assignment engine. Please wait.</p>
              <div className="mt-4 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full animate-pulse w-full" />
              </div>
            </motion.div>
          </div>
        )}

        {/* Final Report Dialog */}
        {autoAssignStep === 'report' && batchReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl p-6 w-full max-w-lg relative"
            >
              <button onClick={closeAutoAssign} className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-green-950/40 border border-green-500/20 flex items-center justify-center text-green-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-100">Assignment Complete</h2>
                  <p className="text-xs text-slate-500">Distribution report</p>
                </div>
              </div>

              {/* Result stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Total Processed', value: batchReport.total_unassigned, color: 'text-slate-100' },
                  { label: 'Assigned', value: batchReport.successfully_assigned, color: 'text-green-400' },
                  { label: 'Skipped (Female)', value: batchReport.skipped_female, color: 'text-slate-400' },
                  { label: 'Skipped (Capacity)', value: batchReport.skipped_no_capacity, color: 'text-amber-400' },
                  { label: 'Failed', value: batchReport.failed, color: batchReport.failed > 0 ? 'text-red-400' : 'text-slate-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-900/40 rounded-xl p-3 text-center">
                    <p className={`text-xl font-extrabold ${color}`}>{value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Distribution breakdown */}
              {batchReport.distribution.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Distribution</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {batchReport.distribution
                      .sort((a, b) => b.assigned_in_batch - a.assigned_in_batch)
                      .map((d) => (
                        <div key={d.operator_id} className="flex items-center justify-between p-2.5 bg-slate-900/30 rounded-xl border border-slate-800/40">
                          <p className="text-xs font-semibold text-slate-200 truncate">{d.operator_name}</p>
                          <span className="text-xs font-bold text-green-400 shrink-0 ml-2">+{d.assigned_in_batch} assigned</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {batchReport.successfully_assigned === 0 && (
                <p className="text-xs text-slate-400 text-center mb-4">No contacts were assigned. All registrations may already be assigned or all operators are at full capacity.</p>
              )}

              <button
                onClick={() => { closeAutoAssign(); }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition-all cursor-pointer"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 right-6 z-[100] bg-slate-800 border border-purple-500/40 text-slate-100 text-sm font-medium px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4 text-purple-400" />
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
