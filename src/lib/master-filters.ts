import { supabaseAdmin } from './supabase-admin';

export interface EventBreakdownItem {
  source: string;
  event_display_name: string;
  count: number;
}

export interface MasterMetadata {
  areas: string[];
  colleges: string[];
  areaVariantsMap: Map<string, string[]>;
  collegeVariantsMap: Map<string, string[]>;
  eventBreakdown: EventBreakdownItem[];
  totalContacts: number;
  cachedAt: number;
}

// In-memory server-side cache for high performance (60s TTL)
let cachedMetadata: MasterMetadata | null = null;
const CACHE_TTL_MS = 60 * 1000;

/**
 * Normalizes an area or college string by trimming and collapsing multiple spaces.
 */
export function cleanFilterString(val: string | null | undefined): string | null {
  if (!val) return null;
  const cleaned = val.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned === '—' || cleaned === '-' || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined') {
    return null;
  }
  return cleaned;
}

/**
 * Selects the optimal canonical display label from a set of raw variants for the same case-insensitive key.
 * Strategy:
 * 1. Most frequent in database (e.g. CBIT (318) vs Cbit (41) -> CBIT)
 * 2. If frequencies tie, prefer all-uppercase acronyms (e.g. MGIT over Mgit, TCS over Tcs)
 * 3. Prefer Title Case over lowercase
 */
export function chooseCanonicalLabel(candidates: Map<string, number>): string {
  const sorted = Array.from(candidates.entries()).sort((a, b) => {
    // 1. Frequency in DB
    if (b[1] !== a[1]) return b[1] - a[1];
    // 2. All-caps acronym preference
    const aIsAllUpper = a[0] === a[0].toUpperCase() && /[A-Z]/.test(a[0]);
    const bIsAllUpper = b[0] === b[0].toUpperCase() && /[A-Z]/.test(b[0]);
    if (aIsAllUpper && !bIsAllUpper) return -1;
    if (!aIsAllUpper && bIsAllUpper) return 1;
    // 3. Title case / starts with capital letter
    const aStartsUpper = /^[A-Z]/.test(a[0]);
    const bStartsUpper = /^[A-Z]/.test(b[0]);
    if (aStartsUpper && !bStartsUpper) return -1;
    if (!aStartsUpper && bStartsUpper) return 1;
    return a[0].localeCompare(b[0]);
  });
  return sorted[0][0];
}

/**
 * Fetches all distinct areas and colleges from master_contacts across the full table without truncation.
 */
