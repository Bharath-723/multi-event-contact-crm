'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  PhoneCall, Plus, Edit2, ToggleLeft, ToggleRight,
  Users, CheckCircle, Clock, TrendingUp, Eye,
  Loader2, AlertCircle, X, Save, Phone, Mail,
  User, Lock, RefreshCw, Headset, LogIn, Trash2,
  Zap, BarChart3, AlertTriangle, Filter, ArrowUpDown,
  ChevronDown, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ContactOperator } from '@/lib/types';
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

  const getStatusClass = (status: unknown) => {
    const s = String(status ?? 'Pending').toLowerCase().replace(/[_\s]+/g, ' ').trim();
    const colors: Record<string, string> = {
      pending:          'text-blue-400   bg-blue-950/30   border-blue-500/20',
      assigned:         'text-blue-400   bg-blue-950/30   border-blue-500/20',
      coming:           'text-green-400  bg-green-950/30  border-green-500/20',
      'not coming':     'text-red-400    bg-red-950/30    border-red-500/20',
      'not answered':   'text-amber-400  bg-amber-950/30  border-amber-500/20',
      'next week':      'text-purple-400 bg-purple-950/30 border-purple-500/20',
      'not interested': 'text-rose-400   bg-rose-950/30   border-rose-500/20',
      'not connected':  'text-amber-400  bg-amber-950/30  border-amber-500/20',
      completed:        'text-emerald-400 bg-emerald-950/30 border-emerald-500/20',
    };
    return colors[s] ?? 'text-slate-400 bg-slate-900/40 border-slate-700/30';
  };

  const formatStatusDisplay = (status: unknown) => {
    const s = String(status ?? 'Pending').replace(/_/g, ' ').trim();
    if (!s) return 'Pending';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const sourceTitle = 'Master Dashboard';

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
            const fc = (a.master_contacts || a.master_contact) as Record<string, unknown> | null;

            const fullName = String(fc?.name || fc?.full_name || '—');
            const phone = String(fc?.phone ?? '—');
            const subDetail = fc?.college_name
              ? `${String(fc.college_name)}${fc.branch ? ` (${String(fc.branch)})` : ''}`
              : fc?.company_college
              ? String(fc.company_college)
              : fc?.area_of_stay
              ? String(fc.area_of_stay)
              : '';

            const statusClass = getStatusClass(a.status);
            const notesText: string | null =
              typeof a.comments === 'string'
                ? a.comments
                : typeof a.notes === 'string'
                ? a.notes
                : typeof a.remarks === 'string'
                ? a.remarks
                : null;
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
                    {formatStatusDisplay(a.status)}
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
  filters?: {
    areas?: string[];
    colleges?: string[];
    occupations?: string[];
    standards?: string[];
    service_ids?: string[];
    dates?: string[];
    volunteers?: string[];
    classes_attended?: string[];
    level_numbers?: string[];
    chanting?: string[];
    area_of_stay?: string | null;
    company_college?: string | null;
    occupation?: string | null;
    standard?: string | null;
    service_id?: string | null;
    date?: string | null;
    volunteer?: string | null;
  };
  selected_operator_ids?: string[];
  filter_options?: {
    areas?: string[];
    colleges?: string[];
    occupations?: string[];
    standards?: string[];
    services?: Array<{ id: string; name: string }>;
    dates?: string[];
    volunteers?: string[];
    classes_attended_options?: string[];
    level_number_options?: Array<{ label: string; value: string }>;
    chanting_options?: Array<{ label: string; value: string }>;
  };
  total_unassigned: number;
  skipped_female: number;
  eligible_male: number;
  active_operators: number;
  total_capacity?: number;
  currently_assigned?: number;
  available_slots: number;
  will_assign: number;
  will_skip_capacity: number;
  will_skip?: number;
  capacity_warning?: boolean;
  operator_breakdown: Array<{
    id: string;
    name: string;
    current: number;
    capacity: number;
    available: number;
    is_selected: boolean;
    is_full: boolean;
    can_receive: boolean;
  }>;
}

interface BatchReport {
  total_unassigned: number;
  successfully_assigned: number;
  skipped_female: number;
  skipped_no_capacity: number;
  failed: number;
  distribution: Array<{ operator_id: string; operator_name: string; assigned_in_batch: number }>;
}

