'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { FestivalEvent } from '@/lib/types';

interface FestivalContextType {
  events: FestivalEvent[];
  selectedEventId: string | null;
  selectedFestival: FestivalEvent | null;
  selectedYear: number;
  availableYears: number[];
  setSelectedEventId: (id: string) => void;
  setSelectedYear: (year: number) => void;
  loading: boolean;
}

const FestivalContext = createContext<FestivalContextType>({
  events: [],
  selectedEventId: null,
  selectedFestival: null,
  selectedYear: 2026,
  availableYears: [2026],
  setSelectedEventId: () => {},
  setSelectedYear: () => {},
  loading: true,
});

const STORAGE_KEY = 'hkm_selected_festival_event_id';

export function FestivalProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<FestivalEvent[]>([]);
  const [selectedEventId, setSelectedEventIdState] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadEvents() {
      try {
        const { data, error } = await supabase
          .from('festival_events')
          .select('*')
          .order('event_year', { ascending: false })
          .order('festival_name', { ascending: true });

        if (error) {
          console.error('[FestivalContext] Error loading events:', error);
          setLoading(false);
          return;
        }

        if (data && data.length > 0) {
          const loadedEvents = data as FestivalEvent[];
          setEvents(loadedEvents);

          // Check localStorage for saved selection
          const savedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
          const matchSaved = savedId ? loadedEvents.find((e: FestivalEvent) => e.id === savedId) : null;

          if (matchSaved) {
            setSelectedEventIdState(matchSaved.id);
            setSelectedYear(matchSaved.event_year);
          } else {
            // Default to active event or Krishnashtami / first event
            const activeEvent = loadedEvents.find((e: FestivalEvent) => e.is_active && e.registration_open) || loadedEvents[0];
            setSelectedEventIdState(activeEvent.id);
            setSelectedYear(activeEvent.event_year);
          }
        }
      } catch (err) {
        console.error('[FestivalContext] Failed to load events:', err);
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, []);

  const setSelectedEventId = (id: string) => {
    setSelectedEventIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
    const target = events.find((e: FestivalEvent) => e.id === id);
    if (target) {
      setSelectedYear(target.event_year);
    }
  };

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(events.map((e: FestivalEvent) => e.event_year)));
    return years.length > 0 ? years.sort((a: number, b: number) => b - a) : [2026];
  }, [events]);

  const selectedFestival = useMemo(() => {
    return events.find((e: FestivalEvent) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  return (
    <FestivalContext.Provider
      value={{
        events,
        selectedEventId,
        selectedFestival,
        selectedYear,
        availableYears,
        setSelectedEventId,
        setSelectedYear,
        loading,
      }}
    >
      {children}
    </FestivalContext.Provider>
  );
}

export function useFestival() {
  const context = useContext(FestivalContext);
  if (!context) {
    throw new Error('useFestival must be used within a FestivalProvider');
  }
  return context;
}
