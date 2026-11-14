/**
 * Centralized Status Normalization and Statistics Calculation Layer
 * Enforces mutually exclusive status classification and strict count invariants.
 */

import { getCurrentWeeklyPeriod } from './weekly-period.ts';

export type NormalizedStatus = 'coming' | 'notComing' | 'notAnswered' | 'nextWeek' | 'notInHyderabad' | 'pending';

/**
 * Maps any status string into mutually exclusive buckets:
 * - 'coming': Coming, Interested, Confirmed, Completed
 * - 'notComing': Not Coming, Not Interested
 * - 'nextWeek': Next Week, Callback Required, Contacted
 * - 'notInHyderabad': Not in Hyderabad
 * - 'notAnswered': Not Answered, Not Connected, No Answer, Wrong Number
 * - 'pending': Pending / Assigned (unresponded contacts)
 */
export function normalizeAssignmentStatus(status: string | null | undefined): NormalizedStatus {
  if (!status) return 'pending';
  const s = status.trim().toLowerCase();
  if (['coming', 'interested', 'confirmed', 'completed', 'visited'].includes(s)) {
    return 'coming';
  }
  if (['not coming', 'not_coming', 'not interested', 'not_interested'].includes(s)) {
    return 'notComing';
  }
  if (['next week', 'next_week', 'callback required', 'callback_required', 'contacted'].includes(s)) {
    return 'nextWeek';
  }
  if (['not in hyderabad', 'not_in_hyderabad'].includes(s)) {
    return 'notInHyderabad';
  }
  if (['not answered', 'not_answered', 'not connected', 'not_connected', 'no answer', 'wrong number'].includes(s)) {
    return 'notAnswered';
  }
  return 'pending';
}

export interface OperatorAssignmentStats {
  assigned: number;
  coming: number;
  notComing: number;
  notAnswered: number;
  nextWeek: number;
  notInHyderabad: number;
  pending: number;      // Used in Admin Dashboard (contacts assigned but not given operator response status)
  notConnected: number; // Legacy synonym for notAnswered
}

export interface ComputeStatsOptions {
  currentWeeklyPeriod?: string | null;
}

/**
 * Calculates authoritative operator statistics from active assignment records (is_active = TRUE).
 * Enforces strict mathematical invariants:
 * - Total Assigned is NEVER reset by weekly transitions and always reflects active assignments.
 * - When currentWeeklyPeriod is supplied, status counters (coming, notComing, notAnswered, nextWeek,
 *   notInHyderabad, pending) reflect only status updates made during that weekly period, starting from 0
 *   on every Friday 00:00:00 Asia/Kolkata rollover.
 */
export function computeOperatorStats(
  activeAssignments: Array<{
    status?: string | null;
    is_active?: boolean;
    status_weekly_period?: string | null;
    updated_at?: string | null;
  }>,
  options?: ComputeStatsOptions
): OperatorAssignmentStats {
  const activeList = activeAssignments.filter((a) => a.is_active !== false);

  let coming = 0;
  let notComing = 0;
  let nextWeek = 0;
  let notAnswered = 0;
  let notInHyderabad = 0;
  let pending = 0;

  const targetPeriod = options?.currentWeeklyPeriod;

  for (const a of activeList) {
    if (targetPeriod) {
      // In weekly period mode: only count status updates recorded during target weekly period
      const period =
        a.status_weekly_period ||
        (a.updated_at ? getCurrentWeeklyPeriod(new Date(a.updated_at)) : null);

      if (period === targetPeriod) {
        const bucket = normalizeAssignmentStatus(a.status);
        if (bucket === 'coming') coming++;
        else if (bucket === 'notComing') notComing++;
        else if (bucket === 'nextWeek') nextWeek++;
        else if (bucket === 'notInHyderabad') notInHyderabad++;
        else if (bucket === 'notAnswered') notAnswered++;
        else pending++;
      } else {
        // Active assigned contact pending operator response for the current weekly period
        pending++;
      }
    } else {
      // Cumulative / unpartitioned mode
      const bucket = normalizeAssignmentStatus(a.status);
      if (bucket === 'coming') coming++;
      else if (bucket === 'notComing') notComing++;
      else if (bucket === 'nextWeek') nextWeek++;
      else if (bucket === 'notInHyderabad') notInHyderabad++;
      else if (bucket === 'notAnswered') notAnswered++;
      else pending++;
    }
  }

  const assigned = activeList.length;

  // Invariant verification check: assigned must reconcile with status sum
  if (assigned !== coming + notComing + notAnswered + nextWeek + notInHyderabad + pending) {
    console.error('[ASSIGNMENT COUNT INVARIANT VIOLATION]', {
      assigned,
      coming,
      notComing,
      notAnswered,
      nextWeek,
      notInHyderabad,
      pending,
      sum: coming + notComing + notAnswered + nextWeek + notInHyderabad + pending,
    });
  }

  return {
    assigned,
    coming,
    notComing,
    notAnswered,
    nextWeek,
    notInHyderabad,
    pending,
    notConnected: notAnswered,
  };
}

/**
 * Formats display operator name, cleaning internal test prefixes/suffixes if present.
 */
export function formatOperatorDisplayName(name: string | null | undefined): string {
  if (!name) return 'Unknown Operator';
  let cleaned = name.trim();

  // If it's a test name like __Test_Operator_A_rathayatra or __test_op_B_krishnashtami_0
  if (cleaned.startsWith('__') || cleaned.includes('_rathayatra') || cleaned.includes('_krishnashtami')) {
    cleaned = cleaned
      .replace(/^__/, '')
      .replace(/_(rathayatra|krishnashtami|feedback).*/i, '')
      .replace(/_/g, ' ')
      .trim();
  }

  return cleaned || name;
}