async function fetchAllContactFilterValues(): Promise<Array<{ area_of_stay: string | null; company_college: string | null }>> {
  const allRows: Array<{ area_of_stay: string | null; company_college: string | null }> = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('master_contacts')
      .select('area_of_stay, company_college')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[master-filters] Error fetching master contact filter values:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

/**
 * Calculates unique master contact counts per event source from master_contact_events.
 */
async function calculateEventBreakdown(
  eventSources: Array<{ source_key: string; display_name: string }>
): Promise<EventBreakdownItem[]> {
  try {
    const counts = await Promise.all(
      eventSources.map(async (src) => {
        let from = 0;
        const pageSize = 1000;
        const contactIdSet = new Set<string>();

        while (true) {
          const { data, error } = await supabaseAdmin
            .from('master_contact_events')
            .select('master_contact_id')
            .eq('source', src.source_key)
            .range(from, from + pageSize - 1);

          if (error) {
            console.error(`[master-filters] Error fetching event breakdown for ${src.source_key}:`, error);
            break;
          }
          if (!data || data.length === 0) break;
          data.forEach((r) => {
            if (r.master_contact_id) contactIdSet.add(String(r.master_contact_id));
          });
          if (data.length < pageSize) break;
          from += pageSize;
        }

        return {
          source: src.source_key,
          event_display_name: src.display_name,
          count: contactIdSet.size,
        };
      })
    );

    return counts;
  } catch (err) {
    console.error('[master-filters] Error calculating event breakdown:', err);
    return eventSources.map((s) => ({
      source: s.source_key,
      event_display_name: s.display_name,
      count: 0,
    }));
  }
}

/**
 * Loads or returns cached Master Dashboard metadata (areas, colleges, variant maps, event breakdown).
 */
export async function getMasterMetadata(
  registeredSources: Array<{ source_key: string; display_name: string }>,
  forceRefresh = false
): Promise<MasterMetadata> {
  const now = Date.now();
  if (!forceRefresh && cachedMetadata && now - cachedMetadata.cachedAt < CACHE_TTL_MS) {
    return cachedMetadata;
  }

  // 1. Fetch raw area and college rows from the whole table
  // 2. Fetch event breakdown concurrently
  const [filterRows, eventBreakdown] = await Promise.all([
    fetchAllContactFilterValues(),
    calculateEventBreakdown(registeredSources),
  ]);

  // Aggregate Area of Stay
  const areaGroups = new Map<string, Map<string, number>>();
  for (const row of filterRows) {
    const cleaned = cleanFilterString(row.area_of_stay);
    if (!cleaned) continue;
    const lowerKey = cleaned.toLowerCase();
    if (!areaGroups.has(lowerKey)) {
      areaGroups.set(lowerKey, new Map());
    }
    const candidateMap = areaGroups.get(lowerKey)!;
    // Track both raw value and trimmed cleaned value to support exact DB matches
    const rawVal = row.area_of_stay || cleaned;
    candidateMap.set(cleaned, (candidateMap.get(cleaned) || 0) + 1);
    if (rawVal !== cleaned) {
      candidateMap.set(rawVal, (candidateMap.get(rawVal) || 0) + 1);
    }
  }

  const finalAreas: string[] = [];
  const areaVariantsMap = new Map<string, string[]>();

  for (const [lowerKey, candidateMap] of areaGroups.entries()) {
    const canonical = chooseCanonicalLabel(candidateMap);
    finalAreas.push(canonical);
    const variants = Array.from(candidateMap.keys());
    areaVariantsMap.set(canonical.toLowerCase(), variants);
    areaVariantsMap.set(lowerKey, variants);
  }

  finalAreas.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  // Aggregate Company / College
  const collegeGroups = new Map<string, Map<string, number>>();
  for (const row of filterRows) {
    const cleaned = cleanFilterString(row.company_college);
    if (!cleaned) continue;
    const lowerKey = cleaned.toLowerCase();
    if (!collegeGroups.has(lowerKey)) {
      collegeGroups.set(lowerKey, new Map());
    }
    const candidateMap = collegeGroups.get(lowerKey)!;
    const rawVal = row.company_college || cleaned;
    candidateMap.set(cleaned, (candidateMap.get(cleaned) || 0) + 1);
    if (rawVal !== cleaned) {
      candidateMap.set(rawVal, (candidateMap.get(rawVal) || 0) + 1);
    }
  }

  const finalColleges: string[] = [];
  const collegeVariantsMap = new Map<string, string[]>();

  for (const [lowerKey, candidateMap] of collegeGroups.entries()) {
    const canonical = chooseCanonicalLabel(candidateMap);
    finalColleges.push(canonical);
    const variants = Array.from(candidateMap.keys());
    collegeVariantsMap.set(canonical.toLowerCase(), variants);
    collegeVariantsMap.set(lowerKey, variants);
  }

  finalColleges.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  cachedMetadata = {
    areas: finalAreas,
    colleges: finalColleges,
    areaVariantsMap,
    collegeVariantsMap,
    eventBreakdown,
    totalContacts: filterRows.length,
    cachedAt: now,
  };

  return cachedMetadata;
}

/**
 * Expands selected canonical area names into all corresponding raw database strings.
 */
export function expandAreaSelections(selected: string[], metadata: MasterMetadata): string[] {
  if (!selected || selected.length === 0) return [];
  const expanded = new Set<string>();
  for (const item of selected) {
    const lower = item.toLowerCase().trim();
    const variants = metadata.areaVariantsMap.get(lower);
    if (variants && variants.length > 0) {
      variants.forEach((v) => expanded.add(v));
    } else {
      expanded.add(item);
    }
  }
  return Array.from(expanded);
}

/**
 * Expands selected canonical company/college names into all corresponding raw database strings.
 */
export function expandCompanySelections(selected: string[], metadata: MasterMetadata): string[] {
  if (!selected || selected.length === 0) return [];
  const expanded = new Set<string>();
  for (const item of selected) {
    const lower = item.toLowerCase().trim();
    const variants = metadata.collegeVariantsMap.get(lower);
    if (variants && variants.length > 0) {
      variants.forEach((v) => expanded.add(v));
    } else {
      expanded.add(item);
    }
  }
  return Array.from(expanded);
}

/**
 * Invalidate the cache (e.g. after backfill or manual refresh).
 */
export function invalidateMasterMetadataCache(): void {
  cachedMetadata = null;
}
