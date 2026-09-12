'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Users, Calendar, TrendingUp, CheckCircle, Search, Filter,
  Download, Printer, RefreshCw, X, Eye, Loader2, PhoneCall,
  ChevronLeft, ChevronRight, Check, Edit2, Trash2, AlertTriangle, Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface EventAttendance {
  id?: string;
  source: string;
  event_display_name: string;
  event_record_id: string;
  event_date: string;
  operator_name: string | null;
  status: string | null;
}

interface MasterContact {
  id: string;
  phone: string;
  name: string;
  age: number | null;
  gender: string;
  area_of_stay: string;
  company_college: string;
  occupation: string;
  standard: string | null;
  operator_name?: string | null;
  assignment_status?: string | null;
  operator_id?: string | null;
  created_at: string;
  events: EventAttendance[];
}

interface EventBreakdownItem {
  source: string;
  event_display_name: string;
  count: number;
}

interface MasterStats {
  total_contacts: number;
  total_events: number;
  this_month: number;
  assigned_contacts: number;
  event_breakdown?: EventBreakdownItem[];
}

interface EventSourceOption {
  source_key: string;
  display_name: string;
}

interface FilterOptions {
  areas: string[];
  colleges: string[];
  occupations: string[];
  standards: string[];
  event_sources: EventSourceOption[];
}

interface OperatorItem {
  id: string;
  name: string;
  is_active: boolean;
  operator_type?: string;
  total_assigned?: number;
}