// ─── MultiSelect Dropdown Component ───────────────────────────────────────────
interface FilterOptionItem {
  value: string;
  label: string;
}

function MultiSelectDropdown({
  label,
  placeholder = 'All',
  options,
  selected,
  onChange,
  labelColor = 'text-slate-500',
  borderColor = 'border-slate-800',
}: {
  label: string;
  placeholder?: string;
  options: Array<string | FilterOptionItem>;
  selected: string[];
  onChange: (next: string[]) => void;
  labelColor?: string;
  borderColor?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const normalizedOptions: FilterOptionItem[] = useMemo(() => {
    return options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt));
  }, [options]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return normalizedOptions;
    const q = search.toLowerCase();
    return normalizedOptions.filter((opt) => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q));
  }, [normalizedOptions, search]);

  const toggleOption = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const handleSelectAll = () => {
    const allVals = normalizedOptions.map((o) => o.value);
    onChange(allVals);
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange([]);
  };

  const displaySummary = useMemo(() => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      const match = normalizedOptions.find((o) => o.value === selected[0]);
      return match ? match.label : selected[0];
    }
    return `${selected.length} selected`;
  }, [selected, normalizedOptions, placeholder]);

  return (
    <div className="relative" ref={containerRef}>
      <label className={`text-[9px] font-bold block mb-1 truncate ${labelColor}`}>{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full px-2 py-1.5 rounded-lg bg-slate-950 border ${
          selected.length > 0 ? 'border-purple-500/50 bg-purple-950/20' : borderColor
        } text-xs text-left text-slate-200 focus:outline-none flex items-center justify-between gap-1 transition-all cursor-pointer`}
      >
        <span className={`truncate text-xs ${selected.length === 0 ? 'text-slate-400' : 'text-slate-100 font-medium'}`} title={selected.join(', ')}>
          {displaySummary}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <span
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 sm:w-64 max-w-[90vw] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 p-2 flex flex-col gap-1.5 backdrop-blur-md">
          <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[10px]">
            <span className="font-semibold text-slate-400">{selected.length} of {normalizedOptions.length} selected</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-purple-400 hover:text-purple-300 font-semibold cursor-pointer"
              >
                All
              </button>
              <span className="text-slate-600">|</span>
              <button
                type="button"
                onClick={() => handleClear()}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                None
              </button>
            </div>
          </div>

          {normalizedOptions.length > 5 && (
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-6 pr-2 py-1 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <p className="text-[11px] text-slate-500 text-center py-2">No matching options</p>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    onClick={() => toggleOption(opt.value)}
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs cursor-pointer transition-colors ${
                      isChecked ? 'bg-purple-950/40 text-purple-200 font-medium' : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-950 text-purple-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="truncate flex-1">{opt.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactOperatorsPage() {
  const contactSource: ContactSource = 'master_dashboard';
  const [operators, setOperators] = useState<ContactOperator[]>([]);
  const [sortOrder, setSortOrder] = useState<'assigned_desc' | 'assigned_asc' | 'alphabetical'>('assigned_desc');
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

  // 10 Dry run multi-select filter states
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedColleges, setSelectedColleges] = useState<string[]>([]);
  const [selectedOccupations, setSelectedOccupations] = useState<string[]>([]);
  const [selectedStandards, setSelectedStandards] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedVolunteers, setSelectedVolunteers] = useState<string[]>([]);
  const [selectedClassesAttended, setSelectedClassesAttended] = useState<string[]>([]);
  const [selectedLevelNumbers, setSelectedLevelNumbers] = useState<string[]>([]);
  const [selectedChanting, setSelectedChanting] = useState<string[]>([]);

  // Selected operator checkboxes state
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);

  // Request sequencing reference for out-of-order API response protection
  const dryRunSeqRef = React.useRef(0);

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
  const fetchDryRun = useCallback(async (overrideParams?: {
    areas?: string[];
    colleges?: string[];
    occupations?: string[];
    standards?: string[];
    services?: string[];
    dates?: string[];
    volunteers?: string[];
    classesAttended?: string[];
    levelNumbers?: string[];
    chanting?: string[];
    operatorIds?: string[];
  }) => {
    const seq = ++dryRunSeqRef.current;
    setAutoAssignStep('loading-dry-run');
    setAutoAssignError(null);

    const areas = overrideParams?.areas !== undefined ? overrideParams.areas : selectedAreas;
    const colleges = overrideParams?.colleges !== undefined ? overrideParams.colleges : selectedColleges;
    const occupations = overrideParams?.occupations !== undefined ? overrideParams.occupations : selectedOccupations;
    const standards = overrideParams?.standards !== undefined ? overrideParams.standards : selectedStandards;
    const services = overrideParams?.services !== undefined ? overrideParams.services : selectedServices;
    const dates = overrideParams?.dates !== undefined ? overrideParams.dates : selectedDates;
    const volunteers = overrideParams?.volunteers !== undefined ? overrideParams.volunteers : selectedVolunteers;
    const classesAttended = overrideParams?.classesAttended !== undefined ? overrideParams.classesAttended : selectedClassesAttended;
    const levelNumbers = overrideParams?.levelNumbers !== undefined ? overrideParams.levelNumbers : selectedLevelNumbers;
    const chanting = overrideParams?.chanting !== undefined ? overrideParams.chanting : selectedChanting;
    const opIds = overrideParams?.operatorIds !== undefined ? overrideParams.operatorIds : selectedOperatorIds;

    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/assignments/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          dry_run: true,
          source: contactSource,
          areas,
          colleges,
          occupations,
          standards,
          services,
          service_ids: services,
          dates,
          volunteers,
          classes_attended: classesAttended,
          level_numbers: levelNumbers,
          chanting,
          selected_operator_ids: opIds,
        }),
      });

      if (seq !== dryRunSeqRef.current) return;

      const d = await res.json();
      if (!res.ok || !d.summary) {
        setAutoAssignError(d.error || 'Failed to fetch dry-run summary');
        setAutoAssignStep('idle');
        return;
      }
      setDryRunSummary(d.summary);
      setAutoAssignStep('dry-run');
    } catch {
      if (seq !== dryRunSeqRef.current) return;
      setAutoAssignError('Network error. Please try again.');
      setAutoAssignStep('idle');
    }
  }, [contactSource, selectedAreas, selectedColleges, selectedOccupations, selectedStandards, selectedServices, selectedDates, selectedVolunteers, selectedClassesAttended, selectedLevelNumbers, selectedChanting, selectedOperatorIds]);

  const handleAutoAssignDryRun = async () => {
    setSelectedOperatorIds([]);
    await fetchDryRun({ operatorIds: [] });
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
          areas: selectedAreas,
          colleges: selectedColleges,
          occupations: selectedOccupations,
          standards: selectedStandards,
          services: selectedServices,
          service_ids: selectedServices,
          dates: selectedDates,
          volunteers: selectedVolunteers,
          classes_attended: selectedClassesAttended,
          level_numbers: selectedLevelNumbers,
          chanting: selectedChanting,
          selected_operator_ids: selectedOperatorIds,
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
      setSelectedOperatorIds([]);
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
    setSelectedOperatorIds([]);
  };

  const handleClearFilters = () => {
    setSelectedAreas([]);
    setSelectedColleges([]);
    setSelectedOccupations([]);
    setSelectedStandards([]);
    setSelectedServices([]);
    setSelectedDates([]);
    setSelectedVolunteers([]);
    setSelectedClassesAttended([]);
    setSelectedLevelNumbers([]);
    setSelectedChanting([]);
    fetchDryRun({
      areas: [],
      colleges: [],
      occupations: [],
      standards: [],
      services: [],
      dates: [],
      volunteers: [],
      classesAttended: [],
      levelNumbers: [],
      chanting: [],
    });
  };

  const handleToggleOperatorCheckbox = (opId: string) => {
    const nextOpIds = selectedOperatorIds.includes(opId)
      ? selectedOperatorIds.filter((id) => id !== opId)
      : [...selectedOperatorIds, opId];
    setSelectedOperatorIds(nextOpIds);
    fetchDryRun({ operatorIds: nextOpIds });
  };

  // Realtime subscription for master contact assignments and operator updates
  useEffect(() => {
    const channel = supabase
      .channel('admin_operators_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'master_contact_assignments' },
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

  const displayedOperators = useMemo(() => {
    const list = [...operators];
    if (sortOrder === 'assigned_desc') {
      list.sort((a, b) => {
        const countA = a.total_assigned ?? 0;
        const countB = b.total_assigned ?? 0;
        if (countB !== countA) return countB - countA;
        const nameComp = (a.name || '').localeCompare(b.name || '');
        if (nameComp !== 0) return nameComp;
        return (a.id || '').localeCompare(b.id || '');
      });
    } else if (sortOrder === 'assigned_asc') {
      list.sort((a, b) => {
        const countA = a.total_assigned ?? 0;
        const countB = b.total_assigned ?? 0;
        if (countA !== countB) return countA - countB;
        const nameComp = (a.name || '').localeCompare(b.name || '');
        if (nameComp !== 0) return nameComp;
        return (a.id || '').localeCompare(b.id || '');
      });
    } else if (sortOrder === 'alphabetical') {
      list.sort((a, b) => {
        const nameComp = (a.name || '').localeCompare(b.name || '');
        if (nameComp !== 0) return nameComp;
        return (b.total_assigned ?? 0) - (a.total_assigned ?? 0);
      });
    }
    return list;
  }, [operators, sortOrder]);

  const sourceTitle = 'Master Dashboard';

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
          {/* Source Dropdown — Exactly one option: Master Dashboard */}
          <div className="flex items-center gap-1.5 bg-slate-900/50 border border-purple-500/30 rounded-xl px-3 py-2">
            <Filter className="w-4 h-4 text-purple-400" />
            <select
              id="source-dropdown"
              aria-label="Source"
              value={contactSource}
              onChange={() => {}}
              className="bg-transparent text-purple-200 font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="master_dashboard" className="bg-slate-900 text-slate-100">
                Master Dashboard
              </option>
            </select>
          </div>

          {/* Sort Control */}
          <div className="flex items-center gap-1.5 bg-slate-900/50 border border-slate-700/40 rounded-xl px-3 py-2">
            <ArrowUpDown className="w-4 h-4 text-purple-400" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'assigned_desc' | 'assigned_asc' | 'alphabetical')}
              className="bg-transparent text-slate-200 font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="assigned_desc" className="bg-slate-900 text-slate-100">Highest assigned count to lowest</option>
              <option value="assigned_asc" className="bg-slate-900 text-slate-100">Lowest assigned count to highest</option>
              <option value="alphabetical" className="bg-slate-900 text-slate-100">Alphabetical by name</option>
            </select>
          </div>

          <a
            href="/operator/portal"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40 text-slate-400 text-sm font-semibold hover:text-slate-100 transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4" /> Operator Portal
          </a>
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
              <><Zap className="w-4 h-4" /> Auto Assign</>
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
      ) : displayedOperators.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Headset className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold">No operators found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedOperators.map((op) => (
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
            key={`view-modal-${contactSource}-${viewOp.id}`}
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
        {/* Dry-Run Summary Dialog with 7 Filter Controls & Selected Operator Checkboxes */}
        {(autoAssignStep === 'dry-run' || autoAssignStep === 'loading-dry-run') && dryRunSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl p-6 w-full max-w-2xl relative max-h-[90vh] flex flex-col"
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
                  <p className="text-xs text-slate-500">Read-only preview. Choose filters and target operators before executing assignment.</p>
                </div>
              </div>

              {/* Dynamic 10 Filter Controls (Multi-Select with OR semantics within filter, AND across filters) */}
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Candidate Filters (AND Semantics)
                  </span>
                  {(selectedAreas.length > 0 || selectedColleges.length > 0 || selectedOccupations.length > 0 || selectedStandards.length > 0 || selectedServices.length > 0 || selectedDates.length > 0 || selectedVolunteers.length > 0 || selectedClassesAttended.length > 0 || selectedLevelNumbers.length > 0 || selectedChanting.length > 0) && (
                    <button
                      onClick={handleClearFilters}
                      className="text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {/* 1. Area of Stay */}
                  <MultiSelectDropdown
                    label="Area of Stay"
                    placeholder="All Areas"
                    options={dryRunSummary.filter_options?.areas || []}
                    selected={selectedAreas}
                    onChange={(next) => {
                      setSelectedAreas(next);
                      fetchDryRun({ areas: next });
                    }}
                  />

                  {/* 2. College / Company */}
                  <MultiSelectDropdown
                    label="College / Company"
                    placeholder="All Colleges/Companies"
                    options={dryRunSummary.filter_options?.colleges || []}
                    selected={selectedColleges}
                    onChange={(next) => {
                      setSelectedColleges(next);
                      fetchDryRun({ colleges: next });
                    }}
                  />

                  {/* 3. Occupation */}
                  <MultiSelectDropdown
                    label="Occupation"
                    placeholder="All Occupations"
                    options={dryRunSummary.filter_options?.occupations || ['Student', 'Employee', 'Working', 'Business', 'Others']}
                    selected={selectedOccupations}
                    onChange={(next) => {
                      setSelectedOccupations(next);
                      fetchDryRun({ occupations: next });
                    }}
                  />

                  {/* 4. Standard */}
                  <MultiSelectDropdown
                    label="Standard"
                    placeholder="All Standards"
                    labelColor="text-amber-400"
                    borderColor="border-amber-500/30"
                    options={dryRunSummary.filter_options?.standards || ['1st Year', '2nd Year', '3rd Year', '4th Year']}
                    selected={selectedStandards}
                    onChange={(next) => {
                      setSelectedStandards(next);
                      fetchDryRun({ standards: next });
                    }}
                  />

                  {/* 5. Service */}
                  <MultiSelectDropdown
                    label="Service"
                    placeholder="All Services"
                    options={(dryRunSummary.filter_options?.services || []).map((svc) => ({ value: svc.id, label: svc.name }))}
                    selected={selectedServices}
                    onChange={(next) => {
                      setSelectedServices(next);
                      fetchDryRun({ services: next });
                    }}
                  />

                  {/* 6. Date */}
                  <MultiSelectDropdown
                    label="Date"
                    placeholder="All Dates"
                    options={dryRunSummary.filter_options?.dates || []}
                    selected={selectedDates}
                    onChange={(next) => {
                      setSelectedDates(next);
                      fetchDryRun({ dates: next });
                    }}
                  />

                  {/* 7. Volunteer */}
                  <MultiSelectDropdown
                    label="Volunteer"
                    placeholder="All"
                    options={[
                      { value: 'Volunteer', label: 'Volunteer (Yes)' },
                      { value: 'Non-Volunteer', label: 'Non-Volunteer (No)' },
                    ]}
                    selected={selectedVolunteers}
                    onChange={(next) => {
                      setSelectedVolunteers(next);
                      fetchDryRun({ volunteers: next });
                    }}
                  />

                  {/* 8. No. of Classes Attended */}
                  <MultiSelectDropdown
                    label="Classes Attended"
                    placeholder="All Classes"
                    labelColor="text-amber-400"
                    borderColor="border-amber-500/30"
                    options={[
                      { value: '0', label: '0 Classes' },
                      { value: '1-10', label: '1–10 Classes' },
                      { value: '11-20', label: '11–20 Classes' },
                      { value: '21+', label: '21+ Classes' },
                    ]}
                    selected={selectedClassesAttended}
                    onChange={(next) => {
                      setSelectedClassesAttended(next);
                      fetchDryRun({ classesAttended: next });
                    }}
                  />

                  {/* 9. Level Number */}
                  <MultiSelectDropdown
                    label="Level Number"
                    placeholder="All Levels"
                    labelColor="text-amber-400"
                    borderColor="border-amber-500/30"
                    options={[
                      { value: '0', label: 'Level 0 (No level)' },
                      { value: '1', label: 'Level 1 (AOMC)' },
                      { value: '2', label: 'Level 2 (Foundation)' },
                      { value: '3', label: 'Level 3 (Prilims)' },
                      { value: '4', label: 'Level 4 (Enhance)' },
                    ]}
                    selected={selectedLevelNumbers}
                    onChange={(next) => {
                      setSelectedLevelNumbers(next);
                      fetchDryRun({ levelNumbers: next });
                    }}
                  />

                  {/* 10. Chanting Count */}
                  <MultiSelectDropdown
                    label="Chanting Count"
                    placeholder="All Chanting"
                    labelColor="text-amber-400"
                    borderColor="border-amber-500/30"
                    options={[
                      { value: '0', label: '0 rounds' },
                      { value: '1+', label: '1+ rounds' },
                      { value: '4+', label: '4+ rounds' },
                      { value: '8+', label: '8+ rounds' },
                      { value: '16+', label: '16+ rounds' },
                    ]}
                    selected={selectedChanting}
                    onChange={(next) => {
                      setSelectedChanting(next);
                      fetchDryRun({ chanting: next });
                    }}
                  />
                </div>

                {/* Active filter badges with individual removal */}
                {(selectedAreas.length > 0 || selectedColleges.length > 0 || selectedOccupations.length > 0 || selectedStandards.length > 0 || selectedServices.length > 0 || selectedDates.length > 0 || selectedVolunteers.length > 0 || selectedClassesAttended.length > 0 || selectedLevelNumbers.length > 0 || selectedChanting.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-500 mr-0.5">Active:</span>
                    {selectedAreas.map((val) => (
                      <span key={`area-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-950/50 border border-purple-500/30 text-[10px] text-purple-200">
                        <span className="text-slate-400">Area:</span> {val}
                        <button type="button" onClick={() => { const n = selectedAreas.filter((v) => v !== val); setSelectedAreas(n); fetchDryRun({ areas: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {selectedColleges.map((val) => (
                      <span key={`col-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-950/50 border border-purple-500/30 text-[10px] text-purple-200">
                        <span className="text-slate-400">College:</span> {val}
                        <button type="button" onClick={() => { const n = selectedColleges.filter((v) => v !== val); setSelectedColleges(n); fetchDryRun({ colleges: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {selectedOccupations.map((val) => (
                      <span key={`occ-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-950/50 border border-purple-500/30 text-[10px] text-purple-200">
                        <span className="text-slate-400">Occ:</span> {val}
                        <button type="button" onClick={() => { const n = selectedOccupations.filter((v) => v !== val); setSelectedOccupations(n); fetchDryRun({ occupations: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {selectedStandards.map((val) => (
                      <span key={`std-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-950/50 border border-amber-500/30 text-[10px] text-amber-200">
                        <span className="text-slate-400">Std:</span> {val}
                        <button type="button" onClick={() => { const n = selectedStandards.filter((v) => v !== val); setSelectedStandards(n); fetchDryRun({ standards: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {selectedServices.map((val) => {
                      const svc = (dryRunSummary.filter_options?.services || []).find((s) => s.id === val);
                      return (
                        <span key={`svc-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-950/50 border border-purple-500/30 text-[10px] text-purple-200">
                          <span className="text-slate-400">Service:</span> {svc ? svc.name : val}
                          <button type="button" onClick={() => { const n = selectedServices.filter((v) => v !== val); setSelectedServices(n); fetchDryRun({ services: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      );
                    })}
                    {selectedDates.map((val) => (
                      <span key={`date-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-950/50 border border-purple-500/30 text-[10px] text-purple-200">
                        <span className="text-slate-400">Date:</span> {val}
                        <button type="button" onClick={() => { const n = selectedDates.filter((v) => v !== val); setSelectedDates(n); fetchDryRun({ dates: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {selectedVolunteers.map((val) => (
                      <span key={`vol-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-950/50 border border-purple-500/30 text-[10px] text-purple-200">
                        <span className="text-slate-400">Vol:</span> {val}
                        <button type="button" onClick={() => { const n = selectedVolunteers.filter((v) => v !== val); setSelectedVolunteers(n); fetchDryRun({ volunteers: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {selectedClassesAttended.map((val) => (
                      <span key={`class-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-950/50 border border-amber-500/30 text-[10px] text-amber-200">
                        <span className="text-slate-400">Classes:</span> {val}
                        <button type="button" onClick={() => { const n = selectedClassesAttended.filter((v) => v !== val); setSelectedClassesAttended(n); fetchDryRun({ classesAttended: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {selectedLevelNumbers.map((val) => (
                      <span key={`lvl-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-950/50 border border-amber-500/30 text-[10px] text-amber-200">
                        <span className="text-slate-400">Level:</span> {val}
                        <button type="button" onClick={() => { const n = selectedLevelNumbers.filter((v) => v !== val); setSelectedLevelNumbers(n); fetchDryRun({ levelNumbers: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {selectedChanting.map((val) => (
                      <span key={`ch-${val}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-950/50 border border-amber-500/30 text-[10px] text-amber-200">
                        <span className="text-slate-400">Chanting:</span> {val}
                        <button type="button" onClick={() => { const n = selectedChanting.filter((v) => v !== val); setSelectedChanting(n); fetchDryRun({ chanting: n }); }} className="text-slate-400 hover:text-slate-100 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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

                {/* Warnings */}
                {dryRunSummary.eligible_male === 0 && (
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                    No eligible contacts found for the selected filters.
                  </div>
                )}

                {dryRunSummary.eligible_male > 0 && dryRunSummary.available_slots === 0 && (
                  <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex gap-2 items-center">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <p className="text-xs text-amber-300 font-semibold">
                      {selectedOperatorIds.length > 0
                        ? 'Selected operators have no available capacity.'
                        : 'No available capacity across active operators.'}
                    </p>
                  </div>
                )}

                {dryRunSummary.capacity_warning && dryRunSummary.available_slots > 0 && (
                  <div className="p-3 bg-red-950/40 border border-red-500/25 rounded-xl flex gap-2 items-start">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <p className="text-xs text-red-300 leading-relaxed">
                      <strong>Capacity Warning:</strong> There are {dryRunSummary.eligible_male} eligible male registrations matching filters but only {dryRunSummary.available_slots} available slots across selected/active operators.
                      {dryRunSummary.will_skip_capacity > 0 && <> <strong>{dryRunSummary.will_skip_capacity} registrations will be skipped</strong> due to capacity limit (40/operator).</> }
                    </p>
                  </div>
                )}

                {/* Operator breakdown with interactive checkboxes */}
                {dryRunSummary.operator_breakdown.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Operator Capacities {selectedOperatorIds.length > 0 ? `(${selectedOperatorIds.length} Selected)` : '(All Active)'}
                      </p>
                      {selectedOperatorIds.length > 0 && (
                        <button
                          onClick={() => {
                            setSelectedOperatorIds([]);
                            fetchDryRun({ operatorIds: [] });
                          }}
                          className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                        >
                          Select All Operators
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {dryRunSummary.operator_breakdown.map((op) => {
                        const pct = Math.round((op.current / op.capacity) * 100);
                        const barColor = pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
                        const textColor = pct >= 100 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-green-400';
                        const isChecked = selectedOperatorIds.includes(op.id);
                        const isDisabled = op.is_full;

                        return (
                          <label
                            key={op.id}
                            className={`flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${
                              isDisabled
                                ? 'bg-slate-950/40 border-slate-900 opacity-60 cursor-not-allowed'
                                : isChecked
                                ? 'bg-amber-950/30 border-amber-500/40'
                                : 'bg-slate-900/30 border-slate-800/60 hover:bg-slate-900/60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => !isDisabled && handleToggleOperatorCheckbox(op.id)}
                              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/30 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <p className="text-xs text-slate-300 w-32 shrink-0 truncate font-semibold">
                              {op.name}
                              {op.is_full && <span className="ml-1.5 text-[9px] font-bold text-red-400 uppercase tracking-wider">(FULL)</span>}
                            </p>
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <p className={`text-[10px] font-bold w-14 text-right shrink-0 ${textColor}`}>{op.current}/{op.capacity}</p>
                          </label>
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
                  {selectedOperatorIds.length === 0
                    ? `Assign All (${dryRunSummary.will_assign} contacts)`
                    : selectedOperatorIds.length === 1
                    ? `Assign to Selected Operator (1) — ${dryRunSummary.will_assign} contacts`
                    : `Assign to Selected Operators (${selectedOperatorIds.length}) — ${dryRunSummary.will_assign} contacts`}
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
