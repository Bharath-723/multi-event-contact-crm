/**
 * Weekly Friday Reset and Period Calculation Utility
 *
 * Timezone: Asia/Kolkata (UTC+5:30)
 * Rollover: Friday at 00:00:00 Asia/Kolkata
 *
 * Each period is identified by the date string of its start Friday:
 * e.g., '2026-10-16' for the week covering Friday 2026-10-16 00:00 through Thursday 2026-10-22 23:59:59.
 */

export const APPLICATION_TIMEZONE = 'Asia/Kolkata';

export interface KolkataDateParts {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 0=Sunday, 1=Monday ... 5=Friday, 6=Saturday
  hour: number;
  minute: number;
  second: number;
}

/**
 * Parses any date/timestamp into Asia/Kolkata wall clock parts.
 */
export function getKolkataDateParts(date: Date = new Date()): KolkataDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APPLICATION_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    dayOfWeek: weekdayMap[map.weekday] ?? 0,
    hour: parseInt(map.hour, 10) % 24,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
  };
}

/**
 * Returns the current weekly period identifier as 'YYYY-MM-DD' representing the start Friday in Asia/Kolkata.
 * Friday is day 5.
 * Formula: daysBack = (dayOfWeek - 5 + 7) % 7
 */
export function getCurrentWeeklyPeriod(date: Date = new Date()): string {
  const { year, month, day, dayOfWeek } = getKolkataDateParts(date);
  const daysBack = (dayOfWeek - 5 + 7) % 7;

  // Use UTC math to shift calendar days cleanly without timezone drift
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() - daysBack);

  const pYear = utcDate.getUTCFullYear();
  const pMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const pDay = String(utcDate.getUTCDate()).padStart(2, '0');

  return `${pYear}-${pMonth}-${pDay}`;
}

/**
 * Returns the start Date object (Friday 00:00:00 Asia/Kolkata) of the given weekly period or current period.
 */
export function getWeeklyPeriodStartDate(periodId?: string): Date {
  const period = periodId || getCurrentWeeklyPeriod();
  const [year, month, day] = period.split('-').map(Number);
  // Friday 00:00:00 Asia/Kolkata = Thursday 18:30:00 UTC
  // Math: Date.UTC(year, month - 1, day) - 5h30m
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - (5.5 * 60 * 60 * 1000));
}

/**
 * Calculates the next reset timestamp (the next Friday at 00:00:00 Asia/Kolkata).
 */
export function getNextResetTimestamp(date: Date = new Date()): Date {
  const currentPeriod = getCurrentWeeklyPeriod(date);
  const startFriday = getWeeklyPeriodStartDate(currentPeriod);
  // Next reset is exactly 7 days after the current period's start Friday
  return new Date(startFriday.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Human-readable period summary for UI badges.
 * e.g. "Week of Oct 16 – Oct 22, 2026"
 */
export function formatWeeklyPeriodLabel(periodId?: string): string {
  const period = periodId || getCurrentWeeklyPeriod();
  const start = getWeeklyPeriodStartDate(period);
  const end = new Date(start.getTime() + (7 * 24 * 60 * 60 * 1000) - 1);

  const opts: Intl.DateTimeFormatOptions = { timeZone: APPLICATION_TIMEZONE, month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-IN', opts);
  const endStr = end.toLocaleDateString('en-IN', { ...opts, year: 'numeric' });

  return `${startStr} – ${endStr}`;
}
