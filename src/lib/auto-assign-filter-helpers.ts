/**
 * Pure filter evaluation helpers for Auto-Assignment
 */

export function isFilterActive(val?: string | null): boolean {
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  if (!s || s === 'all' || s.startsWith('all ') || s === 'n/a' || s === 'none') return false;
  return true;
}

export function parseFilterValues(rawVal: unknown): string[] {
  if (rawVal === null || rawVal === undefined) return [];
  if (Array.isArray(rawVal)) {
    return Array.from(
      new Set(
        rawVal
          .flatMap((item) => (typeof item === 'string' ? item.split(',') : [String(item)]))
          .map((v) => String(v).trim())
          .filter((s) => s && s.toLowerCase() !== 'all' && !s.toLowerCase().startsWith('all ') && s.toLowerCase() !== 'none')
      )
    );
  }
  if (typeof rawVal === 'string') {
    const trimmed = rawVal.trim();
    if (!trimmed || trimmed.toLowerCase() === 'all' || trimmed.toLowerCase().startsWith('all ') || trimmed.toLowerCase() === 'none') {
      return [];
    }
    if (trimmed.includes(',')) {
      return Array.from(
        new Set(
          trimmed
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s && s.toLowerCase() !== 'all' && !s.toLowerCase().startsWith('all ') && s.toLowerCase() !== 'none')
        )
      );
    }
    return [trimmed];
  }
  if (typeof rawVal === 'number' || typeof rawVal === 'boolean') {
    return [String(rawVal)];
  }
  return [];
}

export function mapLevelCodeToNumber(rawLevel: unknown): number {
  if (!rawLevel) return 0;
  const s = String(rawLevel).trim().toLowerCase();
  const match = s.match(/\blevel-(\d+)\b/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) return num;
  }
  if (s.includes('aomc')) return 1;
  if (s.includes('foundation')) return 2;
  if (s.includes('prilims')) return 3;
  if (s.includes('enhance')) return 4;
  if (s.includes('no level')) return 0;
  const parsed = parseInt(s, 10);
  if (!isNaN(parsed)) return parsed;
  return 0;
}

export function matchesClassesAttended(classesAttended: unknown, filterVal: string | null): boolean {
  if (!filterVal || filterVal.toLowerCase() === 'all' || filterVal === '') return true;
  const count = typeof classesAttended === 'number' && !isNaN(classesAttended) ? classesAttended : 0;
  const trimmed = filterVal.trim();

  if (trimmed === '0') return count === 0;
  if (trimmed === '1-10') return count >= 1 && count <= 10;
  if (trimmed === '11-20') return count >= 11 && count <= 20;
  if (trimmed === '21+' || trimmed === '>=21') return count >= 21;
  if (trimmed.startsWith('>=')) {
    const min = parseInt(trimmed.slice(2), 10);
    return !isNaN(min) && count >= min;
  }
  if (trimmed.startsWith('<=')) {
    const max = parseInt(trimmed.slice(2), 10);
    return !isNaN(max) && count <= max;
  }
  if (trimmed.endsWith('+')) {
    const min = parseInt(trimmed.slice(0, -1), 10);
    return !isNaN(min) && count >= min;
  }
  const exact = parseInt(trimmed, 10);
  if (!isNaN(exact)) return count === exact;
  return true;
}

export function matchesLevelNumber(rawLevel: unknown, filterVal: string | null): boolean {
  if (!filterVal || filterVal.toLowerCase() === 'all' || filterVal === '') return true;
  const contactLvl = mapLevelCodeToNumber(rawLevel);
  const trimmed = filterVal.trim();

  if (trimmed.startsWith('>=')) {
    const min = parseInt(trimmed.slice(2), 10);
    return !isNaN(min) && contactLvl >= min;
  }
  if (trimmed.startsWith('<=')) {
    const max = parseInt(trimmed.slice(2), 10);
    return !isNaN(max) && contactLvl <= max;
  }
  if (trimmed.endsWith('+')) {
    const min = parseInt(trimmed.slice(0, -1), 10);
    return !isNaN(min) && contactLvl >= min;
  }
  const targetLvl = mapLevelCodeToNumber(trimmed);
  return contactLvl === targetLvl;
}

export function matchesChanting(chantingCount: unknown, filterVal: string | null): boolean {
  if (!filterVal || filterVal.toLowerCase() === 'all' || filterVal === '') return true;
  const count = typeof chantingCount === 'number' && !isNaN(chantingCount) ? chantingCount : 0;
  const trimmed = filterVal.trim();

  if (trimmed === '0') return count === 0;
  if (trimmed.startsWith('>=')) {
    const min = parseInt(trimmed.slice(2), 10);
    return !isNaN(min) && count >= min;
  }
  if (trimmed.startsWith('<=')) {
    const max = parseInt(trimmed.slice(2), 10);
    return !isNaN(max) && count <= max;
  }
  if (trimmed.endsWith('+')) {
    const min = parseInt(trimmed.slice(0, -1), 10);
    return !isNaN(min) && count >= min;
  }
  const exact = parseInt(trimmed, 10);
  if (!isNaN(exact)) return count === exact;
  return true;
}

export function normalizeGender(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().toLowerCase();
}

export function isFemale(raw: unknown): boolean {
  return normalizeGender(raw) === 'female';
}

export function isGenderEligible(raw: unknown): boolean {
  const g = normalizeGender(raw);
  if (!g) return false;
  return g !== 'female';
}

export function normalizeOccupationCategory(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (['student', 'studying', 'college', 'school'].some((k) => s.includes(k))) return 'Student';
  if (['employee', 'employed', 'private', 'govt', 'government'].some((k) => s.includes(k))) return 'Employee';
  if (['working', 'job', 'software', 'it', 'engineer', 'developer'].some((k) => s.includes(k))) return 'Working';
  if (['business', 'shop', 'owner', 'self'].some((k) => s.includes(k))) return 'Business';
  if (['other', 'others'].some((k) => s === k || s.startsWith('other'))) return 'Others';
  return null;
}

export function parseToYMD(dateStr: unknown): string | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

