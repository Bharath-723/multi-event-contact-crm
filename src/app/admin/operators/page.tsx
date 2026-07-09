'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  PhoneCall, Plus, Edit2, ToggleLeft, ToggleRight,
  Users, CheckCircle, Clock, TrendingUp, Eye,
  Loader2, AlertCircle, X, Save, Phone, Mail,
  User, Lock, RefreshCw, Headset, LogIn, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ContactOperator } from '@/lib/types';

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
  onRemove,
}: {
  op: ContactOperator;
  onEdit: (op: ContactOperator) => void;
  onToggle: (op: ContactOperator) => void;
  onViewAssigned: (op: ContactOperator) => void;
  onRemove: (op: ContactOperator) => void;
}) {
  const callRate = op.call_success_pct ?? 0;
  const statusColor = op.is_active
    ? 'text-green-400 bg-green-950/40 border-green-500/30'
    : 'text-slate-500 bg-slate-900/40 border-slate-700/30';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-5 flex flex-col gap-4 hover:shadow-[0_0_25px_rgba(139,92,246,0.1)] transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-purple-950/50 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <Headset className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-100 text-sm truncate">{op.name}</p>
            <p className="text-xs text-slate-500 truncate">{op.email}</p>
            {op.phone && <p className="text-xs text-slate-500">{op.phone}</p>}
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 ${statusColor}`}>
          {op.is_active ? 'Active' : 'Disabled'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-slate-100">{op.total_assigned ?? 0}</p>
          <p className="text-[10px] text-slate-500">Assigned</p>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-yellow-400">{op.total_pending ?? 0}</p>
          <p className="text-[10px] text-slate-500">Pending</p>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-2.5 text-center">
          <p className="text-lg font-extrabold text-green-400">{op.total_completed ?? 0}</p>
          <p className="text-[10px] text-slate-500">Completed</p>
        </div>
      </div>

      {/* Call Rate Bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-slate-500">Call Success</span>
          <span className="text-[11px] font-bold text-purple-400">{callRate}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(callRate, 100)}%` }}
          />
        </div>
      </div>

      {op.last_login_at && (
        <p className="text-[10px] text-slate-600">
          Last login: {new Date(op.last_login_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => onViewAssigned(op)}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-950/30 border border-purple-500/20 text-purple-400 text-xs font-semibold hover:bg-purple-950/50 transition-all cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" /> View
        </button>
        <button
          onClick={() => onEdit(op)}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-900/40 border border-slate-700/30 text-slate-400 text-xs font-semibold hover:text-slate-100 transition-all cursor-pointer"
        >
          <Edit2 className="w-3.5 h-3.5" /> Edit
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

// ─── View Assigned Modal ──────────────────────────────────────────────────────
function ViewAssignedModal({
  operator,
  onClose,
}: {
  operator: ContactOperator;
  onClose: () => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/assignments?operator_id=${operator.id}&limit=100`, {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        const d = await res.json();
        setAssignments(d.assignments ?? []);
        setTotalCount(d.total ?? 0);
      }
      setLoading(false);
    }
    load();
  }, [operator.id]);

  const statusColors: Record<string, string> = {
    Pending: 'text-yellow-400 bg-yellow-950/30 border-yellow-500/20',
    Called: 'text-blue-400 bg-blue-950/30 border-blue-500/20',
    Confirmed: 'text-green-400 bg-green-950/30 border-green-500/20',
    'No Answer': 'text-red-400 bg-red-950/30 border-red-500/20',
    'Wrong Number': 'text-red-500 bg-red-950/30 border-red-500/20',
    'Callback Required': 'text-orange-400 bg-orange-950/30 border-orange-500/20',
    Completed: 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20',
    Visited: 'text-purple-400 bg-purple-950/30 border-purple-500/20',
  };

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
            <p className="text-xs text-slate-500">Assigned Contacts — {totalCount} total</p>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /></div>}
          {!loading && totalCount === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">No contacts assigned yet.</p>
          )}
          {assignments.map((a) => {
            const reg = a.registrations as Record<string, unknown> | null;
            const statusClass = statusColors[(a.status as string)] ?? 'text-slate-400 bg-slate-900/40 border-slate-700/30';
            const remarksText = typeof a.remarks === 'string' ? a.remarks : null;
            return (
              <div key={a.id as string} className="flex items-center justify-between gap-3 p-3 bg-slate-900/30 rounded-xl border border-slate-800/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">{String(reg?.full_name ?? '—')}</p>
                  <p className="text-xs text-slate-500">{String(reg?.phone ?? '—')} · {String(reg?.area_of_stay ?? '—')}</p>
                  {remarksText && <p className="text-xs text-slate-600 italic mt-0.5 truncate">{remarksText}</p>}
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 ${statusClass}`}>
                  {String(a.status)}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactOperatorsPage() {
  const [operators, setOperators] = useState<ContactOperator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editOp, setEditOp] = useState<ContactOperator | null>(null);
  const [viewOp, setViewOp] = useState<ContactOperator | null>(null);
  const [removeOp, setRemoveOp] = useState<ContactOperator | null>(null);
  const [removing, setRemoving] = useState(false);
  const [errorRemove, setErrorRemove] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

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
      const res = await fetch('/api/operators', { headers: { Authorization: auth } });
      if (res.ok) {
        const d = await res.json();
        setOperators(d.operators ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOperators(); }, [loadOperators]);

  // Realtime subscription for contact assignments status/count updates
  useEffect(() => {
    const channel = supabase
      .channel('admin_operators_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_assignments' },
        () => {
          loadOperators();
        }
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
  const totalCompleted = operators.reduce((s, o) => s + (o.total_completed ?? 0), 0);
  const completionPct = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <PhoneCall className="w-7 h-7 text-purple-400" />
            Contact Operators
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage call operators and contact assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin/operator"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40 text-slate-400 text-sm font-semibold hover:text-slate-100 transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4" /> Operator Portal
          </a>
          <button
            onClick={loadOperators}
            className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40 text-slate-400 hover:text-slate-100 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Operators', value: totalOperators, icon: Headset, color: 'text-purple-400' },
          { label: 'Active', value: activeOperators, icon: ToggleRight, color: 'text-green-400' },
          { label: 'Assigned', value: totalAssigned, icon: Users, color: 'text-blue-400' },
          { label: 'Pending Calls', value: totalPending, icon: Clock, color: 'text-yellow-400' },
          { label: 'Completed', value: totalCompleted, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Completion %', value: `${completionPct}%`, icon: TrendingUp, color: 'text-indigo-400' },
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
      ) : operators.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Headset className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold">No contact operators yet.</p>
          <p className="text-slate-600 text-sm mt-1">Click &ldquo;Add Operator&rdquo; to create your first operator.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {operators.map((op) => (
            <OperatorCard
              key={op.id}
              op={op}
              onEdit={setEditOp}
              onToggle={handleToggle}
              onViewAssigned={setViewOp}
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
            onClose={() => setViewOp(null)}
          />
        )}
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

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 right-6 z-[100] bg-slate-800 border border-slate-700 text-slate-100 text-sm font-medium px-5 py-3 rounded-2xl shadow-2xl"
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
