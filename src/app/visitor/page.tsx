'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, Smartphone, CheckCircle2, UserCheck, X,
  AlertCircle, Loader2, RefreshCw, ExternalLink, UserX,
  History, Clock, Search, Users, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { getApprovalSuccessMessage, getLevelFromClassesAttended } from '@/lib/level-mapping';
import { normalizePhone } from '@/lib/phone-utils';

interface LookedUpContact {
  id: string;
  name: string;
  phone: string;
  age: number | null;
  gender: string;
  area_of_stay: string;
  company_college: string;
  current_level: string;
  descriptive_level_name: string;
  level_badge_class: string;
  classes_attended: number;
  chanting: number;
  is_approved_this_week: boolean;
  checked_in_at: string | null;
  approved_by_email: string | null;
}

interface VisitorLogItem {
  id: string;
  master_contact_id: string;
  name: string;
  phone: string;
  gender: string;
  checked_in_at: string;
  admin_email: string;
  classes_attended: number;
  level_label: string;
  badge_class: string;
}

export default function VisitorCheckInPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [partialResults, setPartialResults] = useState<LookedUpContact[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [contactResult, setContactResult] = useState<LookedUpContact | null>(null);
  const [notFoundState, setNotFoundState] = useState<{ notFound: boolean; registerUrl: string } | null>(null);

  // Approval state
  const [approving, setApproving] = useState(false);
  const [approvalSuccess, setApprovalSuccess] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Period and Live Logs
  const [weeklyPeriodLabel, setWeeklyPeriodLabel] = useState<string>('');
  const [logs, setLogs] = useState<VisitorLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Helper for admin auth header
  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    };
  }, []);

  // 1. Fetch Live Logs for current weekly period
  const fetchLiveLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/visitor/checkins?limit=50', { headers });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setWeeklyPeriodLabel(data.weekly_period_label || '');
      }
    } catch (err) {
      console.error('[Visitor Check-In] Fetch logs error:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLiveLogs();

    // Supabase Realtime subscription for master_contact_checkins
    const channel = supabase
      .channel('master_contact_checkins_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'master_contact_checkins' },
        () => {
          void fetchLiveLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLiveLogs]);

  // 2. Debounced Phone Number Lookup (2-9 digits partial, 10 digits direct)
  useEffect(() => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 2) return;

    const timer = setTimeout(async () => {
      setLoadingLookup(true);
      setLookupError(null);
      setApprovalSuccess(null);
      setApprovalError(null);

      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/visitor/lookup?phone=${encodeURIComponent(digits)}`, { headers });
        const data = await res.json();

        if (!res.ok) {
          setLookupError(data.error || 'Failed to search mobile number');
          setContactResult(null);
          setPartialResults([]);
          setNotFoundState(null);
          return;
        }

        if (data.weekly_period_label) setWeeklyPeriodLabel(data.weekly_period_label);

        if (data.is_partial) {
          // Partial search result (2-9 digits)
          setNotFoundState(null);
          const list: LookedUpContact[] = data.contacts || [];
          setPartialResults(list);

          // Update current selection if it still matches the search results
          setContactResult((prev) => {
            if (!prev) return null;
            const updated = list.find((c) => c.id === prev.id);
            return updated || null;
          });
        } else {
          // Exact 10-digit mobile lookup
          if (data.found) {
            setNotFoundState(null);
            const list: LookedUpContact[] = data.contacts || [];
            if (list.length > 1) {
              setPartialResults(list);
              setContactResult(data.contact || list[0]);
            } else {
              setPartialResults([]);
              setContactResult(data.contact || (list.length > 0 ? list[0] : null));
            }
          } else {
            setContactResult(null);
            setPartialResults([]);
            setNotFoundState({
              notFound: true,
              registerUrl: data.register_url || '/contacts-register',
            });
          }
        }
      } catch (err) {
        console.error('[Visitor Lookup Error]:', err);
        setLookupError('Network error while looking up phone number.');
      } finally {
        setLoadingLookup(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [phoneNumber, getAuthHeaders]);

  const handleSelectContact = (contact: LookedUpContact) => {
    setContactResult(contact);
    setApprovalSuccess(null);
    setApprovalError(null);
  };

  // 3. Approve Check-In Handler
  const handleApproveCheckIn = async () => {
    if (!contactResult || approving) return;

    // Strict 10-digit Indian Mobile phone validation before submitting approval
    const cleanPhone = normalizePhone(contactResult.phone);
    if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      setApprovalError(
        `Cannot approve check-in: Contact "${contactResult.name}" has an invalid mobile number "${contactResult.phone}". A valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 is required.`
      );
      return;
    }

    setApproving(true);
    setApprovalError(null);
    setApprovalSuccess(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/visitor/check-in', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contact_id: contactResult.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setApprovalError(data.error || 'Failed to approve check-in');
        return;
      }

      // Authoritative cumulative classes_attended from RPC response
      const newClassesAttended = typeof data.classes_attended === 'number'
        ? data.classes_attended
        : contactResult.classes_attended + (data.already_approved ? 0 : 1);

      const newLevelInfo = getLevelFromClassesAttended(newClassesAttended);

      setContactResult((prev) => prev ? ({
        ...prev,
        is_approved_this_week: true,
        classes_attended: newClassesAttended,
        current_level: newLevelInfo.code,
        descriptive_level_name: newLevelInfo.displayLabel,
        level_badge_class: newLevelInfo.badgeClass,
        checked_in_at: data.checked_in_at || new Date().toISOString(),
        approved_by_email: data.admin_email || 'You',
      }) : null);

      // Keep partial results list in sync
      setPartialResults((prev) =>
        prev.map((c) =>
          c.id === contactResult.id
            ? {
                ...c,
                is_approved_this_week: true,
                classes_attended: newClassesAttended,
                current_level: newLevelInfo.code,
                descriptive_level_name: newLevelInfo.displayLabel,
                level_badge_class: newLevelInfo.badgeClass,
                checked_in_at: data.checked_in_at || new Date().toISOString(),
                approved_by_email: data.admin_email || 'You',
              }
            : c
        )
      );

      if (data.already_approved) {
        setApprovalSuccess('Contact was already approved for the active weekly period.');
      } else {
        // Authoritative class progression message
        setApprovalSuccess(getApprovalSuccessMessage(newClassesAttended));
      }

      // Refresh live log feed
      fetchLiveLogs();
    } catch (err) {
      console.error('[Approve Check-in Exception]:', err);
      setApprovalError('Network error while processing approval. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const handleClear = () => {
    setPhoneNumber('');
    setContactResult(null);
    setPartialResults([]);
    setNotFoundState(null);
    setLookupError(null);
    setApprovalSuccess(null);
    setApprovalError(null);
    phoneInputRef.current?.focus();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 pb-16">
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-950/40">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">
              Visitor Check-In Center
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
              <span>Active Weekly Period: <strong className="text-purple-400 font-semibold">{weeklyPeriodLabel || 'Current Week'}</strong></span>
              <span className="text-slate-600 hidden sm:inline">·</span>
              <span className="text-slate-400">Next Friday Rollover: <strong className="text-slate-300">00:00 IST</strong></span>
            </p>
          </div>
        </div>

        <button
          onClick={fetchLiveLogs}
          disabled={loadingLogs}
          className="self-start md:self-auto px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/30 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin text-purple-400' : ''}`} />
          Sync Logs
        </button>
      </div>

      {/* ── MAIN WORKFLOW GRID ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Phone Lookup & Check-In Action Card (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Phone Input Box */}
          <div className="glass-card rounded-2xl p-5 border border-purple-500/25 bg-slate-950/60 shadow-xl space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-purple-300">
              Visitor Phone Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 pointer-events-none text-sm font-bold font-mono">
                +91
              </span>
              <input
                ref={phoneInputRef}
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setPhoneNumber(val);
                  if (val.length < 2) {
                    setContactResult(null);
                    setPartialResults([]);
                    setNotFoundState(null);
                    setLookupError(null);
                    setApprovalSuccess(null);
                    setApprovalError(null);
                  }
                }}
                placeholder="Enter at least 2 digits to search"
                maxLength={10}
                autoFocus
                className="w-full pl-14 pr-10 py-3.5 rounded-xl bg-slate-900/90 border-2 border-purple-500/30 focus:border-purple-500 text-slate-100 placeholder-slate-500 text-base font-mono font-bold tracking-wider focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all shadow-inner"
              />
              {phoneNumber && (
                <button
                  onClick={handleClear}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                  title="Clear phone number"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {phoneNumber.replace(/\D/g, '').length === 0 && 'Enter at least 2 digits to search Master Contacts.'}
                {phoneNumber.replace(/\D/g, '').length === 1 && (
                  <span className="text-purple-400 font-medium">Enter at least 2 digits to search.</span>
                )}
                {phoneNumber.replace(/\D/g, '').length >= 2 && phoneNumber.replace(/\D/g, '').length < 10 && (
                  <span className="text-purple-300 font-medium">
                    Searching with {phoneNumber.replace(/\D/g, '').length} digits ({partialResults.length} match{partialResults.length === 1 ? '' : 'es'}). Select a contact below.
                  </span>
                )}
                {phoneNumber.replace(/\D/g, '').length === 10 && (
                  <span className="text-emerald-400 font-medium">10 digits entered — direct lookup active.</span>
                )}
              </span>
              <span className="font-mono text-[10px] text-slate-500">{phoneNumber.replace(/\D/g, '').length}/10 digits</span>
            </div>
          </div>

          {/* Loading Indicator */}
          {loadingLookup && (
            <div className="glass-card rounded-2xl p-8 border border-slate-900 text-center flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
              <p className="text-xs text-slate-400 font-medium">Searching Master Contacts registry...</p>
            </div>
          )}

          {/* Inline Error */}
          {lookupError && (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{lookupError}</span>
            </div>
          )}

          {/* ── PARTIAL MATCHES LIST (2 to 9 digits or multiple 10-digit matches) ──────── */}
          {partialResults.length > 0 && !loadingLookup && (
            <div className="glass-card rounded-2xl p-4 border border-purple-500/30 bg-slate-950/60 shadow-xl space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-purple-400" />
                  Matching Master Contacts ({partialResults.length})
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Select a contact to view &amp; approve</span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {partialResults.map((contact) => {
                  const isSelected = contactResult?.id === contact.id;
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => handleSelectContact(contact)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-purple-950/50 border-purple-500 shadow-md shadow-purple-950/40'
                          : 'bg-slate-900/70 border-slate-800 hover:border-purple-500/40 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-100">{contact.name}</span>
                          <span className="text-[11px] font-mono font-semibold text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">
                            +91 {contact.phone}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">({contact.gender})</span>
                        </div>

                        {contact.is_approved_this_week ? (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Approved This Week
                          </span>
                        ) : isSelected ? (
                          <span className="text-[10px] font-bold text-purple-300 bg-purple-900/80 border border-purple-400/50 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                            <Check className="w-3 h-3" />
                            Selected
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-800 hover:text-white px-2 py-0.5 rounded border border-slate-700 shrink-0">
                            Select
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/60">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${contact.level_badge_class}`}>
                          {contact.descriptive_level_name}
                        </span>
                        <span className="text-slate-400 text-[10px]">
                          Attended: <strong className="text-emerald-400 font-bold">{contact.classes_attended}</strong> class{contact.classes_attended === 1 ? '' : 'es'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PARTIAL SEARCH NO MATCHES (2-9 digits) ────────────────────────── */}
          {phoneNumber.replace(/\D/g, '').length >= 2 &&
            phoneNumber.replace(/\D/g, '').length < 10 &&
            !loadingLookup &&
            partialResults.length === 0 && (
              <div className="glass-card rounded-2xl p-6 border border-slate-800/80 bg-slate-950/40 text-center space-y-2 shadow-lg">
                <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mx-auto">
                  <Search className="w-5 h-5 text-slate-500" />
                </div>
                <h3 className="text-xs font-bold text-slate-300">No matching contacts found</h3>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  No master contacts found containing digits &quot;{phoneNumber.replace(/\D/g, '')}&quot;. Try typing additional digits or verifying the phone number.
                </p>
              </div>
            )}

          {/* ── EXACT 10-DIGIT NOT FOUND STATE ─────────────────────────────────── */}
          <AnimatePresence>
            {notFoundState && !loadingLookup && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="glass-card rounded-2xl p-6 border border-amber-500/30 bg-amber-950/10 text-center space-y-4 shadow-xl"
              >
                <div className="w-12 h-12 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                  <UserX className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-amber-300 tracking-wide">
                    Not Found, kindly register here
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    No matching Master Contact exists for mobile number <strong className="text-slate-200">+91 {phoneNumber}</strong>. Please register the contact first.
                  </p>
                </div>
                <div className="pt-1">
                  <Link
                    href="/contacts-register"
                    target="_blank"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold text-xs shadow-lg shadow-amber-950/40 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>Open Contacts Register Form</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── CONTACT SELECTED: DETAILS & APPROVE CARD ────────────────────────── */}
          <AnimatePresence>
            {contactResult && !loadingLookup && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="glass-card rounded-2xl p-6 border-2 border-purple-500/30 bg-slate-950/70 shadow-2xl space-y-5"
              >
                {/* Header Profile Info */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-900 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                      Verified Master Contact
                    </span>
                    <h2 className="text-xl font-black text-slate-100 mt-0.5">
                      {contactResult.name}
                    </h2>
                    <p className="text-xs text-slate-400 font-mono font-semibold mt-0.5">
                      +91 {contactResult.phone}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Gender</span>
                    <span className="text-xs font-bold text-slate-300">{contactResult.gender}</span>
                  </div>
                </div>

                {/* Level Details Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Current Level */}
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Current Level
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {contactResult.current_level}
                    </span>
                  </div>

                  {/* Descriptive Level Name */}
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Descriptive Level Name
                    </span>
                    <span className={`px-2.5 py-1 rounded-md text-xs font-black inline-block border ${contactResult.level_badge_class}`}>
                      {contactResult.descriptive_level_name}
                    </span>
                  </div>

                  {/* Cumulative Classes Attended */}
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Classes Attended
                    </span>
                    <span className="text-base font-black text-emerald-400">
                      {contactResult.classes_attended}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-1">cumulative</span>
                  </div>

                  {/* Chanting Counter */}
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Chanting
                    </span>
                    <span className="text-base font-black text-amber-400">
                      {contactResult.chanting}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-1">rounds</span>
                  </div>

                  {/* Area / College */}
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Area / College
                    </span>
                    <span className="text-xs text-slate-300 font-medium truncate block" title={contactResult.area_of_stay || contactResult.company_college}>
                      {contactResult.area_of_stay !== '—' ? contactResult.area_of_stay : contactResult.company_college}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2">
                  <button
                    onClick={handleApproveCheckIn}
                    disabled={approving}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {approving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing Atomic Approval...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-5 h-5" />
                        <span>Approve Check-In</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-center text-slate-500 mt-2">
                    Clicking will atomically record this week&apos;s check-in and increment Classes Attended by 1.
                  </p>
                </div>

                {/* Feedback Alerts */}
                {approvalSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{approvalSuccess}</span>
                  </div>
                )}

                {approvalError && (
                  <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{approvalError}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty Prompt State when less than 2 digits typed */}
          {phoneNumber.replace(/\D/g, '').length < 2 && !contactResult && !notFoundState && (
            <div className="glass-card rounded-2xl p-10 text-center border border-slate-900 bg-slate-950/30 space-y-2">
              <Smartphone className="w-10 h-10 text-purple-400/40 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">Ready for Visitor Check-In</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Enter at least 2 digits to search contacts by phone number, or enter all 10 digits for direct lookup.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Active Period Live Check-In Audit Logs (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                Weekly Approved Check-Ins
              </h2>
            </div>
            <span className="text-[10px] text-purple-400 font-bold bg-purple-950/40 border border-purple-500/20 px-2 py-0.5 rounded">
              {logs.length} Approved
            </span>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-slate-900 bg-slate-950/40 flex flex-col min-h-[420px] max-h-[640px] overflow-hidden shadow-xl">
            {loadingLogs ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                <p className="text-xs">Loading weekly logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                <Clock className="w-8 h-8 text-slate-800" />
                <p className="text-xs font-semibold text-slate-400">No Check-Ins Yet This Week</p>
                <p className="text-[11px] text-slate-600 max-w-xs">
                  Approved check-ins for the active weekly period will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-purple-500/30 transition-all space-y-1.5"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-200">{log.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">+91 {log.phone}</p>
                      </div>
                      <span className="text-[9px] text-slate-500 font-medium whitespace-nowrap">
                        {new Date(log.checked_in_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] pt-1 border-t border-slate-800/60">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${log.badge_class}`}>
                        {log.level_label}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        Classes: <strong className="text-emerald-400 font-bold">{log.classes_attended}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
