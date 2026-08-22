'use client';

/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Users, UserCheck, Search, RefreshCw, Loader2,
  FileSpreadsheet, FileText, Star, Laptop, GraduationCap, GitBranch,
  UserPlus, CheckCircle2, X, Sparkles, Home, AlertTriangle, TrendingUp, ThumbsUp, Info
} from 'lucide-react';
import { FeedbackContact, FeedbackContactAssignment, ContactOperator } from '@/lib/types';

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

interface FeedbackStats {
  total_responses: number;
  total_male: number;
  total_female: number;
  total_excellent: number;
  total_good: number;
  total_not_applicable: number;
  total_online_work: number;
  total_with_parents: number;
  total_in_hostel: number;
}

interface FeedbackDryRunData {
  totalUnassigned: number;
  eligibleMale: number;
  eligibleFemale: number;
  activeOperatorsCount: number;
  totalAvailableSlots: number;
  willAssign: number;
  capacityWarning: boolean;
  operatorCapacities: {
    id: string;
    name: string;
    assignedCount: number;
    capacity: number;
    remaining: number;
  }[];
}

export default function AdminFeedbackDashboard() {
  const [contacts, setContacts] = useState<FeedbackContact[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<FeedbackStats>({
    total_responses: 0,
    total_male: 0,
    total_female: 0,
    total_excellent: 0,
    total_good: 0,
    total_not_applicable: 0,
    total_online_work: 0,
    total_with_parents: 0,
    total_in_hostel: 0,
  });
  const [loading, setLoading] = useState(true);

  // Skills mapping
  const [skillsMap, setSkillsMap] = useState<Record<string, string>>({});

  // Assignments & Operators State
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, FeedbackContactAssignment>>({});
  const [operators, setOperators] = useState<ContactOperator[]>([]);
  const [assigningModal, setAssigningModal] = useState<{ open: boolean; contact?: FeedbackContact; currentAssignment?: FeedbackContactAssignment }>({ open: false });
  const [selectedOpId, setSelectedOpId] = useState('');
  const [assigningBtn, setAssigningBtn] = useState(false);

  // Dry Run Modal State
  const [dryRunModal, setDryRunModal] = useState<{ open: boolean; loading: boolean; dryRun?: FeedbackDryRunData }>({
    open: false,
    loading: false,
  });
  const [executingAutoAssign, setExecutingAutoAssign] = useState(false);

  // Filters State
  const [search, setSearch] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterCollege, setFilterCollege] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStay, setFilterStay] = useState('');
  const [filterFeedback, setFilterFeedback] = useState('');
  const [filterOnlineWork, setFilterOnlineWork] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 20;

  const printRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Skills Definitions Map
  useEffect(() => {
    async function loadSkills() {
      try {
        const { data } = await supabase.from('skills').select('id, name');
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((sk) => {
            map[sk.id] = sk.name;
          });
          setSkillsMap(map);
        }
      } catch (err) {
        console.error('Failed to load skills:', err);
      }
    }
    loadSkills();
  }, []);

  const resolveSkillName = (skill: string): string | null => {
    if (!skill) return null;
    if (skillsMap[skill]) return skillsMap[skill];
    if (/^[0-9a-fA-F-]{36}$/.test(skill.trim())) return null; // Hide raw UUIDs
    return skill;
  };

  // 1. Fetch Feedback Contacts & Global Stats
  const loadData = useCallback(async (overrideFilters?: {
    s?: string;
    pageNum?: number;
    g?: string;
    col?: string;
    br?: string;
    st?: string;
    fb?: string;
    ow?: string;
  }) => {
    setLoading(true);
    try {
      const searchVal = overrideFilters?.s !== undefined ? overrideFilters.s : search;
      const pageVal = overrideFilters?.pageNum !== undefined ? overrideFilters.pageNum : page;
      const genderVal = overrideFilters?.g !== undefined ? overrideFilters.g : filterGender;
      const collegeVal = overrideFilters?.col !== undefined ? overrideFilters.col : filterCollege;
      const branchVal = overrideFilters?.br !== undefined ? overrideFilters.br : filterBranch;
      const stayVal = overrideFilters?.st !== undefined ? overrideFilters.st : filterStay;
      const feedbackVal = overrideFilters?.fb !== undefined ? overrideFilters.fb : filterFeedback;
      const onlineWorkVal = overrideFilters?.ow !== undefined ? overrideFilters.ow : filterOnlineWork;

      const auth = await getAuthHeader();
      const params = new URLSearchParams({
        page: String(pageVal),
        limit: String(limit),
      });

      if (searchVal.trim()) params.set('search', searchVal.trim());
      if (genderVal) params.set('gender', genderVal);
      if (collegeVal.trim()) params.set('college', collegeVal.trim());
      if (branchVal.trim()) params.set('branch', branchVal.trim());
      if (stayVal) params.set('current_stay', stayVal);
      if (feedbackVal) params.set('feedback', feedbackVal);
      if (onlineWorkVal) params.set('interested_online_work', onlineWorkVal);

      const res = await fetch(`/api/feedback?${params.toString()}`, {
        headers: { Authorization: auth },
      });

      if (res.ok) {
        const d = await res.json();
        setContacts(d.contacts ?? []);
        setTotal(d.total ?? 0);
        if (d.stats) {
          setStats(d.stats);
        }
      }
    } catch (err) {
      console.error('[FeedbackDashboard] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page, filterGender, filterCollege, filterBranch, filterStay, filterFeedback, filterOnlineWork]);

  // 2. Fetch Active Assignments
  const loadAssignments = useCallback(async () => {
    try {
      const res = await fetch('/api/assignments/feedback?is_active=true');
      const data = await res.json();
      if (res.ok && data.assignments) {
        const map: Record<string, FeedbackContactAssignment> = {};
        for (const a of data.assignments as FeedbackContactAssignment[]) {
          map[a.feedback_contact_id] = a;
        }
        setAssignmentsMap(map);
      }
    } catch (err) {
      console.error('[FeedbackDashboard] Load assignments error:', err);
    }
  }, []);

  // 3. Fetch Active Operators
  const loadOperators = useCallback(async () => {
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/operators', { headers: { Authorization: auth } });
      const data = await res.json();
      if (res.ok && data.operators) {
        setOperators(data.operators.filter((op: ContactOperator) => op.is_active));
      }
    } catch (err) {
      console.error('[FeedbackDashboard] Load operators error:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadAssignments();
    loadOperators();
  }, [loadData, loadAssignments, loadOperators]);

  // 4. Realtime Subscription for feedback_contact_assignments
  useEffect(() => {
    const channel = supabase
      .channel('admin-fca-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedback_contact_assignments' },
        () => {
          loadAssignments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAssignments]);

  // 5. Manual Assign / Reassign Handler
  const handleAssignOperator = async () => {
    if (!assigningModal.contact || !selectedOpId || assigningModal.contact.gender === 'Female') return;
    setAssigningBtn(true);
    try {
      const res = await fetch('/api/assignments/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackContactId: assigningModal.contact.id,
          targetOperatorId: selectedOpId,
        }),
      });

      if (res.ok) {
        setAssigningModal({ open: false });
        setSelectedOpId('');
        loadAssignments();
      }
    } catch (err) {
      console.error('Assign failed:', err);
    } finally {
      setAssigningBtn(false);
    }
  };

  // 6. Open Dry Run Preview Modal
  const handleOpenDryRun = async () => {
    setDryRunModal({ open: true, loading: true });
    try {
      const res = await fetch('/api/assignments/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dry_run' }),
      });
      const data = await res.json();
      if (res.ok && data.dryRun) {
        setDryRunModal({ open: true, loading: false, dryRun: data.dryRun });
      } else {
        setDryRunModal({ open: false, loading: false });
      }
    } catch (err) {
      console.error('Dry run failed:', err);
      setDryRunModal({ open: false, loading: false });
    }
  };

  // 7. Execute Auto Assignment
  const handleExecuteAutoAssign = async () => {
    setExecutingAutoAssign(true);
    try {
      const res = await fetch('/api/assignments/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_assign_all' }),
      });

      if (res.ok) {
        setDryRunModal({ open: false, loading: false });
        loadAssignments();
      }
    } catch (err) {
      console.error('Execute auto assign failed:', err);
    } finally {
      setExecutingAutoAssign(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadData({ s: val, pageNum: 1 });
    }, 350);
  };

  const handleClearFilters = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setSearch('');
    setFilterGender('');
    setFilterCollege('');
    setFilterBranch('');
    setFilterStay('');
    setFilterFeedback('');
    setFilterOnlineWork('');
    setPage(1);
    loadData({ s: '', pageNum: 1, g: '', col: '', br: '', st: '', fb: '', ow: '' });
  };

  // CSV Export
  const handleExportCSV = () => {
    if (contacts.length === 0) return;
    const headers = ['Full Name', 'Phone', 'College', 'Branch', 'Gender', 'Current Stay', 'Skills', 'Feedback', 'Interested in Online Workshop', 'Assigned Operator', 'Status', 'Submitted Date'];
    const rows = contacts.map(c => {
      const assign = assignmentsMap[c.id];
      const opName = c.gender === 'Female' ? 'Not Assignable' : (assign?.operator?.name || 'Unassigned');
      const status = c.gender === 'Female' ? 'Not Assignable' : (assign?.status || 'Unassigned');
      const validSkills = (c.skills || []).map(resolveSkillName).filter(Boolean).join(', ');
      return [
        `"${c.full_name.replace(/"/g, '""')}"`,
        `"${c.phone}"`,
        `"${c.college_name.replace(/"/g, '""')}"`,
        `"${c.branch.replace(/"/g, '""')}"`,
        `"${c.gender}"`,
        `"${c.current_stay}"`,
        `"${validSkills.replace(/"/g, '""')}"`,
        `"${c.feedback}"`,
        `"${(c.interested_online_workshop ?? c.interested_online_work) ? 'Yes' : 'No'}"`,
        `"${opName}"`,
        `"${status}"`,
        `"${new Date(c.created_at).toLocaleString()}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `feedback_contacts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Print
  const handleExportPDF = () => {
    window.print();
  };

  const totalPages = Math.ceil(total / limit) || 1;

  // Percentage Calculations
  const satisfactionRate = stats.total_responses > 0
    ? Math.round(((stats.total_excellent + stats.total_good) / stats.total_responses) * 100)
    : 0;
  const workshopConversion = stats.total_responses > 0
    ? Math.round((stats.total_online_work / stats.total_responses) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 transition-colors duration-200" ref={printRef}>
      {/* --- Full Responsive Width Container --- */}
      <div className="w-full space-y-6 px-1 sm:px-3 lg:px-4">
        
        {/* --- Top Header & Action Row --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-100 dark:text-slate-100 flex items-center gap-3">
              <Users className="w-7 h-7 text-purple-500 dark:text-purple-400" />
              Feedback Dashboard
            </h1>
            <p className="text-slate-400 dark:text-slate-400 text-sm mt-1 font-medium">Manage and review student feedback registrations & operator assignments</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap no-print">
            <button
              onClick={() => { loadData(); loadAssignments(); }}
              className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-100 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition-all shadow-sm cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-500 dark:text-purple-400' : ''}`} />
            </button>
            <button
              onClick={handleOpenDryRun}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold shadow-md transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Auto-Assign Pending
            </button>
            <button
              onClick={handleExportCSV}
              disabled={contacts.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4 text-white" /> Export CSV
            </button>
            <button
              onClick={handleExportPDF}
              disabled={contacts.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <FileText className="w-4 h-4 text-white" /> Print / Export PDF
            </button>
          </div>
        </div>

        {/* --- Metric Cards Grid (Matching Reference Image) --- */}
        <div className="space-y-3">
          {/* Row 1: 5 Primary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="glass-card bg-white dark:bg-slate-900/60 rounded-2xl p-4 text-center border border-slate-200 dark:border-purple-500/20 shadow-sm">
              <Users className="w-5 h-5 mx-auto mb-2 text-purple-500 dark:text-purple-400" />
              <p className="text-2xl font-extrabold text-slate-100 dark:text-slate-100">{stats.total_responses}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">Total Responses</p>
            </div>
            <div className="glass-card bg-white dark:bg-slate-900/60 rounded-2xl p-4 text-center border border-slate-200 dark:border-blue-500/20 shadow-sm">
              <UserCheck className="w-5 h-5 mx-auto mb-2 text-blue-500 dark:text-blue-400" />
              <p className="text-2xl font-extrabold text-blue-500 dark:text-blue-400">{stats.total_male} / {stats.total_female}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">Male / Female</p>
            </div>
            <div className="glass-card bg-white dark:bg-slate-900/60 rounded-2xl p-4 text-center border border-slate-200 dark:border-emerald-500/20 shadow-sm">
              <Laptop className="w-5 h-5 mx-auto mb-2 text-emerald-500 dark:text-emerald-400" />
              <p className="text-2xl font-extrabold text-emerald-500 dark:text-emerald-400">{stats.total_online_work}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">Online Workshop (Yes)</p>
            </div>
            <div className="glass-card bg-white dark:bg-slate-900/60 rounded-2xl p-4 text-center border border-slate-200 dark:border-amber-500/20 shadow-sm">
              <Star className="w-5 h-5 mx-auto mb-2 text-amber-500 dark:text-amber-400" />
              <p className="text-2xl font-extrabold text-amber-500 dark:text-amber-400">{stats.total_excellent}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">Excellent Rating</p>
            </div>
            <div className="glass-card bg-white dark:bg-slate-900/60 rounded-2xl p-4 text-center border border-slate-200 dark:border-indigo-500/20 shadow-sm col-span-2 sm:col-span-1">
              <Home className="w-5 h-5 mx-auto mb-2 text-indigo-500 dark:text-indigo-400" />
              <p className="text-2xl font-extrabold text-indigo-500 dark:text-indigo-400">{stats.total_with_parents} / {stats.total_in_hostel}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">Parents / Hostel</p>
            </div>
          </div>

          {/* Row 2: 4 Secondary Stat Cards (Exactly as in Reference Screenshot) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-card bg-white/80 dark:bg-slate-900/40 rounded-xl p-3 text-center border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xl font-extrabold text-emerald-500 dark:text-emerald-400 flex items-center justify-center gap-1">
                <ThumbsUp className="w-4 h-4" /> {stats.total_good}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-semibold">Good Rating</p>
            </div>
            <div className="glass-card bg-white/80 dark:bg-slate-900/40 rounded-xl p-3 text-center border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xl font-extrabold text-slate-100 dark:text-slate-100">{stats.total_not_applicable}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-semibold">Not Applicable Rating</p>
            </div>
            <div className="glass-card bg-white/80 dark:bg-slate-900/40 rounded-xl p-3 text-center border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xl font-extrabold text-purple-500 dark:text-purple-400 flex items-center justify-center gap-1">
                <TrendingUp className="w-4 h-4" /> {satisfactionRate}%
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-semibold">Satisfaction Rate</p>
            </div>
            <div className="glass-card bg-white/80 dark:bg-slate-900/40 rounded-xl p-3 text-center border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xl font-extrabold text-blue-500 dark:text-blue-400">{workshopConversion}%</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-semibold">Online Workshop Conversion</p>
            </div>
          </div>
        </div>

        {/* --- Search & Multi-Filters Panel --- */}
        <div className="glass-card bg-white dark:bg-slate-900/60 rounded-2xl p-4 space-y-3 border border-slate-200 dark:border-slate-800 shadow-sm no-print">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-100 dark:text-slate-100 uppercase tracking-wider">Search & Multi-Filters</h3>
            {(Boolean(search) || Boolean(filterGender) || Boolean(filterStay) || Boolean(filterFeedback) || Boolean(filterOnlineWork) || Boolean(filterCollege) || Boolean(filterBranch)) && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-300 hover:bg-purple-950/70 font-bold transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search dynamically by Name, Phone, College, or Branch..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-100 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Gender Filter */}
            <select
              value={filterGender}
              onChange={(e) => { const v = e.target.value; setFilterGender(v); setPage(1); loadData({ g: v, pageNum: 1 }); }}
              className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-100 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Gender (All)</option>
              <option value="Male" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Male</option>
              <option value="Female" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Female</option>
            </select>

            {/* Current Stay Filter */}
            <select
              value={filterStay}
              onChange={(e) => { const v = e.target.value; setFilterStay(v); setPage(1); loadData({ st: v, pageNum: 1 }); }}
              className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-100 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Current Stay (All)</option>
              <option value="With Parents" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">With Parents</option>
              <option value="In Hostel" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">In Hostel</option>
            </select>

            {/* Feedback Rating Filter */}
            <select
              value={filterFeedback}
              onChange={(e) => { const v = e.target.value; setFilterFeedback(v); setPage(1); loadData({ fb: v, pageNum: 1 }); }}
              className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-100 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Feedback (All)</option>
              <option value="Excellent" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Excellent</option>
              <option value="Good" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Good</option>
              <option value="Not Applicable" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Not Applicable</option>
            </select>

            {/* Online Workshop Interest Filter */}
            <select
              value={filterOnlineWork}
              onChange={(e) => { const v = e.target.value; setFilterOnlineWork(v); setPage(1); loadData({ ow: v, pageNum: 1 }); }}
              className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-100 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Online Workshop (All)</option>
              <option value="Yes" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Yes Only</option>
              <option value="No" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">No Only</option>
            </select>

            {/* College Filter Dropdown */}
            <select
              value={filterCollege}
              onChange={(e) => { const v = e.target.value; setFilterCollege(v); setPage(1); loadData({ col: v, pageNum: 1 }); }}
              className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-100 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">College (All)</option>
              <option value="CBIT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">CBIT</option>
              <option value="MGIT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">MGIT</option>
              <option value="JBIT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">JBIT</option>
              <option value="VJIT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">VJIT</option>
              <option value="VBIT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">VBIT</option>
            </select>

            {/* Branch Filter Dropdown */}
            <select
              value={filterBranch}
              onChange={(e) => { const v = e.target.value; setFilterBranch(v); setPage(1); loadData({ br: v, pageNum: 1 }); }}
              className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-100 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Branch (All)</option>
              <option value="CSE" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">CSE</option>
              <option value="ECE" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">ECE</option>
              <option value="EEE" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">EEE</option>
              <option value="Mechanical" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Mechanical</option>
              <option value="Civil" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Civil</option>
            </select>
          </div>
        </div>

        {/* --- Contacts Table --- */}
        <div className="glass-card bg-white dark:bg-slate-900/60 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-100 dark:text-slate-300">
              <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Full Name</th>
                  <th className="px-4 py-3.5">Phone</th>
                  <th className="px-4 py-3.5">College & Branch</th>
                  <th className="px-4 py-3.5">Gender</th>
                  <th className="px-4 py-3.5">Stay</th>
                  <th className="px-4 py-3.5">Feedback</th>
                  <th className="px-4 py-3.5 text-center">Online Workshop</th>
                  <th className="px-4 py-3.5">Assigned Operator</th>
                  <th className="px-4 py-3.5 text-right">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-500 dark:text-purple-400 mb-2" />
                      Loading feedback contacts...
                    </td>
                  </tr>
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      No feedback registrations match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  contacts.map((c) => {
                    const assignment = assignmentsMap[c.id];
                    const op = assignment?.operator;
                    const isOnlineWorkshop = Boolean(c.interested_online_workshop ?? c.interested_online_work);
                    const isFemale = c.gender === 'Female';

                    // Resolve human-readable skill names, filtering out raw UUIDs
                    const validSkillNames = (c.skills || [])
                      .map(resolveSkillName)
                      .filter((name): name is string => Boolean(name));

                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="px-4 py-3.5 font-bold text-slate-100 dark:text-slate-100 leading-snug">
                          {c.full_name}
                          {validSkillNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {validSkillNames.map(s => (
                                <span key={s} className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/20 text-[9px] text-purple-800 dark:text-purple-300 font-medium">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-300 dark:text-slate-300">{c.phone}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                              <GraduationCap className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" />
                              {c.college_name}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                              <GitBranch className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
                              {c.branch}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${c.gender === 'Male'
                            ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:border-blue-500/30 dark:text-blue-300'
                            : 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950/50 dark:border-pink-500/30 dark:text-pink-300'
                            }`}>
                            {c.gender}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${c.current_stay === 'With Parents'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-500/30 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:border-amber-500/30 dark:text-amber-300'
                            }`}>
                            {c.current_stay}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${c.feedback === 'Excellent'
                            ? 'bg-green-100 text-green-800 border-green-300 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-400'
                            : c.feedback === 'Good'
                              ? 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:border-yellow-500/30 dark:text-yellow-400'
                              : 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400'
                            }`}>
                            {c.feedback}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isOnlineWorkshop
                            ? 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-purple-950/50 dark:border-purple-500/30 dark:text-purple-300'
                            : 'bg-red-100 text-red-800 border-red-300 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-500'
                            }`}>
                            {isOnlineWorkshop ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {isFemale ? (
                            <div className="flex flex-col gap-0.5">
                              <button
                                disabled
                                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-[11px] font-bold cursor-not-allowed w-fit"
                              >
                                Not Assignable
                              </button>
                              <span className="text-[9px] font-bold text-red-500 flex items-center gap-0.5 whitespace-nowrap">
                                ⚠ FEMALES ARE NOT ALLOWED TO ASSIGN
                              </span>
                            </div>
                          ) : op ? (
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                {op.name}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30 font-semibold">
                                  {assignment.status}
                                </span>
                                <button
                                  onClick={() => setAssigningModal({ open: true, contact: c, currentAssignment: assignment })}
                                  className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer"
                                >
                                  Change
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAssigningModal({ open: true, contact: c })}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/70 text-[11px] font-bold transition-all cursor-pointer"
                            >
                              <UserPlus className="w-3 h-3" /> Assign
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right text-[11px] text-slate-400 dark:text-slate-400">
                          {new Date(c.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* --- Pagination Controls --- */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 no-print">
              <span className="text-xs text-slate-400 dark:text-slate-400 font-semibold">
                Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} of {total} contacts
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-100 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-300 dark:text-slate-400 font-bold px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-100 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* --- Dry Run Preview Modal --- */}
      {dryRunModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-100 dark:text-slate-100 text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                Feedback Auto Assign — Dry Run Preview
              </h3>
              <button
                onClick={() => setDryRunModal({ open: false, loading: false })}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {dryRunModal.loading || !dryRunModal.dryRun ? (
              <div className="py-12 text-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-500 dark:text-purple-400 mb-2" />
                <p className="text-xs font-semibold">Calculating unassigned feedback contacts & operator capacity...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 6 Metric Boxes Grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-xl font-extrabold text-purple-500 dark:text-purple-400">{dryRunModal.dryRun.totalUnassigned}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase">Unassigned</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-xl font-extrabold text-blue-500 dark:text-blue-400">{dryRunModal.dryRun.eligibleMale}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase">Eligible (Male)</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-xl font-extrabold text-pink-500 dark:text-pink-400">{dryRunModal.dryRun.eligibleFemale}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase">Skipped (Female)</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-xl font-extrabold text-indigo-500 dark:text-indigo-400">{dryRunModal.dryRun.activeOperatorsCount}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase">Active Operators</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-xl font-extrabold text-emerald-500 dark:text-emerald-400">{dryRunModal.dryRun.totalAvailableSlots}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase">Available Slots</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-xl font-extrabold text-amber-500 dark:text-amber-400">{dryRunModal.dryRun.willAssign}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase">Will Be Assigned</p>
                  </div>
                </div>

                {/* All Unassigned Contacts are Female Info Banner */}
                {dryRunModal.dryRun.eligibleMale === 0 && dryRunModal.dryRun.eligibleFemale > 0 && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 rounded-xl text-blue-800 dark:text-blue-300 text-xs flex gap-2">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>All remaining unassigned feedback contacts ({dryRunModal.dryRun.eligibleFemale}) are Female. Female contacts are excluded from auto-assignment per organization policy. No new assignments will be created.</span>
                  </div>
                )}

                {/* Capacity Warning */}
                {dryRunModal.dryRun.capacityWarning && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Capacity Warning: Available slots ({dryRunModal.dryRun.totalAvailableSlots}) are fewer than eligible male contacts ({dryRunModal.dryRun.eligibleMale}). Some male contacts will remain unassigned.</span>
                  </div>
                )}

                {/* Operator Capacities */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">Operator Workload & Capacity (40 max)</p>
                  {dryRunModal.dryRun.operatorCapacities.map((op) => (
                    <div key={op.id} className="flex items-center justify-between text-xs py-1.5 px-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                      <span className="font-semibold text-slate-100 dark:text-slate-100">{op.name}</span>
                      <span className="font-mono text-purple-500 dark:text-purple-400 font-bold">{op.assignedCount} / {op.capacity}</span>
                    </div>
                  ))}
                </div>

                {/* Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleExecuteAutoAssign}
                    disabled={executingAutoAssign || dryRunModal.dryRun.willAssign === 0}
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                  >
                    {executingAutoAssign ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Execute Auto Assignment ({dryRunModal.dryRun.willAssign} male contacts)
                  </button>
                  <button
                    onClick={() => setDryRunModal({ open: false, loading: false })}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-extrabold text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Assign Modal --- */}
      {assigningModal.open && assigningModal.contact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-100 dark:text-slate-100 text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                {assigningModal.currentAssignment ? 'Contact Already Assigned' : 'Assign Contact Operator'}
              </h3>
              <button
                onClick={() => { setAssigningModal({ open: false }); setSelectedOpId(''); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {assigningModal.currentAssignment ? (
              /* READ-ONLY ALREADY ASSIGNED VIEW */
              <div className="space-y-4">
                <div className="p-4 bg-purple-950/20 border border-purple-500/30 rounded-xl space-y-3">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Contact Name</p>
                    <p className="text-sm font-extrabold text-slate-100 mt-0.5">{assigningModal.contact.full_name}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Assigned Operator</p>
                    <p className="text-sm font-extrabold text-purple-400 mt-0.5">{assigningModal.currentAssignment.operator?.name || '—'}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status</p>
                    <span className="inline-block text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/25 px-2.5 py-0.5 rounded mt-0.5">
                      {assigningModal.currentAssignment.status || 'Assigned'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  This contact can only be assigned to one operator at a time. To change operator, first unassign this contact.
                </p>

                <div className="pt-2">
                  <button
                    onClick={() => { setAssigningModal({ open: false }); setSelectedOpId(''); }}
                    className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm font-bold hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              /* UNASSIGNED CONTACT FORM */
              <div className="space-y-4">
                <div className="text-xs space-y-1 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-100 dark:text-slate-100"><span className="font-bold text-slate-100 dark:text-slate-100">Student:</span> {assigningModal.contact.full_name}</p>
                  <p className="text-slate-400 dark:text-slate-400"><span className="font-bold text-slate-300 dark:text-slate-300">College:</span> {assigningModal.contact.college_name} ({assigningModal.contact.branch})</p>
                  <p className="text-slate-400 dark:text-slate-400"><span className="font-bold text-slate-300 dark:text-slate-300">Gender:</span> <span className={assigningModal.contact.gender === 'Female' ? 'text-pink-500 font-bold' : 'text-blue-500 font-bold'}>{assigningModal.contact.gender}</span></p>
                </div>

                {/* Female Warning Banner */}
                {assigningModal.contact.gender === 'Female' && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 rounded-xl text-red-800 dark:text-red-300 text-xs space-y-1">
                    <p className="font-extrabold flex items-center gap-1 text-red-600 dark:text-red-400">
                      ⚠ FEMALES ARE NOT ALLOWED TO ASSIGN
                    </p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      Female feedback contacts are excluded from operator assignment per organization policy.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 dark:text-slate-300">Select Operator / Co-ordinator *</label>
                  <select
                    value={selectedOpId}
                    disabled={assigningModal.contact.gender === 'Female'}
                    onChange={(e) => setSelectedOpId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-100 dark:text-slate-100 cursor-pointer disabled:opacity-50"
                  >
                    <option value="" disabled className="bg-white dark:bg-slate-950 text-slate-400">Choose operator...</option>
                    {operators.map((op) => (
                      <option key={op.id} value={op.id} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
                        {op.name} ({op.operator_type || 'operator'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleAssignOperator}
                    disabled={!selectedOpId || assigningBtn || assigningModal.contact.gender === 'Female'}
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                  >
                    {assigningBtn ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Confirm Assignment
                  </button>
                  <button
                    onClick={() => { setAssigningModal({ open: false }); setSelectedOpId(''); }}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-extrabold text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
