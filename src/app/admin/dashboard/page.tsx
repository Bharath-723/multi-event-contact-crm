'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Registration, VolunteerSlot } from '@/lib/types';
import { 
  Users, Heart, Soup, Clock, Loader2, X, Phone, 
  User, CheckCircle, ExternalLink, Calendar, Building, Briefcase
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate } from '@/lib/utils';
import Image from 'next/image';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts';

// Dynamically import Recharts to avoid SSR hydration mismatches
const DashboardCharts = dynamic(() => import('@/components/dashboard-charts'), {
  ssr: false,
  loading: () => (
    <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
      <Loader2 className="w-6 h-6 animate-spin text-purple-500 mr-2" />
      <span>Loading visualizations...</span>
    </div>
  ),
});

const PURPLE_COLORS = ['#8b5cf6', '#6366f1', '#ec4899', '#3b82f6', '#14b8a6', '#f59e0b'];

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const [activeModal, setActiveModal] = useState<'total' | 'donors' | 'prasadam' | 'volunteers' | 'todays' | 'occupation' | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('SUBSCRIBED');

  // 1. Query all registrations with joint data
  const { data: registrations = [], isLoading: isLoadingRegs } = useQuery<Registration[]>({
    queryKey: ['registrations-summary'],
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

      // Parse skills from joining data structure to plain list
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

  // 2. Query volunteer slots to handle grouping references
  const { data: slots = [] } = useQuery<VolunteerSlot[]>({
    queryKey: ['volunteer-slots-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_slots')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Set up Supabase Realtime subscription to invalidate query keys on new submissions
  useEffect(() => {
    const channel = supabase
      .channel('dashboard_realtime_refetch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations' },
        () => {
          // Trigger a query refetch to update all statistics and listings
          queryClient.invalidateQueries({ queryKey: ['registrations-summary'] });
        }
      )
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // --- STATS CALCULATIONS (Client-Side Aggregation for Speed & Consistency) ---
  const totalCount = registrations.length;
  
  const donorsList = registrations.filter(r => r.wants_to_donate);
  const donorsCount = donorsList.length;

  const dinnerList = registrations.filter(r => r.interested_to_dinner);
  const dinnerCount = dinnerList.length;

  const volunteersList = registrations.filter(r => r.interested_to_volunteer);
  const volunteersCount = volunteersList.length;

  const todaysList = registrations.filter(r => {
    const regDate = new Date(r.created_at);
    const today = new Date();
    return regDate.getDate() === today.getDate() &&
      regDate.getMonth() === today.getMonth() &&
      regDate.getFullYear() === today.getFullYear();
  });
  const todaysCount = todaysList.length;

  const studentsCount = registrations.filter(r => r.occupation === 'Student').length;
  const employeesCount = registrations.filter(r => r.occupation === 'Employee').length;
  const othersCount = totalCount - studentsCount - employeesCount;

  // Group Volunteers by Slot for the details modal
  const volunteersBySlot = slots.map(slot => {
    const list = volunteersList.filter(v => v.volunteer_slot_id === slot.id);
    return {
      slotName: slot.slot_time,
      count: list.length,
      volunteers: list,
    };
  });

  // --- CHART DATA FORMATTING ---
  
  // A. Daily registrations (last 7 days trend)
  const getDailyTrendData = () => {
    const datesMap: Record<string, number> = {};
    // Pre-populate last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      datesMap[label] = 0;
    }

    registrations.forEach(r => {
      const label = new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (label in datesMap) {
        datesMap[label] += 1;
      }
    });

    return Object.entries(datesMap).map(([date, count]) => ({ date, count }));
  };

  // B. Skills distribution
  const getSkillsDistributionData = () => {
    const skillsMap: Record<string, number> = {
      'Singing': 0,
      'Teaching': 0,
      'Musical Instruments': 0,
      'Video Editing': 0
    };

    registrations.forEach(r => {
      r.skills?.forEach(s => {
        if (s.name in skillsMap) {
          skillsMap[s.name] += 1;
        }
      });
    });

    return Object.entries(skillsMap).map(([name, value]) => ({ name, value }));
  };

  // C. Volunteer slot allocation distribution
  const getSlotsDistributionData = () => {
    return slots.map(s => {
      const value = volunteersList.filter(v => v.volunteer_slot_id === s.id).length;
      return {
        name: s.slot_time,
        value,
      };
    });
  };

  // D. Gender ratio
  const getGenderRatioData = () => {
    const male = registrations.filter(r => r.gender === 'Male').length;
    const female = registrations.filter(r => r.gender === 'Female').length;
    return [
      { name: 'Male', value: male },
      { name: 'Female', value: female }
    ];
  };

  // E. Occupation analytics
  const getOccupationCountsList = () => {
    const counts: Record<string, number> = {};
    let othersCountSum = 0;

    registrations.forEach(r => {
      const occ = r.occupation?.trim() || '';
      if (!occ || occ === 'Other' || occ === 'Others') {
        othersCountSum++;
      } else {
        counts[occ] = (counts[occ] || 0) + 1;
      }
    });

    const predefinedList = [
      { label: 'Students', count: counts['Student'] || 0 },
      { label: 'Employees', count: counts['Employee'] || 0 },
      { label: 'Business', count: counts['Business'] || 0 },
      { label: 'Self Employed', count: counts['Self Employed'] || counts['Self Emp'] || 0 },
      { label: 'Government Employee', count: counts['Government Employee'] || 0 },
      { label: 'Professional', count: counts['Professional'] || 0 },
      { label: 'Homemaker', count: counts['Homemaker'] || 0 },
      { label: 'Retired', count: counts['Retired'] || 0 },
    ];

    const predefinedKeys = ['Student', 'Employee', 'Business', 'Self Employed', 'Self Emp', 'Government Employee', 'Professional', 'Homemaker', 'Retired'];

    const customList = Object.entries(counts)
      .filter(([key]) => !predefinedKeys.includes(key))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }));

    return [
      ...predefinedList,
      ...customList,
      { label: 'Others', count: othersCountSum }
    ];
  };

  if (isLoadingRegs) {
    return (
      <div className="space-y-8 animate-pulse">
        {/* Loading Indicator Header with HKM Logo */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-950/20 rounded-2xl border border-slate-900">
          <div className="relative w-[150px] h-[97px] overflow-hidden mb-4">
            <Image 
              src="/hkm-logo.png" 
              alt="Hare Krishna Movement" 
              width={150} 
              height={97} 
              priority
              className="object-contain"
            />
          </div>
          <div className="flex items-center gap-2 text-indigo-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-slate-400 text-sm font-semibold">Loading Dashboard...</span>
          </div>
        </div>

        {/* Skeleton cards grid (5 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass-card rounded-2xl p-5 md:p-6 relative overflow-hidden flex flex-col justify-between h-full min-h-[140px]">
              <div>
                <div className="h-3.5 w-24 bg-slate-850 rounded-full mb-3" />
                <div className="h-8 w-16 bg-slate-850 rounded-lg" />
              </div>
              <div className="h-2.5 w-28 bg-slate-850 rounded-full mt-4" />
            </div>
          ))}
        </div>

        {/* Skeleton charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-6 h-80">
            <div className="h-4 w-40 bg-slate-850 rounded-full mb-6" />
            <div className="w-full h-56 bg-slate-900/40 rounded-xl" />
          </div>
          <div className="glass-card rounded-2xl p-6 h-80">
            <div className="h-4 w-40 bg-slate-850 rounded-full mb-6" />
            <div className="w-full h-56 bg-slate-900/40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Heading Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Dashboard Overview</h1>
          <p className="text-slate-400 text-sm mt-0.5">Real-time statistics & activity logs</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-850 text-xs">
            <span className={`w-2 h-2 rounded-full ${
              realtimeStatus === 'SUBSCRIBED' 
                ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' 
                : 'bg-[#f1a817] shadow-[0_0_8px_#f1a817]'
            }`} />
            <span className="font-semibold text-slate-300">Live Updates</span>
            {realtimeStatus !== 'SUBSCRIBED' && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#f1a817]" />
            )}
          </div>
        </div>
      </div>

      {/* 1. Statistics Cards Section */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 md:gap-6">
        
        {/* Total Registrations */}
        <div 
          onClick={() => setActiveModal('total')}
          className="glass-card rounded-2xl p-3.5 md:p-6 cursor-pointer hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all group relative overflow-hidden flex flex-col justify-between h-full min-h-[105px] md:min-h-[140px]"
        >
          <div>
            <span className="text-[9px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Registrations</span>
            <span className="text-lg md:text-3xl font-extrabold text-slate-100 mt-1 md:mt-2 block">{totalCount}</span>
          </div>
          <span className="text-[9px] md:text-[10px] text-purple-600 dark:text-purple-400 font-bold mt-2 md:mt-4 flex items-center gap-1">
            Click to view list <ExternalLink className="w-3 h-3" />
          </span>
          <Users className="w-9 h-9 md:w-16 md:h-16 opacity-8 md:opacity-12 absolute right-2 top-2 text-slate-400 dark:text-slate-700 group-hover:text-purple-400/80 transition-colors" />
        </div>

        {/* Total Volunteers */}
        <div 
          onClick={() => setActiveModal('volunteers')}
          className="glass-card rounded-2xl p-3.5 md:p-6 cursor-pointer hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all group relative overflow-hidden flex flex-col justify-between h-full min-h-[105px] md:min-h-[140px]"
        >
          <div>
            <span className="text-[9px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Volunteers</span>
            <span className="text-lg md:text-3xl font-extrabold text-slate-100 mt-1 md:mt-2 block">{volunteersCount}</span>
          </div>
          <span className="text-[9px] md:text-[10px] text-purple-600 dark:text-purple-400 font-bold mt-2 md:mt-4 flex items-center gap-1">
            Grouped by slot <ExternalLink className="w-3 h-3" />
          </span>
          <Clock className="w-9 h-9 md:w-16 md:h-16 opacity-8 md:opacity-12 absolute right-2 top-2 text-slate-400 dark:text-slate-700 group-hover:text-purple-400/80 transition-colors" />
        </div>

        {/* Total Donors */}
        <div 
          onClick={() => setActiveModal('donors')}
          className="glass-card rounded-2xl p-3.5 md:p-6 cursor-pointer hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all group relative overflow-hidden flex flex-col justify-between h-full min-h-[105px] md:min-h-[140px]"
        >
          <div>
            <span className="text-[9px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Donors</span>
            <span className="text-lg md:text-3xl font-extrabold text-slate-100 mt-1 md:mt-2 block">{donorsCount}</span>
          </div>
          <span className="text-[9px] md:text-[10px] text-purple-600 dark:text-purple-400 font-bold mt-2 md:mt-4 flex items-center gap-1">
            Click to view list <ExternalLink className="w-3 h-3" />
          </span>
          <Heart className="w-9 h-9 md:w-16 md:h-16 opacity-8 md:opacity-12 absolute right-2 top-2 text-slate-400 dark:text-slate-700 group-hover:text-purple-400/80 transition-colors" />
        </div>

        {/* Dinner Prasadam */}
        <div 
          onClick={() => setActiveModal('prasadam')}
          className="glass-card rounded-2xl p-3.5 md:p-6 cursor-pointer hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all group relative overflow-hidden flex flex-col justify-between h-full min-h-[105px] md:min-h-[140px]"
        >
          <div>
            <span className="text-[9px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Dinner Prasadam</span>
            <span className="text-lg md:text-3xl font-extrabold text-slate-100 mt-1 md:mt-2 block">{dinnerCount}</span>
          </div>
          <span className="text-[9px] md:text-[10px] text-purple-600 dark:text-purple-400 font-bold mt-2 md:mt-4 flex items-center gap-1">
            Click to view list <ExternalLink className="w-3 h-3" />
          </span>
          <Soup className="w-9 h-9 md:w-16 md:h-16 opacity-8 md:opacity-12 absolute right-2 top-2 text-slate-400 dark:text-slate-700 group-hover:text-purple-400/80 transition-colors" />
        </div>

        {/* Today's Registrations */}
        <div 
          onClick={() => setActiveModal('todays')}
          className="glass-card rounded-2xl p-3.5 md:p-6 cursor-pointer hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all group relative overflow-hidden flex flex-col justify-between h-full min-h-[105px] md:min-h-[140px]"
        >
          <div>
            <span className="text-[9px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Today&apos;s Registrations</span>
            <span className="text-lg md:text-3xl font-extrabold text-slate-100 mt-1 md:mt-2 block">{todaysCount}</span>
          </div>
          <span className="text-[9px] md:text-[10px] text-purple-600 dark:text-purple-400 font-bold mt-2 md:mt-4 flex items-center gap-1">
            Click to view list <ExternalLink className="w-3 h-3" />
          </span>
          <Calendar className="w-9 h-9 md:w-16 md:h-16 opacity-8 md:opacity-12 absolute right-2 top-2 text-slate-400 dark:text-slate-700 group-hover:text-purple-400/80 transition-colors" />
        </div>

        {/* Occupation Summary */}
        <div 
          onClick={() => setActiveModal('occupation')}
          className="glass-card rounded-2xl p-3.5 md:p-4 cursor-pointer hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all group relative overflow-hidden flex flex-col justify-between h-full min-h-[150px] md:min-h-[160px]"
        >
          <div>
            <span className="text-[9px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Occupation Summary</span>
            <div className="mt-2 text-xs md:text-[13px] text-slate-300 space-y-1 font-medium">
              <div className="flex justify-between items-center">
                <span>👨🎓 Students</span>
                <span className="font-bold text-slate-100">{studentsCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>👨💼 Employees</span>
                <span className="font-bold text-slate-100">{employeesCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>👥 Others</span>
                <span className="font-bold text-slate-100">{othersCount}</span>
              </div>
            </div>
            
            <div className="border-t border-slate-900/60 my-2 pt-1.5 flex justify-between items-center text-[10px] md:text-xs text-slate-400 font-semibold">
              <span>Total</span>
              <span className="text-slate-100 font-bold">{totalCount}</span>
            </div>

            {/* Compact Horizontal Bar Chart */}
            <div className="h-2 w-full mt-2 bg-slate-950/40 rounded-full overflow-hidden flex p-[1px] border border-slate-900/60">
              {totalCount > 0 ? (
                <>
                  <div 
                    style={{ width: `${(studentsCount / totalCount) * 100}%` }} 
                    className="h-full bg-purple-500 rounded-l-full" 
                    title={`Students: ${studentsCount}`}
                  />
                  <div 
                    style={{ width: `${(employeesCount / totalCount) * 100}%` }} 
                    className="h-full bg-pink-500" 
                    title={`Employees: ${employeesCount}`}
                  />
                  <div 
                    style={{ width: `${(othersCount / totalCount) * 100}%` }} 
                    className="h-full bg-indigo-500 rounded-r-full" 
                    title={`Others: ${othersCount}`}
                  />
                </>
              ) : (
                <div className="w-full h-full bg-slate-900" />
              )}
            </div>
          </div>
          <span className="text-[9px] md:text-[10px] text-purple-650 dark:text-purple-400 font-bold mt-2 flex items-center gap-0.5 shrink-0">
            View details <ExternalLink className="w-2.5 h-2.5" />
          </span>
          <Briefcase className="w-9 h-9 md:w-16 md:h-16 opacity-5 absolute right-2 top-2 text-slate-400 dark:text-slate-700 group-hover:text-purple-400/80 transition-colors pointer-events-none" />
        </div>

      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent 10 Registrations */}
        <div className="glass-card rounded-2xl p-6 flex flex-col h-[400px]">
          <h3 className="text-sm font-bold text-slate-300 border-b border-slate-900 pb-3 mb-4 flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-purple-400" /> Recent 10 Registrations
          </h3>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900/60 pr-1">
            {registrations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 py-8 text-center">
                <Users className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
                <p className="text-xs font-semibold">No registrations found.</p>
              </div>
            ) : (
              registrations.slice(0, 10).map((reg) => (
                <div key={reg.id} className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2.5 sm:gap-2">
                  <div className="space-y-1 sm:space-y-0.5">
                    {/* Name */}
                    <p className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" /> 
                      <span className="truncate max-w-[200px] sm:max-w-xs">{reg.full_name}</span>
                    </p>
                    {/* Occupation */}
                    {reg.occupation && (
                      <p className="text-[10px] text-purple-500 dark:text-purple-400 font-bold pl-5 leading-none mb-1">
                        {reg.occupation}
                      </p>
                    )}
                    {/* Phone */}
                    <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-mono text-[11px]">
                      <Phone className="w-3 h-3 text-slate-450 dark:text-slate-550 shrink-0" /> 
                      <span>{reg.phone}</span>
                    </p>
                    {/* Company */}
                    {reg.company_college && (
                      <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-[11px]">
                        <Building className="w-3 h-3 text-slate-450 dark:text-slate-550 shrink-0" />
                        <span className="truncate max-w-[200px] sm:max-w-xs">{reg.company_college}</span>
                      </p>
                    )}
                    {/* Age Badge */}
                    <div className="pt-0.5 sm:pt-0 sm:inline-block">
                      <span className="text-[9px] text-slate-600 dark:text-slate-300 font-bold px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 inline-block">
                        Age: {reg.age}
                      </span>
                    </div>
                  </div>
                  {/* Date */}
                  <div className="self-start sm:self-center">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-850 px-2 py-0.5 rounded-md inline-block">
                      {formatDate(reg.created_at).split(',')[0]}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Volunteer Slots Grouped by Time */}
        <div className="glass-card rounded-2xl p-6 flex flex-col h-[400px]">
          <h3 className="text-sm font-bold text-slate-300 border-b border-slate-900 pb-3 mb-4 flex items-center gap-2">
            <Clock className="w-4.5 h-4.5 text-purple-400" /> Volunteer Slots Allocation
          </h3>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900/60 pr-1 space-y-3">
            {volunteersCount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 py-8 text-center">
                <Clock className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
                <p className="text-xs font-semibold">No volunteers registered yet.</p>
              </div>
            ) : (
              volunteersBySlot.map((group) => (
                <div key={group.slotName} className="space-y-2 pt-2 border-none">
                  <div className="flex justify-between items-center text-xs bg-slate-900/40 px-3 py-1.5 rounded-lg border border-slate-850">
                    <span className="font-semibold text-purple-400">{group.slotName}</span>
                    <span className="font-bold text-slate-300">{group.count} {group.count === 1 ? 'vol' : 'vols'}</span>
                  </div>
                  {group.count === 0 ? (
                    <p className="text-[10px] text-slate-500 italic pl-3">No volunteers allocated</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pl-2">
                      {group.volunteers.map((v) => (
                        <div 
                          key={v.id}
                          className="text-[10px] bg-purple-950/40 text-purple-300 px-2 py-0.5 rounded border border-purple-500/10 flex items-center gap-1 font-medium"
                          title={`Phone: ${v.phone}${v.skills?.length ? ` | Skills: ${v.skills.map(s => s.name).join(', ')}` : ''}`}
                        >
                          <User className="w-2.5 h-2.5 shrink-0" />
                          <span>{v.full_name.split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 3. Visualizations Section */}
      <section>
        <DashboardCharts 
          dailyData={getDailyTrendData()}
          skillData={getSkillsDistributionData()}
          slotData={getSlotsDistributionData()}
          genderData={getGenderRatioData()}
          occupationData={getOccupationCountsList()
            .filter(item => item.count > 0)
            .map(item => ({ name: item.label, value: item.count }))}
        />
      </section>

      {/* --- STATS DETAIL MODALS (ANALYTICS POPUPS) --- */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-[calc(100vw-20px)] sm:w-full max-w-[420px] sm:max-w-[700px] max-h-[80vh] glass-card rounded-2xl overflow-hidden flex flex-col relative"
            >
              {/* Top border decor */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
 
              {/* Modal Header */}
              <div className="px-4 md:px-6 py-3 border-b border-slate-900 flex justify-between items-center bg-slate-950/60 shrink-0">
                <h3 className="font-bold text-base sm:text-lg text-slate-100">
                  {activeModal === 'total' && 'All Registrations'}
                  {activeModal === 'donors' && 'Interested Donors'}
                  {activeModal === 'prasadam' && 'Dinner Prasadam List'}
                  {activeModal === 'volunteers' && 'Volunteers Grouped By Time Slot'}
                  {activeModal === 'todays' && "Today's Registrations"}
                  {activeModal === 'occupation' && 'Occupation Summary & Details'}
                </h3>
                <button
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
 
              {/* Modal Content Scrollbox */}
              <div className="p-3 sm:p-6 overflow-y-auto flex-1 divide-y divide-slate-900/60 bg-slate-950/40">
                {activeModal === 'total' && (
                  <div className="space-y-3.5">
                    {registrations.length === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-8">No registrations found.</p>
                    ) : (
                      registrations.map(reg => (
                        <div key={reg.id} className="py-2.5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                          <div>
                            <p className="font-semibold text-slate-100 text-sm flex items-center gap-1.5 flex-wrap">
                              <User className="w-4 h-4 text-purple-600 dark:text-purple-400" /> {reg.full_name} 
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-850 bg-slate-100 dark:bg-slate-900">Age: {reg.age}</span>
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                              <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {reg.phone}
                              {reg.company_college && <span className="text-[10px] text-slate-400 dark:text-slate-500">| {reg.company_college}</span>}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 self-start sm:self-center font-medium bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-md">
                            {formatDate(reg.created_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
 
                {activeModal === 'todays' && (
                  <div className="space-y-3.5">
                    {todaysList.length === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-8">No registrations found.</p>
                    ) : (
                      todaysList.map(reg => (
                        <div key={reg.id} className="py-2.5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                          <div>
                            <p className="font-semibold text-slate-100 text-sm flex items-center gap-1.5 flex-wrap">
                              <User className="w-4 h-4 text-purple-600 dark:text-purple-400" /> {reg.full_name} 
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-850 bg-slate-100 dark:bg-slate-900">Age: {reg.age}</span>
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                              <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {reg.phone}
                              {reg.company_college && <span className="text-[10px] text-slate-400 dark:text-slate-500">| {reg.company_college}</span>}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 self-start sm:self-center font-medium bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-md">
                            {formatDate(reg.created_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
 
                {activeModal === 'donors' && (
                  <div className="space-y-3.5">
                    {donorsList.length === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-8">No donations received yet.</p>
                    ) : (
                      donorsList.map(reg => (
                        <div key={reg.id} className="py-2.5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                          <div>
                            <p className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                              <User className="w-4 h-4 text-purple-600 dark:text-purple-400" /> {reg.full_name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {reg.phone}
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold px-3 py-1 rounded-full border self-start sm:self-center ${
                            reg.donation_status === 'Completed'
                              ? 'bg-green-100 dark:bg-green-950/20 border-green-500/30 text-green-600 dark:text-green-400'
                              : 'bg-yellow-100 dark:bg-yellow-950/20 border-yellow-500/30 text-yellow-650 dark:text-yellow-400'
                          }`}>
                            {reg.donation_status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
 
                {activeModal === 'prasadam' && (
                  <div className="space-y-3.5">
                    {dinnerList.length === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-8">No prasadam requests.</p>
                    ) : (
                      dinnerList.map(reg => (
                        <div key={reg.id} className="py-2.5 flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                              <User className="w-4 h-4 text-purple-600 dark:text-purple-400" /> {reg.full_name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {reg.phone}
                            </p>
                          </div>
                          <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-950/20 border border-green-500/30 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 animate-pulse" /> Dinner Opted
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
 
                {activeModal === 'volunteers' && (
                  <div className="space-y-5">
                    {volunteersCount === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-8">No volunteers registered yet.</p>
                    ) : (
                      volunteersBySlot.map(group => (
                        <div key={group.slotName} className="space-y-2.5 pt-2 first:pt-0">
                          <h4 className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 flex items-center justify-between bg-purple-100 dark:bg-purple-950/20 border-l-2 border-purple-500 px-3 py-1.5 rounded-r-md">
                            <span>{group.slotName}</span>
                            <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-900 text-slate-650 dark:text-slate-300">
                              {group.count} {group.count === 1 ? 'Volunteer' : 'Volunteers'}
                            </span>
                          </h4>
                          
                          {group.volunteers.length === 0 ? (
                            <p className="text-[11px] text-slate-500 pl-4 py-1 italic">No volunteers for this slot.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-2">
                              {group.volunteers.map(v => (
                                <div key={v.id} className="p-2.5 rounded-xl bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-850 flex flex-col gap-1">
                                  <span className="font-semibold text-slate-100 text-xs sm:text-sm flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-purple-500" /> {v.full_name}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-mono">
                                    <Phone className="w-3 h-3 text-slate-400 dark:text-slate-500" /> {v.phone}
                                  </span>
                                  {v.skills && v.skills.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {v.skills.map(s => (
                                        <span key={s.id} className="text-[9px] font-medium bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-500/10">
                                          {s.name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeModal === 'occupation' && (
                  <div className="space-y-5">
                    {/* List counts grouped by occupation */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {getOccupationCountsList().map((item) => {
                        // Calculate dot filler length dynamically
                        const dotLen = Math.max(3, 40 - item.label.length);
                        const dots = '.'.repeat(dotLen);
                        return (
                          <div key={item.label} className="flex justify-between items-center text-xs sm:text-sm font-mono py-0.5">
                            <span className="text-slate-350 dark:text-slate-300 truncate max-w-[240px]">{item.label}</span>
                            <span className="text-slate-650 flex-1 mx-2 overflow-hidden truncate">{dots}</span>
                            <span className="font-bold text-slate-100">{item.count}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-slate-900/60 pt-3 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <span>Total Registrations</span>
                      <span className="text-slate-100 text-sm font-mono">{totalCount}</span>
                    </div>

                    {/* Horizontal Bar Chart of Occupation Distribution */}
                    <div className="border-t border-slate-900/60 pt-4">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">Occupation Distribution</span>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            layout="vertical"
                            data={getOccupationCountsList()
                              .filter(item => item.count > 0)
                              .map(item => ({ name: item.label, value: item.count }))}
                            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                          >
                            <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
                            <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} width={80} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#0f172a',
                                borderColor: '#334155',
                                borderRadius: '12px',
                                color: '#f8fafc',
                                fontSize: '11px',
                              }}
                            />
                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Count">
                              {getOccupationCountsList()
                                .filter(item => item.count > 0)
                                .map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={PURPLE_COLORS[index % PURPLE_COLORS.length]} />
                                ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>
 
              {/* Modal Footer - Fixed */}
              <div className="px-4 md:px-6 py-2.5 bg-slate-950/60 border-t border-slate-900 shrink-0 text-right text-[10px] text-slate-500 font-medium">
                Live Data Feed
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
