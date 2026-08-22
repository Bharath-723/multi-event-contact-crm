'use client';

/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Phone, Search, Loader2, Clock,
  Users, MessageSquare, Save, X, RefreshCw,
  ChevronLeft, ChevronRight, MessageCircle,
  CheckCircle2, XCircle, Sparkles, GraduationCap, GitBranch, Laptop, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FeedbackContact } from '@/lib/types';
import { ContactSource, normalizeSource } from '@/lib/source-resolver';
import { computeOperatorStats, formatOperatorDisplayName } from '@/lib/status-normalizer';
import Link from 'next/link';

export type AllowedStatus = 'Coming' | 'Not Coming' | 'Not Answered' | 'Next Week' | 'Not Interested';

const STATUS_OPTIONS: AllowedStatus[] = [
  'Coming', 'Not Coming', 'Not Answered', 'Next Week', 'Not Interested',
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  'Assigned':       { label: 'Assigned',       color: 'text-blue-400',    bg: 'bg-blue-950/30',    border: 'border-blue-500/30',   icon: <Clock className="w-3 h-3" /> },
  'Pending':        { label: 'Assigned',       color: 'text-blue-400',    bg: 'bg-blue-950/30',    border: 'border-blue-500/30',   icon: <Clock className="w-3 h-3" /> },
  'Coming':         { label: 'Coming',         color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  'Not Coming':     { label: 'Not Coming',     color: 'text-red-400',     bg: 'bg-red-950/30',     border: 'border-red-500/30',    icon: <XCircle className="w-3 h-3" /> },
  'Not Answered':   { label: 'Not Answered',   color: 'text-amber-400',   bg: 'bg-amber-950/30',   border: 'border-amber-500/30',  icon: <Clock className="w-3 h-3" /> },
  'Next Week':      { label: 'Next Week',      color: 'text-purple-400',  bg: 'bg-purple-950/30', border: 'border-purple-500/30', icon: <Clock className="w-3 h-3" /> },
  'Not Interested': { label: 'Not Interested', color: 'text-rose-400',    bg: 'bg-rose-950/30',    border: 'border-rose-500/30',   icon: <XCircle className="w-3 h-3" /> },
  'Not Connected':  { label: 'Not Answered',   color: 'text-amber-400',   bg: 'bg-amber-950/30',   border: 'border-amber-500/30',  icon: <Clock className="w-3 h-3" /> },
  'Contacted':      { label: 'Next Week',      color: 'text-purple-400',  bg: 'bg-purple-950/30', border: 'border-purple-500/30', icon: <Clock className="w-3 h-3" /> },
  'Interested':     { label: 'Coming',         color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  'Completed':      { label: 'Coming',         color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
};

interface OperatorInfo {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

interface GenericAssignmentData {
  id: string;
  operator_id: string;
  assigned_at: string;
  status: AllowedStatus | string;
  notes?: string | null;
  remarks?: string | null;
  is_active: boolean;
  updated_at: string;
  feedback_contact?: FeedbackContact | null;
  feedback_contacts?: Record<string, unknown> | null;
  krishnashtami_registrations?: Record<string, unknown> | null;
  registrations?: Record<string, unknown> | null;
}

interface Stats {
  total_assigned: number;
  total_coming: number;
  total_not_coming: number;
  total_not_answered: number;
  total_next_week: number;
}

function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

function waLink(phone: string): string {
  const digits = sanitizePhone(phone);
  return `https://wa.me/91${digits}`;
}

// ─── Notes Modal ────────────────────────────────────────────────────────────
function NotesModal({
  assignmentId,
  currentNotes,
  onSave,
  onClose,
}: {
  assignmentId: string;
  currentNotes: string;
  onSave: (id: string, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(currentNotes);
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
          placeholder="e.g. Interested in online workshop, Available on weekends, Sent details on WhatsApp..."
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
  onNotes,
}: {
  assignment: GenericAssignmentData;
  onStatusChange: (id: string, status: AllowedStatus) => Promise<void>;
  onNotes: (id: string, current: string) => void;
}) {
  const contact = (
    assignment.feedback_contacts ||
    assignment.feedback_contact ||
    assignment.krishnashtami_registrations ||
    assignment.registrations
  ) as Record<string, unknown> | null;

  const [updating, setUpdating] = useState(false);
  const meta = STATUS_META[assignment.status as AllowedStatus] ?? STATUS_META['Assigned'];

  const handleStatus = async (status: AllowedStatus) => {
    if (status === assignment.status) return;
    setUpdating(true);
    try { await onStatusChange(assignment.id, status); }
    finally { setUpdating(false); }
  };

  if (!contact) return null;

  const fullName = String(contact.full_name ?? '—');
  const rawPhone = String(contact.phone ?? '');
  const cleanPhone = sanitizePhone(rawPhone);
  const college = String(contact.college_name || contact.company_college || '—');
  const branch = String(contact.branch || contact.occupation || '');
  const gender = String(contact.gender || '');
  const stay = String(contact.current_stay || contact.area_of_stay || '');
  const feedback = contact.feedback ? String(contact.feedback) : null;
  const skills = Array.isArray(contact.skills) ? (contact.skills as string[]) : [];
  const isOnlineWorkshop = Boolean(contact.interested_online_workshop ?? contact.interested_online_work);
  const notesText = assignment.notes || assignment.remarks || '';

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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-100 text-sm leading-snug truncate">{fullName}</span>
            {isOnlineWorkshop && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 shrink-0">
                <Laptop className="w-3 h-3 text-indigo-400" /> Online Workshop
              </span>
            )}
          </div>

          {/* Academic / Organization Info */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-xs text-slate-300">
            <span className="flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              {college}
            </span>
            {branch && (
              <span className="flex items-center gap-1 text-slate-400">
                <GitBranch className="w-3 h-3 text-indigo-400 shrink-0" />
                {branch}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
            {gender && <span className="text-[11px] text-slate-400">{gender}</span>}
            {stay && <span className="text-[11px] text-slate-400">· {stay}</span>}
            {feedback && (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-0.5">
                <Star className="w-3 h-3 text-emerald-400 fill-emerald-400/30" /> {feedback}
              </span>
            )}
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {skills.map((skill) => (
                <span key={skill} className="px-2 py-0.5 rounded bg-purple-950/40 border border-purple-500/20 text-[10px] text-purple-300 font-medium">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Status Badge */}
        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 ${meta.color} ${meta.bg} ${meta.border}`}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* Notes */}
      {notesText && (
        <p className="text-[11px] text-slate-300 italic bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-800/40 leading-relaxed">
          &ldquo;{notesText}&rdquo;
        </p>
      )}

      {/* Action Row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Call */}
        <a
          href={`tel:+91${cleanPhone}`}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-green-950/40 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-950/60 active:bg-green-950/80 transition-all"
          aria-label={`Call ${fullName}`}
        >
          <Phone className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">+91 {cleanPhone}</span>
        </a>

        {/* WhatsApp */}
        <a
          href={waLink(rawPhone)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-950/60 active:bg-emerald-950/80 transition-all"
          aria-label={`WhatsApp ${fullName}`}
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
          <span>WhatsApp</span>
        </a>

        {/* Status Dropdown — Only 3 Allowed Options */}
        <div className="relative col-span-2">
          {updating && (
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none z-10">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            </div>
          )}
          <select
            value={STATUS_OPTIONS.includes(assignment.status as AllowedStatus) ? assignment.status : ''}
            disabled={updating}
            onChange={(e) => {
              if (e.target.value) {
                handleStatus(e.target.value as AllowedStatus);
              }
            }}
            className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold text-slate-200 cursor-pointer disabled:opacity-50 appearance-none pr-8 bg-slate-950"
          >
            <option value="" disabled className="bg-slate-950 text-slate-400 font-semibold">
              Status
            </option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st} className="bg-slate-950 text-white font-medium">
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Add Notes Button */}
      <button
        onClick={() => onNotes(assignment.id, notesText)}
        className="w-full text-left text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center justify-between pt-1 border-t border-slate-800/40 cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          {notesText ? 'Edit Notes' : '+ Add Notes'}
        </span>
        {notesText && <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{notesText}</span>}
      </button>
    </motion.div>
  );
}

function OperatorPortalContent() {
  const searchParams = useSearchParams();
  const [contactSource, setContactSourceState] = useState<ContactSource>('rathayatra');
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [loadingOp, setLoadingOp] = useState(true);
  const [assignments, setAssignments] = useState<GenericAssignmentData[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_assigned: 0,
    total_coming: 0,
    total_not_coming: 0,
    total_not_answered: 0,
    total_next_week: 0,
  });
  const [loadingData, setLoadingData] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Preserve & read initial source from URL params
  useEffect(() => {
    const s = searchParams.get('source') || searchParams.get('contact_source');
    if (s) {
      setContactSourceState(normalizeSource(s));
    }
  }, [searchParams]);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  // Notes Modal State
  const [notesModal, setNotesModal] = useState<{ open: boolean; assignmentId: string; notes: string }>({
    open: false,
    assignmentId: '',
    notes: '',
  });

  const setContactSource = (newSource: ContactSource) => {
    // Immediate clean state reset when source changes
    setAssignments([]);
    setStats({
      total_assigned: 0,
      total_coming: 0,
      total_not_coming: 0,
      total_not_answered: 0,
      total_next_week: 0,
    });
    setSearch('');
    setPage(1);
    setContactSourceState(newSource);
  };

  // 1. Fetch Current Operator Profile
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/operators/me');
      const json = await res.json();
      if (res.ok && json.operator) {
        setOperator(json.operator);
      } else {
        setOperator(null);
      }
    } catch {
      setOperator(null);
    } finally {
      setLoadingOp(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // 2. Fetch Assignments for Current Operator & Active Source
  const loadAssignments = useCallback(async (isBackground = false) => {
    if (!operator) return;
    if (!isBackground) setLoadingData(true);

    try {
      const url = `/api/assignments/my?source=${contactSource}`;

      const res = await fetch(url);
      const json = await res.json();

      if (res.ok && json.assignments) {
        setAssignments(json.assignments as GenericAssignmentData[]);
        if (json.stats) {
          setStats(json.stats);
        }
      } else {
        setAssignments([]);
        setStats({ total_assigned: 0, total_coming: 0, total_not_coming: 0, total_not_answered: 0, total_next_week: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch operator assignments:', err);
      setAssignments([]);
      setStats({ total_assigned: 0, total_coming: 0, total_not_coming: 0, total_not_answered: 0, total_next_week: 0 });
    } finally {
      if (!isBackground) setLoadingData(false);
    }
  }, [operator, contactSource]);

  useEffect(() => {
    if (operator) loadAssignments(false);
  }, [operator, loadAssignments]);

  // 3. Supabase Realtime Subscription on source-specific assignment table
  const loadAssignmentsRef = useRef(loadAssignments);
  useEffect(() => {
    loadAssignmentsRef.current = loadAssignments;
  }, [loadAssignments]);

  useEffect(() => {
    if (!operator) return;

    const assignTable =
      contactSource === 'krishnashtami'
        ? 'krishnashtami_contact_assignments'
        : contactSource === 'feedback_contacts'
        ? 'feedback_contact_assignments'
        : 'contact_assignments';

    const channel = supabase
      .channel(`op-portal-${contactSource}-${operator.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: assignTable,
          filter: `operator_id=eq.${operator.id}`,
        },
        () => {
          loadAssignmentsRef.current(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [operator, contactSource]);

  // 4. Update Status Handler with immediate state & stats update (no full-page spinner/refresh)
  const handleStatusChange = async (assignmentId: string, status: AllowedStatus) => {
    // 1. Optimistic instant state & stats update
    setAssignments((prev) => {
      const updated = prev.map((item) => (item.id === assignmentId ? { ...item, status } : item));
      const statsObj = computeOperatorStats(updated);

      setStats({
        total_assigned: statsObj.assigned,
        total_coming: statsObj.coming,
        total_not_coming: statsObj.notComing,
        total_not_answered: statsObj.notAnswered,
        total_next_week: statsObj.nextWeek,
      });

      return updated;
    });
    toast(`Status updated to ${status}`);

    try {
      const res = await fetch(`/api/assignments/${assignmentId}?source=${contactSource}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        loadAssignments(true);
      } else {
        const d = await res.json();
        toast(d.error || 'Failed to update status');
        loadAssignments(true);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      toast('Network error while updating status.');
      loadAssignments(true);
    }
  };

  // 5. Save Notes Handler with immediate state update
  const handleSaveNotes = async (assignmentId: string, notes: string) => {
    // Optimistic instant state update
    setAssignments((prev) =>
      prev.map((item) => (item.id === assignmentId ? { ...item, notes, remarks: notes } : item))
    );
    toast('Notes saved.');

    try {
      const res = await fetch(`/api/assignments/${assignmentId}?source=${contactSource}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });

      if (res.ok) {
        loadAssignments(true);
      } else {
        const d = await res.json();
        toast(d.error || 'Failed to save notes.');
        loadAssignments(true);
      }
    } catch (err) {
      console.error('Failed to save notes:', err);
      toast('Network error while saving notes.');
      loadAssignments(true);
    }
  };

  // Filtered contacts list based on search string
  const filteredList = assignments.filter((a) => {
    const contact = (
      (a as unknown as Record<string, unknown>).feedback_contacts ||
      a.feedback_contact ||
      a.krishnashtami_registrations ||
      a.registrations
    ) as Record<string, unknown> | null;
    if (!contact) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = String(contact.full_name ?? '').toLowerCase();
    const phone = String(contact.phone ?? '');
    const college = String(contact.college_name || contact.company_college || '').toLowerCase();
    const branch = String(contact.branch || contact.occupation || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || college.includes(q) || branch.includes(q);
  });

  const totalPages = Math.ceil(filteredList.length / LIMIT) || 1;
  const paginatedList = filteredList.slice((page - 1) * LIMIT, page * LIMIT);

  const sourceTitle =
    contactSource === 'krishnashtami'
      ? 'Krishnashtami 2026'
      : contactSource === 'feedback_contacts'
      ? 'Feedback Contacts'
      : 'Rathayatra 2026';

  if (loadingOp) {
    return (
      <div className="min-h-screen bg-[#030014] text-slate-100 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!operator) {
    return (
      <div className="min-h-screen bg-[#030014] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-6 max-w-sm text-center space-y-4">
          <Users className="w-12 h-12 mx-auto text-purple-400" />
          <h2 className="text-xl font-bold">Operator Session Required</h2>
          <p className="text-sm text-slate-400">Please log in to your Contact Operator portal to view your assigned workload.</p>
          <Link href="/operator/login">
            <button className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm cursor-pointer">
              Go to Login
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-[#030014] text-slate-100 pb-16">
      {/* --- Top Header Bar --- */}
      <header className="sticky top-0 z-30 bg-[#030014]/90 backdrop-blur-md border-b border-purple-500/20 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center font-black text-white shadow-md">
              {operator.name.charAt(0)}
            </div>
            <div>
              <h1 className="font-bold text-sm text-slate-100 flex items-center gap-1.5 leading-snug">
                {formatOperatorDisplayName(operator.name)}
              </h1>
              <p className="text-[11px] text-purple-400 font-semibold">{sourceTitle} Operator Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Source Dropdown Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-purple-500/30 rounded-xl px-2.5 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Source:</span>
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

            <button
              onClick={() => loadAssignments()}
              disabled={loadingData}
              className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer disabled:opacity-50"
              title="Refresh List"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin text-purple-400' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {/* --- Metric Overview Cards (ASSIGNED, COMING, NOT COMING, NOT ANSWERED, NEXT WEEK) --- */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="glass-card rounded-xl p-3 border-blue-500/20 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned</p>
            <p className="text-xl font-extrabold text-blue-400 mt-0.5">{stats.total_assigned}</p>
          </div>
          <div className="glass-card rounded-xl p-3 border-emerald-500/20 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Coming</p>
            <p className="text-xl font-extrabold text-emerald-400 mt-0.5">{stats.total_coming}</p>
          </div>
          <div className="glass-card rounded-xl p-3 border-red-500/20 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Not Coming</p>
            <p className="text-xl font-extrabold text-red-400 mt-0.5">{stats.total_not_coming}</p>
          </div>
          <div className="glass-card rounded-xl p-3 border-amber-500/20 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Not Answered</p>
            <p className="text-xl font-extrabold text-amber-400 mt-0.5">{stats.total_not_answered}</p>
          </div>
          <div className="glass-card rounded-xl p-3 border-purple-500/20 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next Week</p>
            <p className="text-xl font-extrabold text-purple-400 mt-0.5">{stats.total_next_week}</p>
          </div>
        </div>

        {/* --- Search Bar --- */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search assigned contacts..."
            className="w-full pl-9 pr-3 py-2 rounded-xl glass-input text-xs text-foreground placeholder-slate-500"
          />
        </div>

        {/* --- Assigned Contacts List --- */}
        {loadingData ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-400" />
            <p className="text-xs font-medium">Loading assigned contacts for {sourceTitle}...</p>
          </div>
        ) : paginatedList.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center space-y-3">
            <Sparkles className="w-8 h-8 text-purple-400 mx-auto" />
            <h3 className="font-bold text-slate-200 text-sm">No Contacts Found</h3>
            <p className="text-xs text-slate-500">
              No assigned contacts matching this filter for {sourceTitle}.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedList.map((assignment) => (
              <ContactCard
                key={assignment.id}
                assignment={assignment}
                onStatusChange={handleStatusChange}
                onNotes={(id, current) => setNotesModal({ open: true, assignmentId: id, notes: current })}
              />
            ))}
          </div>
        )}

        {/* --- Pagination Controls --- */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <span className="text-xs text-slate-500 font-semibold">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </main>

      {/* --- Notes Modal --- */}
      {notesModal.open && (
        <NotesModal
          assignmentId={notesModal.assignmentId}
          currentNotes={notesModal.notes}
          onSave={handleSaveNotes}
          onClose={() => setNotesModal({ open: false, assignmentId: '', notes: '' })}
        />
      )}

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
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function OperatorPortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#030014] text-slate-100 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    }>
      <OperatorPortalContent />
    </Suspense>
  );
}
