'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import {
  User, Phone, CheckCircle2,
  ChevronDown, ShieldAlert, Sparkles, Loader2, Home, Laptop, MapPin, Building
} from 'lucide-react';
import { contactsRegisterSchema, ContactsRegisterSchemaInput } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

// ─── Light-theme design tokens (hardcoded — immune to ThemeProvider remapping) ─
// bg:     #f8fafc  surface: #ffffff  text: #172033    heading: #111827
// label:  #334155  placeholder: #64748b  border: #94a3b8
// primary:#4f46e5  error: #b91c1c

const LOCAL_STORAGE_KEY = 'contacts_register_draft';

const ALLOWED_AREAS = [
  'Kokapet',
  'Gandipet',
  'Narsingi',
  'Aziz Nagar',
  'Moinabad',
  'Banjara Hills'
].sort();

// ─── Shared input class string — hardcoded, ThemeProvider-immune ──────────────
const inputCls =
  'w-full py-3 rounded-xl border text-[#172033] placeholder-[#64748b] ' +
  'bg-white focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/25 ' +
  'focus:border-[#4f46e5] transition-all text-base';

const inputPl11 = `${inputCls} pl-11 pr-4 border-[#94a3b8]`;
const inputPl11Pr10 = `${inputCls} pl-11 pr-10 border-[#94a3b8]`;
const selectCls =
  'w-full px-4 py-3 rounded-xl border border-[#94a3b8] bg-white ' +
  'text-[#172033] appearance-none cursor-pointer ' +
  'focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/25 focus:border-[#4f46e5] transition-all text-base';

