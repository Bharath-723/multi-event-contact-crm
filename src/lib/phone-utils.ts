/**
 * Canonical Indian Mobile Phone Normalization Rule.
 * Client-safe utility (zero server-side or admin dependencies).
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  return cleaned;
}
