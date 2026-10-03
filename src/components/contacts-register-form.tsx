'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import {
  User, Phone, CheckCircle2,
  ChevronDown, ShieldAlert, Sparkles, Loader2, Home, Laptop, GraduationCap, MapPin, Search, Building
} from 'lucide-react';
import { contactsRegisterSchema, ContactsRegisterSchemaInput } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const LOCAL_STORAGE_KEY = 'contacts_register_draft';

const ALLOWED_AREAS = [
  'Kokapet',
  'Gandipet',
  'Narsingi',
  'Aziz Nagar',
  'Moinabad',
  'Banjara Hills'
].sort();

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
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-indigo-900/90 backdrop-blur-md text-center p-6 text-white"
          >
            <div className="relative max-w-sm flex flex-col items-center p-8 bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-100">
              <h2 className="text-xl font-bold text-slate-900 mb-2 tracking-wide">
                Submitting your registration...
              </h2>
              <p className="text-slate-600 text-sm mb-6 max-w-xs">
                Please wait...
              </p>
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
                <div className="absolute inset-0 rounded-full border-4 border-t-indigo-600 animate-spin" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl p-6 sm:p-10 relative overflow-hidden border border-slate-200/80 shadow-2xl text-slate-900">
        {/* Decorative Light Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        {/* Form Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center text-xs text-slate-600 mb-2 font-medium">
            <span>Form Completion</span>
            <span className="font-bold text-indigo-600">{progress}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Header Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Registration Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-2">
            Contacts Register
          </h1>
          <p className="text-slate-600 text-sm sm:text-base">
            Please fill in your details below.
          </p>
        </div>

        {/* Error Alert Box */}
        {submissionError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex gap-3 text-red-800 text-sm shadow-sm"
          >
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-900">Submission Blocked</p>
              <p className="text-red-700 mt-0.5 whitespace-pre-line font-medium">{submissionError}</p>
            </div>
          </motion.div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* --- SECTION 1: PERSONAL & LOCATION DETAILS --- */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
              1. Personal & Location Details
            </h3>

            {/* Name Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  {...register('fullName')}
                  placeholder="Enter Full Name *"
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-base placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                  aria-invalid={errors.fullName ? 'true' : 'false'}
                />
              </div>
              {errors.fullName && (
                <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.fullName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <Phone className="w-5 h-5" />
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    {...register('phone')}
                    placeholder="10 digit mobile number *"
                    className="w-full pl-11 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-base placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                    aria-invalid={errors.phone || Boolean(duplicateWarning) ? 'true' : 'false'}
                  />
                  {isCheckingDuplicate && (
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    </span>
                  )}
                </div>
                {errors.phone && (
                  <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.phone.message}</p>
                )}
                {duplicateWarning && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{duplicateWarning}</span>
                  </div>
                )}
              </div>

              {/* Gender Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Gender <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    {...register('gender')}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-base appearance-none cursor-pointer focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                    aria-invalid={errors.gender ? 'true' : 'false'}
                    defaultValue=""
                  >
                    <option value="" disabled className="text-slate-400">Select Gender *</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                  <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-400">
                    <ChevronDown className="w-5 h-5" />
                  </span>
                </div>
                {errors.gender && (
                  <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.gender.message}</p>
                )}
              </div>
            </div>

            {/* College / Company Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                College / Company <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  {...register('collegeName')}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-base appearance-none cursor-pointer focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                  aria-invalid={errors.collegeName ? 'true' : 'false'}
                  defaultValue=""
                >
                  <option value="" disabled className="text-slate-400">Select College / Company *</option>
                  <option value="CBIT">CBIT</option>
                  <option value="MGIT">MGIT</option>
                  <option value="VASV">VASV</option>
                  <option value="JBIT">JBIT</option>
                  <option value="VJIT">VJIT</option>
                  <option value="VBIT">VBIT</option>
                  <option value="NIAT">NIAT</option>
                  <option value="Other">Other / Enter Name</option>
                </select>
                <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-400">
                  <ChevronDown className="w-5 h-5" />
                </span>
              </div>
              {errors.collegeName && (
                <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.collegeName.message}</p>
              )}
            </div>

            {/* Manual Custom College Input (when Other selected) */}
            {watchedFields.collegeName === 'Other' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Enter College / Company Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <Building className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    {...register('customCollegeName')}
                    placeholder="Enter College or Company Name *"
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-base placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                    aria-invalid={errors.customCollegeName ? 'true' : 'false'}
                  />
                </div>
                {errors.customCollegeName && (
                  <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.customCollegeName.message}</p>
                )}
              </motion.div>
            )}

            {/* Area of Stay (Location API + Searchable Autocomplete + Manual Entry) */}
            <div className="relative" ref={areaDropdownRef}>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Area of Stay <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <MapPin className="w-5 h-5" />
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
                  className="w-full pl-11 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-base placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                  aria-invalid={errors.areaOfStay ? 'true' : 'false'}
                />
                {isLoadingAreaSuggestions && (
                  <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  </span>
                )}
              </div>

              {/* Location Autocomplete Dropdown Menu */}
              {showAreaDropdown && (
                <div className="absolute z-20 w-full mt-1.5 max-h-56 overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl py-1 text-slate-900">
                  {/* Geoapify Server Location Suggestions */}
                  {locationSuggestions.length > 0 && (
                    <div className="px-3 py-1.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider bg-slate-50 border-b border-slate-100 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Location Suggestions
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
                      className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm text-slate-800 transition-colors flex items-start gap-2 border-b border-slate-50"
                    >
                      <MapPin className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      <span>{sug.description}</span>
                    </button>
                  ))}

                  {/* Predefined Local Area Options */}
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
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
                        className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm text-slate-700 transition-colors"
                      >
                        {area}
                      </button>
                    ))
                  ) : locationSuggestions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-500 font-medium">
                      Press enter or keep typing your custom location.
                    </div>
                  ) : null}
                </div>
              )}
              {errors.areaOfStay && (
                <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.areaOfStay.message}</p>
              )}
            </div>

            {/* Current Stay Options */}
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Home className="w-4 h-4 text-indigo-600" /> Current Stay <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {['With Parents', 'In Hostel'].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border font-bold text-sm cursor-pointer transition-all ${watchedFields.currentStay === opt
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-white'
                      }`}
                  >
                    <input
                      type="radio"
                      value={opt}
                      className="sr-only"
                      {...register('currentStay')}
                    />
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${watchedFields.currentStay === opt
                      ? 'border-indigo-600 bg-indigo-600'
                      : 'border-slate-300'
                      }`}>
                      {watchedFields.currentStay === opt && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {errors.currentStay && (
                <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.currentStay.message}</p>
              )}
            </div>

            {/* Conditional Mandatory PG Name Field (Visible ONLY when In Hostel is selected) */}
            <AnimatePresence>
              {watchedFields.currentStay === 'In Hostel' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1.5 pt-1"
                >
                  <label className="block text-xs font-bold text-slate-700">
                    PG / Hostel Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                      <Building className="w-5 h-5" />
                    </span>
                    <input
                      type="text"
                      {...register('pgName')}
                      placeholder="Enter PG or Hostel Name *"
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-base placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                      aria-invalid={errors.pgName ? 'true' : 'false'}
                    />
                  </div>
                  {errors.pgName && (
                    <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.pgName.message}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* --- SECTION 2: SKILLS --- */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
              2. Skills & Interests (Optional)
            </h3>
            <p className="text-xs text-slate-500 -mt-2">
              Select any skills or domains you are interested in:
            </p>

            {isLoadingSkills ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {skills.map((skill) => (
                  <label
                    key={skill.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${(watchedFields.skills || []).includes(skill.id)
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-white'
                      }`}
                  >
                    <input
                      type="checkbox"
                      value={skill.id}
                      className="sr-only"
                      {...register('skills')}
                    />
                    <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${(watchedFields.skills || []).includes(skill.id)
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300'
                      }`}>
                      {(watchedFields.skills || []).includes(skill.id) && (
                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />
                      )}
                    </div>
                    <span>{skill.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* --- SECTION 3: ONLINE WORKSHOP INTEREST --- */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
              3. Online Workshop
            </h3>

            {/* Interested in Online Workshop */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Laptop className="w-4 h-4 text-indigo-600" /> Interested in Online Workshop? <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                {['Yes', 'No'].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 py-3 rounded-xl border font-bold text-base cursor-pointer transition-all ${watchedFields.interestedOnlineWork === opt
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-white'
                      }`}
                  >
                    <input
                      type="radio"
                      value={opt}
                      className="sr-only"
                      {...register('interestedOnlineWork')}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {errors.interestedOnlineWork && (
                <p className="text-red-600 text-xs font-semibold mt-1 pl-1">{errors.interestedOnlineWork.message}</p>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSubmitting || Boolean(duplicateWarning)}
              className={`w-full py-4 rounded-xl font-extrabold text-base text-white transition-all transform active:scale-[0.98] ${isValid && !duplicateWarning
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/25 cursor-pointer'
                : 'bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed'
                }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2.5">
                  <Loader2 className="w-5 h-5 animate-spin" /> Submitting Registration...
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
