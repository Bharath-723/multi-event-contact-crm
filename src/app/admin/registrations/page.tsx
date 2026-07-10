'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Registration, VolunteerSlot, Skill } from '@/lib/types';
import { formatDate, sanitizeText } from '@/lib/utils';
import { 
  Search, Filter, Download, Printer, QrCode, Edit2, Trash2, 
  ChevronLeft, ChevronRight, X, Eye, Loader2, AlertTriangle, Check,
  PhoneCall, UserCheck, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import QRModal from '@/components/qr-modal';

// ─── Assign Contact Modal ─────────────────────────────────────────────────────
function AssignContactModal({
  registration,
  onClose,
  onAssigned,
}: {
  registration: { id: string; full_name: string; phone: string };
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [operators, setOperators] = React.useState<Array<{id:string;name:string;email:string;is_active:boolean;total_assigned?:number}>>([]);
  const [existing, setExisting] = React.useState<{id:string;status:string;contact_operators:{name:string;email:string}|null} | null>(null);
  const [loadingCheck, setLoadingCheck] = React.useState(true);
  const [selectedOp, setSelectedOp] = React.useState('');
  const [assigning, setAssigning] = React.useState(false);
  const [error, setError] = React.useState<string|null>(null);
  const [reassignMode, setReassignMode] = React.useState(false);

  React.useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
        const auth = session?.access_token ? `Bearer ${session.access_token}` : '';
        const [opsRes, checkRes] = await Promise.all([
          fetch('/api/operators', { headers: { Authorization: auth } }),
          fetch(`/api/assignments/check?registration_id=${registration.id}`, { headers: { Authorization: auth } }),
        ]);
        if (opsRes.ok) { const d = await opsRes.json(); setOperators((d.operators ?? []).filter((o: {is_active:boolean}) => o.is_active)); }
        if (checkRes.ok) { const d = await checkRes.json(); setExisting(d.assignment); }
      } finally { setLoadingCheck(false); }
    }
    load();
  }, [registration.id]);

  const handleAssign = async () => {
    if (!selectedOp) { setError('Please select an operator'); return; }
    setAssigning(true); setError(null);
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      const auth = session?.access_token ? `Bearer ${session.access_token}` : '';
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ registration_id: registration.id, operator_id: selectedOp, reassign: reassignMode }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Assignment failed'); return; }
      const result = d.results?.[0];
      if (result?.status === 'already_assigned') { setError(result.message); setReassignMode(false); return; }
      onAssigned();
    } catch { setError('Network error. Please try again.'); }
    finally { setAssigning(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} className="glass-card rounded-2xl p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-purple-950/50 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <PhoneCall className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-100">{reassignMode ? 'Reassign Contact' : 'Assign Contact'}</h2>
            <p className="text-xs text-slate-500 truncate">{registration.full_name} · {registration.phone}</p>
          </div>
        </div>

        {loadingCheck ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /></div>
        ) : (
          <div className="space-y-4">
            {/* Existing assignment badge */}
            {existing && !reassignMode && (
              <div className="p-3 bg-green-950/30 border border-green-500/25 rounded-xl flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] text-green-400 font-bold uppercase tracking-wider">Already Assigned to</p>
                  <p className="text-sm font-bold text-slate-100 mt-0.5">
                    {(() => {
                      const op = existing.contact_operators as unknown;
                      return (Array.isArray(op) ? (op as Array<{ name: string }>)[0]?.name : (op as { name: string } | null)?.name) ?? '—';
                    })()}
                  </p>
                </div>
                <UserCheck className="w-5 h-5 text-green-400 shrink-0" />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />{error}
              </div>
            )}

            {(!existing || reassignMode) && (
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-2">Select Operator</label>
                {operators.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No active operators available.</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {operators.map(op => {
                      const MAX_CAP = 30;
                      const assigned = op.total_assigned ?? 0;
                      const pct = Math.round((assigned / MAX_CAP) * 100);
                      const isFull = assigned >= MAX_CAP;
                      const barColor = isFull ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
                      const badgeColor = isFull
                        ? 'text-red-400 bg-red-950/30 border-red-500/25'
                        : pct >= 70
                        ? 'text-amber-400 bg-amber-950/30 border-amber-500/25'
                        : 'text-green-400 bg-green-950/30 border-green-500/25';
                      const isSelected = selectedOp === op.id;
                      return (
                        <button
                          key={op.id}
                          type="button"
                          disabled={isFull}
                          onClick={() => !isFull && setSelectedOp(op.id)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'bg-purple-950/40 border-purple-500/40'
                              : 'bg-slate-900/30 border-slate-800/40 hover:border-slate-700/60 hover:bg-slate-900/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-xs font-semibold text-slate-100 truncate">{op.name}</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${badgeColor}`}>
                              {isFull ? 'FULL' : `${assigned}/${MAX_CAP}`}
                            </span>
                          </div>
                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {existing && !reassignMode && (
                <button onClick={() => { setReassignMode(true); setError(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-yellow-950/30 border border-yellow-500/25 text-yellow-400 text-sm font-bold hover:bg-yellow-950/50 transition-all cursor-pointer">
                  Reassign Contact
                </button>
              )}
              {(!existing || reassignMode) && (
                <button onClick={handleAssign} disabled={assigning || !selectedOp}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold transition-all cursor-pointer disabled:opacity-60">
                  {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                  {assigning ? 'Assigning...' : reassignMode ? 'Confirm Reassign' : 'Assign'}
                </button>
              )}
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-sm font-semibold hover:text-slate-100 transition-all cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function RegistrationsPage() {
  const queryClient = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);

  // --- STATE FOR FILTER & SEARCH ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterVolunteer, setFilterVolunteer] = useState('');
  const [filterSlot, setFilterSlot] = useState('');
  const [filterOccupation, setFilterOccupation] = useState('');
  const [filterDonation, setFilterDonation] = useState('');
  const [filterPrasadam, setFilterPrasadam] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterSkill, setFilterSkill] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterTransportation, setFilterTransportation] = useState('');

  // --- PAGINATION STATE ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // --- ASSIGNMENT STATE (new) ---
  const [assignReg, setAssignReg] = React.useState<{id:string;full_name:string;phone:string}|null>(null);
  const [assignToast, setAssignToast] = React.useState<string|null>(null);

  const showAssignToast = (msg: string) => {
    setAssignToast(msg);
    setTimeout(() => setAssignToast(null), 3500);
  };

  // --- CRUD MODALS STATE ---
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteRegId, setDeleteRegId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // --- EDIT FORM STATE ---
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAge, setEditAge] = useState<number>(20);
  const [editGender, setEditGender] = useState<'Male' | 'Female'>('Male');
  const [editArea, setEditArea] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editPgName, setEditPgName] = useState('');
  const [editVolunteer, setEditVolunteer] = useState(false);
  const [editSlotId, setEditSlotId] = useState('');
  const [editPrasadam, setEditPrasadam] = useState(false);
  const [editWantsDonate, setEditWantsDonate] = useState(false);
  const [editDonationStatus, setEditDonationStatus] = useState<Registration['donation_status']>('Pending');
  const [editSelectedSkills, setEditSelectedSkills] = useState<string[]>([]);

  // --- DATA QUERIES ---
  const { data: registrations = [], isLoading: isLoadingRegs } = useQuery<Registration[]>({
    queryKey: ['registrations-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registrations')
        .select(`
          *,
          volunteer_slots (
            id,
            slot_time,
            display_order
          ),
          registration_skills (
            skill_id,
            skills (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      interface DBRegistration {
        registration_skills?: {
          skills: {
            id: string;
            name: string;
          } | null;
        }[] | null;
      }
 
      return (data || []).map((reg: unknown) => {
        const r = reg as DBRegistration & Record<string, unknown>;
        const skills = r.registration_skills?.map((rs) => rs.skills).filter(Boolean) || [];
        return {
          ...r,
          skills,
        } as unknown as Registration;
      });
    },
  });

  const { data: slots = [] } = useQuery<VolunteerSlot[]>({
    queryKey: ['volunteer-slots-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_slots')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: skills = [] } = useQuery<Skill[]>({
    queryKey: ['skills-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime refetch sync
  useEffect(() => {
    const channel = supabase
      .channel('registrations_table_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['registrations-list'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_assignments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['registrations-list'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Load search filters from sessionStorage on mount
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = sessionStorage.getItem('regs_searchQuery');
      const p = sessionStorage.getItem('regs_searchPhone');
      const g = sessionStorage.getItem('regs_filterGender');
      const v = sessionStorage.getItem('regs_filterVolunteer');
      const sl = sessionStorage.getItem('regs_filterSlot');
      const occ = sessionStorage.getItem('regs_filterOccupation');
      const d = sessionStorage.getItem('regs_filterDonation');
      const pr = sessionStorage.getItem('regs_filterPrasadam');
      const a = sessionStorage.getItem('regs_filterArea');
      const c = sessionStorage.getItem('regs_filterCompany');
          const sk = sessionStorage.getItem('regs_filterSkill');
      const dt = sessionStorage.getItem('regs_filterDate');
      const tr = sessionStorage.getItem('regs_filterTransportation');
 
      if (q) setSearchQuery(q);
      if (p) setSearchPhone(p);
      if (g) setFilterGender(g);
      if (v) setFilterVolunteer(v);
      if (sl) setFilterSlot(sl);
      if (occ) setFilterOccupation(occ);
      if (d) setFilterDonation(d);
      if (pr) setFilterPrasadam(pr);
      if (a) setFilterArea(a);
      if (c) setFilterCompany(c);
      if (sk) setFilterSkill(sk);
      if (dt) setFilterDate(dt);
      if (tr) setFilterTransportation(tr);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
 
  // Save search filters to sessionStorage on change
  useEffect(() => { sessionStorage.setItem('regs_searchQuery', searchQuery); }, [searchQuery]);
  useEffect(() => { sessionStorage.setItem('regs_searchPhone', searchPhone); }, [searchPhone]);
  useEffect(() => { sessionStorage.setItem('regs_filterGender', filterGender); }, [filterGender]);
  useEffect(() => { sessionStorage.setItem('regs_filterVolunteer', filterVolunteer); }, [filterVolunteer]);
  useEffect(() => { sessionStorage.setItem('regs_filterSlot', filterSlot); }, [filterSlot]);
  useEffect(() => { sessionStorage.setItem('regs_filterOccupation', filterOccupation); }, [filterOccupation]);
  useEffect(() => { sessionStorage.setItem('regs_filterDonation', filterDonation); }, [filterDonation]);
  useEffect(() => { sessionStorage.setItem('regs_filterPrasadam', filterPrasadam); }, [filterPrasadam]);
  useEffect(() => { sessionStorage.setItem('regs_filterArea', filterArea); }, [filterArea]);
  useEffect(() => { sessionStorage.setItem('regs_filterCompany', filterCompany); }, [filterCompany]);
  useEffect(() => { sessionStorage.setItem('regs_filterSkill', filterSkill); }, [filterSkill]);
  useEffect(() => { sessionStorage.setItem('regs_filterDate', filterDate); }, [filterDate]);
  useEffect(() => { sessionStorage.setItem('regs_filterTransportation', filterTransportation); }, [filterTransportation]);

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-purple-500/30 text-purple-200 font-semibold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Extract unique areas and companies for filtering options
  const uniqueAreas = Array.from(new Set(registrations.map(r => r.area_of_stay).filter(Boolean))) as string[];
  const uniqueCompanies = Array.from(new Set(registrations.map(r => r.company_college).filter(Boolean))) as string[];

  const predefinedOccupations = [
    'Student', 'Working', 'Business', 'Others'
  ];

  const customOccupations = Array.from(
    new Set(
      registrations
        .map(r => r.occupation?.trim())
        .filter(o => o && !predefinedOccupations.includes(o))
    )
  ).sort() as string[];

  // --- FILTERING LOGIC ---
  const filteredRegistrations = registrations.filter(reg => {
    // 1. Global / Name search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchName = reg.full_name.toLowerCase().includes(query);
      const matchCompany = reg.company_college.toLowerCase().includes(query);
      const matchArea = reg.area_of_stay?.toLowerCase().includes(query) || false;
      const matchOccupation = reg.occupation?.toLowerCase().includes(query) || false;
      const matchTransportation = reg.transportation_required?.toLowerCase().includes(query) || false;
      if (!matchName && !matchCompany && !matchArea && !matchOccupation && !matchTransportation) return false;
    }

    // 2. Phone specific search
    if (searchPhone.trim()) {
      if (!reg.phone.includes(searchPhone.trim())) return false;
    }

    // 3. Gender Filter
    if (filterGender && reg.gender !== filterGender) return false;

    // 4. Volunteer Filter
    if (filterVolunteer) {
      const isVol = filterVolunteer === 'Yes';
      if (reg.interested_to_volunteer !== isVol) return false;
    }

    // 5. Time slot filter
    if (filterSlot && reg.volunteer_slot_id !== filterSlot) return false;

    // 6. Donation filter
    if (filterDonation) {
      if (filterDonation === 'Yes' && !reg.wants_to_donate) return false;
      if (filterDonation === 'No' && reg.wants_to_donate) return false;
      if (['Pending', 'User Opted to Donate', 'Completed', 'Failed'].includes(filterDonation)) {
        if (reg.donation_status !== filterDonation) return false;
      }
    }

    // 7. Prasadam filter
    if (filterPrasadam) {
      const isPrasadam = filterPrasadam === 'Yes';
      if (reg.interested_to_dinner !== isPrasadam) return false;
    }

    // 8. Area filter
    if (filterArea && reg.area_of_stay !== filterArea) return false;

    // 9. Company filter
    if (filterCompany && reg.company_college !== filterCompany) return false;

    // 10. Skill filter
    if (filterSkill) {
      const hasSkill = reg.skills?.some(s => s.id === filterSkill);
      if (!hasSkill) return false;
    }

    // 11. Date filter
    if (filterDate) {
      const regDate = new Date(reg.created_at).toDateString();
      const matchDate = new Date(filterDate).toDateString();
      if (regDate !== matchDate) return false;
    }

    // 12. Occupation filter
    if (filterOccupation) {
      if (filterOccupation === 'Others') {
        const predefined = ['Student', 'Working', 'Business'];
        if (!reg.occupation || predefined.includes(reg.occupation)) return false;
      } else {
        if (reg.occupation !== filterOccupation) return false;
      }
    }

    // 13. Transportation filter
    if (filterTransportation) {
      const val = reg.transportation_required || 'No';
      if (val !== filterTransportation) return false;
    }

    return true;
  });

  // --- PAGINATION CALCULATIONS ---
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredRegistrations.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredRegistrations.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset pagination if filters or search changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [
    searchQuery, searchPhone, filterGender, filterVolunteer, filterSlot, filterOccupation,
    filterDonation, filterPrasadam, filterArea, filterCompany, filterSkill, filterDate
  ]);

  // --- ACTIONS HANDLERS ---

  // A. View Details Modal opening
  const handleOpenView = (reg: Registration) => {
    setSelectedReg(reg);
    setViewModalOpen(true);
  };

  // B. Edit Modal opening & Form pre-fill
  const handleOpenEdit = (reg: Registration) => {
    setSelectedReg(reg);
    setEditFullName(reg.full_name);
    setEditPhone(reg.phone);
    setEditAge(reg.age);
    setEditGender(reg.gender);
    setEditArea(reg.area_of_stay || '');
    setEditCompany(reg.company_college);
    setEditPgName(reg.pg_name || '');
    setEditVolunteer(reg.interested_to_volunteer);
    setEditSlotId(reg.volunteer_slot_id || '');
    setEditPrasadam(reg.interested_to_dinner);
    setEditWantsDonate(reg.wants_to_donate);
    setEditDonationStatus(reg.donation_status);
    setEditSelectedSkills(reg.skills?.map(s => s.id) || []);
    setEditError(null);
    setEditModalOpen(true);
  };

  // C. Save Edit Form submit
  const handleSaveEdit = async () => {
    if (!editFullName.trim() || !editPhone.trim() || !editCompany.trim()) {
      setEditError('Please fill out all required fields (*)');
      return;
    }

    if (editPhone.length !== 10 || !/^[0-9]+$/.test(editPhone)) {
      setEditError('Phone number must be exactly 10 digits.');
      return;
    }

    if (editAge < 10 || editAge > 100) {
      setEditError('Age must be between 10 and 100.');
      return;
    }

    if (editGender === 'Male' && !editArea.trim()) {
      setEditError('Area of Stay is required for males.');
      return;
    }

    if (editVolunteer && !editSlotId) {
      setEditError('Please select a volunteer slot.');
      return;
    }



    setIsSavingEdit(true);
    setEditError(null);

    try {
      const regId = selectedReg!.id;

      // 1. Update registrations record
      const { error: regErr } = await supabase
        .from('registrations')
        .update({
          full_name: sanitizeText(editFullName),
          phone: editPhone,
          age: editAge,
          gender: editGender,
          area_of_stay: editGender === 'Male' ? sanitizeText(editArea) : null,
          company_college: sanitizeText(editCompany),
          pg_name: editPgName ? sanitizeText(editPgName) : null,
          interested_to_volunteer: editVolunteer,
          volunteer_slot_id: editVolunteer ? editSlotId : null,
          interested_to_dinner: editPrasadam,
          wants_to_donate: editWantsDonate,
          donation_status: editWantsDonate ? editDonationStatus : 'Pending',
        })
        .eq('id', regId);

      if (regErr) throw regErr;

      // 2. Sync associated skills mapping
      // Delete existing skill mapping entries
      await supabase
        .from('registration_skills')
        .delete()
        .eq('registration_id', regId);

      // Insert new skill mappings
      const skillInserts = editSelectedSkills.map(sid => ({
        registration_id: regId,
        skill_id: sid,
      }));

      if (skillInserts.length > 0) {
        const { error: skillErr } = await supabase
          .from('registration_skills')
          .insert(skillInserts);

        if (skillErr) throw skillErr;
      }

      // Success, invalidate queries
      queryClient.invalidateQueries({ queryKey: ['registrations-list'] });
      setEditModalOpen(false);
      setSelectedReg(null);

    } catch (err) {
      console.error('Update failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to update record.';
      setEditError(message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // D. Delete Registration Handlers
  const confirmDelete = (id: string) => {
    setDeleteRegId(id);
  };

  const handleDelete = async () => {
    if (!deleteRegId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', deleteRegId);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['registrations-list'] });
      setDeleteRegId(null);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete registration.');
    } finally {
      setIsDeleting(false);
    }
  };

  // --- EXPORTS ---

  // 1. Export CSV
  const handleExportCSV = () => {
    if (filteredRegistrations.length === 0) return;

    const headers = [
      'Name', 'Phone', 'Age', 'Gender', 'Area', 'Company', 'PG', 
      'Skills', 'Volunteer', 'Volunteer Slot', 'Dinner Prasadam', 
      'Donation Status', 'Registered Date', 'Occupation', 'Transportation Required'
    ];

    const rows = filteredRegistrations.map(r => [
      `"${r.full_name.replace(/"/g, '""')}"`,
      r.phone,
      r.age,
      r.gender,
      `"${(r.area_of_stay || '').replace(/"/g, '""')}"`,
      `"${r.company_college.replace(/"/g, '""')}"`,
      `"${(r.pg_name || '').replace(/"/g, '""')}"`,
      `"${(r.skills || []).map(s => s.name).join(', ')}"`,
      r.interested_to_volunteer ? 'Yes' : 'No',
      r.volunteer_slots?.slot_time || 'N/A',
      r.interested_to_dinner ? 'Yes' : 'No',
      r.donation_status,
      formatDate(r.created_at),
      `"${(r.occupation || '').replace(/"/g, '""')}"`,
      r.transportation_required || 'No'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rathayatra_registrations_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 2. Export Print
  const handlePrintTable = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const tableRows = filteredRegistrations.map(r => `
      <tr>
        <td>${r.full_name}</td>
        <td>${r.phone}</td>
        <td>${r.age}</td>
        <td>${r.gender}</td>
        <td>${r.area_of_stay || 'N/A'}</td>
        <td>${r.company_college}</td>
        <td>${r.skills?.map(s => s.name).join(', ') || 'N/A'}</td>
        <td>${r.interested_to_volunteer ? `Yes (${r.volunteer_slots?.slot_time})` : 'No'}</td>
        <td>${r.interested_to_dinner ? 'Yes' : 'No'}</td>
        <td>${r.donation_status}</td>
        <td>${formatDate(r.created_at).split(',')[0]}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Rathayatra 2026 Registrations</title>
          <style>
            body { font-family: sans-serif; color: #1e293b; padding: 20px; }
            h2 { text-align: center; color: #4f46e5; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; }
            tr:nth-child(even) { background-color: #f8fafc; }
          </style>
        </head>
        <body>
          <h2>Rathayatra Volunteer Registrations (${filteredRegistrations.length} Records)</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Area</th>
                <th>Company/College</th>
                <th>Skills</th>
                <th>Volunteer</th>
                <th>Dinner</th>
                <th>Donation</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleSkillEdit = (skillId: string) => {
    setEditSelectedSkills(prev => 
      prev.includes(skillId) 
        ? prev.filter(id => id !== skillId) 
        : [...prev, skillId]
    );
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSearchPhone('');
    setFilterGender('');
    setFilterVolunteer('');
    setFilterSlot('');
    setFilterOccupation('');
    setFilterDonation('');
    setFilterPrasadam('');
    setFilterArea('');
    setFilterCompany('');
    setFilterSkill('');
    setFilterDate('');
  };

  if (isLoadingRegs) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Actions panel skeleton */}
        <div className="h-14 w-full bg-slate-900/60 rounded-2xl" />
        
        {/* Filters panel skeleton */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="h-4 w-32 bg-slate-850 rounded-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-10 w-full bg-slate-850 rounded-xl" />
            <div className="h-10 w-full bg-slate-850 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 w-full bg-slate-850 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Table skeleton */}
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-900/40">
          <div className="h-12 w-full bg-slate-950/80 border-b border-slate-900" />
          <div className="divide-y divide-slate-900/60">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-6 py-5 flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-slate-850 rounded-full" />
                  <div className="h-2.5 w-20 bg-slate-850 rounded-full" />
                </div>
                <div className="h-3.5 w-24 bg-slate-850 rounded-full" />
                <div className="h-4 w-12 bg-slate-850 rounded-full" />
                <div className="h-3.5 w-28 bg-slate-850 rounded-full" />
                <div className="h-3.5 w-20 bg-slate-850 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* 1. Header with QR Trigger and CSV Download */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-950/20 p-1.5 rounded-2xl">
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setQrOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-950/40 border border-purple-500/25 text-purple-300 hover:text-slate-100 transition-all cursor-pointer font-semibold text-sm shadow-[0_0_15px_rgba(139,92,246,0.1)]"
          >
            <QrCode className="w-4.5 h-4.5" /> Configure QR Code
          </button>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleExportCSV}
            disabled={filteredRegistrations.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 transition-all cursor-pointer text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          
          <button
            onClick={handlePrintTable}
            disabled={filteredRegistrations.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 transition-all cursor-pointer text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" /> Print PDF Table
          </button>
        </div>
      </div>

      {/* 2. Global Search & Multi-Filters Panel */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-900">
          <h3 className="font-bold text-sm text-slate-300 flex items-center gap-2">
            <Filter className="w-4.5 h-4.5 text-purple-400" /> Filters & Query Search
          </h3>
          {(searchQuery || searchPhone || filterGender || filterVolunteer || filterSlot || filterDonation || filterPrasadam || filterArea || filterCompany || filterSkill || filterDate) && (
            <button
              onClick={handleResetFilters}
              className="text-[10px] uppercase font-bold tracking-wider text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>

        {/* Search bars — hidden on mobile */}
        <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
              <Search className="w-4.5 h-4.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Global Search (Name, Area, Company)"
              className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-900/60 border border-slate-850 focus:border-purple-500/50 text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-100 cursor-pointer"
                title="Clear query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
              <Search className="w-4.5 h-4.5" />
            </span>
            <input
              type="text"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Filter by Phone"
              className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-900/60 border border-slate-850 focus:border-purple-500/50 text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
            />
            {searchPhone && (
              <button
                onClick={() => setSearchPhone('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-100 cursor-pointer"
                title="Clear phone filter"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Dropdown filters grid — Mobile: Gender, Volunteer, Slot only */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3.5 pt-2">
          {/* Gender — always visible */}
          <select
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Gender (All)</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          {/* Volunteer Status — always visible */}
          <select
            value={filterVolunteer}
            onChange={(e) => setFilterVolunteer(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Volunteer (All)</option>
            <option value="Yes">Volunteers Only</option>
            <option value="No">Non-Volunteers Only</option>
          </select>

          {/* Volunteer Slot — always visible */}
          <select
            value={filterSlot}
            onChange={(e) => setFilterSlot(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
            disabled={filterVolunteer === 'No'}
          >
            <option value="">Time Slot (All)</option>
            {slots.map(s => (
              <option key={s.id} value={s.id}>{s.slot_time}</option>
            ))}
          </select>

          {/* Occupation Filter — always visible */}
          <select
            value={filterOccupation}
            onChange={(e) => setFilterOccupation(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Occupation (All)</option>
            {predefinedOccupations.map(occ => (
              <option key={occ} value={occ}>{occ}</option>
            ))}
            {customOccupations.map(occ => (
              <option key={occ} value={occ}>{occ}</option>
            ))}
          </select>

          {/* Dinner Prasadam — hidden on mobile */}
          <select
            value={filterPrasadam}
            onChange={(e) => setFilterPrasadam(e.target.value)}
            className="hidden sm:block px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Dinner Prasadam (All)</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>

          {/* Transportation Filter — always visible */}
          <select
            value={filterTransportation}
            onChange={(e) => setFilterTransportation(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Transportation (All)</option>
            <option value="Yes">Yes Only</option>
            <option value="No">No Only</option>
          </select>

          {/* Donation Status — hidden on mobile */}
          <select
            value={filterDonation}
            onChange={(e) => setFilterDonation(e.target.value)}
            className="hidden sm:block px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Donation (All)</option>
            <option value="Yes">Interested Donors</option>
            <option value="No">Non-Donors</option>
            <option value="Pending">Status: Pending</option>
            <option value="User Opted to Donate">Status: Opted to Donate</option>
            <option value="Completed">Status: Completed</option>
          </select>

          {/* Area filter — hidden on mobile */}
          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            className="hidden sm:block px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Area of Stay (All)</option>
            {uniqueAreas.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Company filter — hidden on mobile */}
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className="hidden sm:block px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Company/College (All)</option>
            {uniqueCompanies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Skill Filter — hidden on mobile */}
          <select
            value={filterSkill}
            onChange={(e) => setFilterSkill(e.target.value)}
            className="hidden sm:block px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Skill (All)</option>
            {skills.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Date Picker — hidden on mobile */}
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="hidden sm:block px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* 3. Main Data Table */}
      <div className="glass-card rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm">
              <tr className="border-b border-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Contact</th>
                <th className="px-5 py-4">Age / Gender</th>
                <th className="px-5 py-4">Area / PG</th>
                <th className="px-5 py-4">Company/College</th>
                <th className="px-5 py-4">Skills</th>
                <th className="px-5 py-4">Volunteer Slot</th>
                <th className="px-5 py-4">Dinner</th>
                <th className="px-5 py-4">Donation Status</th>
                <th className="px-5 py-4">Transport</th>
                <th className="px-5 py-4">Assign</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-5 py-12 text-center text-slate-500">
                    No registrations found.
                  </td>
                </tr>
              ) : (
                currentItems.map((reg) => (
                  <tr key={reg.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Name */}
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-100 leading-snug">
                        {highlightText(reg.full_name, searchQuery)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Reg: {formatDate(reg.created_at).split(',')[0]}</div>
                    </td>

                    {/* Contact */}
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-slate-200">
                        {highlightText(reg.phone, searchPhone || searchQuery)}
                      </span>
                    </td>

                    {/* Age / Gender */}
                    <td className="px-5 py-4">
                      <span className="text-slate-200">{reg.age} yrs</span>
                      <span className={`inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${
                        reg.gender === 'Male' ? 'bg-purple-950/40 text-purple-300' : 'bg-pink-950/40 text-pink-300'
                      }`}>
                        {reg.gender}
                      </span>
                    </td>

                    {/* Area / PG */}
                    <td className="px-5 py-4 max-w-[150px] truncate">
                      <div className="truncate text-slate-200" title={reg.area_of_stay || 'N/A'}>
                        {reg.area_of_stay ? highlightText(reg.area_of_stay, searchQuery) : <span className="text-slate-600 font-semibold">—</span>}
                      </div>
                      {reg.pg_name && (
                        <div className="text-[10px] text-purple-400 mt-0.5 truncate" title={reg.pg_name}>PG: {reg.pg_name}</div>
                      )}
                    </td>

                    {/* Company/College */}
                    <td className="px-5 py-4 max-w-[150px] truncate" title={reg.company_college}>
                      {highlightText(reg.company_college, searchQuery)}
                    </td>

                    {/* Skills */}
                    <td className="px-5 py-4 max-w-[150px]">
                      <div className="flex flex-wrap gap-1">
                        {reg.skills && reg.skills.length > 0 ? (
                          reg.skills.map(s => (
                            <span key={s.id} className="text-[9px] font-bold bg-purple-950/40 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/10">
                              {s.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-600 font-semibold">—</span>
                        )}
                      </div>
                    </td>

                    {/* Volunteer Slot */}
                    <td className="px-5 py-4">
                      {reg.interested_to_volunteer ? (
                        <span className="text-xs font-semibold text-indigo-300 flex flex-col">
                          <span>Yes</span>
                          <span className="text-[9px] text-slate-500 font-medium mt-0.5">{reg.volunteer_slots?.slot_time || 'N/A'}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">No</span>
                      )}
                    </td>

                    {/* Dinner */}
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold ${reg.interested_to_dinner ? 'text-green-400' : 'text-slate-500'}`}>
                        {reg.interested_to_dinner ? 'Yes' : 'No'}
                      </span>
                    </td>

                    {/* Donation Status */}
                    <td className="px-5 py-4">
                      {reg.wants_to_donate ? (
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          reg.donation_status === 'Completed'
                            ? 'bg-green-950/20 border-green-500/30 text-green-400'
                            : 'bg-yellow-950/20 border-yellow-500/30 text-yellow-400'
                        }`}>
                          {reg.donation_status}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">No</span>
                      )}
                    </td>

                    {/* Transportation */}
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold ${reg.transportation_required === 'Yes' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}>
                        {reg.transportation_required || 'No'}
                      </span>
                    </td>

                    {/* Assign */}
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setAssignReg({ id: reg.id, full_name: reg.full_name, phone: reg.phone })}
                        aria-label="Assign contact operator"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/30 border border-purple-500/20 text-purple-400 text-xs font-semibold hover:bg-purple-950/50 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <PhoneCall className="w-3.5 h-3.5" /> Assign
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleOpenView(reg)}
                          aria-label="View registration details"
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-100 cursor-pointer transition-all"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => handleOpenEdit(reg)}
                          aria-label="Edit registration"
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-100 cursor-pointer transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => confirmDelete(reg.id)}
                          aria-label="Delete registration"
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-red-900 text-slate-400 hover:text-red-400 cursor-pointer transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-slate-900 bg-slate-950 flex justify-between items-center text-xs text-slate-400">
            <span>
              Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredRegistrations.length)} of {filteredRegistrations.length} registrations
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-100 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- QR CODE CONFIGURATION MODAL --- */}
      <QRModal isOpen={qrOpen} onClose={() => setQrOpen(false)} />

      {/* --- CRUD MODAL: VIEW DETAILS --- */}
      <AnimatePresence>
        {viewModalOpen && selectedReg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass-card rounded-2xl overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
              
              <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/60">
                <h3 className="font-bold text-lg text-slate-100">Registration Details</h3>
                <button
                  onClick={() => { setViewModalOpen(false); setSelectedReg(null); }}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-sm text-slate-300">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Full Name</span>
                    <span className="font-bold text-slate-100 text-base mt-0.5 block">{selectedReg.full_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Phone Number</span>
                    <span className="font-mono text-sm text-slate-200 mt-0.5 block">{selectedReg.phone}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-slate-900 pt-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Age</span>
                    <span className="font-bold text-slate-100 mt-0.5 block">{selectedReg.age} yrs</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Gender</span>
                    <span className="font-bold text-slate-100 mt-0.5 block">{selectedReg.gender}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Area of Stay</span>
                    <span className="font-bold text-slate-100 mt-0.5 block truncate">{selectedReg.area_of_stay || 'N/A'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-slate-900 pt-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Occupation</span>
                    <span className="font-bold text-slate-100 mt-0.5 block">{selectedReg.occupation || 'N/A'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-900 pt-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Company / College</span>
                    <span className="font-semibold text-slate-100 mt-0.5 block truncate">{selectedReg.company_college}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">PG Name (if any)</span>
                    <span className="font-semibold text-slate-100 mt-0.5 block truncate">{selectedReg.pg_name || 'N/A'}</span>
                  </div>
                </div>

                <div className="border-t border-slate-900 pt-3">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Skills Selected</span>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {selectedReg.skills && selectedReg.skills.length > 0 ? (
                      selectedReg.skills.map(s => (
                        <span key={s.id} className="text-xs bg-purple-950/40 border border-purple-500/20 text-purple-300 px-2.5 py-1 rounded-md font-semibold">
                          {s.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">None selected</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-slate-900 pt-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Volunteering Schedule</span>
                    <span className="font-semibold text-slate-100 mt-0.5 block">
                      {selectedReg.interested_to_volunteer 
                        ? `Yes (${selectedReg.volunteer_slots?.slot_time || 'N/A'})` 
                        : 'No'}
                    </span>
                  </div>
                  
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Dinner Prasadam</span>
                    <span className="font-semibold text-slate-100 mt-0.5 block">
                      {selectedReg.interested_to_dinner ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Transportation</span>
                    <span className="font-semibold text-slate-100 mt-0.5 block">
                      {selectedReg.transportation_required || 'No'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-900 pt-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Opted to Donate</span>
                    <span className="font-semibold text-slate-100 mt-0.5 block">
                      {selectedReg.wants_to_donate ? 'Yes' : 'No'}
                    </span>
                  </div>
                  
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Donation Status</span>
                    <span className="font-semibold text-slate-100 mt-0.5 block">
                      {selectedReg.wants_to_donate ? selectedReg.donation_status : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-900 pt-3 text-center text-xs text-slate-500">
                  Registration ID: {selectedReg.id} <br/>
                  Submitted at: {formatDate(selectedReg.created_at)}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- CRUD MODAL: EDIT REGISTRATION --- */}
      <AnimatePresence>
        {editModalOpen && selectedReg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass-card rounded-2xl overflow-hidden relative max-h-[90vh] flex flex-col"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
              
              <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/60 shrink-0">
                <h3 className="font-bold text-lg text-slate-100">Edit Registration</h3>
                <button
                  onClick={() => { setEditModalOpen(false); setSelectedReg(null); }}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content - Scrollable */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-slate-950/20 text-sm">
                
                {editError && (
                  <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-200 text-xs flex gap-2">
                    <AlertTriangle className="w-4.5 h-4.5 text-red-400 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Full Name *</label>
                    <input
                      type="text"
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none"
                    />
                  </div>
                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Phone Number *</label>
                    <input
                      type="text"
                      maxLength={10}
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Age */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Age *</label>
                    <input
                      type="number"
                      value={editAge}
                      onChange={(e) => setEditAge(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none"
                    />
                  </div>

                  {/* Gender */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Gender *</label>
                    <select
                      value={editGender}
                      onChange={(e) => {
                        const val = e.target.value as 'Male' | 'Female';
                        setEditGender(val);
                        if (val !== 'Male') setEditArea('');
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none cursor-pointer"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  {/* Area (Conditional) */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Area of Stay {editGender === 'Male' && '*'}</label>
                    <input
                      type="text"
                      list="edit-areas-list"
                      value={editArea}
                      onChange={(e) => setEditArea(e.target.value)}
                      disabled={editGender !== 'Male'}
                      placeholder="Type or select Area of Stay"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <datalist id="edit-areas-list">
                      <option value="Kokapet" />
                      <option value="Gandipet" />
                      <option value="Narsingi" />
                      <option value="Aziz Nagar" />
                      <option value="Banjara Hills" />
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Company */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Company / College *</label>
                    <input
                      type="text"
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none"
                    />
                  </div>
                  {/* PG */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">PG Name</label>
                    <input
                      type="text"
                      value={editPgName}
                      onChange={(e) => setEditPgName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                {/* Skills */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold block">Skills</label>
                  <div className="grid grid-cols-2 gap-2">
                    {skills.map(s => {
                      const isSelected = editSelectedSkills.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleSkillEdit(s.id)}
                          className={`px-3 py-2 text-xs font-semibold rounded-xl border text-left flex items-center justify-between transition-all ${
                            isSelected
                              ? 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                              : 'bg-slate-900 border-slate-850 text-slate-400'
                          }`}
                        >
                          <span>{s.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-purple-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Volunteer Details */}
                <div className="grid grid-cols-2 gap-4 border-t border-slate-900 pt-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Volunteer Interest</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditVolunteer(true)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          editVolunteer 
                            ? 'bg-purple-950/40 border-purple-500/40 text-purple-300' 
                            : 'bg-slate-900 border-slate-850 text-slate-400'
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditVolunteer(false); setEditSlotId(''); }}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          !editVolunteer 
                            ? 'bg-purple-950/40 border-purple-500/40 text-purple-300' 
                            : 'bg-slate-900 border-slate-850 text-slate-400'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Time Slot</label>
                    <select
                      value={editSlotId}
                      onChange={(e) => setEditSlotId(e.target.value)}
                      disabled={!editVolunteer}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none disabled:opacity-40"
                    >
                      <option value="">Select Slot</option>
                      {slots.map(s => (
                        <option key={s.id} value={s.id}>{s.slot_time}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Prasadam & Donation */}
                <div className="grid grid-cols-3 gap-4 border-t border-slate-900 pt-3">
                  {/* Dinner */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Prasadam Dinner</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditPrasadam(true)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          editPrasadam 
                            ? 'bg-purple-950/40 border-purple-500/40 text-purple-300' 
                            : 'bg-slate-900 border-slate-850 text-slate-400'
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditPrasadam(false)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          !editPrasadam 
                            ? 'bg-purple-950/40 border-purple-500/40 text-purple-300' 
                            : 'bg-slate-900 border-slate-850 text-slate-400'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {/* Donation Opted */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Wants to Donate</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditWantsDonate(true)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          editWantsDonate 
                            ? 'bg-purple-950/40 border-purple-500/40 text-purple-300' 
                            : 'bg-slate-900 border-slate-850 text-slate-400'
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditWantsDonate(false); setEditDonationStatus('Pending'); }}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          !editWantsDonate 
                            ? 'bg-purple-950/40 border-purple-500/40 text-purple-300' 
                            : 'bg-slate-900 border-slate-850 text-slate-400'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {/* Donation Status */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Donation Status</label>
                    <select
                      value={editDonationStatus}
                      onChange={(e) => setEditDonationStatus(e.target.value as Registration['donation_status'])}
                      disabled={!editWantsDonate}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none disabled:opacity-40"
                    >
                      <option value="Pending">Pending</option>
                      <option value="User Opted to Donate">Opted to Donate</option>
                      <option value="Completed">Completed</option>
                      <option value="Failed">Failed</option>
                    </select>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-900 bg-slate-950/60 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { setEditModalOpen(false); setSelectedReg(null); }}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-300 hover:text-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving Changes...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- CRUD MODAL: CONFIRM DELETE --- */}
      <AnimatePresence>
        {deleteRegId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-card rounded-2xl p-6 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-500" />
              
              <h3 className="font-bold text-base text-slate-100 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Confirm Delete Record
              </h3>
              
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Are you absolutely sure you want to delete this volunteer registration? This action is irreversible and will trigger an audit trail entry.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteRegId(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-300 hover:text-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-red-650 hover:bg-red-600 text-white transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...
                    </>
                  ) : (
                    'Yes, Delete'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Assign Contact Modal (new, isolated) ─── */}
      <AnimatePresence>
        {assignReg && (
          <AssignContactModal
            key="assign-modal"
            registration={assignReg}
            onClose={() => setAssignReg(null)}
            onAssigned={() => {
              setAssignReg(null);
              showAssignToast('Contact assigned successfully!');
            }}
          />
        )}
      </AnimatePresence>

      {/* Assign Toast */}
      <AnimatePresence>
        {assignToast && (
          <motion.div
            key="assign-toast"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 right-6 z-[100] bg-slate-800 border border-green-500/30 text-slate-100 text-sm font-medium px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-green-400" />
            {assignToast}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
