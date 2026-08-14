'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Loader2, UserCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Notification } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useFestival } from '@/lib/contexts/FestivalContext';

export default function NotificationBell() {
  const { selectedEventId } = useFestival();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedEventIdRef = useRef<string | null>(selectedEventId);

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  // Fetch initial unread count and list of recent registrations scoped by festival
  const fetchNotifications = React.useCallback(async () => {
    if (!selectedEventId) return;
    try {
      setIsLoading(true);
      const isKrishnashtami = selectedEventId === '7852cff8-e784-4e91-b990-a9838ea59ff1';
      const regRel = isKrishnashtami
        ? 'krishnashtami_registrations!krishnashtami_registration_id'
        : 'registrations!registration_id';

      // Fetch unread count scoped by festival
      let countQuery = supabase
        .from('notifications')
        .select(`*, ${regRel}(festival_event_id)`, { count: 'exact', head: true })
        .eq('is_read', false);

      if (isKrishnashtami) {
        countQuery = countQuery.not('krishnashtami_registration_id', 'is', null);
      } else {
        countQuery = countQuery.eq('registrations.festival_event_id', selectedEventId);
      }

      const { count, error: countErr } = await countQuery;
      if (!countErr && count !== null) {
        setUnreadCount(count);
      } else {
        setUnreadCount(0);
      }

      // Fetch recent notifications
      let dataQuery = supabase
        .from('notifications')
        .select(`
          id,
          registration_id,
          krishnashtami_registration_id,
          is_read,
          created_at,
          ${regRel} (
            full_name,
            phone,
            created_at,
            festival_event_id
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (isKrishnashtami) {
        dataQuery = dataQuery.not('krishnashtami_registration_id', 'is', null);
      } else {
        dataQuery = dataQuery.eq('registrations.festival_event_id', selectedEventId);
      }

      const { data, error: dataErr } = await dataQuery;

      if (!dataErr && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped = (data as any[]).map((item) => {
          const regObj = item.krishnashtami_registrations || item.registrations;
          return {
            id: item.id,
            registration_id: item.krishnashtami_registration_id || item.registration_id,
            is_read: item.is_read,
            created_at: item.created_at,
            registrations: {
              full_name: regObj?.full_name || 'New Registration',
              phone: regObj?.phone,
              created_at: regObj?.created_at,
            },
          };
        });
        setNotifications(mapped as Notification[]);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setNotifications([]);
    setUnreadCount(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchNotifications();

    if (!selectedEventId) return;

    const channel = supabase
      .channel(`realtime_notifications_${selectedEventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        async (payload) => {
          const isKrishnashtami = selectedEventIdRef.current === '7852cff8-e784-4e91-b990-a9838ea59ff1';
          const regId = payload.new.krishnashtami_registration_id || payload.new.registration_id;
          const regTable = isKrishnashtami ? 'krishnashtami_registrations' : 'registrations';

          if (!regId) return;

          const { data: newReg, error } = await supabase
            .from(regTable)
            .select('full_name, phone, created_at, festival_event_id')
            .eq('id', regId)
            .single();

          if (!error && newReg) {
            setUnreadCount((prev) => prev + 1);

            const newNotification: Notification = {
              id: payload.new.id,
              registration_id: regId,
              is_read: payload.new.is_read,
              created_at: payload.new.created_at,
              registrations: {
                full_name: newReg.full_name,
                phone: newReg.phone,
                created_at: newReg.created_at,
              },
            };

            setNotifications((prev) => [newNotification, ...prev].slice(0, 20));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedEventId, fetchNotifications]);

  // Mark notifications as read when opening panel
  const handleTogglePanel = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (nextState && unreadCount > 0) {
      // Optimistically clear the unread count in frontend
      setUnreadCount(0);
      
      try {
        // Call the database function RPC
        const { error } = await supabase.rpc('mark_all_notifications_read');
        if (error) {
          console.error('Error calling mark_all_notifications_read RPC:', error);
        } else {
          // Update local state is_read to true
          setNotifications((prev) =>
            prev.map((n) => ({ ...n, is_read: true }))
          );
        }
      } catch (err) {
        console.error('Failed to mark notifications read:', err);
      }
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Prevent body scrolling on mobile when open
  useEffect(() => {
    if (isOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleTogglePanel}
        aria-label="Toggle notifications panel"
        className="relative p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-500 hover:text-slate-100 border border-slate-850 hover:border-slate-700 transition-all cursor-pointer flex items-center justify-center"
      >
        <Bell className="w-5 h-5" />
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold leading-none min-w-[18px] text-center ring-2 ring-slate-950 animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop overlay for mobile to tap outside and dismiss */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/40 md:bg-transparent z-40" 
          onClick={() => setIsOpen(false)} 
        />
      )}

      {/* Notification Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed md:absolute top-[70px] md:top-full left-1/2 md:left-auto md:right-0 -translate-x-1/2 md:translate-x-0 w-[90vw] sm:w-[420px] max-h-[70vh] glass-card rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col mt-2.5"
          >
            {/* Panel Header */}
            <div className="px-4 py-3.5 border-b border-slate-900 flex justify-between items-center bg-slate-950/80 shrink-0 transition-colors">
              <span className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                Notifications
              </span>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-100 p-1 rounded hover:bg-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-900/60">
              {isLoading && notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500 mb-2" />
                  <span>Loading alerts...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs space-y-1 bg-slate-950/20">
                  <p className="font-semibold text-slate-400">No notifications available.</p>
                  <p>All caught up!</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const reg = notification.registrations;
                  const formattedDate = notification.created_at
                    ? formatDate(notification.created_at).replace(',', ' •').replace(/\s(am|pm)$/i, (m) => m.toUpperCase())
                    : null;
                  return (
                    <div
                      key={notification.id}
                      className={`p-3.5 flex gap-3 transition-colors ${
                        !notification.is_read
                          ? 'bg-purple-50 dark:bg-purple-950/15 hover:bg-purple-100/80 dark:hover:bg-purple-950/25'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {reg?.full_name || 'New Registration'}
                        </p>
                        {reg?.phone && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate">
                            Phone: {reg.phone}
                          </p>
                        )}
                        {formattedDate && (
                          <p className="text-[10px] text-purple-700 dark:text-purple-400 mt-1.5 font-semibold">
                            {formattedDate}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
