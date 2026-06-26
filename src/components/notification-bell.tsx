'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Loader2, UserCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Notification } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 1. Fetch initial unread count and list of recent registrations
  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      
      // Fetch unread count
      const { count, error: countErr } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

      if (!countErr && count !== null) {
        setUnreadCount(count);
      }

      // Fetch recent notifications (join with registrations)
      const { data, error: dataErr } = await supabase
        .from('notifications')
        .select(`
          id,
          registration_id,
          is_read,
          created_at,
          registrations (
            full_name,
            phone,
            created_at
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!dataErr && data) {
        // Cast to Notification[] since Supabase join types can be dynamic
        setNotifications(data as unknown as Notification[]);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();

    // 2. Subscribe to Supabase Realtime insert events on 'notifications' table
    const channel = supabase
      .channel('realtime_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        async (payload) => {
          // Increment unread counter
          setUnreadCount((prev) => prev + 1);

          // Fetch the details of the new registration associated with this notification
          const { data: newReg, error } = await supabase
            .from('registrations')
            .select('full_name, phone, created_at')
            .eq('id', payload.new.registration_id)
            .single();

          if (!error && newReg) {
            const newNotification: Notification = {
              id: payload.new.id,
              registration_id: payload.new.registration_id,
              is_read: payload.new.is_read,
              created_at: payload.new.created_at,
              registrations: {
                full_name: newReg.full_name,
                phone: newReg.phone,
                created_at: newReg.created_at,
              },
            };

            // Prepend new notification to state
            setNotifications((prev) => [newNotification, ...prev].slice(0, 20));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Mark notifications as read when opening panel
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

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleTogglePanel}
        aria-label="Toggle notifications panel"
        className="relative p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 transition-all cursor-pointer flex items-center justify-center"
      >
        <Bell className="w-5 h-5" />
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold leading-none min-w-[18px] text-center ring-2 ring-slate-950 animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2.5 w-80 sm:w-96 glass-card rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Panel Header */}
            <div className="px-4 py-3.5 border-b border-slate-850 flex justify-between items-center bg-slate-950/80">
              <span className="font-bold text-sm text-white flex items-center gap-1.5">
                Notifications
              </span>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-900/60">
              {isLoading && notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500 mb-2" />
                  <span>Loading alerts...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs space-y-1">
                  <p className="font-semibold text-slate-400">No notifications available.</p>
                  <p>All caught up!</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const reg = notification.registrations;
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 flex gap-3 transition-colors ${
                        !notification.is_read
                          ? 'bg-purple-950/15 hover:bg-purple-950/25'
                          : 'hover:bg-slate-900/40'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-purple-900/30 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex justify-between items-start gap-1">
                          <p className="text-sm font-semibold text-white truncate">
                            {reg?.full_name || 'New Registration'}
                          </p>
                          <span className="text-[10px] text-slate-500 shrink-0 mt-0.5">
                            {formatDate(notification.created_at).split(',')[0]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          Phone: {reg?.phone || 'N/A'}
                        </p>
                        <p className="text-[10px] text-purple-400 mt-1.5">
                          Registered at {formatDate(notification.created_at).split('at')[1] || 'N/A'}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Panel Footer */}
            <div className="px-4 py-2 text-center bg-slate-950/80 border-t border-slate-900 text-[10px] text-slate-500">
              Updates in real time via Supabase Realtime
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