export default function ContactsRegisterForm() {
  const router = useRouter();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [areaSearch, setAreaSearch] = useState('');
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const areaDropdownRef = useRef<HTMLDivElement>(null);

  // Geoapify Location Autocomplete suggestions state
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ place_id: string; description: string }>>([]);
  const [isLoadingAreaSuggestions, setIsLoadingAreaSuggestions] = useState(false);

  // Fetch skills from Supabase
  const { data: skills = [], isLoading: isLoadingSkills } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skills')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Initialize Form
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isValid },
    trigger,
    reset,
  } = useForm<ContactsRegisterSchemaInput>({
    resolver: zodResolver(contactsRegisterSchema),
    mode: 'onChange',
    defaultValues: {
      fullName: '',
      phone: '',
      collegeName: '',
      customCollegeName: '',
      areaOfStay: '',
      gender: undefined,
      currentStay: undefined,
      pgName: '',
      skills: [],
      interestedOnlineWork: undefined,
    } as unknown as ContactsRegisterSchemaInput,
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const watchedFields = watch();

  // Handle currentStay change to clear pgName when With Parents is selected
  useEffect(() => {
    if (watchedFields.currentStay === 'With Parents') {
      if (watchedFields.pgName) {
        setValue('pgName', '');
        trigger('pgName');
      }
    }
  }, [watchedFields.currentStay, watchedFields.pgName, setValue, trigger]);

  // Handle Area of Stay Geoapify location suggestions
  useEffect(() => {
    const query = areaSearch.trim();
    if (query.length < 2) {
      setLocationSuggestions([]);
      setIsLoadingAreaSuggestions(false);
      return;
    }

    setIsLoadingAreaSuggestions(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/geocode/autocomplete?text=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.results)) {
            const results = data.results.map((r: { formatted: string }, idx: number) => ({
              place_id: `geoapify-${idx}-${r.formatted}`,
              description: r.formatted,
            }));
            setLocationSuggestions(results);
          } else {
            setLocationSuggestions([]);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('[Geoapify API Error]:', err);
            setLocationSuggestions([]);
          }
        })
        .finally(() => {
          setIsLoadingAreaSuggestions(false);
        });
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [areaSearch]);

  // Click outside listener for Area dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (areaDropdownRef.current && !areaDropdownRef.current.contains(event.target as Node)) {
        setShowAreaDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Server-side duplicate check state
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const phoneValue = watchedFields.phone;
  const fullNameValue = watchedFields.fullName;

  useEffect(() => {
    const digits = (phoneValue || '').replace(/\D/g, '').slice(-10);
    if (digits.length === 10) {
      setIsCheckingDuplicate(true);
      const timer = setTimeout(() => {
        fetch(`/api/contacts-register/check?phone=${digits}&name=${encodeURIComponent(fullNameValue || '')}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.isDuplicate) {
              setDuplicateWarning(data.message);
            } else {
              setDuplicateWarning(null);
            }
          })
          .catch(() => setDuplicateWarning(null))
          .finally(() => setIsCheckingDuplicate(false));
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setDuplicateWarning(null);
      setIsCheckingDuplicate(false);
    }
  }, [phoneValue, fullNameValue]);

  // Load draft from local storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === 'true') {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        setDuplicateWarning(null);
        setSubmissionError(null);
        reset({
          fullName: '',
          phone: '',
          collegeName: '',
          customCollegeName: '',
          areaOfStay: '',
          gender: undefined,
          currentStay: undefined,
          pgName: '',
          skills: [],
          interestedOnlineWork: undefined,
        } as unknown as ContactsRegisterSchemaInput);
        setAreaSearch('');
        return;
      }
      const savedDraft = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          reset(parsed);
          if (parsed.areaOfStay) {
            setAreaSearch(parsed.areaOfStay);
          }
        } catch (e) {
          console.error('Failed to parse draft contacts registration', e);
        }
      }
    }
  }, [reset]);

  // Save draft on change
  useEffect(() => {
    if (watchedFields && Object.keys(watchedFields).length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(watchedFields));
    }
  }, [watchedFields]);

  // Form completion progress calculation (across required fields)
  const calculateProgress = () => {
    const values = getValues();
    let completed = 0;
    let total = 7;

    if (values.fullName && values.fullName.trim().length >= 2) completed++;
    if (values.phone && values.phone.length === 10) completed++;
    if (values.collegeName) {
      if (values.collegeName === 'Other') {
        if (values.customCollegeName && values.customCollegeName.trim().length >= 2) completed++;
      } else {
        completed++;
      }
    }
    if (values.areaOfStay && values.areaOfStay.trim().length >= 2) completed++;
    if (values.gender) completed++;
    if (values.currentStay) {
      completed++;
      if (values.currentStay === 'In Hostel') {
        total++;
        if (values.pgName && values.pgName.trim().length >= 2) completed++;
      }
    }
    if (values.interestedOnlineWork) completed++;

    return Math.min(Math.round((completed / total) * 100), 100);
  };

  const progress = calculateProgress();

  const filteredAreas = ALLOWED_AREAS.filter((area) =>
    area.toLowerCase().includes(areaSearch.toLowerCase())
  );

  // Submit Handler
  const onSubmit = async (data: ContactsRegisterSchemaInput) => {
    if (duplicateWarning) {
      setSubmissionError(duplicateWarning);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      setSubmissionError(
        "You are currently offline.\nYour information is saved locally.\nReconnect to the internet and submit."
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    const finalCollegeName = data.collegeName === 'Other'
      ? data.customCollegeName?.trim() || 'Other'
      : data.collegeName.trim();

    const finalPgName = data.currentStay === 'In Hostel' ? (data.pgName?.trim() || null) : null;

    const payload = {
      ...data,
      collegeName: finalCollegeName,
      pgName: finalPgName,
    };
    delete payload.customCollegeName;

    try {
      const response = await fetch('/api/contacts-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Registration failed');
      }

      // Successful registration!
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#4f46e5', '#6366f1', '#ec4899', '#3b82f6'],
      });

      localStorage.removeItem(LOCAL_STORAGE_KEY);

      setTimeout(() => {
        router.push('/success?type=contacts_register');
      }, 800);

    } catch (err) {
      console.error('Contacts Register Submission error:', err);
      let message = 'An unexpected connection error occurred.';
      if (typeof window !== 'undefined' && !navigator.onLine) {
        message = "You are currently offline.\nYour information is saved locally.\nReconnect to the internet and submit.";
      } else if (err instanceof Error) {
        message = err.message;
      }
      setSubmissionError(message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Submitting Overlay */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md text-center p-6"
            style={{ backgroundColor: 'rgba(79,70,229,0.85)' }}
          >
            <div className="relative max-w-sm flex flex-col items-center p-8 bg-white rounded-3xl shadow-2xl border border-[#e2e8f0]">
              <h2 className="text-xl font-bold text-[#111827] mb-2 tracking-wide">
                Submitting your registration...
              </h2>
              <p className="text-[#475569] text-sm mb-6 max-w-xs">
                Please wait...
              </p>
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-[#e2e8f0]" />
                <div className="absolute inset-0 rounded-full border-4 border-t-[#4f46e5] animate-spin" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Form Card ── */}
      <div
        className="rounded-3xl p-6 sm:p-10 relative overflow-hidden shadow-2xl"
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          color: '#172033',
        }}
      >
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        {/* ── Progress Bar ── */}
        <div className="mb-6">
          <div className="flex justify-between items-center text-xs mb-2 font-medium" style={{ color: '#334155' }}>
            <span>Form Completion</span>
            <span className="font-bold" style={{ color: '#4f46e5' }}>{progress}%</span>
          </div>
          <div
            className="w-full h-2.5 rounded-full overflow-hidden"
            style={{ backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0' }}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* ── Header ── */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3"
            style={{ backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca' }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#4f46e5' }} />
            Registration Portal
          </div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2"
            style={{ color: '#111827' }}
          >
            Contacts Register
          </h1>
          <p className="text-sm sm:text-base" style={{ color: '#475569' }}>
            Please fill in your details below.
          </p>
        </div>

        {/* ── Error Alert ── */}
        {submissionError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl flex gap-3 text-sm shadow-sm"
            style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}
          >
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#b91c1c' }} />
            <div>
              <p className="font-bold" style={{ color: '#7f1d1d' }}>Submission Blocked</p>
              <p className="mt-0.5 whitespace-pre-line font-medium" style={{ color: '#991b1b' }}>{submissionError}</p>
            </div>
          </motion.div>
        )}

        {/* ── Form Body ── */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* ─── SECTION 1: PERSONAL & LOCATION ─── */}
          <div className="space-y-4">
            <h3
              className="text-xs font-bold tracking-wider uppercase"
              style={{ color: '#4338ca' }}
            >
              1. Personal &amp; Location Details
            </h3>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: '#334155' }}>
                Full Name <span style={{ color: '#b91c1c' }}>*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="w-5 h-5" style={{ color: '#94a3b8' }} />
                </span>
                <input
                  type="text"
                  {...register('fullName')}
                  placeholder="Enter Full Name *"
                  className={inputPl11}
                  style={{ color: '#172033', backgroundColor: '#ffffff', borderColor: errors.fullName ? '#b91c1c' : '#94a3b8' }}
                  aria-invalid={errors.fullName ? 'true' : 'false'}
                />
              </div>
              {errors.fullName && (
                <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.fullName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone */}
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: '#334155' }}>
                  Mobile Number <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Phone className="w-5 h-5" style={{ color: '#94a3b8' }} />
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    {...register('phone')}
                    placeholder="10 digit mobile number *"
                    className={inputPl11Pr10}
                    style={{ color: '#172033', backgroundColor: '#ffffff', borderColor: (errors.phone || duplicateWarning) ? '#b91c1c' : '#94a3b8' }}
                    aria-invalid={errors.phone || Boolean(duplicateWarning) ? 'true' : 'false'}
                  />
                  {isCheckingDuplicate && (
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#4f46e5' }} />
                    </span>
                  )}
                </div>
                {errors.phone && (
                  <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.phone.message}</p>
                )}
                {duplicateWarning && (
                  <div
                    className="mt-2 p-3 rounded-xl text-xs font-semibold flex items-start gap-2"
                    style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#b45309' }} />
                    <span>{duplicateWarning}</span>
                  </div>
                )}
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: '#334155' }}>
                  Gender <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <div className="relative">
                  <select
                    {...register('gender')}
                    className={selectCls}
                    style={{ color: '#172033', backgroundColor: '#ffffff', borderColor: errors.gender ? '#b91c1c' : '#94a3b8' }}
                    aria-invalid={errors.gender ? 'true' : 'false'}
                    defaultValue=""
                  >
                    <option value="" disabled style={{ color: '#64748b', backgroundColor: '#ffffff' }}>Select Gender *</option>
                    <option value="Male" style={{ color: '#172033', backgroundColor: '#ffffff' }}>Male</option>
                    <option value="Female" style={{ color: '#172033', backgroundColor: '#ffffff' }}>Female</option>
                  </select>
                  <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <ChevronDown className="w-5 h-5" style={{ color: '#64748b' }} />
                  </span>
                </div>
                {errors.gender && (
                  <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.gender.message}</p>
                )}
              </div>
            </div>

            {/* College / Company */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: '#334155' }}>
                College / Company <span style={{ color: '#b91c1c' }}>*</span>
              </label>
              <div className="relative">
                <select
                  {...register('collegeName')}
                  className={selectCls}
                  style={{ color: '#172033', backgroundColor: '#ffffff', borderColor: errors.collegeName ? '#b91c1c' : '#94a3b8' }}
                  aria-invalid={errors.collegeName ? 'true' : 'false'}
                  defaultValue=""
                >
                  <option value="" disabled style={{ color: '#64748b', backgroundColor: '#ffffff' }}>Select College / Company *</option>
                  <option value="CBIT" style={{ color: '#172033', backgroundColor: '#ffffff' }}>CBIT</option>
                  <option value="MGIT" style={{ color: '#172033', backgroundColor: '#ffffff' }}>MGIT</option>
                  <option value="VASV" style={{ color: '#172033', backgroundColor: '#ffffff' }}>VASV</option>
                  <option value="JBIT" style={{ color: '#172033', backgroundColor: '#ffffff' }}>JBIT</option>
                  <option value="VJIT" style={{ color: '#172033', backgroundColor: '#ffffff' }}>VJIT</option>
                  <option value="VBIT" style={{ color: '#172033', backgroundColor: '#ffffff' }}>VBIT</option>
                  <option value="NIAT" style={{ color: '#172033', backgroundColor: '#ffffff' }}>NIAT</option>
                  <option value="Other" style={{ color: '#172033', backgroundColor: '#ffffff' }}>Other / Enter Name</option>
                </select>
                <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <ChevronDown className="w-5 h-5" style={{ color: '#64748b' }} />
                </span>
              </div>
              {errors.collegeName && (
                <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.collegeName.message}</p>
              )}
            </div>

            {/* Custom College Name (when Other selected) */}
            {watchedFields.collegeName === 'Other' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="block text-xs font-bold mb-1.5" style={{ color: '#334155' }}>
                  Enter College / Company Name <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Building className="w-5 h-5" style={{ color: '#94a3b8' }} />
                  </span>
                  <input
                    type="text"
                    {...register('customCollegeName')}
                    placeholder="Enter College or Company Name *"
                    className={inputPl11}
                    style={{ color: '#172033', backgroundColor: '#ffffff', borderColor: errors.customCollegeName ? '#b91c1c' : '#94a3b8' }}
                    aria-invalid={errors.customCollegeName ? 'true' : 'false'}
                  />
                </div>
                {errors.customCollegeName && (
                  <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.customCollegeName.message}</p>
                )}
              </motion.div>
            )}

            {/* Area of Stay */}
            <div className="relative" ref={areaDropdownRef}>
              <label className="block text-xs font-bold mb-1.5" style={{ color: '#334155' }}>
                Area of Stay <span style={{ color: '#b91c1c' }}>*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <MapPin className="w-5 h-5" style={{ color: '#94a3b8' }} />
                </span>
                <input
                  type="text"
                  value={areaSearch}
                  placeholder="Search location or type custom area of stay *"
                  onFocus={() => setShowAreaDropdown(true)}
                  onChange={(e) => {
                    const typed = e.target.value;
                    setAreaSearch(typed);
                    setValue('areaOfStay', typed);
                    setShowAreaDropdown(true);
                    trigger('areaOfStay');
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      trigger('areaOfStay');
                    }, 200);
                  }}
                  className={inputPl11Pr10}
                  style={{
                    color: '#172033',
                    backgroundColor: '#ffffff',
                    borderColor: errors.areaOfStay ? '#b91c1c' : '#94a3b8',
                  }}
                  aria-invalid={errors.areaOfStay ? 'true' : 'false'}
                />
                {isLoadingAreaSuggestions && (
                  <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#4f46e5' }} />
                  </span>
                )}
              </div>

              {/* Location Autocomplete Dropdown */}
              {showAreaDropdown && (
                <div
                  className="absolute z-20 w-full mt-1.5 max-h-56 overflow-y-auto rounded-2xl shadow-2xl py-1"
                  style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
                >
                  {/* Geoapify suggestions header */}
                  {locationSuggestions.length > 0 && (
                    <div
                      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                      style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', color: '#4338ca' }}
                    >
                      <MapPin className="w-3 h-3" />
                      Location Suggestions
                    </div>
                  )}
                  {locationSuggestions.map((sug) => (
                    <button
                      key={sug.place_id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setValue('areaOfStay', sug.description);
                        setAreaSearch(sug.description);
                        setShowAreaDropdown(false);
                        trigger('areaOfStay');
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm flex items-start gap-2 transition-colors"
                      style={{ color: '#172033', borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eef2ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#4f46e5' }} />
                      <span>{sug.description}</span>
                    </button>
                  ))}

                  {/* Predefined areas header */}
                  <div
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}
                  >
                    Common Areas
                  </div>
                  {filteredAreas.length > 0 ? (
                    filteredAreas.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setValue('areaOfStay', area);
                          setAreaSearch(area);
                          setShowAreaDropdown(false);
                          trigger('areaOfStay');
                        }}
                        className="w-full text-left px-4 py-2 text-sm transition-colors"
                        style={{ color: '#334155' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eef2ff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        {area}
                      </button>
                    ))
                  ) : locationSuggestions.length === 0 ? (
                    <div className="px-4 py-3 text-sm font-medium" style={{ color: '#64748b' }}>
                      Press enter or keep typing your custom location.
                    </div>
                  ) : null}
                </div>
              )}

              {errors.areaOfStay && (
                <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.areaOfStay.message}</p>
              )}
            </div>

            {/* Current Stay */}
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#334155' }}>
                <Home className="w-4 h-4" style={{ color: '#4f46e5' }} />
                Current Stay <span style={{ color: '#b91c1c' }}>*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(['With Parents', 'In Hostel'] as const).map((opt) => {
                  const selected = watchedFields.currentStay === opt;
                  return (
                    <label
                      key={opt}
                      className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl font-bold text-sm cursor-pointer transition-all"
                      style={{
                        backgroundColor: selected ? '#eef2ff' : '#f8fafc',
                        border: selected ? '1.5px solid #4f46e5' : '1.5px solid #cbd5e1',
                        color: selected ? '#3730a3' : '#475569',
                        boxShadow: selected ? '0 0 0 2px rgba(79,70,229,0.12)' : 'none',
                      }}
                    >
                      <input
                        type="radio"
                        value={opt}
                        className="sr-only"
                        {...register('currentStay')}
                      />
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          border: selected ? '2px solid #4f46e5' : '2px solid #94a3b8',
                          backgroundColor: selected ? '#4f46e5' : 'transparent',
                        }}
                      >
                        {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
              {errors.currentStay && (
                <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.currentStay.message}</p>
              )}
            </div>

            {/* PG / Hostel Name (conditional) */}
            <AnimatePresence>
              {watchedFields.currentStay === 'In Hostel' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1.5 pt-1"
                >
                  <label className="block text-xs font-bold" style={{ color: '#334155' }}>
                    PG / Hostel Name <span style={{ color: '#b91c1c' }}>*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Building className="w-5 h-5" style={{ color: '#94a3b8' }} />
                    </span>
                    <input
                      type="text"
                      {...register('pgName')}
                      placeholder="Enter PG or Hostel Name *"
                      className={inputPl11}
                      style={{ color: '#172033', backgroundColor: '#ffffff', borderColor: errors.pgName ? '#b91c1c' : '#94a3b8' }}
                      aria-invalid={errors.pgName ? 'true' : 'false'}
                    />
                  </div>
                  {errors.pgName && (
                    <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.pgName.message}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ─── SECTION 2: SKILLS ─── */}
          <div className="space-y-4 pt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
            <h3 className="text-xs font-bold tracking-wider uppercase" style={{ color: '#4338ca' }}>
              2. Skills &amp; Interests (Optional)
            </h3>
            <p className="text-xs -mt-2" style={{ color: '#64748b' }}>
              Select any skills or domains you are interested in:
            </p>

            {isLoadingSkills ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: '#f1f5f9' }} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {skills.map((skill) => {
                  const checked = (watchedFields.skills || []).includes(skill.id);
                  return (
                    <label
                      key={skill.id}
                      className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all"
                      style={{
                        backgroundColor: checked ? '#eef2ff' : '#f8fafc',
                        border: checked ? '1.5px solid #4f46e5' : '1.5px solid #cbd5e1',
                        color: checked ? '#3730a3' : '#334155',
                      }}
                    >
                      <input
                        type="checkbox"
                        value={skill.id}
                        className="sr-only"
                        {...register('skills')}
                      />
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                        style={{
                          border: checked ? '2px solid #4f46e5' : '2px solid #94a3b8',
                          backgroundColor: checked ? '#4f46e5' : 'transparent',
                          color: '#ffffff',
                        }}
                      >
                        {checked && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <span className="text-sm font-semibold">{skill.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── SECTION 3: ONLINE WORKSHOP ─── */}
          <div className="space-y-4 pt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
            <h3 className="text-xs font-bold tracking-wider uppercase" style={{ color: '#4338ca' }}>
              3. Online Workshop
            </h3>

            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#334155' }}>
                <Laptop className="w-4 h-4" style={{ color: '#4f46e5' }} />
                Interested in Online Workshop? <span style={{ color: '#b91c1c' }}>*</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                {(['Yes', 'No'] as const).map((opt) => {
                  const selected = watchedFields.interestedOnlineWork === opt;
                  return (
                    <label
                      key={opt}
                      className="flex items-center justify-center gap-2.5 py-3 rounded-xl font-bold text-base cursor-pointer transition-all"
                      style={{
                        backgroundColor: selected ? '#eef2ff' : '#f8fafc',
                        border: selected ? '1.5px solid #4f46e5' : '1.5px solid #cbd5e1',
                        color: selected ? '#3730a3' : '#475569',
                        boxShadow: selected ? '0 0 0 2px rgba(79,70,229,0.12)' : 'none',
                      }}
                    >
                      <input
                        type="radio"
                        value={opt}
                        className="sr-only"
                        {...register('interestedOnlineWork')}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
              {errors.interestedOnlineWork && (
                <p className="text-xs font-semibold mt-1 pl-1" style={{ color: '#b91c1c' }}>{errors.interestedOnlineWork.message}</p>
              )}
            </div>
          </div>

          {/* ── Submit Button ── */}
          <div className="pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(duplicateWarning)}
              className="w-full py-4 rounded-xl font-extrabold text-base transition-all transform active:scale-[0.98]"
              style={
                isValid && !duplicateWarning
                  ? {
                      background: 'linear-gradient(to right, #4f46e5, #7c3aed)',
                      color: '#ffffff',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(79,70,229,0.35)',
                    }
                  : {
                      backgroundColor: '#e2e8f0',
                      border: '1px solid #cbd5e1',
                      color: '#94a3b8',
                      cursor: 'not-allowed',
                    }
              }
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2.5">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting Registration...
                </span>
              ) : (
                'Submit Registration'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
