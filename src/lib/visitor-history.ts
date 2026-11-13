/**
 * Saturday Meetup Visitor History Service
 * File: src/lib/visitor-history.ts
 *
 * Implements persistent, idempotent archival and querying of historical Saturday Meetup
 * visitor counts and attendance.
 *
 * Requirements:
 * 1. Store each Saturday Meetup's visitor count as a permanent historical record.
 * 2. Record contains Meetup date (Saturday) and total approved visitors.
 * 3. Idempotent: multiple executions never duplicate or overwrite previous Meetup history.
 * 4. Graceful handling if the table is pending migration.
 */

import { supabaseAdmin } from './supabase-admin';
import { getCurrentWeeklyPeriod, getSaturdayMeetupDate } from './weekly-period';

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
 * Idempotently archives unarchived past Saturday Meetup visitor counts,
 * then returns the complete list of historical records sorted by meetup_date DESC.
 */
export async function archiveAndGetVisitorHistory(currentPeriod?: string): Promise<SaturdayVisitorHistoryItem[]> {
  const activePeriod = currentPeriod || getCurrentWeeklyPeriod();

  try {
    // 1. First attempt to call the database stored procedure if available
    const { error: rpcErr } = await supabaseAdmin.rpc('archive_saturday_meetup_visitor_history', {
      p_current_period: activePeriod,
    });

    if (rpcErr && !isSchemaObjectMissing(rpcErr)) {
      console.warn('[visitor-history] RPC archive_saturday_meetup_visitor_history notice:', rpcErr.message);
    }

    // 2. Fallback / Client-side reconciliation for past periods
    const { data: pastCheckins, error: checkinErr } = await supabaseAdmin
      .from('master_contact_checkins')
      .select('weekly_period, master_contact_id, phone')
      .lt('weekly_period', activePeriod);

    if (!checkinErr && pastCheckins && pastCheckins.length > 0) {
      // Group past check-ins by weekly_period
      const checkinsByPeriod = new Map<string, Array<{ weekly_period: string; master_contact_id: string; phone: string }>>();
      for (const row of pastCheckins) {
        if (!row.weekly_period) continue;
        const list = checkinsByPeriod.get(row.weekly_period) || [];
        list.push(row);
        checkinsByPeriod.set(row.weekly_period, list);
      }

      // Check which periods are already archived
      const { data: existingHistory, error: existErr } = await supabaseAdmin
        .from('saturday_meetup_visitor_history')
        .select('weekly_period');

      if (!existErr && existingHistory) {
        const archivedPeriods = new Set(((existingHistory as Array<{ weekly_period: string }>) || []).map((h) => h.weekly_period));

        // Fetch active assignments to accurately partition assigned attendees vs walk-in visitors
        const { data: activeAssignments } = await supabaseAdmin
          .from('master_contact_assignments')
          .select('master_contact_id')
          .eq('is_active', true);

        const assignedContactIds = new Set(
          ((activeAssignments as Array<{ master_contact_id: string }>) || []).map((a) => a.master_contact_id)
        );

        // Insert unarchived periods
        for (const [period, rows] of checkinsByPeriod.entries()) {
          if (archivedPeriods.has(period)) continue;

          const totalAttendance = rows.length;
          const totalVisitors = rows.filter((r) => !assignedContactIds.has(r.master_contact_id)).length;
          const { dateStr, label } = getSaturdayMeetupDate(period);

          await supabaseAdmin
            .from('saturday_meetup_visitor_history')
            .insert({
              weekly_period: period,
              meetup_date: dateStr,
              meetup_date_label: label,
              total_visitors: totalVisitors,
              total_attendance: totalAttendance,
              archived_at: new Date().toISOString(),
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

    if (histErr) {
      if (!isSchemaObjectMissing(histErr)) {
        console.warn('[visitor-history] Error querying history:', histErr.message);
      }
      return [];
    }

    return (history || []) as SaturdayVisitorHistoryItem[];
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string } | undefined;
    if (!isSchemaObjectMissing(errorObj)) {
      console.warn('[visitor-history] Exception querying history:', err);
    }
    return [];
  }
}

