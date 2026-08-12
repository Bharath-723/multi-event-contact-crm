export const KRISHNASHTAMI_SLOTS = [
  '7:00 AM – 1:00 PM',
  '3:00 PM – 9:00 PM',
  '6:00 PM – 12:00 AM',
  'Full Day (7AM – 12AM)',
] as const;

export type PrasadamOption = 'Breakfast' | 'Lunch' | 'Dinner';

export const SLOT_PRASADAM_MAP: Record<string, PrasadamOption[]> = {
  '7:00 AM – 1:00 PM': ['Breakfast', 'Lunch'],
  '3:00 PM – 9:00 PM': ['Dinner'],
  '6:00 PM – 12:00 AM': ['Dinner'],
  'Full Day (7AM – 12AM)': ['Breakfast', 'Lunch', 'Dinner'],
};

export const FASTING_SUBTITLE_TEXT = "If you are fasting, fruits are being arranged-Kindly collect";

/**
 * Validates whether a given prasadam option is permitted for a given time slot.
 */
export function isPrasadamAllowedForSlot(slotTime: string | null | undefined, prasadam: string | null | undefined): boolean {
  if (!slotTime || !prasadam) return false;
  
  // Normalize slot lookup
  const cleanSlot = slotTime.trim();
  const allowed = SLOT_PRASADAM_MAP[cleanSlot];
  
  if (!allowed) return false;
  return allowed.includes(prasadam as PrasadamOption);
}