export default function MasterDashboardPage() {
  const [contacts, setContacts] = useState<MasterContact[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [stats, setStats] = useState<MasterStats>({
    total_contacts: 0,
    total_events: 0,
    this_month: 0,
    assigned_contacts: 0,
    event_breakdown: [],
  });

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    areas: [],
    colleges: [],
    occupations: ['Student', 'Employee', 'Working', 'Business'],
    standards: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
    event_sources: [],
  });

  // --- SEARCH & FILTER STATES ---
  const [search, setSearch] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterOccupation, setFilterOccupation] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStandard, setFilterStandard] = useState('');
  const [filterEventSource, setFilterEventSource] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // --- PAGINATION STATE ---
  const [page, setPage] = useState(1);
  const limit = 25;

  // --- MODALS ---
  const [viewContact, setViewContact] = useState<MasterContact | null>(null);
  const [editContact, setEditContact] = useState<MasterContact | null>(null);
  const [deleteContact, setDeleteContact] = useState<MasterContact | null>(null);
  const [assignModalContact, setAssignModalContact] = useState<MasterContact | null>(null);
  const [showEventBreakdownModal, setShowEventBreakdownModal] = useState<boolean>(false);

  // Edit Modal Form State
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAge, setEditAge] = useState<string>('');
  const [editGender, setEditGender] = useState('Male');
  const [editArea, setEditArea] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editStandard, setEditStandard] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete State
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Assign Operator Modal State
  const [operators, setOperators] = useState<OperatorItem[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : '';
  };

  // 1. Fetch Paginated Master Contacts for UI Table
  const loadData = useCallback(async (overrides?: {
    s?: string;
    g?: string;
    occ?: string;
    ar?: string;
    col?: string;
    st?: string;
    evt?: string;
    dt?: string;
    pageNum?: number;
  }) => {
    setLoading(true);
    try {
      const auth = await getAuthHeader();
      const params = new URLSearchParams();

      const searchVal = overrides?.s !== undefined ? overrides.s : search;
      const genderVal = overrides?.g !== undefined ? overrides.g : filterGender;
      const occVal = overrides?.occ !== undefined ? overrides.occ : filterOccupation;
      const areaVal = overrides?.ar !== undefined ? overrides.ar : filterArea;
      const colVal = overrides?.col !== undefined ? overrides.col : filterCompany;
      const stdVal = overrides?.st !== undefined ? overrides.st : filterStandard;
      const evtVal = overrides?.evt !== undefined ? overrides.evt : filterEventSource;
      const dtVal = overrides?.dt !== undefined ? overrides.dt : filterDate;
      const pNum = overrides?.pageNum !== undefined ? overrides.pageNum : page;

      if (searchVal) params.set('search', searchVal);
      if (genderVal) params.set('gender', genderVal);
      if (occVal) params.set('occupation', occVal);
      if (areaVal) params.set('area', areaVal);
      if (colVal) params.set('company', colVal);
      if (stdVal) params.set('standard', stdVal);
      if (evtVal) params.set('event_source', evtVal);
      if (dtVal) params.set('date', dtVal);

      params.set('page', String(pNum));
      params.set('limit', String(limit));

      const res = await fetch(`/api/master?${params.toString()}`, {
        headers: { Authorization: auth },
      });

      if (res.ok) {
        const d = await res.json();
        setContacts(d.contacts ?? []);
        setTotal(d.total ?? 0);
        if (d.stats) setStats(d.stats);
        if (d.filter_options) {
          setFilterOptions({
            ...d.filter_options,
            occupations: ['Student', 'Employee', 'Working', 'Business'],
            standards: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
          });
        }
      }
    } catch (err) {
      console.error('[MasterDashboard] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filterGender, filterOccupation, filterArea, filterCompany, filterStandard, filterEventSource, filterDate, page, limit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load Operators for Assign Modal
  const loadOperators = useCallback(async () => {
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/operators?source=master_dashboard', { headers: { Authorization: auth } });
      if (res.ok) {
        const d = await res.json();
        setOperators((d.operators ?? []).filter((o: OperatorItem) => o.is_active));
      }
    } catch (err) {
      console.error('[MasterDashboard] Load operators error:', err);
    }
  }, []);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  // Realtime Subscription
  useEffect(() => {
    const channel = supabase
      .channel('master_contacts_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'master_contacts' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'master_contact_events' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'master_contact_assignments' }, () => {
        loadData();
        loadOperators();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, loadOperators]);

  // Search handler
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadData({ s: val, pageNum: 1 });
    }, 350);
  };

  // Reset all filters
  const handleResetFilters = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setSearch('');
    setFilterGender('');
    setFilterOccupation('');
    setFilterArea('');
    setFilterCompany('');
    setFilterStandard('');
    setFilterEventSource('');
    setFilterDate('');
    setPage(1);
    loadData({
      s: '', g: '', occ: '', ar: '', col: '', st: '', evt: '', dt: '', pageNum: 1,
    });
  };

  // --- FULL-RECORD FETCHING FOR PRINT & CSV (BYPASSES PAGINATION) ---
  const fetchAllMatchingContacts = async (): Promise<MasterContact[]> => {
    const auth = await getAuthHeader();
    const params = new URLSearchParams();

    if (search) params.set('search', search);
    if (filterGender) params.set('gender', filterGender);
    if (filterOccupation) params.set('occupation', filterOccupation);
    if (filterArea) params.set('area', filterArea);
    if (filterCompany) params.set('company', filterCompany);
    if (filterStandard) params.set('standard', filterStandard);
    if (filterEventSource) params.set('event_source', filterEventSource);
    if (filterDate) params.set('date', filterDate);

    params.set('export', 'true');
    params.set('limit', 'all');

    const res = await fetch(`/api/master?${params.toString()}`, {
      headers: { Authorization: auth },
    });

    if (res.ok) {
      const d = await res.json();
      return d.contacts ?? [];
    }
    return [];
  };

  // --- FULL-RECORD EXPORT CSV ---
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const allContacts = await fetchAllMatchingContacts();
      if (allContacts.length === 0) return;

      const headers = ['Name', 'Phone', 'Age', 'Gender', 'Area / Stay', 'Company / College', 'Occupation', 'Standard', 'Event Attended', 'Assigned Operator'];
      const rows = allContacts.map(c => {
        const eventsStr = c.events.map(e => e.event_display_name).join(' | ');
        return [
          `"${c.name.replace(/"/g, '""')}"`,
          `"${c.phone}"`,
          `"${c.age ?? '—'}"`,
          `"${c.gender}"`,
          `"${c.area_of_stay.replace(/"/g, '""')}"`,
          `"${c.company_college.replace(/"/g, '""')}"`,
          `"${c.occupation.replace(/"/g, '""')}"`,
          `"${(c.standard || '—').replace(/"/g, '""')}"`,
          `"${eventsStr.replace(/"/g, '""')}"`,
          `"${(c.operator_name || 'Unassigned').replace(/"/g, '""')}"`,
        ];
      });

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `master_contacts_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export CSV error:', err);
    } finally {
      setExporting(false);
    }
  };

  // --- FULL-RECORD PRINT PDF (USING RATHAYATRA PRINT REPORT ARCHITECTURE) ---
  const handlePrintPDF = async () => {
    setExporting(true);
    try {
      const allContacts = await fetchAllMatchingContacts();
      if (allContacts.length === 0) return;

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      // Event Display Name for Header Meta
      const matchedEvt = filterOptions.event_sources.find(e => e.source_key === filterEventSource);
      const eventMetaLabel = matchedEvt ? matchedEvt.display_name : filterEventSource ? filterEventSource : 'All Registered Events';

      // Applied Filter Text Meta
      const filterSummary: string[] = [];
      if (search) filterSummary.push(`Search: "${search}"`);
      if (filterGender) filterSummary.push(`Gender: ${filterGender}`);
      if (filterOccupation) filterSummary.push(`Occupation: ${filterOccupation}`);
      if (filterArea) filterSummary.push(`Area: ${filterArea}`);
      if (filterCompany) filterSummary.push(`Company: ${filterCompany}`);
      if (filterStandard) filterSummary.push(`Standard: ${filterStandard}`);
      if (filterDate) filterSummary.push(`Date: ${filterDate}`);

      const appliedFiltersText = filterSummary.length > 0 ? filterSummary.join(' | ') : 'None (Full Dataset)';

      const tableRows = allContacts.map((c, idx) => {
        const eventsStr = c.events.map(e => e.event_display_name).join(', ') || '—';
        return `
          <tr>
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="font-weight: 700; color: #0f172a;">${c.name}</td>
            <td style="font-family: monospace;">${c.phone}</td>
            <td>${c.age ? `${c.age} yrs` : '—'} / ${c.gender}</td>
            <td>${c.area_of_stay || '—'}</td>
            <td>${c.company_college || '—'}</td>
            <td style="font-weight: 600;">${c.occupation || '—'}</td>
            <td>${c.standard || '—'}</td>
            <td style="font-weight: 600; color: #78350f;">${eventsStr}</td>
            <td>${c.operator_name ? `<span style="color: #047857; font-weight: 600;">${c.operator_name}</span>` : 'Unassigned'}</td>
          </tr>
        `;
      }).join('');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Master Dashboard Report — ${allContacts.length} Contacts</title>
            <style>
              @media print {
                @page {
                  size: A4 landscape;
                  margin: 10mm;
                }
                body {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                thead {
                  display: table-header-group;
                }
                tr {
                  page-break-inside: avoid;
                }
              }

              body {
                font-family: system-ui, -apple-system, sans-serif;
                color: #0f172a;
                background: #ffffff;
                margin: 0;
                padding: 16px;
              }

              .header-container {
                border-bottom: 2.5px solid #d97706;
                padding-bottom: 12px;
                margin-bottom: 16px;
              }

              .header-title {
                font-size: 20px;
                font-weight: 900;
                color: #78350f;
                margin: 0 0 4px 0;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }

              .header-subtitle {
                font-size: 12px;
                color: #475569;
                margin: 0 0 10px 0;
                font-weight: 600;
              }

              .meta-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 10px;
                background-color: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 11px;
              }

              .meta-item {
                display: flex;
                flex-direction: column;
              }

              .meta-label {
                font-size: 9px;
                font-weight: 800;
                color: #92400e;
                text-transform: uppercase;
              }

              .meta-val {
                font-weight: 700;
                color: #0f172a;
                margin-top: 2px;
              }

              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 12px;
                font-size: 10.5px;
              }

              th {
                background-color: #fef3c7 !important;
                color: #78350f !important;
                font-weight: 800;
                border: 1px solid #d97706;
                padding: 7px 8px;
                text-align: left;
                text-transform: uppercase;
                font-size: 9.5px;
              }

              td {
                border: 1px solid #cbd5e1;
                padding: 6.5px 8px;
                text-align: left;
                vertical-align: middle;
              }

              tr:nth-child(even) {
                background-color: #fffbeb;
              }

              .footer {
                margin-top: 16px;
                font-size: 10px;
                color: #64748b;
                text-align: right;
                border-top: 1px solid #e2e8f0;
                padding-top: 8px;
              }
            </style>
          </head>
          <body>
            <div class="header-container">
              <h1 class="header-title">Master Dashboard — Global Contact Directory</h1>
              <p class="header-subtitle">Official Database Report — ${allContacts.length} Matching Records</p>
              
              <div class="meta-grid">
                <div class="meta-item">
                  <span class="meta-label">Generated Date</span>
                  <span class="meta-val">${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Event Scope</span>
                  <span class="meta-val">${eventMetaLabel}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Applied Filters</span>
                  <span class="meta-val">${appliedFiltersText}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Matching Contacts</span>
                  <span class="meta-val">${allContacts.length.toLocaleString()} Records</span>
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 35px; text-align: center;">S.No</th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Age / Gender</th>
                  <th>Area / PG</th>
                  <th>Company / College</th>
                  <th>Occupation</th>
                  <th>Standard</th>
                  <th>Event Attended</th>
                  <th>Assign Operator</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div class="footer">
              Generated by HKM Admin Portal — Master Directory Control System
            </div>

            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error('Print PDF error:', err);
    } finally {
      setExporting(false);
    }
  };

  // Edit Modal Pre-fill
  const handleOpenEdit = (c: MasterContact) => {
    setEditContact(c);
    setEditName(c.name || '');
    setEditPhone(c.phone || '');
    setEditAge(c.age !== null ? String(c.age) : '');
    setEditGender(c.gender || 'Male');
    setEditArea(c.area_of_stay || '');
    setEditCompany(c.company_college || '');
    setEditOccupation(c.occupation || '');
    setEditStandard(c.standard || '');
    setEditError(null);
  };

  // Save Edit Handler
  const handleSaveEdit = async () => {
    if (!editContact) return;
    if (!editName.trim() || !editPhone.trim()) {
      setEditError('Name and Phone are required.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);

    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/master/${editContact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          name: editName,
          phone: editPhone,
          age: editAge ? parseInt(editAge, 10) : null,
          gender: editGender,
          area_of_stay: editArea,
          company_college: editCompany,
          occupation: editOccupation,
          standard: editStandard,
        }),
      });

      const d = await res.json();
      if (!res.ok) {
        setEditError(d.error || 'Failed to update contact');
      } else {
        setEditContact(null);
        loadData();
      }
    } catch {
      setEditError('Network error while updating contact');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Handler
  const handleDelete = async () => {
    if (!deleteContact) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/master/${deleteContact.id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });

      const d = await res.json();
      if (!res.ok) {
        setDeleteError(d.error || 'Failed to delete contact');
      } else {
        setDeleteContact(null);
        loadData();
      }
    } catch {
      setDeleteError('Network error while deleting contact');
    } finally {
      setDeleting(false);
    }
  };

  // Execute Operator Assignment / Reassignment
  const handleAssignOperator = async () => {
    if (!assignModalContact || !selectedOperatorId) return;
    setAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          source: 'master_dashboard',
          master_contact_id: assignModalContact.id,
          operator_id: selectedOperatorId,
        }),
      });

      const d = await res.json();
      if (!res.ok) {
        setAssignError(d.error || d.message || 'Assignment failed');
      } else {
        setAssignSuccess('Operator assigned successfully!');
        setTimeout(() => {
          setAssignModalContact(null);
          setSelectedOperatorId('');
          setAssignSuccess(null);
          loadData();
          loadOperators();
        }, 800);
      }
    } catch {
      setAssignError('Network error while assigning operator');
    } finally {
      setAssigning(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const isAnyFilterActive = Boolean(search || filterGender || filterOccupation || filterArea || filterCompany || filterStandard || filterEventSource || filterDate);

  return (
    <div className="space-y-6">
      {/* --- Top Header & Action Row --- */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-3 rounded-2xl border-2 border-amber-300 shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0f172a] flex items-center gap-3">
            <Crown className="w-8 h-8 text-amber-500 shrink-0" />
            Master Dashboard
          </h1>
          <p className="text-slate-600 text-sm mt-1 font-semibold">Global contact directory across all events</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap no-print">
          <button
            onClick={() => loadData()}
            className="p-2.5 rounded-xl bg-white border-2 border-amber-300 hover:border-amber-500 text-amber-900 hover:bg-amber-50 transition-all cursor-pointer shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin text-amber-600' : 'text-amber-700'}`} />
          </button>
          <button
            onClick={handleExportCSV}
            disabled={contacts.length === 0 || exporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4.5 h-4.5 animate-spin text-white" /> : <Download className="w-4.5 h-4.5 text-white" />}
            Export CSV
          </button>
          <button
            onClick={handlePrintPDF}
            disabled={contacts.length === 0 || exporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-amber-300 hover:border-amber-500 text-amber-900 hover:bg-amber-50 font-bold text-sm transition-all cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {exporting ? <Loader2 className="w-4.5 h-4.5 animate-spin text-amber-700" /> : <Printer className="w-4.5 h-4.5 text-amber-700" />}
            Print PDF
          </button>
        </div>
      </div>

      {/* --- Metric Stat Cards Grid --- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-5 text-center shadow-md hover:border-amber-400 transition-all">
          <Users className="w-6 h-6 mx-auto mb-2 text-amber-500" />
          <p className="text-3xl font-black text-[#0f172a]">{stats.total_contacts.toLocaleString()}</p>
          <p className="text-xs text-amber-900 font-extrabold uppercase tracking-wider mt-1">Total Contacts</p>
        </div>

        <div
          onClick={() => setShowEventBreakdownModal(true)}
          className="bg-white border-2 border-amber-200 rounded-2xl p-5 text-center shadow-md hover:border-amber-500 hover:scale-[1.02] transition-all cursor-pointer group"
          title="Click to view event contact breakdown"
        >
          <Calendar className="w-6 h-6 mx-auto mb-2 text-orange-500 group-hover:scale-110 transition-transform" />
          <p className="text-3xl font-black text-[#0f172a]">{stats.total_events}</p>
          <p className="text-xs text-amber-900 font-extrabold uppercase tracking-wider mt-1 group-hover:text-amber-600 group-hover:underline">Total Events</p>
        </div>

        <div className="bg-white border-2 border-amber-200 rounded-2xl p-5 text-center shadow-md">
          <TrendingUp className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
          <p className="text-3xl font-black text-[#0f172a]">{stats.this_month.toLocaleString()}</p>
          <p className="text-xs text-amber-900 font-extrabold uppercase tracking-wider mt-1">This Month</p>
        </div>

        <div className="bg-white border-2 border-amber-200 rounded-2xl p-5 text-center shadow-md">
          <CheckCircle className="w-6 h-6 mx-auto mb-2 text-emerald-600" />
          <p className="text-3xl font-black text-[#0f172a]">{stats.assigned_contacts.toLocaleString()}</p>
          <p className="text-xs text-amber-900 font-extrabold uppercase tracking-wider mt-1">Assigned Contacts</p>
        </div>
      </div>

      {/* --- Search & Filters Panel --- */}
      <div className="bg-white border-2 border-amber-300 rounded-2xl p-5 sm:p-6 space-y-4 shadow-md no-print">
        <div className="flex items-center justify-between pb-2 border-b-2 border-amber-100">
          <h3 className="font-extrabold text-sm text-amber-900 flex items-center gap-2">
            <Filter className="w-4.5 h-4.5 text-amber-500" /> Search & Filters
          </h3>
          {isAnyFilterActive && (
            <button
              onClick={handleResetFilters}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all cursor-pointer shadow-sm"
            >
              <X className="w-3.5 h-3.5 inline mr-1" /> Reset Filters
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="w-4.5 h-4.5 absolute left-3.5 top-3 text-amber-600 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Global Search (Name, Phone, Area, Company)"
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white border-2 border-amber-300 focus:border-amber-500 text-[#0f172a] placeholder:text-[#475569] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {/* 1. Gender Filter */}
          <select
            value={filterGender}
            onChange={(e) => { const v = e.target.value; setFilterGender(v); setPage(1); loadData({ g: v, pageNum: 1 }); }}
            className="px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-[#0f172a] text-xs font-bold focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white text-[#0f172a] font-semibold">Gender (All)</option>
            <option value="Male" className="bg-white text-[#0f172a] font-semibold">Male</option>
            <option value="Female" className="bg-white text-[#0f172a] font-semibold">Female</option>
          </select>

          {/* 2. Occupation Filter */}
          <select
            value={filterOccupation}
            onChange={(e) => { const v = e.target.value; setFilterOccupation(v); setPage(1); loadData({ occ: v, pageNum: 1 }); }}
            className="px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-[#0f172a] text-xs font-extrabold focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white text-[#0f172a] font-semibold">Occupation (All)</option>
            <option value="Student" className="bg-white text-[#0f172a] font-semibold">Student</option>
            <option value="Employee" className="bg-white text-[#0f172a] font-semibold">Employee</option>
            <option value="Working" className="bg-white text-[#0f172a] font-semibold">Working</option>
            <option value="Business" className="bg-white text-[#0f172a] font-semibold">Business</option>
          </select>

          {/* 3. Area of Stay Filter */}
          <select
            value={filterArea}
            onChange={(e) => { const v = e.target.value; setFilterArea(v); setPage(1); loadData({ ar: v, pageNum: 1 }); }}
            className="px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-[#0f172a] text-xs font-bold focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white text-[#0f172a] font-semibold">Area of Stay (All)</option>
            {filterOptions.areas.map((ar) => (
              <option key={ar} value={ar} className="bg-white text-[#0f172a] font-semibold">{ar}</option>
            ))}
          </select>

          {/* 4. Company / College Filter */}
          <select
            value={filterCompany}
            onChange={(e) => { const v = e.target.value; setFilterCompany(v); setPage(1); loadData({ col: v, pageNum: 1 }); }}
            className="px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-[#0f172a] text-xs font-bold focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white text-[#0f172a] font-semibold">Company / College (All)</option>
            {filterOptions.colleges.map((col) => (
              <option key={col} value={col} className="bg-white text-[#0f172a] font-semibold">{col}</option>
            ))}
          </select>

          {/* 5. Standard Filter */}
          <select
            value={filterStandard}
            onChange={(e) => { const v = e.target.value; setFilterStandard(v); setPage(1); loadData({ st: v, pageNum: 1 }); }}
            className="px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-[#0f172a] text-xs font-bold focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white text-[#0f172a] font-semibold">Standard (All)</option>
            {filterOptions.standards.map((st) => (
              <option key={st} value={st} className="bg-white text-[#0f172a] font-semibold">{st}</option>
            ))}
          </select>

          {/* 6. Event Attended Filter */}
          <select
            value={filterEventSource}
            onChange={(e) => { const v = e.target.value; setFilterEventSource(v); setPage(1); loadData({ evt: v, pageNum: 1 }); }}
            className="px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-[#0f172a] text-xs font-bold focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white text-[#0f172a] font-semibold">Event Attended (All)</option>
            {filterOptions.event_sources.map((evt) => (
              <option key={evt.source_key} value={evt.source_key} className="bg-white text-[#0f172a] font-semibold">{evt.display_name}</option>
            ))}
          </select>

          {/* 7. Date Filter */}
          <input
            type="date"
            value={filterDate}
            onChange={(e) => { const v = e.target.value; setFilterDate(v); setPage(1); loadData({ dt: v, pageNum: 1 }); }}
            className="px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-[#0f172a] text-xs font-bold focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm [color-scheme:light]"
          />

          {/* 8. Reset Button */}
          <button
            onClick={handleResetFilters}
            className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold transition-all cursor-pointer shadow-sm"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* --- Contacts Table --- */}
      <div className="bg-white rounded-2xl overflow-hidden border-2 border-amber-300 shadow-lg">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-extrabold uppercase tracking-wider shadow-sm">
              <tr>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Contact</th>
                <th className="px-5 py-4">Age / Gender</th>
                <th className="px-5 py-4">Area / PG</th>
                <th className="px-5 py-4">Company / College</th>
                <th className="px-5 py-4">Occupation</th>
                <th className="px-5 py-4">Standard</th>
                <th className="px-5 py-4">Event Attended</th>
                <th className="px-5 py-4">Assign</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100 text-sm text-[#0f172a] bg-white">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-amber-900 font-bold">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                    Loading master contact directory...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-slate-500 font-semibold">
                    No master contacts match the selected criteria.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => {
                  return (
                    <tr key={c.id} className="hover:bg-amber-50/70 transition-colors bg-white">
                      {/* 1. NAME */}
                      <td className="px-5 py-4">
                        <div className="font-extrabold text-[#0f172a] leading-snug">
                          {c.name}
                        </div>
                      </td>

                      {/* 2. CONTACT */}
                      <td className="px-5 py-4 font-mono text-xs font-bold text-[#1e293b]">
                        {c.phone}
                      </td>

                      {/* 3. AGE / GENDER */}
                      <td className="px-5 py-4">
                        <span className="font-bold text-[#1e293b]">{c.age ? `${c.age} yrs` : '—'}</span>
                        <span className={`inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-black ${
                          c.gender === 'Male'
                            ? 'bg-amber-100 text-amber-950 border border-amber-300'
                            : 'bg-orange-100 text-orange-950 border border-orange-300'
                        }`}>
                          {c.gender}
                        </span>
                      </td>

                      {/* 4. AREA / PG */}
                      <td className="px-5 py-4 text-[#1e293b] font-semibold">{c.area_of_stay || '—'}</td>

                      {/* 5. COMPANY / COLLEGE */}
                      <td className="px-5 py-4 text-[#1e293b] font-semibold">{c.company_college || '—'}</td>

                      {/* 6. OCCUPATION */}
                      <td className="px-5 py-4 text-[#1e293b] font-bold">{c.occupation || '—'}</td>

                      {/* 7. STANDARD */}
                      <td className="px-5 py-4 text-[#1e293b] font-semibold">{c.standard || '—'}</td>

                      {/* 8. EVENT ATTENDED */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {c.events.map((evt) => (
                            <span
                              key={evt.id || evt.event_record_id}
                              className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-950 border border-amber-300 whitespace-nowrap shadow-sm"
                            >
                              {evt.event_display_name}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* 9. ASSIGN */}
                      <td className="px-5 py-4">
                        {c.operator_name ? (
                          <div className="flex items-center gap-1">
                            <span className="text-emerald-700 font-extrabold flex items-center gap-1 text-xs">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              {c.operator_name}
                            </span>
                            <button
                              onClick={() => setAssignModalContact(c)}
                              className="ml-1 text-[10px] text-amber-700 hover:text-amber-800 underline font-bold cursor-pointer"
                              title="Reassign operator"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAssignModalContact(c)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-sm"
                          >
                            + Assign
                          </button>
                        )}
                      </td>

                      {/* 10. ACTIONS */}
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewContact(c)}
                            className="p-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200 cursor-pointer transition-all shadow-sm"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(c)}
                            className="p-1.5 rounded-lg bg-orange-100 border border-orange-300 text-orange-900 hover:bg-orange-200 cursor-pointer transition-all shadow-sm"
                            title="Edit Master Contact"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteContact(c)}
                            className="p-1.5 rounded-lg bg-red-100 border border-red-300 text-red-900 hover:bg-red-200 cursor-pointer transition-all shadow-sm"
                            title="Remove Master Contact"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* --- Pagination Controls --- */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 bg-amber-50/80 border-t-2 border-amber-200 no-print">
            <span className="text-xs text-amber-950 font-bold">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} contacts
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-extrabold text-amber-950 text-xs px-3 py-1 bg-white border border-amber-300 rounded-md shadow-sm">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Event Contact Breakdown Modal --- */}
      <AnimatePresence>
        {showEventBreakdownModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setShowEventBreakdownModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-md relative space-y-4 border-2 border-amber-300 shadow-2xl"
            >
              <button
                onClick={() => setShowEventBreakdownModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 border-b-2 border-amber-100 pb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">Event Contact Breakdown</h3>
                  <p className="text-xs text-amber-900 font-bold">Unique master contacts per event</p>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {(stats.event_breakdown && stats.event_breakdown.length > 0) ? (
                  stats.event_breakdown.map((eb) => (
                    <div
                      key={eb.source || eb.event_display_name}
                      className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 flex items-center justify-between"
                    >
                      <span className="font-extrabold text-sm text-[#0f172a]">{eb.event_display_name}</span>
                      <span className="font-black text-xs px-3 py-1 rounded-lg bg-amber-500 text-white shadow-sm">
                        {eb.count.toLocaleString()} contacts
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 text-center py-4">No event breakdown available.</p>
                )}
              </div>

              <div className="pt-2 border-t border-amber-100">
                <button
                  onClick={() => setShowEventBreakdownModal(false)}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- View Details Modal --- */}
      <AnimatePresence>
        {viewContact && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setViewContact(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-lg relative max-h-[90vh] flex flex-col space-y-4 border-2 border-amber-300 shadow-2xl"
            >
              <button
                onClick={() => setViewContact(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 border-b-2 border-amber-100 pb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">{viewContact.name}</h3>
                  <p className="text-xs text-amber-900 font-mono font-bold">{viewContact.phone}</p>
                </div>
              </div>

              <div className="overflow-y-auto space-y-4 pr-1 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                    <p className="text-[10px] text-amber-900 font-extrabold uppercase">Gender / Age</p>
                    <p className="font-extrabold text-[#0f172a] mt-0.5">{viewContact.gender} ({viewContact.age ? `${viewContact.age} yrs` : '—'})</p>
                  </div>
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                    <p className="text-[10px] text-amber-900 font-extrabold uppercase">Occupation</p>
                    <p className="font-extrabold text-[#0f172a] mt-0.5">{viewContact.occupation || '—'}</p>
                  </div>
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                    <p className="text-[10px] text-amber-900 font-extrabold uppercase">Area of Stay</p>
                    <p className="font-extrabold text-[#0f172a] mt-0.5">{viewContact.area_of_stay || '—'}</p>
                  </div>
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                    <p className="text-[10px] text-amber-900 font-extrabold uppercase">Company / College</p>
                    <p className="font-extrabold text-[#0f172a] mt-0.5">{viewContact.company_college || '—'}</p>
                  </div>
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                    <p className="text-[10px] text-amber-900 font-extrabold uppercase">Standard</p>
                    <p className="font-extrabold text-[#0f172a] mt-0.5">{viewContact.standard || '—'}</p>
                  </div>
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                    <p className="text-[10px] text-amber-900 font-extrabold uppercase">Assigned Operator</p>
                    <p className="font-extrabold text-emerald-700 mt-0.5">{viewContact.operator_name || 'Unassigned'}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-900 mb-2">Event Attendance Timeline</h4>
                  <div className="space-y-2">
                    {viewContact.events.map((evt, idx) => (
                      <div key={evt.id || idx} className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-[#0f172a]">{evt.event_display_name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Registered: {new Date(evt.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-amber-100">
                <button
                  onClick={() => setViewContact(null)}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Edit Master Contact Modal --- */}
      <AnimatePresence>
        {editContact && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setEditContact(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-md relative space-y-4 border-2 border-amber-300 shadow-2xl"
            >
              <button
                onClick={() => setEditContact(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 border-b-2 border-amber-100 pb-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 border border-orange-300 flex items-center justify-center text-orange-700">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">Edit Master Contact</h3>
                  <p className="text-xs text-amber-900 font-bold">{editContact.name}</p>
                </div>
              </div>

              {editError && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-red-900 text-xs font-bold">
                  {editError}
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-extrabold text-[#0f172a] block mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-extrabold text-[#0f172a] block mb-1">Phone Number *</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="font-extrabold text-[#0f172a] block mb-1">Age</label>
                    <input
                      type="number"
                      value={editAge}
                      onChange={(e) => setEditAge(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-extrabold text-[#0f172a] block mb-1">Gender</label>
                    <select
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-sm font-semibold focus:outline-none cursor-pointer"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-extrabold text-[#0f172a] block mb-1">Occupation</label>
                    <select
                      value={editOccupation}
                      onChange={(e) => setEditOccupation(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-sm font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="">Select Occupation...</option>
                      <option value="Student">Student</option>
                      <option value="Employee">Employee</option>
                      <option value="Working">Working</option>
                      <option value="Business">Business</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-extrabold text-[#0f172a] block mb-1">Area of Stay</label>
                    <input
                      type="text"
                      value={editArea}
                      onChange={(e) => setEditArea(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="font-extrabold text-[#0f172a] block mb-1">Company / College</label>
                    <input
                      type="text"
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-extrabold text-[#0f172a] block mb-1">Standard (Students)</label>
                  <select
                    value={editStandard}
                    onChange={(e) => setEditStandard(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-sm font-semibold focus:outline-none cursor-pointer"
                  >
                    <option value="">None / Not Applicable</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-amber-100">
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Edit2 className="w-4 h-4 text-white" />}
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditContact(null)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Delete Confirmation Modal --- */}
      <AnimatePresence>
        {deleteContact && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setDeleteContact(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-md relative space-y-4 border-2 border-red-300 shadow-2xl"
            >
              <button
                onClick={() => setDeleteContact(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 border-b-2 border-red-100 pb-3 text-red-600">
                <AlertTriangle className="w-6 h-6" />
                <div>
                  <h3 className="text-base font-extrabold text-red-600">Remove Master Contact</h3>
                  <p className="text-xs text-slate-600 font-bold">{deleteContact.name} ({deleteContact.phone})</p>
                </div>
              </div>

              {deleteError && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-red-900 text-xs font-bold">
                  {deleteError}
                </div>
              )}

              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 space-y-1.5">
                <p className="font-extrabold">Are you sure you want to remove this contact from the Master Directory?</p>
                <p className="text-[11px] text-slate-600 font-semibold">
                  ✔ Safe Operation: Source event registration records (Rathayatra, Krishnashtami, Feedback) will remain <strong>100% safe and untouched</strong>.
                </p>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? 'Removing...' : 'Confirm Remove'}
                </button>
                <button
                  onClick={() => setDeleteContact(null)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Assign Operator Modal --- */}
      <AnimatePresence>
        {assignModalContact && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => { setAssignModalContact(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-md relative space-y-4 border-2 border-amber-300 shadow-2xl"
            >
              <button
                onClick={() => { setAssignModalContact(null); }}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 border-b-2 border-amber-100 pb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">
                    {assignModalContact.operator_name ? 'Reassign Master Contact' : 'Assign Master Contact'}
                  </h3>
                  <p className="text-xs text-amber-900 font-bold">{assignModalContact.name} ({assignModalContact.phone})</p>
                </div>
              </div>

              {assignModalContact.operator_name && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center justify-between">
                  <span className="text-slate-800 font-bold">Currently assigned to: <strong className="text-amber-900 font-extrabold">{assignModalContact.operator_name}</strong></span>
                  <span className="text-[10px] font-extrabold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                    Active
                  </span>
                </div>
              )}

              {assignError && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-red-900 text-xs font-bold">
                  {assignError}
                </div>
              )}

              {assignSuccess && (
                <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-bold">
                  {assignSuccess}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-extrabold text-amber-900 block">
                  {assignModalContact.operator_name ? 'Select New Operator' : 'Select Operator'}
                </label>
                {operators.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No active operators available.</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {operators.map((op) => {
                      const assigned = op.total_assigned ?? 0;
                      const isFull = assigned >= 40;
                      const isSelected = selectedOperatorId === op.id;
                      return (
                        <button
                          key={op.id}
                          type="button"
                          disabled={isFull}
                          onClick={() => !isFull && setSelectedOperatorId(op.id)}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl border-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'bg-amber-100 border-amber-400 text-slate-900 font-extrabold'
                              : 'bg-white border-amber-200 hover:border-amber-400 text-slate-800 font-semibold'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs truncate">
                              {op.name} <span className="text-[10px] text-slate-500 font-normal">({op.operator_type === 'coordinator' ? 'Co-ordinator' : 'Operator'})</span>
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded border shrink-0 ${
                              isFull ? 'bg-red-100 text-red-900 border-red-300' : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            }`}>
                              {isFull ? 'FULL' : `${assigned}/40`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-amber-100">
                <button
                  onClick={handleAssignOperator}
                  disabled={assigning || !selectedOperatorId}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md"
                >
                  {assigning ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <PhoneCall className="w-4 h-4 text-white" />}
                  {assigning ? 'Assigning...' : assignModalContact.operator_name ? 'Reassign Contact' : 'Confirm Assignment'}
                </button>
                <button
                  onClick={() => { setAssignModalContact(null); }}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
