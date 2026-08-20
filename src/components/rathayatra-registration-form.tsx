'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import {
  User, Phone, Award, Building, Home as HomeIcon, CheckCircle2,
  ChevronDown, Search, ShieldAlert, Sparkles, Loader2, Info, Briefcase, MapPin, Building2
} from 'lucide-react';
import { registrationSchema, RegistrationSchemaInput } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { KRISHNASHTAMI_SLOTS, SLOT_PRASADAM_MAP, FASTING_SUBTITLE_TEXT, PrasadamOption, filterValidSelectionsForSlot } from '@/lib/constants/prasadam-rules';

const LOCAL_STORAGE_KEY = 'krishnashtami_registration_draft';
const REDIRECT_FLAG_KEY = 'krishnashtami_donation_redirected';
const DONATION_URL = 'https://www.harekrishna-movement.in/mobiledonation/?prcr=VKGD';

interface GooglePlacePrediction {
  place_id: string;
  description: string;
}

interface GooglePlacesService {
  getPlacePredictions: (
    request: { input: string; componentRestrictions?: { country: string } },
    callback: (predictions: GooglePlacePrediction[] | null, status: string) => void
  ) => void;
}

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          AutocompleteService: new () => GooglePlacesService;
          PlacesServiceStatus: {
            OK: string;
          };
        };
      };
    };
  }
}


// Static common areas for the fallback searchable dropdown
const ALLOWED_AREAS = [
  'Kokapet',
  'Gandipet',
  'Narsingi',
  'Aziz Nagar',
  'Moinabad',
  'Banjara Hills'
].sort();

const OCCUPATION_SUGGESTIONS = [
  'Student',
  'Working',
  'Business',
  'Others'
];

const COMPANY_COLLEGE_SUGGESTIONS = [
  'CBIT',
  'MGIT',
  'VASV',
  'VJIT',
  'JBIT'
];

