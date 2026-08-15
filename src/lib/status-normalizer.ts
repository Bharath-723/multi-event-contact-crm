/**
 * Centralized Status Normalization and Statistics Calculation Layer
 * Enforces mutually exclusive status classification and strict count invariants.
 */

export type NormalizedStatus = 'coming' | 'notComing' | 'notConnected';

/**
 * Maps any status string into exactly one of three mutually exclusive buckets:
 * - 'coming'
 * - 'notComing'
 * - 'notConnected' (Admin synonym: 'pending')
 */
export function normalizeAssignmentStatus(status: string | null | undefined): NormalizedStatus {
  if (!status) return 'notConnected';
  const s = status.trim().toLowerCase();
  if (['coming', 'interested', 'confirmed', 'completed'].includes(s)) {
    return 'coming';
  }
  if (['not coming', 'not_coming', 'not interested', 'not_interested'].includes(s)) {
    return 'notComing';
  }
  return 'notConnected';
}

export interface OperatorAssignmentStats {
  assigned: number;
  coming: number;
  notComing: number;
  notConnected: number; // Used in Operator Portal
  pending: number;      // Used in Admin Dashboard (synonym for notConnected)
}

/**
 * Calculates authoritative operator statistics from active assignment records (is_active = TRUE).
 * Enforces the invariant: assigned = coming + notComing + notConnected
 */
export function computeOperatorStats(
  activeAssignments: Array<{ status?: string | null; is_active?: boolean }>
): OperatorAssignmentStats {
  const activeList = activeAssignments.filter((a) => a.is_active !== false);

  let coming = 0;
  let notComing = 0;
  let notConnected = 0;

  for (const a of activeList) {
    const bucket = normalizeAssignmentStatus(a.status);
    if (bucket === 'coming') coming++;
    else if (bucket === 'notComing') notComing++;
    else notConnected++;
  }

  const assigned = activeList.length;

  // Invariant verification check
  if (assigned !== coming + notComing + notConnected) {
    console.error('[ASSIGNMENT COUNT INVARIANT VIOLATION]', {
      assigned,
      coming,
      notComing,
      notConnected,
      sum: coming + notComing + notConnected,
    });
  }

  return {
    assigned,
    coming,
    notComing,
    notConnected,
    pending: notConnected,
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
