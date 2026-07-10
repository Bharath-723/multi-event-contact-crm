'use client';

import React, { useState } from 'react';
import {
  Search, Clock, CheckCircle2, AlertCircle, Loader2, X,
  UserCheck, Smartphone, Check, Shield, UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  id: string;
  registration_no: string;
  full_name: string;
  phone: string;
  age: number;
  gender: string;
  occupation: string | null;
  area_of_stay: string | null;
  interested_to_volunteer: boolean;
  interested_to_dinner: boolean;
  transportation_required: string | null;
  operator_status: string | null;
  created_at: string;
  company_college: string;
  volunteer_slot_time: string | null;
  assigned_operator: { id: string; name: string } | null;
  visit: {
    id: string;
    visited_at: string;
    visit_method: string;
    visited_by_admin: boolean;
    remarks: string | null;
    operator_name: string;
  } | null;
}

interface SuccessCheckIn {
  regNo: string;
  name: string;
  operator: string;
  time: string;
}

export default function OperatorVisitorPage() {
  const [query, setQuery] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedVisitor, setSelectedVisitor] = useState<SearchResult | null>(null);

  // States for confirmation & success modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState<SuccessCheckIn | null>(null);
  const [checkInRemarks, setCheckInRemarks] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [errorCheckIn, setErrorCheckIn] = useState<string | null>(null);

  // 1. Search Visitor (Operator Cookie auth is handled automatically by the browser)
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const searchVal = query.trim();
    if (!searchVal) return;

    setLoadingSearch(true);
    setErrorCheckIn(null);
    try {
      const res = await fetch(`/api/visitor/search?q=${encodeURIComponent(searchVal)}`);
      const data = await res.json();
      if (!res.ok) {
        setResults([]);
        setSelectedVisitor(null);
        return;
      }
      setResults(data.registrations ?? []);
      if (data.registrations?.length === 1) {
        setSelectedVisitor(data.registrations[0]);
      } else {
        setSelectedVisitor(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (!val.trim()) {
      setResults([]);
      setSelectedVisitor(null);
    }
  };

  // 3. Check-in Action
  const handleApproveCheckIn = async () => {
    if (!selectedVisitor) return;
    setCheckingIn(true);
    setErrorCheckIn(null);

    try {
      const res = await fetch('/api/visitor/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registration_id: selectedVisitor.id,
          remarks: checkInRemarks,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorCheckIn(data.error || 'Check-in failed');
        if (data.details) {
          // Update selected visitor state with existing visit details
          setSelectedVisitor(prev => prev ? {
            ...prev,
            visit: {
              id: 'existing',
              visited_at: data.details.visited_at,
              visit_method: data.details.visit_method,
              visited_by_admin: data.details.checked_in_by === 'Admin',
              remarks: null,
              operator_name: data.details.checked_in_by,
            }
          } : null);
        }
        return;
      }

      // Success
      setShowConfirm(false);
      setCheckInRemarks('');
      
      // Update selectedVisitor state to show checked in
      const updatedVisitor = {
        ...selectedVisitor,
        visit: {
          id: data.visit.id,
          visited_at: data.visit.visited_at,
          visit_method: 'MANUAL_SEARCH',
          visited_by_admin: false,
          remarks: checkInRemarks || null,
          operator_name: data.visit.checked_in_by,
        }
      };
      setSelectedVisitor(updatedVisitor);
      
      // Update results list
      setResults(prev => prev.map(r => r.id === selectedVisitor.id ? updatedVisitor : r));
      
      // Show check-in success message card
      setShowSuccess({
        regNo: data.visit.registration_no,
        name: data.visit.full_name,
        operator: data.visit.checked_in_by,
        time: new Date(data.visit.visited_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      });
    } catch {
      setErrorCheckIn('Network error. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-4 md:p-6 pb-12 text-slate-100">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Visitor Check-In
          </h1>
          <p className="text-slate-500 text-xs mt-1">Search and approve checked-in status for assigned visitors</p>
        </div>
        <a
          href="/operator/portal"
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-450 hover:text-slate-100 transition-all text-xs font-semibold"
        >
          ← Back to Call Portal
        </a>
      </div>

      {/* SEARCH INPUT */}
      <form onSubmit={handleSearch} className="relative">
        <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 pointer-events-none">
          <Search className="w-5 h-5" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search assigned visitor by Reg No, Phone, or Name..."
          className="w-full pl-11 pr-24 py-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-xl"
        />
        <button
          type="submit"
          disabled={loadingSearch || !query.trim()}
          className="absolute right-2.5 top-2 bottom-2 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
        >
          {loadingSearch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
        </button>
      </form>

      {/* Search Result List (if multiple results found) */}
      {results.length > 1 && !selectedVisitor && (
        <div className="glass-card rounded-2xl p-4 space-y-2 border border-slate-900">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Multiple Visitors Found ({results.length})</p>
          <div className="divide-y divide-slate-900/60 max-h-52 overflow-y-auto pr-1">
            {results.map((res) => (
              <div
                key={res.id}
                onClick={() => setSelectedVisitor(res)}
                className="flex justify-between items-center py-2.5 px-2 hover:bg-slate-900/40 rounded-xl cursor-pointer transition-all"
              >
                <div>
                  <p className="text-sm font-bold text-slate-200">{res.full_name}</p>
                  <p className="text-xs text-slate-500">{res.registration_no} · {res.phone}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  res.visit ? 'text-green-400 bg-green-950/20 border-green-500/20' : 'text-yellow-400 bg-yellow-950/20 border-yellow-500/20'
                }`}>
                  {res.visit ? 'Visited' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Check-In Card */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-green-950/40 border border-green-500/30 rounded-2xl flex flex-col items-center text-center space-y-2.5 relative overflow-hidden"
          >
            <div className="absolute top-2 right-2">
              <button onClick={() => setShowSuccess(null)} className="text-green-500 hover:text-green-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-900/30 border border-green-500/20 flex items-center justify-center text-green-400">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-green-400">✓ Visitor Checked In Successfully</h3>
              <p className="text-slate-100 text-xs font-bold mt-1">{showSuccess.name}</p>
              <p className="text-slate-400 text-[10px] mt-0.5">ID: {showSuccess.regNo}</p>
            </div>
            <div className="w-full border-t border-green-550/10 pt-2 text-[10px] text-green-400/80 flex justify-between px-6">
              <span>Checked In By: <strong>{showSuccess.operator}</strong></span>
              <span>Time: <strong>{showSuccess.time}</strong></span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Visitor Details Card */}
      {selectedVisitor ? (
        <div className="glass-card rounded-2xl p-5 border border-slate-900 space-y-4">
          <div className="flex justify-between items-start gap-4">
            <div>
              <span className="text-[10px] font-bold text-purple-400 bg-purple-950/40 border border-purple-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
                {selectedVisitor.registration_no}
              </span>
              <h2 className="text-lg font-black text-slate-100 mt-1">{selectedVisitor.full_name}</h2>
              <p className="text-xs text-slate-500">{selectedVisitor.phone}</p>
            </div>
            
            <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 flex items-center gap-1.5 ${
              selectedVisitor.visit 
                ? 'text-green-400 bg-green-950/30 border-green-500/25' 
                : 'text-yellow-450 bg-yellow-950/30 border-yellow-500/25'
            }`}>
              {selectedVisitor.visit ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              {selectedVisitor.visit ? 'Checked In' : 'Pending'}
            </span>
          </div>

          {/* Details list */}
          <div className="grid grid-cols-2 gap-3 text-xs border-t border-b border-slate-900 py-4">
            <div>
              <p className="text-slate-500 font-bold uppercase text-[9px]">Age & Gender</p>
              <p className="text-slate-200 mt-0.5">{selectedVisitor.age} Years · {selectedVisitor.gender}</p>
            </div>
            <div>
              <p className="text-slate-500 font-bold uppercase text-[9px]">Occupation</p>
              <p className="text-slate-200 mt-0.5 truncate">{selectedVisitor.occupation || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-bold uppercase text-[9px]">Area of Stay</p>
              <p className="text-slate-200 mt-0.5 truncate">{selectedVisitor.area_of_stay || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-bold uppercase text-[9px]">Company / College</p>
              <p className="text-slate-200 mt-0.5 truncate">{selectedVisitor.company_college}</p>
            </div>
            <div>
              <p className="text-slate-500 font-bold uppercase text-[9px]">Volunteer Option</p>
              <p className={`mt-0.5 font-semibold ${selectedVisitor.interested_to_volunteer ? 'text-purple-400' : 'text-slate-400'}`}>
                {selectedVisitor.interested_to_volunteer ? `Yes (${selectedVisitor.volunteer_slot_time || 'Pending'})` : 'No'}
              </p>
            </div>
            <div>
              <p className="text-slate-500 font-bold uppercase text-[9px]">Prasadam Dinner</p>
              <p className="text-slate-200 mt-0.5">{selectedVisitor.interested_to_dinner ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-bold uppercase text-[9px]">Transportation Required</p>
              <p className="text-slate-200 mt-0.5">{selectedVisitor.transportation_required || 'No'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-bold uppercase text-[9px]">Current Operator Status</p>
              <p className={`mt-0.5 font-semibold ${
                selectedVisitor.operator_status === 'Coming' ? 'text-green-400' : 
                selectedVisitor.operator_status === 'Not Coming' ? 'text-red-400' : 
                selectedVisitor.operator_status === 'Callback Required' ? 'text-blue-400' : 'text-yellow-405'
              }`}>{selectedVisitor.operator_status || 'Pending'}</p>
            </div>
          </div>

          {/* Already Checked-in breakdown display */}
          {selectedVisitor.visit && (
            <div className="p-3.5 bg-slate-900/50 border border-slate-800 rounded-xl space-y-2">
              <p className="text-xs font-extrabold text-green-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Check-In Recorded
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div>Checked In Time: <strong className="text-slate-200">{new Date(selectedVisitor.visit.visited_at).toLocaleString('en-IN', { hour12: true })}</strong></div>
                <div>Checked In By: <strong className="text-slate-200">{selectedVisitor.visit.operator_name}</strong></div>
                <div>Method: <strong className="text-slate-200">{selectedVisitor.visit.visit_method}</strong></div>
              </div>
            </div>
          )}

          {errorCheckIn && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-400 mt-0.5" />
              <span>{errorCheckIn}</span>
            </div>
          )}

          {/* Action buttons (large, optimized for one-hand operation) */}
          <div className="flex gap-2">
            {!selectedVisitor.visit ? (
              <button
                onClick={() => { setShowConfirm(true); setErrorCheckIn(null); }}
                className="flex-1 py-3.5 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-sm transition-all cursor-pointer shadow-lg shadow-green-950/30 flex items-center justify-center gap-2"
              >
                <UserCheck className="w-5 h-5" /> Approve Visit
              </button>
            ) : (
              <button
                disabled
                className="flex-1 py-3.5 rounded-xl bg-slate-850 text-slate-500 border border-slate-800 text-sm font-bold opacity-60 flex items-center justify-center gap-2 cursor-not-allowed"
              >
                Already Checked In
              </button>
            )}
            <button
              onClick={() => setSelectedVisitor(null)}
              className="px-5 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 transition-all font-semibold text-sm cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : results.length > 1 ? (
        null
      ) : !loadingSearch && query ? (
        <div className="glass-card rounded-2xl p-10 text-center border border-slate-900">
          <UserX className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-semibold">No matching assigned visitor found.</p>
          <p className="text-slate-600 text-xs mt-1">Make sure the visitor is assigned to you and has correct registration details.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-10 text-center border border-slate-900 bg-slate-950/20">
          <Smartphone className="w-12 h-12 text-slate-800 mx-auto mb-3" />
          <p className="text-slate-400 font-semibold">Ready to Check In</p>
          <p className="text-slate-600 text-xs mt-1">Type details in the search box to lookup visitor registration.</p>
        </div>
      )}

      {/* CONFIRMATION DIALOG (MODAL) */}
      <AnimatePresence>
        {showConfirm && selectedVisitor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-card rounded-2xl p-6 relative border border-slate-850"
            >
              <h3 className="font-extrabold text-slate-100 text-base mb-2">Approve Visitor Check-in?</h3>
              
              <div className="space-y-3 mt-4 text-xs">
                <div className="p-3 bg-slate-900/50 rounded-xl space-y-1">
                  <div><span className="text-slate-500">ID:</span> <strong className="text-slate-200 font-bold">{selectedVisitor.registration_no}</strong></div>
                  <div><span className="text-slate-500">Name:</span> <strong className="text-slate-200 font-bold">{selectedVisitor.full_name}</strong></div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Remarks (Optional)</label>
                  <input
                    type="text"
                    value={checkInRemarks}
                    onChange={(e) => setCheckInRemarks(e.target.value)}
                    placeholder="e.g. checked in manually..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-850 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleApproveCheckIn}
                  disabled={checkingIn}
                  className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {checkingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Approve
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={checkingIn}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold hover:text-slate-100 transition-all cursor-pointer"
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