export default function RegistrationForm() {
  const router = useRouter();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDonationReturned, setIsDonationReturned] = useState(false);
  const [areaSearch, setAreaSearch] = useState('');
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const areaDropdownRef = useRef<HTMLDivElement>(null);

  const [occupationSearch, setOccupationSearch] = useState('');
  const [showOccupationDropdown, setShowOccupationDropdown] = useState(false);
  const occupationDropdownRef = useRef<HTMLDivElement>(null);

  const [companyCollegeSearch, setCompanyCollegeSearch] = useState('');
  const [showCompanyCollegeDropdown, setShowCompanyCollegeDropdown] = useState(false);
  const companyCollegeDropdownRef = useRef<HTMLDivElement>(null);

  // Location Autocomplete suggestions state (using server-side Geoapify proxy)
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ place_id: string; description: string }>>([]);
  const [isLoadingAreaSuggestions, setIsLoadingAreaSuggestions] = useState(false);

  // Fetch Geoapify Autocomplete results via server API proxy on areaSearch change
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
            console.error('[Geoapify API Proxy Error]:', err);
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


  // 1. Fetch skills and volunteer slots from Supabase via TanStack Query
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

  const { data: remoteSlots = [] } = useQuery({
    queryKey: ['volunteer-slots-krishnashtami'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_slots')
        .select('id, slot_time, display_order')
        .order('display_order');
      if (error) throw error;
      return data;
    },
  });

  // Construct Krishnashtami slots list matching exact required times
  const slots = useMemo(() => {
    return KRISHNASHTAMI_SLOTS.map((slotTime, idx) => {
      const matched = remoteSlots.find((s: { slot_time: string }) => s.slot_time.trim() === slotTime);
      return {
        id: matched?.id || `ks-slot-${idx + 1}`,
        slot_time: slotTime,
      };
    });
  }, [remoteSlots]);

  // 2. Initialize Form
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isValid },
    trigger,
    reset,
    setError,
  } = useForm<RegistrationSchemaInput>({
    resolver: zodResolver(registrationSchema),
    mode: 'onChange',
    defaultValues: {
      fullName: '',
      phone: '',
      age: undefined,
      gender: undefined,
      occupation: '',
      standard: '',
      areaOfStay: '',
      companyCollege: '',
      pgName: '',
      skills: [],
      interestedToVolunteer: undefined,
      volunteerSlotId: '',
      volunteerSlotTime: '',
      interestedToDinner: undefined,
      prasadamSelections: [],
      wantsToDonate: undefined,
      transportationRequired: undefined,
    } as unknown as RegistrationSchemaInput,
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const watchedFields = watch();

  // Clear standard when Occupation changes away from Student
  useEffect(() => {
    if (watchedFields.occupation !== 'Student') {
      if (watchedFields.standard) {
        setValue('standard', '');
      }
    }
  }, [watchedFields.occupation, watchedFields.standard, setValue]);

  const isVolunteerNo = watchedFields.interestedToVolunteer === 'No';
  const isPrasadamYes = watchedFields.interestedToDinner === 'Yes';

  const selectedSlotTime = watchedFields.volunteerSlotTime;

  const allowedPrasadamOptions = useMemo(() => {
    if (!isPrasadamYes) return [];
    if (isVolunteerNo) {
      return ['Breakfast', 'Lunch', 'Dinner'] as PrasadamOption[];
    }
    if (!selectedSlotTime) return [];
    return (SLOT_PRASADAM_MAP[selectedSlotTime.trim()] || []) as PrasadamOption[];
  }, [isPrasadamYes, isVolunteerNo, selectedSlotTime]);

  // Current prasadam selections
  const currentPrasadamSelections: string[] = (watchedFields.prasadamSelections as unknown as string[]) ?? [];

  // Toggle a single prasadam meal checkbox on/off
  const togglePrasadamSelection = (meal: PrasadamOption) => {
    const current = (getValues('prasadamSelections') as unknown as string[]) ?? [];
    const updated = current.includes(meal)
      ? current.filter(m => m !== meal)
      : [...current, meal];
    setValue('prasadamSelections', updated as ('Breakfast' | 'Lunch' | 'Dinner')[]);
    trigger('prasadamSelections');
  };

  // 3. Load Draft from Local Storage on Mount and detect donation success callback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isDonationSuccess = params.get('donation') === 'success';
      const savedDraft = localStorage.getItem(LOCAL_STORAGE_KEY);

      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (isDonationSuccess) {
            parsed.wantsToDonate = 'Yes';
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
            localStorage.setItem(REDIRECT_FLAG_KEY, 'true');
            setIsDonationReturned(true);
          }
          reset(parsed);
          if (parsed.areaOfStay) {
            setAreaSearch(parsed.areaOfStay);
          }
          if (parsed.occupation) {
            setOccupationSearch(parsed.occupation);
          }
          if (parsed.companyCollege) {
            setCompanyCollegeSearch(parsed.companyCollege);
          }
        } catch (e) {
          console.error('Failed to parse draft registration', e);
        }
      } else if (isDonationSuccess) {
        setValue('wantsToDonate', 'Yes');
        localStorage.setItem(REDIRECT_FLAG_KEY, 'true');
        setIsDonationReturned(true);
      }

      if (isDonationSuccess) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      } else {
        const alreadyRedirected = localStorage.getItem(REDIRECT_FLAG_KEY) === 'true';
        if (alreadyRedirected) {
          setIsDonationReturned(true);
        }
      }
    }
  }, [reset, setValue]);

  // 4. Save draft to local storage on change
  useEffect(() => {
    if (watchedFields && Object.keys(watchedFields).length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(watchedFields));
    }
  }, [watchedFields]);

  // 5. Handle Donation Redirect logic
  const wantsToDonateValue = watchedFields.wantsToDonate;
  const [isRedirectingToDonate, setIsRedirectingToDonate] = useState(false);
  useEffect(() => {
    if (wantsToDonateValue === 'Yes') {
      const alreadyRedirected = localStorage.getItem(REDIRECT_FLAG_KEY);
      if (!alreadyRedirected) {
        setIsRedirectingToDonate(true);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(getValues()));

        const timer = setTimeout(() => {
          localStorage.setItem(REDIRECT_FLAG_KEY, 'true');
          const origin = window.location.origin;
          const returnUrl = encodeURIComponent(`${origin}/?donation=success`);
          const targetUrl = `${DONATION_URL}&redirect_url=${returnUrl}&return_url=${returnUrl}&return=${returnUrl}`;
          window.location.href = targetUrl;
        }, 1800);
        return () => clearTimeout(timer);
      }
    } else if (wantsToDonateValue === 'No') {
      localStorage.removeItem(REDIRECT_FLAG_KEY);
      setIsRedirectingToDonate(false);
      setIsDonationReturned(false);
    }
  }, [wantsToDonateValue, getValues]);

  // 6. Click outside handler to close custom dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (areaDropdownRef.current && !areaDropdownRef.current.contains(event.target as Node)) {
        setShowAreaDropdown(false);
      }
      if (occupationDropdownRef.current && !occupationDropdownRef.current.contains(event.target as Node)) {
        setShowOccupationDropdown(false);
      }
      if (companyCollegeDropdownRef.current && !companyCollegeDropdownRef.current.contains(event.target as Node)) {
        setShowCompanyCollegeDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAreas = ALLOWED_AREAS.filter((area) =>
    area.toLowerCase().includes(areaSearch.toLowerCase())
  );

  const filteredOccupations = OCCUPATION_SUGGESTIONS.filter((occ) =>
    occ.toLowerCase().includes(occupationSearch.toLowerCase())
  );

  const filteredCompanyColleges = COMPANY_COLLEGE_SUGGESTIONS.filter((col) =>
    col.toLowerCase().includes(companyCollegeSearch.toLowerCase())
  );

  // Form completion progress calculations
  const calculateProgress = () => {
    const values = getValues();
    let totalFields = 9;
    let completedFields = 0;

    if (values.fullName) completedFields++;
    if (values.phone && values.phone.length === 10) completedFields++;
    if (values.age) completedFields++;
    if (values.gender) {
      completedFields++;
      if (values.gender === 'Male') {
        totalFields++;
        if (values.areaOfStay) completedFields++;
      }
    }
    if (values.occupation) completedFields++;
    if (values.companyCollege) completedFields++;
    if (values.skills && values.skills.length > 0) completedFields++;
    if (values.interestedToDinner) completedFields++;
    if (values.wantsToDonate) completedFields++;
    if (values.interestedToVolunteer) {
      completedFields++;
      if (values.interestedToVolunteer === 'Yes') {
        totalFields++;
        if (values.volunteerSlotId) completedFields++;
      }
    }

    return Math.min(Math.round((completedFields / totalFields) * 100), 100);
  };

  const progress = calculateProgress();

  // 7. Submit Handler
  const onSubmit = async (data: RegistrationSchemaInput) => {
    if (!data.occupation || data.occupation.trim() === '') {
      setError('occupation', { type: 'manual', message: 'Occupation is required' });
      setIsSubmitting(false);
      return;
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      setSubmissionError(
        "You are currently offline.\nYour information is saved locally.\nReconnect to the internet and submit."
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const payload = {
        ...data,
        festival: 'Krishnashtami',
        eventYear: 2026,
      };

      const response = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Registration failed');
      }

      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#a78bfa', '#8b5cf6', '#ec4899', '#3b82f6'],
      });

      const selectedSlot = slots.find((s) => s.id === data.volunteerSlotId);
      sessionStorage.setItem('krishnashtami_last_registration', JSON.stringify({
        interestedToVolunteer: data.interestedToVolunteer,
        volunteerSlotTime: selectedSlot?.slot_time || data.volunteerSlotTime || '',
        prasadamSelections: data.prasadamSelections || [],
        gender: data.gender
      }));

      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem(REDIRECT_FLAG_KEY);

      setTimeout(() => {
        router.push('/success');
      }, 1000);

    } catch (err) {
      console.error('Submission error:', err);
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
      {/* Donation Redirection Overlay */}
      <AnimatePresence>
        {isRedirectingToDonate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b66a5] text-center p-4 pb-[env(safe-area-inset-bottom,16px)]"
          >
            <div className="w-full max-w-sm flex flex-col items-center px-4">
              <div className="mb-4 relative w-[160px] h-[103px] sm:w-[200px] sm:h-[129px] overflow-hidden shrink-0">
                <Image
                  src="/hkm-logo.png"
                  alt="Hare Krishna Movement"
                  width={200}
                  height={129}
                  priority
                  className="object-contain animate-pulse"
                />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mb-2 tracking-wide">
                Redirecting to Secure Donation Portal...
              </h2>
              <p className="text-white/90 text-sm mb-5 max-w-xs">
                Thank you for supporting Krishnashtami 2026.
              </p>
              <div className="relative w-12 h-12 mb-5 shrink-0">
                <div className="absolute inset-0 rounded-full border-4 border-white/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-[#f1a817] animate-spin" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setValue('wantsToDonate', 'No');
                  setIsRedirectingToDonate(false);
                  setIsDonationReturned(false);
                }}
                className="w-full max-w-xs min-h-[44px] px-6 py-3 rounded-xl border border-white/30 text-white hover:bg-white/10 text-sm font-semibold transition-all cursor-pointer"
              >
                Cancel Redirect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submitting Overlay */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b66a5] text-center p-6"
          >
            <div className="relative max-w-sm flex flex-col items-center p-8 bg-[#0b66a5] rounded-3xl">
              <div className="mb-6 relative w-[200px] h-[129px] overflow-hidden">
                <Image
                  src="/hkm-logo.png"
                  alt="Hare Krishna Movement"
                  width={200}
                  height={129}
                  priority
                  className="object-contain animate-pulse"
                />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 tracking-wide">
                Submitting your registration...
              </h2>
              <p className="text-white/90 text-sm mb-6 max-w-xs">
                Please wait...
              </p>
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-white/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-[#f1a817] animate-spin" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass-card rounded-3xl p-4 sm:p-8 relative overflow-hidden">
        {/* Decorative Top Glow */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
            <span>Profile Completion</span>
            <span className="font-semibold text-purple-400">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Hero Section Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/50 border border-purple-500/20 text-purple-300 text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Volunteer Registration
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            Krishnashtami 2026
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Join the grand celebrations of Krishnashtami on <span className="font-bold text-yellow-400">04-September-2026</span>.
          </p>
        </div>

        {/* Error Alert Box */}
        {submissionError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex gap-3 text-red-200 text-sm"
          >
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="font-semibold">Submission Failed</p>
              <p className="text-red-300/90 mt-0.5">{submissionError}</p>
            </div>
          </motion.div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* --- SECTION 1: PERSONAL DETAILS --- */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
              1. Personal Details
            </h3>

            {/* Name Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <User className="w-5 h-5" />
              </span>
              <input
                type="text"
                {...register('fullName')}
                placeholder="Full Name *"
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                aria-invalid={errors.fullName ? 'true' : 'false'}
              />
              {errors.fullName && (
                <p className="text-red-400 text-xs mt-1 pl-1">{errors.fullName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone Input */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Phone className="w-5 h-5" />
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  {...register('phone')}
                  placeholder="Phone Number (10 digits) *"
                  className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                  aria-invalid={errors.phone ? 'true' : 'false'}
                />
                {errors.phone && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.phone.message}</p>
                )}
              </div>

              {/* Age Input */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Award className="w-5 h-5" />
                </span>
                <input
                  type="number"
                  {...register('age')}
                  placeholder="Age *"
                  className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                  aria-invalid={errors.age ? 'true' : 'false'}
                />
                {errors.age && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.age.message}</p>
                )}
              </div>
            </div>

            {/* Gender & Occupation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <select
                  {...register('gender')}
                  onChange={(e) => {
                    const val = e.target.value as 'Male' | 'Female';
                    setValue('gender', val);
                    if (val !== 'Male') {
                      setValue('pgName', '');
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl glass-input text-white text-base appearance-none cursor-pointer"
                  aria-invalid={errors.gender ? 'true' : 'false'}
                  defaultValue=""
                >
                  <option value="" disabled className="bg-slate-950 text-slate-500">Select Gender *</option>
                  <option value="Male" className="bg-slate-950 text-white">Male</option>
                  <option value="Female" className="bg-slate-950 text-white">Female</option>
                </select>
                <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-500">
                  <ChevronDown className="w-5 h-5" />
                </span>
                {errors.gender && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.gender.message}</p>
                )}
              </div>

              {/* Occupation */}
              <div className="relative" ref={occupationDropdownRef}>
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Briefcase className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  value={occupationSearch}
                  placeholder="Search/Select Occupation *"
                  onFocus={() => setShowOccupationDropdown(true)}
                  onChange={(e) => {
                    const typed = e.target.value;
                    setOccupationSearch(typed);
                    setValue('occupation', typed);
                    setShowOccupationDropdown(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      const match = OCCUPATION_SUGGESTIONS.find(o => o.toLowerCase() === occupationSearch.trim().toLowerCase());
                      if (match) {
                        setOccupationSearch(match);
                        setValue('occupation', match);
                      } else {
                        setValue('occupation', occupationSearch);
                      }
                      trigger('occupation');
                    }, 200);
                  }}
                  className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                  aria-invalid={errors.occupation ? 'true' : 'false'}
                />
                {showOccupationDropdown && (
                  <div className="absolute z-10 w-full mt-1.5 max-h-52 overflow-y-auto rounded-xl bg-slate-900 border border-slate-800 shadow-2xl">
                    {filteredOccupations.length > 0 ? (
                      filteredOccupations.map((occ) => (
                        <button
                          key={occ}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setValue('occupation', occ);
                            setOccupationSearch(occ);
                            setShowOccupationDropdown(false);
                            trigger('occupation');
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-purple-950/60 text-sm text-slate-200 transition-colors"
                        >
                          {occ}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2.5 text-sm text-slate-500">
                        Type to enter custom occupation.
                      </div>
                    )}
                  </div>
                )}
                {errors.occupation && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.occupation.message}</p>
                )}
              </div>
            </div>

            {/* Select Standard (Required & Visible ONLY when Occupation is Student) */}
            {watchedFields.occupation === 'Student' && (
              <div className="relative">
                <select
                  {...register('standard')}
                  onChange={(e) => {
                    const val = e.target.value as '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
                    setValue('standard', val);
                    trigger('standard');
                  }}
                  className="w-full px-4 py-3 rounded-xl glass-input text-white text-base appearance-none cursor-pointer"
                  aria-invalid={errors.standard ? 'true' : 'false'}
                  defaultValue=""
                  value={watchedFields.standard || ''}
                >
                  <option value="" disabled className="bg-slate-950 text-slate-500">Select Standard *</option>
                  <option value="1st Year" className="bg-slate-950 text-white">1st Year</option>
                  <option value="2nd Year" className="bg-slate-950 text-white">2nd Year</option>
                  <option value="3rd Year" className="bg-slate-950 text-white">3rd Year</option>
                  <option value="4th Year" className="bg-slate-950 text-white">4th Year</option>
                </select>
                <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-500">
                  <ChevronDown className="w-5 h-5" />
                </span>
                {errors.standard && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.standard.message}</p>
                )}
              </div>
            )}

            {/* Area of Stay with Geoapify Autocomplete */}
            <div className="grid grid-cols-1 gap-4">
              <div className="relative" ref={areaDropdownRef}>
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Search className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  value={areaSearch}
                  placeholder={watchedFields.gender === 'Male' ? "Search Area of Stay / Location *" : "Search Area of Stay / Location"}
                  onFocus={() => {
                    setShowAreaDropdown(true);
                  }}
                  onChange={(e) => {
                    const typed = e.target.value;
                    setAreaSearch(typed);
                    setValue('areaOfStay', typed);
                    setShowAreaDropdown(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      const match = ALLOWED_AREAS.find(a => a.toLowerCase() === areaSearch.trim().toLowerCase());
                      if (match) {
                        setAreaSearch(match);
                        setValue('areaOfStay', match);
                      } else {
                        setValue('areaOfStay', areaSearch);
                      }
                      trigger('areaOfStay');
                    }, 200);
                  }}
                  className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                  aria-invalid={errors.areaOfStay ? 'true' : 'false'}
                />
                {showAreaDropdown && (
                  <div className="absolute z-30 w-full mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-slate-900 border border-slate-800 shadow-2xl divide-y divide-slate-800/50">
                    {/* Inline Loading Indicator */}
                    {isLoadingAreaSuggestions && (
                      <div className="px-4 py-2.5 text-xs text-purple-400 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                        <span>Searching locations...</span>
                      </div>
                    )}

                    {/* Geoapify Location Autocomplete Results */}
                    {locationSuggestions.length > 0 && (
                      <div className="py-1">
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-400/90 bg-purple-950/30">
                          Location Suggestions
                        </div>
                        {locationSuggestions.map((place) => (
                          <button
                            key={place.place_id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setValue('areaOfStay', place.description);
                              setAreaSearch(place.description);
                              setShowAreaDropdown(false);
                              trigger('areaOfStay');
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-purple-950/60 text-sm text-slate-200 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <MapPin className="w-4 h-4 text-purple-400 shrink-0" />
                            <span className="truncate">{place.description}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Quick / Predefined Popular Areas */}
                    {filteredAreas.length > 0 && (
                      <div className="py-1">
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-950/50">
                          Popular Areas
                        </div>
                        {filteredAreas.map((area) => (
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
                            className="w-full text-left px-4 py-2.5 hover:bg-purple-950/60 text-sm text-slate-200 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{area}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {!isLoadingAreaSuggestions && locationSuggestions.length === 0 && filteredAreas.length === 0 && (
                      <div className="px-4 py-3 text-xs text-slate-500">
                        Type to enter custom location address.
                      </div>
                    )}
                  </div>
                )}
                {errors.areaOfStay && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.areaOfStay.message}</p>
                )}
              </div>
            </div>

            {/* College/Company & PG Name Grid */}
            <div className={watchedFields.gender === 'Male' ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}>
              {watchedFields.gender === 'Male' && (
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <HomeIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    {...register('pgName')}
                    placeholder="PG Name (optional)"
                    className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                  />
                </div>
              )}

              {/* College / Company Combobox (Autocomplete + Manual Custom Entry) */}
              <div className="relative" ref={companyCollegeDropdownRef}>
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                  <Building className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  value={companyCollegeSearch}
                  placeholder="Select or Type College / Company *"
                  onFocus={() => setShowCompanyCollegeDropdown(true)}
                  onChange={(e) => {
                    const typed = e.target.value;
                    setCompanyCollegeSearch(typed);
                    setValue('companyCollege', typed);
                    setShowCompanyCollegeDropdown(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      const match = COMPANY_COLLEGE_SUGGESTIONS.find(c => c.toLowerCase() === companyCollegeSearch.trim().toLowerCase());
                      if (match) {
                        setCompanyCollegeSearch(match);
                        setValue('companyCollege', match);
                      } else {
                        setValue('companyCollege', companyCollegeSearch);
                      }
                      trigger('companyCollege');
                    }, 200);
                  }}
                  className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                  aria-invalid={errors.companyCollege ? 'true' : 'false'}
                />
                {showCompanyCollegeDropdown && (
                  <div className="absolute z-20 w-full mt-1.5 max-h-52 overflow-y-auto rounded-xl bg-slate-900 border border-slate-800 shadow-2xl">
                    {filteredCompanyColleges.length > 0 ? (
                      filteredCompanyColleges.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setValue('companyCollege', col);
                            setCompanyCollegeSearch(col);
                            setShowCompanyCollegeDropdown(false);
                            trigger('companyCollege');
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-purple-950/60 text-sm text-slate-200 transition-colors flex items-center gap-2"
                        >
                          <Building className="w-4 h-4 text-purple-400 shrink-0" />
                          <span>{col}</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2.5 text-sm text-slate-500">
                        Type to enter custom College / Company.
                      </div>
                    )}
                  </div>
                )}
                {errors.companyCollege && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.companyCollege.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* --- SECTION 2: SKILLS --- */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
              2. SKILLS & CAPABILITIES (optional)
            </h3>
            <p className="text-xs text-slate-400 -mt-2">
              Please let us know, if you are blessed with any of the below skills
            </p>

            {isLoadingSkills ? (
              <div className="grid grid-cols-2 gap-3.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3.5">
                {skills.map((skill) => (
                  <label
                    key={skill.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm font-medium cursor-pointer transition-all ${(watchedFields.skills || []).includes(skill.id)
                      ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                      : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                  >
                    <input
                      type="checkbox"
                      value={skill.id}
                      className="sr-only"
                      {...register('skills')}
                    />
                    <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${(watchedFields.skills || []).includes(skill.id)
                      ? 'border-purple-400 bg-purple-500 text-slate-950'
                      : 'border-slate-700'
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
            {errors.skills && (
              <p className="text-red-400 text-xs mt-1 pl-1">{errors.skills.message}</p>
            )}
          </div>

          {/* --- SECTION 3: VOLUNTEERING --- */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
              3. Volunteer Schedule
            </h3>

            <div className="space-y-3">
              <span className="text-sm text-slate-300">Are you interested to Volunteer? *</span>
              <div className="flex gap-4">
                {['Yes', 'No'].map((opt) => (
                  <label
                    key={opt}
                    className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl border font-semibold text-base cursor-pointer transition-all ${watchedFields.interestedToVolunteer === opt
                      ? 'bg-purple-950/40 border-purple-500/50 text-white'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400'
                      }`}
                  >
                    <input
                      type="radio"
                      value={opt}
                      className="sr-only"
                      {...register('interestedToVolunteer')}
                      onChange={() => {
                        setValue('interestedToVolunteer', opt as 'Yes' | 'No');
                        if (opt === 'No') {
                          setValue('volunteerSlotId', '');
                          setValue('volunteerSlotTime', '');
                        } else if (opt === 'Yes') {
                          if (getValues('interestedToDinner') === 'Yes' && getValues('volunteerSlotTime')) {
                            const valid = filterValidSelectionsForSlot(
                              getValues('volunteerSlotTime'),
                              (getValues('prasadamSelections') as unknown as string[]) || []
                            );
                            setValue('prasadamSelections', valid as ('Breakfast' | 'Lunch' | 'Dinner')[]);
                          }
                        }
                        trigger('prasadamSelections');
                      }}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {errors.interestedToVolunteer && (
                <p className="text-red-400 text-xs mt-1">{errors.interestedToVolunteer.message}</p>
              )}
            </div>

            {/* Time Slot selection — shown ONLY when Volunteer=Yes */}
            <AnimatePresence>
              {watchedFields.interestedToVolunteer === 'Yes' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  <label className="text-sm text-slate-300 block">
                    Available Time Slots (Select One) *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {slots.map((slot) => (
                      <label
                        key={slot.id}
                        className={`flex flex-col p-3 rounded-xl border text-sm font-medium cursor-pointer transition-all ${watchedFields.volunteerSlotId === slot.id
                          ? 'bg-purple-950/40 border-purple-500/50 text-white'
                          : 'bg-slate-950/30 border-slate-900 text-slate-400 hover:border-slate-800 hover:text-white'
                          }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            value={slot.id}
                            className="sr-only"
                            {...register('volunteerSlotId')}
                            onChange={() => {
                              setValue('volunteerSlotId', slot.id);
                              setValue('volunteerSlotTime', slot.slot_time);
                              // On slot change: remove stale prasadam selections not valid for new slot
                              const validSelections = filterValidSelectionsForSlot(
                                slot.slot_time,
                                (getValues('prasadamSelections') as unknown as string[]) ?? []
                              );
                              setValue('prasadamSelections', validSelections as ('Breakfast' | 'Lunch' | 'Dinner')[]);
                              trigger('prasadamSelections');
                            }}
                          />
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${watchedFields.volunteerSlotId === slot.id
                            ? 'border-purple-400 bg-purple-500'
                            : 'border-slate-800'
                            }`}>
                            {watchedFields.volunteerSlotId === slot.id && (
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                            )}
                          </div>
                          <span className="font-semibold text-white">{slot.slot_time}</span>
                        </div>
                        {/* Fasting Information Subtitle under EVERY slot option */}
                        <span className="text-[10px] text-amber-400/90 font-normal leading-tight mt-1.5 pl-6">
                          {FASTING_SUBTITLE_TEXT}
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.volunteerSlotId && (
                    <p className="text-red-400 text-xs mt-1">{errors.volunteerSlotId.message}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* --- SECTION 4: PRASADAM --- */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
              4. Prasadam
            </h3>
            <span className="text-sm text-slate-300 block">Interested to take Prasadam? *</span>
            <div className="flex gap-4">
              {['Yes', 'No'].map((opt) => (
                <label
                  key={opt}
                  className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl border font-semibold text-base cursor-pointer transition-all ${watchedFields.interestedToDinner === opt
                    ? 'bg-purple-950/40 border-purple-500/50 text-white'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400'
                    }`}
                >
                  <input
                    type="radio"
                    value={opt}
                    className="sr-only"
                    {...register('interestedToDinner')}
                    onChange={() => {
                      setValue('interestedToDinner', opt as 'Yes' | 'No');
                      if (opt === 'No') {
                        setValue('prasadamSelections', []);
                      } else if (opt === 'Yes' && watchedFields.interestedToVolunteer === 'Yes' && watchedFields.volunteerSlotTime) {
                        const valid = filterValidSelectionsForSlot(
                          watchedFields.volunteerSlotTime,
                          (getValues('prasadamSelections') as unknown as string[]) || []
                        );
                        setValue('prasadamSelections', valid as ('Breakfast' | 'Lunch' | 'Dinner')[]);
                      }
                      trigger('prasadamSelections');
                    }}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {errors.interestedToDinner && (
              <p className="text-red-400 text-xs mt-1">{errors.interestedToDinner.message}</p>
            )}

            {/* Prasadam Selection (multi-select checkboxes, based on time slot) */}
            <AnimatePresence>
              {watchedFields.interestedToDinner === 'Yes' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2.5 pt-2 overflow-hidden"
                >
                  <span className="text-xs text-slate-300 block font-medium">Select Prasadam Option(s) *</span>
                  {allowedPrasadamOptions.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {allowedPrasadamOptions.map((opt) => {
                        const isSelected = currentPrasadamSelections.includes(opt);
                        return (
                          <label
                            key={opt}
                            className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${isSelected
                              ? 'bg-purple-950/40 border-purple-500/50 text-white'
                              : 'bg-slate-950/30 border-slate-900 text-slate-400 hover:border-slate-800 hover:text-white'
                              }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={isSelected}
                              onChange={() => togglePrasadamSelection(opt)}
                            />
                            <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${isSelected ? 'border-purple-400 bg-purple-500' : 'border-slate-700'}`}>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3] text-slate-950" />}
                            </div>
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/30 p-3 rounded-xl">
                      Please select a time slot above to view available prasadam options.
                    </p>
                  )}
                  {errors.prasadamSelections && (
                    <p className="text-red-400 text-xs mt-1">{String(errors.prasadamSelections.message)}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* --- SECTION 5: DONATION --- */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
              5. Donation Contribution
            </h3>
            <div className="pt-1">
              <span className="text-xs text-slate-400 block mb-3 font-semibold uppercase tracking-wider">Anna-Daan Seva Amount</span>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {(watchedFields.occupation === 'Student'
                  ? [
                    { count: '2 People', amount: '₹116', desc: 'Prasadam Sponsorship' },
                    { count: '4 People', amount: '₹216', desc: 'Prasadam Sponsorship' },
                    { count: '10 People', amount: '₹516', desc: 'Festival Seva' },
                    { count: '20 People', amount: '₹1,016', desc: 'Grand Festival Seva' },
                  ]
                  : [
                    { count: '10 People', amount: '₹516', desc: 'Prasadam Sponsorship' },
                    { count: '20 People', amount: '₹1,016', desc: 'Prasadam Sponsorship' },
                    { count: '50 People', amount: '₹2,516', desc: 'Festival Seva' },
                    { count: '100 People', amount: '₹5,016', desc: 'Grand Festival Seva' },
                  ]
                ).map((card, i) => (
                  <div
                    key={i}
                    className="glass-card p-3 rounded-xl flex flex-col justify-between border border-purple-500/10 bg-purple-950/10 relative overflow-hidden pointer-events-none min-h-[90px]"
                  >
                    <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-purple-500/60 animate-pulse" />
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">{card.count}</span>
                      <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 block mt-1.5">{card.amount}</span>
                    </div>
                    <span className="text-[9px] text-slate-500 font-medium block mt-1">{card.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <span className="text-sm text-slate-300 block">Would you like to Donate? *</span>
            <div className="flex gap-4">
              {['Yes', 'No'].map((opt) => (
                <label
                  key={opt}
                  className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl border font-semibold text-base cursor-pointer transition-all ${watchedFields.wantsToDonate === opt
                    ? 'bg-purple-950/40 border-purple-500/50 text-white'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400'
                    }`}
                >
                  <input
                    type="radio"
                    value={opt}
                    className="sr-only"
                    {...register('wantsToDonate')}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {errors.wantsToDonate && (
              <p className="text-red-400 text-xs mt-1">{errors.wantsToDonate.message}</p>
            )}

            {watchedFields.wantsToDonate === 'Yes' && (
              isDonationReturned ? (
                <div className="p-3.5 bg-green-950/30 border border-green-500/30 rounded-xl flex flex-col gap-2 text-xs text-green-200 transition-colors mt-3">
                  <div className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <p className="font-semibold text-green-300">Welcome Back!</p>
                      <p className="mt-0.5 text-slate-300">
                        Your details have been successfully restored. If you have completed your donation, please click <strong>Submit Registration</strong> below to complete your volunteer registration.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem(REDIRECT_FLAG_KEY);
                      setValue('wantsToDonate', 'No');
                      setTimeout(() => setValue('wantsToDonate', 'Yes'), 50);
                    }}
                    className="self-start text-[10px] text-purple-400 hover:text-purple-300 font-semibold underline underline-offset-2 transition-colors cursor-pointer mt-1"
                  >
                    Did the donation portal fail to load? Click here to retry redirect.
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl flex gap-2 text-xs text-indigo-200 mt-3">
                  <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <p>
                    You will be redirected to the secure donation portal. Rest assured, your registration details are saved and you will resume here upon completion.
                  </p>
                </div>
              )
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all transform active:scale-[0.98] ${isValid
                ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:opacity-95 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] cursor-pointer'
                : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed'
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
