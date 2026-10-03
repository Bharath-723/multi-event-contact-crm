'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { 
  Search, Download, Edit2, Trash2, ChevronLeft, ChevronRight, X, Eye, 
  Loader2, Sparkles, BookUser, Users, User, Home, Laptop, Filter, 
  RotateCcw, CheckCircle2, AlertCircle, Phone, Building, MapPin, Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ContactsRegisterRecord {
  id: string;
  full_name: string;
  phone: string;
  college_name: string;
  area_of_stay: string;
  gender: 'Male' | 'Female';
  current_stay: 'With Parents' | 'In Hostel';
  pg_name?: string | null;
  skills: string[];
  interested_online_workshop: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactsRegisterStats {
  total_registrations: number;
  male_contacts: number;
  female_contacts: number;
  hostel_residents: number;
  workshop_interested: number;
}

export default function ContactsRegisterAdminPage() {
  const queryClient = useQueryClient();

  // --- FILTER STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterCurrentStay, setFilterCurrentStay] = useState('');
  const [filterWorkshopInterest, setFilterWorkshopInterest] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // --- PAGINATION STATE ---
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterGender, filterCurrentStay, filterWorkshopInterest, filterDate, itemsPerPage]);

  // --- MODAL STATES ---
  const [viewRecord, setViewRecord] = useState<ContactsRegisterRecord | null>(null);
  const [editRecord, setEditRecord] = useState<ContactsRegisterRecord | null>(null);
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- EDIT FORM STATES ---
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCollegeName, setEditCollegeName] = useState('');
  const [editAreaOfStay, setEditAreaOfStay] = useState('');
  const [editGender, setEditGender] = useState<'Male' | 'Female'>('Male');
  const [editCurrentStay, setEditCurrentStay] = useState<'With Parents' | 'In Hostel'>('With Parents');
  const [editPgName, setEditPgName] = useState('');
  const [editSkillsInput, setEditSkillsInput] = useState('');
  const [editWorkshopInterest, setEditWorkshopInterest] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Populate edit form when editRecord changes
  useEffect(() => {
    if (editRecord) {
      setEditFullName(editRecord.full_name || '');
      setEditPhone(editRecord.phone || '');
      setEditCollegeName(editRecord.college_name || '');
      setEditAreaOfStay(editRecord.area_of_stay || '');
      setEditGender(editRecord.gender || 'Male');
      setEditCurrentStay(editRecord.current_stay || 'With Parents');
      setEditPgName(editRecord.pg_name || '');
      setEditSkillsInput(Array.isArray(editRecord.skills) ? editRecord.skills.join(', ') : '');
      setEditWorkshopInterest(Boolean(editRecord.interested_online_workshop));
      setEditError(null);
    }
  }, [editRecord]);

  // Clear PG name when switching to With Parents
  useEffect(() => {
    if (editCurrentStay === 'With Parents') {
      setEditPgName('');
    }
  }, [editCurrentStay]);

  // --- DATA QUERY ---
  const { data, isLoading, isError, error, refetch } = useQuery<{
    registrations: ContactsRegisterRecord[];
    total: number;
    page: number;
    limit: number;
    stats: ContactsRegisterStats;
  }>({
    queryKey: [
      'contacts-register-admin-list',
      searchQuery,
      filterGender,
      filterCurrentStay,
      filterWorkshopInterest,
      filterDate,
      currentPage,
      itemsPerPage,
    ],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token ? `Bearer ${session.access_token}` : '';

      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filterGender) params.set('gender', filterGender);
      if (filterCurrentStay) params.set('current_stay', filterCurrentStay);
      if (filterWorkshopInterest) params.set('interested_online_workshop', filterWorkshopInterest);
      if (filterDate) params.set('date', filterDate);
      params.set('page', String(currentPage));
      params.set('limit', String(itemsPerPage));

      const res = await fetch(`/api/contacts-register?${params.toString()}`, {
        headers: { Authorization: auth },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch contacts register data');
      }

      return res.json();
    },
  });

  const registrations = data?.registrations || [];
  const stats = data?.stats || {
    total_registrations: 0,
    male_contacts: 0,
    female_contacts: 0,
    hostel_residents: 0,
    workshop_interested: 0,
  };
  const totalRecords = data?.total || 0;
  const totalPages = Math.ceil(totalRecords / itemsPerPage) || 1;

  // --- CSV EXPORT ---
  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token ? `Bearer ${session.access_token}` : '';

      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filterGender) params.set('gender', filterGender);
      if (filterCurrentStay) params.set('current_stay', filterCurrentStay);
      if (filterWorkshopInterest) params.set('interested_online_workshop', filterWorkshopInterest);
      if (filterDate) params.set('date', filterDate);
      params.set('export', 'true');

      const res = await fetch(`/api/contacts-register?${params.toString()}`, {
        headers: { Authorization: auth },
      });

      if (!res.ok) throw new Error('Export failed');

      const result = await res.json();
      const exportRows: ContactsRegisterRecord[] = result.registrations || [];

      const headers = [
        'S.No.',
        'Full Name',
        'Mobile Number',
        'College / Company',
        'Area of Stay',
        'Gender',
        'Current Stay',
        'PG Name',
        'Skills',
        'Online Workshop Interest',
        'Registered At',
      ];

      const csvRows = exportRows.map((r, i) => [
        i + 1,
        `"${(r.full_name || '').replace(/"/g, '""')}"`,
        `"${r.phone}"`,
        `"${(r.college_name || '').replace(/"/g, '""')}"`,
        `"${(r.area_of_stay || '').replace(/"/g, '""')}"`,
        `"${r.gender}"`,
        `"${r.current_stay}"`,
        `"${(r.pg_name || 'N/A').replace(/"/g, '""')}"`,
        `"${(Array.isArray(r.skills) ? r.skills.join('; ') : '').replace(/"/g, '""')}"`,
        `"${r.interested_online_workshop ? 'Yes' : 'No'}"`,
        `"${formatDate(r.created_at)}"`,
      ]);

      const csvContent = [headers.join(','), ...csvRows.map((row) => row.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `contacts_register_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // --- SAVE EDIT HANDLER ---
  const handleSaveEdit = async () => {
    if (!editRecord) return;
    setEditError(null);

    if (!editFullName.trim() || editFullName.trim().length < 2) {
      setEditError('Full name must be at least 2 characters.');
      return;
    }
    if (!editPhone.trim() || editPhone.trim().length !== 10) {
      setEditError('Phone number must be exactly 10 digits.');
      return;
    }
    if (editCurrentStay === 'In Hostel' && (!editPgName.trim() || editPgName.trim().length < 2)) {
      setEditError('PG Name is required when staying in hostel.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token ? `Bearer ${session.access_token}` : '';

      const skillsArray = editSkillsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/contacts-register/${editRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          full_name: editFullName.trim(),
          phone: editPhone.trim(),
          college_name: editCollegeName.trim() || 'Other',
          area_of_stay: editAreaOfStay.trim(),
          gender: editGender,
          current_stay: editCurrentStay,
          pg_name: editCurrentStay === 'In Hostel' ? editPgName.trim() : null,
          skills: skillsArray,
          interested_online_workshop: editWorkshopInterest,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        setEditError(resData.error || 'Failed to update registration');
        return;
      }

      setEditRecord(null);
      refetch();
    } catch {
      setEditError('Network error while saving modifications.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // --- DELETE HANDLER ---
  const handleDeleteConfirm = async () => {
    if (!deleteRecordId) return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token ? `Bearer ${session.access_token}` : '';

      const res = await fetch(`/api/contacts-register/${deleteRecordId}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to delete record.');
        return;
      }

      setDeleteRecordId(null);
      refetch();
    } catch {
      alert('Network error while deleting record.');
    } finally {
      setIsDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterGender('');
    setFilterCurrentStay('');
    setFilterWorkshopInterest('');
    setFilterDate('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ─── HEADER BAR ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-inner">
              <BookUser className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-3">
                Contacts Register
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-indigo-300">
                  {stats.total_registrations} Total
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Manage and monitor Contacts Register public form submissions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={isExporting || registrations.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Download className="w-4 h-4 text-purple-400" />}
            Export CSV
          </button>
        </div>
      </div>

      {/* ─── SUMMARY STATS CARDS ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Registrations */}
        <div className="glass-card rounded-2xl p-4 border border-purple-500/20 bg-slate-950/60 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Total Contacts</span>
            <div className="w-8 h-8 rounded-lg bg-purple-950/50 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-100">{stats.total_registrations}</p>
        </div>

        {/* Card 2: Male Contacts */}
        <div className="glass-card rounded-2xl p-4 border border-blue-500/20 bg-slate-950/60 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Male Contacts</span>
            <div className="w-8 h-8 rounded-lg bg-blue-950/50 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <User className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-blue-400">{stats.male_contacts}</p>
        </div>

        {/* Card 3: Female Contacts */}
        <div className="glass-card rounded-2xl p-4 border border-pink-500/20 bg-slate-950/60 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Female Contacts</span>
            <div className="w-8 h-8 rounded-lg bg-pink-950/50 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <User className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-pink-400">{stats.female_contacts}</p>
        </div>

        {/* Card 4: Hostel Residents */}
        <div className="glass-card rounded-2xl p-4 border border-indigo-500/20 bg-slate-950/60 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">In Hostel</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-950/50 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Home className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-indigo-400">{stats.hostel_residents}</p>
        </div>

        {/* Card 5: Online Workshop Interested */}
        <div className="glass-card rounded-2xl p-4 border border-emerald-500/20 bg-slate-950/60 flex flex-col justify-between space-y-2 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Workshop Interest</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/50 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Laptop className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-400">{stats.workshop_interested}</p>
        </div>
      </div>

      {/* ─── CONTROLS & FILTER BAR ──────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800 bg-slate-950/70 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative col-span-1 sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, Phone, College, Area..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Gender Filter */}
          <div>
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          {/* Current Stay Filter */}
          <div>
            <select
              value={filterCurrentStay}
              onChange={(e) => setFilterCurrentStay(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
            >
              <option value="">All Stay Types</option>
              <option value="With Parents">With Parents</option>
              <option value="In Hostel">In Hostel</option>
            </select>
          </div>

          {/* Workshop Interest Filter */}
          <div>
            <select
              value={filterWorkshopInterest}
              onChange={(e) => setFilterWorkshopInterest(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
            >
              <option value="">Workshop Interest</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
        </div>

        {/* Date Filter & Clear */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-900">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-400" /> Date:
            </span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
            />
          </div>

          {(searchQuery || filterGender || filterCurrentStay || filterWorkshopInterest || filterDate) && (
            <button
              onClick={clearFilters}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* ─── DATA TABLE SECTION ─────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4 text-center w-12">S.No.</th>
                <th className="py-3.5 px-4">Full Name</th>
                <th className="py-3.5 px-4">Phone Number</th>
                <th className="py-3.5 px-4">College / Company</th>
                <th className="py-3.5 px-4">Area of Stay</th>
                <th className="py-3.5 px-4">Gender</th>
                <th className="py-3.5 px-4">Current Stay</th>
                <th className="py-3.5 px-4">PG Name</th>
                <th className="py-3.5 px-4">Skills</th>
                <th className="py-3.5 px-4 text-center">Workshop</th>
                <th className="py-3.5 px-4">Registered At</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm text-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading contacts register records...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-red-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                    {error instanceof Error ? error.message : 'Error loading records'}
                  </td>
                </tr>
              ) : registrations.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    No contacts register submissions found matching the criteria.
                  </td>
                </tr>
              ) : (
                registrations.map((r, idx) => {
                  const serialNo = (currentPage - 1) * itemsPerPage + idx + 1;
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-900/50 transition-colors group"
                    >
                      <td className="py-3.5 px-4 text-center text-slate-500 font-bold text-xs">
                        {serialNo}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-100">
                        {r.full_name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-indigo-300">
                        {r.phone}
                      </td>
                      <td className="py-3.5 px-4 max-w-[180px] truncate text-slate-300" title={r.college_name}>
                        {r.college_name}
                      </td>
                      <td className="py-3.5 px-4 max-w-[150px] truncate text-slate-300" title={r.area_of_stay}>
                        {r.area_of_stay}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                          r.gender === 'Male'
                            ? 'bg-blue-950/60 border-blue-500/30 text-blue-400'
                            : 'bg-pink-950/60 border-pink-500/30 text-pink-400'
                        }`}>
                          {r.gender}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          r.current_stay === 'In Hostel'
                            ? 'bg-indigo-950/60 border-indigo-500/30 text-indigo-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}>
                          {r.current_stay}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-[120px] truncate text-slate-400">
                        {r.current_stay === 'In Hostel' ? r.pg_name || '—' : '—'}
                      </td>
                      <td className="py-3.5 px-4 max-w-[160px]">
                        {Array.isArray(r.skills) && r.skills.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.skills.slice(0, 2).map((s, i) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-purple-950/40 border border-purple-500/20 text-purple-300 text-[10px] font-semibold">
                                {s}
                              </span>
                            ))}
                            {r.skills.length > 2 && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 text-[10px] font-bold">
                                +{r.skills.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          r.interested_online_workshop
                            ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                            : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}>
                          {r.interested_online_workshop ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewRecord(r)}
                            title="View Detail"
                            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-purple-500/40 text-slate-400 hover:text-purple-300 transition-all cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditRecord(r)}
                            title="Edit Record"
                            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500/40 text-slate-400 hover:text-indigo-300 transition-all cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteRecordId(r.id)}
                            title="Delete Record"
                            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── PAGINATION CONTROLS ────────────────────────────────────────── */}
        <div className="px-4 py-3.5 border-t border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              Showing {registrations.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to{' '}
              {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords} records
            </span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-300 focus:outline-none text-xs cursor-pointer"
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-200">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── VIEW DETAIL MODAL ──────────────────────────────────────────── */}
      <AnimatePresence>
        {viewRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl p-6 sm:p-8 w-full max-w-lg relative border border-purple-500/20 bg-slate-950 space-y-6 shadow-2xl"
            >
              <button
                onClick={() => setViewRecord(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-300">
                  <BookUser className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-100">{viewRecord.full_name}</h2>
                  <p className="text-xs text-indigo-400 font-mono">{viewRecord.phone}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm">
                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">College / Company</span>
                  <span className="text-slate-200 font-bold">{viewRecord.college_name}</span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Area of Stay</span>
                  <span className="text-slate-200 font-bold">{viewRecord.area_of_stay}</span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Gender</span>
                  <span className="text-slate-200 font-bold">{viewRecord.gender}</span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Current Stay</span>
                  <span className="text-slate-200 font-bold">{viewRecord.current_stay}</span>
                </div>

                {viewRecord.current_stay === 'In Hostel' && (
                  <div className="col-span-2">
                    <span className="text-slate-500 font-semibold block text-[10px] uppercase">PG Name</span>
                    <span className="text-indigo-300 font-bold">{viewRecord.pg_name || 'N/A'}</span>
                  </div>
                )}

                <div className="col-span-2">
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase mb-1">Skills</span>
                  {Array.isArray(viewRecord.skills) && viewRecord.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {viewRecord.skills.map((s, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-md bg-purple-950/50 border border-purple-500/30 text-purple-300 text-xs font-semibold">
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500">None specified</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Online Workshop</span>
                  <span className={`font-bold ${viewRecord.interested_online_workshop ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {viewRecord.interested_online_workshop ? 'Yes (Interested)' : 'No'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Registered At</span>
                  <span className="text-slate-300 font-medium">{formatDate(viewRecord.created_at)}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setViewRecord(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── EDIT RECORD MODAL ──────────────────────────────────────────── */}
      <AnimatePresence>
        {editRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl p-6 sm:p-8 w-full max-w-lg relative border border-indigo-500/30 bg-slate-950 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setEditRecord(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
                <Edit2 className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-extrabold text-slate-100">Edit Contacts Register Submission</h2>
              </div>

              {editError && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  {editError}
                </div>
              )}

              <div className="space-y-3.5 text-xs sm:text-sm">
                <div>
                  <label className="text-slate-400 font-semibold block mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-semibold block mb-1">Mobile Number * (10 Digits)</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-indigo-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-semibold block mb-1">College / Company *</label>
                    <input
                      type="text"
                      value={editCollegeName}
                      onChange={(e) => setEditCollegeName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 font-semibold block mb-1">Area of Stay *</label>
                    <input
                      type="text"
                      value={editAreaOfStay}
                      onChange={(e) => setEditAreaOfStay(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-semibold block mb-1">Gender *</label>
                    <select
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value as 'Male' | 'Female')}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 font-semibold block mb-1">Current Stay *</label>
                    <select
                      value={editCurrentStay}
                      onChange={(e) => setEditCurrentStay(e.target.value as 'With Parents' | 'In Hostel')}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                    >
                      <option value="With Parents">With Parents</option>
                      <option value="In Hostel">In Hostel</option>
                    </select>
                  </div>
                </div>

                {editCurrentStay === 'In Hostel' && (
                  <div>
                    <label className="text-slate-400 font-semibold block mb-1">PG Name *</label>
                    <input
                      type="text"
                      value={editPgName}
                      onChange={(e) => setEditPgName(e.target.value)}
                      placeholder="Enter PG Name"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                )}

                <div>
                  <label className="text-slate-400 font-semibold block mb-1">Skills (Comma-separated)</label>
                  <input
                    type="text"
                    value={editSkillsInput}
                    onChange={(e) => setEditSkillsInput(e.target.value)}
                    placeholder="e.g. Communication, Event Management, Singing"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="editWorkshopCheckbox"
                    checked={editWorkshopInterest}
                    onChange={(e) => setEditWorkshopInterest(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="editWorkshopCheckbox" className="text-xs font-semibold text-slate-200 cursor-pointer">
                    Interested in Online Workshop
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditRecord(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isSavingEdit ? 'Saving...' : 'Save Modifications'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── DELETE CONFIRMATION MODAL ──────────────────────────────────── */}
      <AnimatePresence>
        {deleteRecordId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl p-6 w-full max-w-md relative border border-red-500/30 bg-slate-950 space-y-4 shadow-2xl"
            >
              <button
                onClick={() => setDeleteRecordId(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 text-red-500">
                <Trash2 className="w-6 h-6 shrink-0" />
                <h2 className="text-base font-extrabold text-slate-100">Delete Source Registration Record</h2>
              </div>

              <div className="p-3.5 bg-red-950/30 border border-red-500/20 rounded-xl text-xs text-red-300 space-y-1.5">
                <p className="font-bold">Are you sure you want to delete this Contacts Register submission?</p>
                <p className="text-[11px] text-slate-400">
                  This action will permanently delete the single submission record from <code className="text-red-300 font-mono">contacts_register</code>.
                  Master contacts and assignment history will remain 100% untouched.
                </p>
              </div>

              <div className="flex gap-2 pt-2 justify-end">
                <button
                  onClick={() => setDeleteRecordId(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {isDeleting ? 'Deleting...' : 'Delete Record'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
