/**
 * Centralized Status Normalization and Statistics Calculation Layer
 * Enforces mutually exclusive status classification and strict count invariants.
 */

export type NormalizedStatus = 'coming' | 'notComing' | 'notAnswered' | 'nextWeek' | 'pending';

/**
 * Maps any status string into one of five mutually exclusive buckets:
 * - 'coming': Coming, Interested, Confirmed, Completed
 * - 'notComing': Not Coming, Not Interested
 * - 'nextWeek': Next Week, Callback Required, Contacted
 * - 'notAnswered': Not Answered, Not Connected, No Answer, Wrong Number
 * - 'pending': Pending / Assigned (unresponded contacts)
 */
export function normalizeAssignmentStatus(status: string | null | undefined): NormalizedStatus {
  if (!status) return 'pending';
  const s = status.trim().toLowerCase();
  if (['coming', 'interested', 'confirmed', 'completed'].includes(s)) {
    return 'coming';
  }
  if (['not coming', 'not_coming', 'not interested', 'not_interested'].includes(s)) {
    return 'notComing';
  }
  if (['next week', 'next_week', 'callback required', 'callback_required', 'contacted'].includes(s)) {
    return 'nextWeek';
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
  pending: number;      // Used in Admin Dashboard (contacts assigned but not given operator response status)
  notConnected: number; // Legacy synonym for notAnswered
}

/**
 * Calculates authoritative operator statistics from active assignment records (is_active = TRUE).
 * Enforces strict mathematical invariants:
 * Admin: Assigned = Coming + Not Coming + Not Answered + Next Week + Pending
 * Operator: Assigned = Coming + Not Coming + (Not Answered + Pending) + Next Week
 */
export function computeOperatorStats(
  activeAssignments: Array<{ status?: string | null; is_active?: boolean }>
): OperatorAssignmentStats {
  const activeList = activeAssignments.filter((a) => a.is_active !== false);

  let coming = 0;
  let notComing = 0;
  let nextWeek = 0;
  let notAnswered = 0;
  let pending = 0;

  for (const a of activeList) {
    const bucket = normalizeAssignmentStatus(a.status);
    if (bucket === 'coming') coming++;
    else if (bucket === 'notComing') notComing++;
    else if (bucket === 'nextWeek') nextWeek++;
    else if (bucket === 'notAnswered') notAnswered++;
    else pending++;
  }

  const assigned = activeList.length;

  // Invariant verification check for Admin Dashboard
  if (assigned !== coming + notComing + notAnswered + nextWeek + pending) {
    console.error('[ASSIGNMENT COUNT INVARIANT VIOLATION]', {
      assigned,
      coming,
      notComing,
      notAnswered,
      nextWeek,
      pending,
      sum: coming + notComing + notAnswered + nextWeek + pending,
    });
  }

  return {
    assigned,
    coming,
    notComing,
    notAnswered,
    nextWeek,
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
