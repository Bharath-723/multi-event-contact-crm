/**
 * Unified Level System for HKM Admin Portal
 *
 * Authoritative mapping based strictly on Cumulative Classes Attended:
 * - 0 classes:         'level-0' | 'No level'   | 'level-0/No level'
 * - 1 class:           'level-1' | 'AOMC'       | 'level-1/AOMC'
 * - 2–10 classes:      'level-2' | 'Foundation' | 'level-2/Foundation'
 * - 11–20 classes:     'level-3' | 'Prilims'    | 'level-3/Prilims'
 * - 21 or more:        'level-4' | 'Enhance'    | 'level-4/Enhance'
 */

export type LevelCode = 'level-0' | 'level-1' | 'level-2' | 'level-3' | 'level-4';

export interface LevelInfo {
  code: LevelCode;
  descriptiveName: string;
  displayLabel: string;
  badgeClass: string;
}

/**
 * Calculates level display label and metadata strictly from cumulative Classes Attended.
 */
export function getLevelFromClassesAttended(classesAttended: number | null | undefined): LevelInfo {
  if (classesAttended === null || classesAttended === undefined || isNaN(Number(classesAttended))) {
    return {
      code: 'level-0',
      descriptiveName: 'No level',
      displayLabel: 'level-0/No level',
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    };
  }

  const count = Number(classesAttended);

  if (count <= 0) {
    return {
      code: 'level-0',
      descriptiveName: 'No level',
      displayLabel: 'level-0/No level',
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    };
  }

  if (count === 1) {
    return {
      code: 'level-1',
      descriptiveName: 'AOMC',
      displayLabel: 'level-1/AOMC',
      badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
    };
  }

  if (count >= 2 && count <= 10) {
    return {
      code: 'level-2',
      descriptiveName: 'Foundation',
      displayLabel: 'level-2/Foundation',
      badgeClass: 'bg-blue-950/60 text-blue-300 border-blue-800',
    };
  }

  if (count >= 11 && count <= 20) {
    return {
      code: 'level-3',
      descriptiveName: 'Prilims',
      displayLabel: 'level-3/Prilims',
      badgeClass: 'bg-purple-950/60 text-purple-300 border-purple-800',
    };
  }

  // 21 or more classes
  return {
    code: 'level-4',
    descriptiveName: 'Enhance',
    displayLabel: 'level-4/Enhance',
    badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-800',
  };
}

/**
 * Returns the exact descriptive class progression message after successful approval:
 * - 0 classes: 'Approved!! Move to No level (level-0/No level).'
 * - 1 class: 'Approved!! Move to AOMC (level-1/AOMC).'
 * - 2–10 classes: 'Approved!! Move to Foundation (level-2/Foundation).'
 * - 11–20 classes: 'Approved!! Move to Prilims (level-3/Prilims).'
 * - 21 or more classes: 'Approved!! Level-4/Enhance.'
 */
export function getApprovalSuccessMessage(classesAttended: number): string {
  const count = Number(classesAttended);
  if (count <= 0) {
    return 'Approved!! Move to No level (level-0/No level).';
  }
  if (count === 1) {
    return 'Approved!! Move to AOMC (level-1/AOMC).';
  }
  if (count >= 2 && count <= 10) {
    return 'Approved!! Move to Foundation (level-2/Foundation).';
  }
  if (count >= 11 && count <= 20) {
    return 'Approved!! Move to Prilims (level-3/Prilims).';
  }
  return 'Approved!! Level-4/Enhance.';
}

/**
 * Universal formatter for components that display levels.
 * If classesAttended is numeric, it is authoritative.
 * If classesAttended is missing, maps known level codes to the standard unified labels.
 */
export function formatUnifiedLevel(
  classesAttended?: number | null,
  fallbackLevel?: string | null
): string {
  if (classesAttended !== null && classesAttended !== undefined && !isNaN(Number(classesAttended))) {
    return getLevelFromClassesAttended(Number(classesAttended)).displayLabel;
  }

  if (!fallbackLevel) return 'level-0/No level';
  const clean = fallbackLevel.trim().toLowerCase();

  if (clean === 'level-0' || clean === 'l0' || clean.includes('no level')) {
    return 'level-0/No level';
  }
  if (clean === 'level-1' || clean === 'l1' || clean.includes('aomc')) {
    return 'level-1/AOMC';
  }
  if (clean === 'level-2' || clean === 'l2' || clean.includes('foundation')) {
    return 'level-2/Foundation';
  }
  if (clean === 'level-3' || clean === 'l3' || clean.includes('prilims')) {
    return 'level-3/Prilims';
  }
  if (clean === 'level-4' || clean === 'l4' || clean.includes('enhance')) {
    return 'level-4/Enhance';
  }

  return 'level-0/No level';
}
