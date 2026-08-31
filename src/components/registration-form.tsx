'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import {
  User, Phone, CheckCircle2,
  ChevronDown, ShieldAlert, Sparkles, Loader2, Home, Star, Laptop, GraduationCap
} from 'lucide-react';
import { feedbackSchema, FeedbackSchemaInput } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const LOCAL_STORAGE_KEY = 'feedback_registration_draft';

export default function RegistrationForm() {
  const router = useRouter();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    getValues,
    watch,
    formState: { errors, isValid },
    reset,
  } = useForm<FeedbackSchemaInput>({
    resolver: zodResolver(feedbackSchema),
    mode: 'onChange',
    defaultValues: {
      fullName: '',
      phone: '',
      collegeName: '',
      customCollegeName: '',
      branch: '',
      gender: undefined,
      currentStay: undefined,
      skills: [],
      feedback: undefined,
      interestedOnlineWork: undefined,
    } as unknown as FeedbackSchemaInput,
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const watchedFields = watch();

  const [isDuplicatePhone, setIsDuplicatePhone] = useState(false);
  const phoneValue = watchedFields.phone;

  useEffect(() => {
    const digits = (phoneValue || '').replace(/\D/g, '').slice(-10);
    if (digits.length === 10) {
      const timer = setTimeout(() => {
        fetch(`/api/feedback/check?phone=${digits}`)
          .then((res) => res.json())
          .then((data) => {
            setIsDuplicatePhone(Boolean(data.exists));
          })
          .catch(() => setIsDuplicatePhone(false));
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setIsDuplicatePhone(false);
    }
  }, [phoneValue]);

  // Load draft from local storage or reset if reset=true
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === 'true') {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        setIsDuplicatePhone(false);
        setSubmissionError(null);
        reset({
          fullName: '',
          phone: '',
          collegeName: '',
          customCollegeName: '',
          branch: '',
          gender: undefined,
          currentStay: undefined,
          skills: [],
          feedback: undefined,
          interestedOnlineWork: undefined,
        } as unknown as FeedbackSchemaInput);
        return;
      }
      const savedDraft = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          reset(parsed);
        } catch (e) {
          console.error('Failed to parse draft feedback registration', e);
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

  // Completion progress calculation across the 8 mandatory required fields
  const calculateProgress = () => {
    const values = getValues();
    let completed = 0;
    const total = 8;

    if (values.fullName && values.fullName.trim().length >= 2) completed++;
    if (values.phone && values.phone.length === 10) completed++;
    if (values.collegeName) {
      if (values.collegeName === 'Other') {
        if (values.customCollegeName && values.customCollegeName.trim().length >= 2) completed++;
      } else {
        completed++;
      }
    }
    if (values.branch) completed++;
    if (values.gender) completed++;
    if (values.currentStay) completed++;
    if (values.feedback) completed++;
    if (values.interestedOnlineWork) completed++;

    return Math.min(Math.round((completed / total) * 100), 100);
  };

  const progress = calculateProgress();

  // Submit Handler
  const onSubmit = async (data: FeedbackSchemaInput) => {
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
      ? data.customCollegeName?.trim() || ''
      : data.collegeName.trim();

    const payload = {
      ...data,
      collegeName: finalCollegeName,
    };
    delete payload.customCollegeName;

    try {
      const response = await fetch('/api/feedback', {
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
        colors: ['#a78bfa', '#8b5cf6', '#ec4899', '#3b82f6'],
      });

      localStorage.removeItem(LOCAL_STORAGE_KEY);

      setTimeout(() => {
        router.push('/success?type=feedback');
      }, 800);

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
            <span>Form Completion</span>
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

        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/50 border border-purple-500/20 text-purple-300 text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Feedback & Registration
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            Feedback Registration
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Please fill in your details and feedback below.
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
              <p className="text-red-300/90 mt-0.5 whitespace-pre-line">{submissionError}</p>
            </div>
          </motion.div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* --- SECTION 1: PERSONAL & ACADEMIC DETAILS --- */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
              1. Personal & Academic Details
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
                  placeholder="Mobile Number (10 digits) *"
                  className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                  aria-invalid={errors.phone || isDuplicatePhone ? 'true' : 'false'}
                />
                {errors.phone && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.phone.message}</p>
                )}
                {isDuplicatePhone && (
                  <p className="text-red-400 text-xs mt-1 pl-1 font-bold">
                    This mobile number has already been registered.
                  </p>
                )}
              </div>

              {/* Gender Dropdown */}
              <div className="relative">
                <select
                  {...register('gender')}
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
            </div>

            {/* College & Branch Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* College Name Dropdown */}
              <div className="relative">
                <select
                  {...register('collegeName')}
                  className="w-full px-4 py-3 rounded-xl glass-input text-white text-base appearance-none cursor-pointer"
                  aria-invalid={errors.collegeName ? 'true' : 'false'}
                  defaultValue=""
                >
                  <option value="" disabled className="bg-slate-950 text-slate-500">Select College *</option>
                  <option value="CBIT" className="bg-slate-950 text-white">CBIT</option>
                  <option value="MGIT" className="bg-slate-950 text-white">MGIT</option>
                  <option value="VASV" className="bg-slate-950 text-white">VASV</option>
                  <option value="JBIT" className="bg-slate-950 text-white">JBIT</option>
                  <option value="VJIT" className="bg-slate-950 text-white">VJIT</option>
                  <option value="VBIT" className="bg-slate-950 text-white">VBIT</option>
                  <option value="NIAT" className="bg-slate-950 text-white">NIAT</option>
                  <option value="Other" className="bg-slate-950 text-white">Other / Enter College Name</option>
                </select>
                <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-500">
                  <ChevronDown className="w-5 h-5" />
                </span>
                {errors.collegeName && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.collegeName.message}</p>
                )}
              </div>

              {/* Branch Dropdown */}
              <div className="relative">
                <select
                  {...register('branch')}
                  className="w-full px-4 py-3 rounded-xl glass-input text-white text-base appearance-none cursor-pointer"
                  aria-invalid={errors.branch ? 'true' : 'false'}
                  defaultValue=""
                >
                  <option value="" disabled className="bg-slate-950 text-slate-500">Select Branch *</option>
                  <option value="CSE" className="bg-slate-950 text-white">CSE</option>
                  <option value="ECE" className="bg-slate-950 text-white">ECE</option>
                  <option value="EEE" className="bg-slate-950 text-white">EEE</option>
                  <option value="Mechanical" className="bg-slate-950 text-white">Mechanical</option>
                  <option value="Civil" className="bg-slate-950 text-white">Civil</option>
                </select>
                <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-500">
                  <ChevronDown className="w-5 h-5" />
                </span>
                {errors.branch && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.branch.message}</p>
                )}
              </div>
            </div>

            {/* Manual College Name Input (when Other is selected) */}
            {watchedFields.collegeName === 'Other' && (
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <GraduationCap className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  {...register('customCollegeName')}
                  placeholder="Enter College Name *"
                  className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-white text-base placeholder-slate-500"
                  aria-invalid={errors.customCollegeName ? 'true' : 'false'}
                />
                {errors.customCollegeName && (
                  <p className="text-red-400 text-xs mt-1 pl-1">{errors.customCollegeName.message}</p>
                )}
              </div>
            )}

            {/* Current Stay (Mandatory - With Parents / In Hostel) */}
            <div className="space-y-2 pt-1">
              <span className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                <Home className="w-4 h-4 text-purple-400" /> Current Stay *
              </span>
              <div className="grid grid-cols-2 gap-3">
                {['With Parents', 'In Hostel'].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border font-semibold text-sm cursor-pointer transition-all ${watchedFields.currentStay === opt
                      ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                      }`}
                  >
                    <input
                      type="radio"
                      value={opt}
                      className="sr-only"
                      {...register('currentStay')}
                    />
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${watchedFields.currentStay === opt
                      ? 'border-purple-400 bg-purple-500'
                      : 'border-slate-800'
                      }`}>
                      {watchedFields.currentStay === opt && (
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                      )}
                    </div>
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {errors.currentStay && (
                <p className="text-red-400 text-xs mt-1 pl-1">{errors.currentStay.message}</p>
              )}
            </div>
          </div>

          {/* --- SECTION 2: SKILLS --- */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
              2. Skills & Interests (Optional)
            </h3>
            <p className="text-xs text-slate-400 -mt-2">
              Select one or more skills you are proficient in:
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

          {/* --- SECTION 3: FEEDBACK & WORK INTEREST --- */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
              3. Feedback & Online Workshop
            </h3>

            {/* Feedback Rating */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-400" /> Overall Feedback *
              </span>
              <div className="grid grid-cols-3 gap-3">
                {['Excellent', 'Good', 'Not Applicable'].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border font-semibold text-xs sm:text-sm cursor-pointer transition-all ${watchedFields.feedback === opt
                      ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                      }`}
                  >
                    <input
                      type="radio"
                      value={opt}
                      className="sr-only"
                      {...register('feedback')}
                    />
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border shrink-0 ${watchedFields.feedback === opt
                      ? 'border-purple-400 bg-purple-500'
                      : 'border-slate-800'
                      }`}>
                      {watchedFields.feedback === opt && (
                        <div className="w-1 h-1 rounded-full bg-slate-950" />
                      )}
                    </div>
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {errors.feedback && (
                <p className="text-red-400 text-xs mt-1 pl-1">{errors.feedback.message}</p>
              )}
            </div>

            {/* Interested in Online Workshop */}
            <div className="space-y-2 pt-2">
              <span className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                <Laptop className="w-4 h-4 text-indigo-400" /> Interested in Online Workshop? *
              </span>
              <div className="grid grid-cols-2 gap-4">
                {['Yes', 'No'].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 py-3 rounded-xl border font-semibold text-base cursor-pointer transition-all ${watchedFields.interestedOnlineWork === opt
                      ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
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
                <p className="text-red-400 text-xs mt-1 pl-1">{errors.interestedOnlineWork.message}</p>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting || isDuplicatePhone}
              className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all transform active:scale-[0.98] ${isValid && !isDuplicatePhone
                ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:opacity-95 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] cursor-pointer'
                : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed'
                }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2.5">
                  <Loader2 className="w-5 h-5 animate-spin" /> Submitting Response...
                </span>
              ) : (
                'Submit Response'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
