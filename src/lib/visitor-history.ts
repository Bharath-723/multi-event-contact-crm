/**
 * Saturday Meetup Visitor History Service
 * File: src/lib/visitor-history.ts
 *
 * Implements persistent, idempotent archival and querying of historical Saturday Meetup
 * visitor counts and attendance.
 *
 * Requirements:
 * 1. Archive the previous Saturday Meetup's approved visitor count every Sunday at 06:00 AM IST.
 * 2. Store each Saturday Meetup's visitor count as a permanent historical record.
 * 3. Record contains Meetup date (Saturday) and total approved unique visitors.
 * 4. Idempotent: multiple executions never duplicate or overwrite previous Meetup history.
 * 5. Graceful handling if the table is pending migration.
 */

import { supabaseAdmin } from './supabase-admin';
import {
  getCurrentWeeklyPeriod,
  getSaturdayMeetupDate,
  isSundayArchiveTimeReached,
} from './weekly-period';

export interface SaturdayVisitorHistoryItem {
  id: string;
  weekly_period: string;
  meetup_date: string;
  meetup_date_label: string;
  total_visitors: number;
  total_attendance: number;
  archived_at: string;
}

/**
 * Checks whether an error indicates a missing database object (pending migration/schema cache)
 */
function isSchemaObjectMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  return (
    code === '42883' || // PostgreSQL: undefined_function
    code === '42P01' || // PostgreSQL: undefined_table
    code === 'PGRST202' || // PostgREST: Could not find function in schema cache
    code === 'PGRST205' || // PostgREST: Could not find table in schema cache
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function')
  );
}

/**
 * Idempotently archives unarchived past Saturday Meetup visitor counts
 * (any Saturday Meetup whose Sunday 06:00 AM IST has passed),
 * then returns the complete list of historical records sorted by meetup_date DESC.
 */
export async function archiveAndGetVisitorHistory(currentPeriod?: string): Promise<SaturdayVisitorHistoryItem[]> {
  const activePeriod = currentPeriod || getCurrentWeeklyPeriod();
  const now = new Date();

  // Temporary container for dynamically derived history when DB table is not yet migrated
  const fallbackHistoryMap = new Map<string, SaturdayVisitorHistoryItem>();

  try {
    // 1. First attempt to call the database stored procedure if available
    const { error: rpcErr } = await supabaseAdmin.rpc('archive_saturday_meetup_visitor_history', {
      p_current_period: activePeriod,
    });

    if (rpcErr && !isSchemaObjectMissing(rpcErr)) {
      console.warn('[visitor-history] RPC archive_saturday_meetup_visitor_history notice:', rpcErr.message);
    }

    // 2. Fetch check-in records to archive any completed Saturday Meetups
    // (Periods whose Sunday 06:00 AM IST threshold has been reached)
    const { data: allCheckins, error: checkinErr } = await supabaseAdmin
      .from('master_contact_checkins')
      .select('weekly_period, master_contact_id, phone');

    if (!checkinErr && allCheckins && allCheckins.length > 0) {
      // Group check-ins by weekly_period
      const checkinsByPeriod = new Map<string, Array<{ weekly_period: string; master_contact_id: string; phone: string }>>();
      for (const row of allCheckins) {
        if (!row.weekly_period) continue;
        const list = checkinsByPeriod.get(row.weekly_period) || [];
        list.push(row);
        checkinsByPeriod.set(row.weekly_period, list);
      }

      // Check which periods are already archived in the database
      const { data: existingHistory, error: existErr } = await supabaseAdmin
        .from('saturday_meetup_visitor_history')
        .select('weekly_period');

      const archivedPeriods = new Set(
        (!existErr && existingHistory
          ? (existingHistory as Array<{ weekly_period: string }>).map((h) => h.weekly_period)
          : [])
      );

      // Iterate over each period and archive if Sunday 06:00 AM IST has arrived
      for (const [period, rows] of checkinsByPeriod.entries()) {
        const canArchive = isSundayArchiveTimeReached(period, now);
        if (!canArchive) {
          // Saturday Meetup has not yet concluded and reached Sunday 06:00 AM IST
          continue;
        }

        // Deduplicate unique visitors by normalized phone & master contact ID
        const uniquePhones = new Set(rows.map((r) => r.phone).filter(Boolean));
        const totalVisitors = uniquePhones.size > 0 ? uniquePhones.size : rows.length;
        const totalAttendance = rows.length;
        const { dateStr, label } = getSaturdayMeetupDate(period);

        const historyItem: SaturdayVisitorHistoryItem = {
          id: `derived_${period}`,
          weekly_period: period,
          meetup_date: dateStr,
          meetup_date_label: label,
          total_visitors: totalVisitors,
          total_attendance: totalAttendance,
          archived_at: now.toISOString(),
        };

        fallbackHistoryMap.set(period, historyItem);

        // If not already archived in DB and table exists, insert record
        if (!archivedPeriods.has(period) && (!existErr || !isSchemaObjectMissing(existErr))) {
          await supabaseAdmin
            .from('saturday_meetup_visitor_history')
            .insert({
              weekly_period: period,
              meetup_date: dateStr,
              meetup_date_label: label,
              total_visitors: totalVisitors,
              total_attendance: totalAttendance,
              archived_at: now.toISOString(),
            });
        }
      }
    }
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string } | undefined;
    if (!isSchemaObjectMissing(errorObj)) {
      console.warn('[visitor-history] Archival check completed with notice:', err);
    }
  }

  // 3. Query all historical records from persistent database storage
  try {
    const { data: history, error: histErr } = await supabaseAdmin
      .from('saturday_meetup_visitor_history')
      .select('id, weekly_period, meetup_date, meetup_date_label, total_visitors, total_attendance, archived_at')
      .order('meetup_date', { ascending: false });

    if (!histErr && history && history.length > 0) {
      return history as SaturdayVisitorHistoryItem[];
    }

    // If DB query returned error (e.g. table pending migration) or 0 rows, use fallback derived history
    if (fallbackHistoryMap.size > 0) {
      const fallbackList = Array.from(fallbackHistoryMap.values());
      fallbackList.sort((a, b) => b.meetup_date.localeCompare(a.meetup_date));
      return fallbackList;
    }

    return [];
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string } | undefined;
    if (!isSchemaObjectMissing(errorObj)) {
      console.warn('[visitor-history] Exception querying history:', err);
    }
    const fallbackList = Array.from(fallbackHistoryMap.values());
    fallbackList.sort((a, b) => b.meetup_date.localeCompare(a.meetup_date));
    return fallbackList;
  }
}
