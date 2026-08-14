export const KRISHNASHTAMI_SLOTS = [
  'Full Day (7AM – 12AM)',
  '7:00 AM – 1:00 PM',
  '3:00 PM – 9:00 PM',
  '6:00 PM – 12:00 AM',
] as const;

export type PrasadamOption = 'Breakfast' | 'Lunch' | 'Dinner';
export const ALL_PRASADAM_OPTIONS: PrasadamOption[] = ['Breakfast', 'Lunch', 'Dinner'];

export const SLOT_PRASADAM_MAP: Record<string, PrasadamOption[]> = {
  '7:00 AM – 1:00 PM': ['Breakfast', 'Lunch'],
  '3:00 PM – 9:00 PM': ['Dinner'],
  '6:00 PM – 12:00 AM': ['Dinner'],
  'Full Day (7AM – 12AM)': ['Breakfast', 'Lunch', 'Dinner'],
};

export const FASTING_SUBTITLE_TEXT = "If you are fasting, fruits are being arranged-Kindly collect";

/**
 * Returns the list of Prasadam options permitted for a given time slot.
 * Returns an empty array if no slot is selected or slot is not recognized.
 */
export function getPrasadamOptionsForSlot(slotTime: string | null | undefined): PrasadamOption[] {
  if (!slotTime) return [];
  const cleanSlot = slotTime.trim();
  return SLOT_PRASADAM_MAP[cleanSlot] ?? [];
}

/**
 * Validates whether a single prasadam option is permitted for a given time slot.
 */
export function isPrasadamAllowedForSlot(slotTime: string | null | undefined, prasadam: string | null | undefined): boolean {
  if (!slotTime || !prasadam) return false;
  const allowed = getPrasadamOptionsForSlot(slotTime);
  return allowed.includes(prasadam as PrasadamOption);
}

/**
 * Validates whether ALL selections in a prasadamSelections array are permitted for the given slot.
 * Returns { valid: true } if all selections are allowed.
 * Returns { valid: false, invalidItems: [...] } if any selection is not permitted.
 */
export function arePrasadamSelectionsValidForSlot(
  slotTime: string | null | undefined,
  selections: string[]
): { valid: boolean; invalidItems: string[] } {
  if (!slotTime || selections.length === 0) {
    return { valid: true, invalidItems: [] };
  }
  const allowed = getPrasadamOptionsForSlot(slotTime);
  const invalidItems = selections.filter(s => !allowed.includes(s as PrasadamOption));
  return { valid: invalidItems.length === 0, invalidItems };
}

/**
 * Filters out stale prasadam selections that are not permitted for the new slot.
 * Use this when the user changes their time slot to clean up invalid selections.
 */
export function filterValidSelectionsForSlot(
  slotTime: string | null | undefined,
  currentSelections: string[]
): string[] {
  const allowed = getPrasadamOptionsForSlot(slotTime);
  return currentSelections.filter(s => allowed.includes(s as PrasadamOption));
}
