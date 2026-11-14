/**
 * qr-url-resolver.ts
 *
 * Canonical URL and QR Code domain resolution for the MECM platform.
 * Enforces the current production domain: https://mecm.vercel.app
 *
 * Replaces obsolete domains:
 * - rathayatra-three.vercel.app
 * - krishnashtami-2026.vercel.app
 * - localhost / 127.0.0.1
 *
 * Preserves target route paths, queries, and parameters.
 */

export const MECM_PRODUCTION_DOMAIN = 'https://mecm.vercel.app';

export const OBSOLETE_DOMAINS = [
  'rathayatra-three.vercel.app',
  'krishnashtami-2026.vercel.app',
  'localhost:3000',
  'localhost',
  '127.0.0.1:3000',
  '127.0.0.1',
];

/**
 * Returns the canonical base URL for MECM public QR codes.
 * Defaults strictly to https://mecm.vercel.app.
 */
export function getMecmBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) {
    const isObsolete = OBSOLETE_DOMAINS.some((d) => envUrl.includes(d));
    if (!isObsolete && envUrl.startsWith('http')) {
      return envUrl.replace(/\/+$/, '');
    }
  }
  return MECM_PRODUCTION_DOMAIN;
}

/**
 * Normalizes any QR destination URL or path to use the current MECM production domain.
 *
 * - Relative paths (e.g. '/contacts-register', '/feedback') are mapped to:
 *   https://mecm.vercel.app/{path}
 *
 * - Obsolete full URLs (e.g. 'https://rathayatra-three.vercel.app', 'https://krishnashtami-2026.vercel.app')
 *   have their origin replaced with 'https://mecm.vercel.app' while preserving their specific route path.
 *
 * - Empty/root paths on obsolete domains are mapped to their intended destination:
 *   - Krishnashtami -> /krishnashtami-complete
 *   - Rathayatra -> /feedback
 *   - Default -> /contacts-register
 */
export function normalizeQrUrl(rawUrl?: string | null, fallbackPath = '/contacts-register'): string {
  const baseUrl = getMecmBaseUrl();
  const cleanFallback = fallbackPath.startsWith('/') ? fallbackPath : `/${fallbackPath}`;

  if (!rawUrl || !rawUrl.trim()) {
    return `${baseUrl}${cleanFallback}`;
  }

  const trimmed = rawUrl.trim();

  // Full URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.host.toLowerCase();

      const matchedObsolete = OBSOLETE_DOMAINS.some((obs) => host.includes(obs));
      if (matchedObsolete) {
        let newPath = parsed.pathname;
        if (newPath === '/' || !newPath) {
          if (host.includes('krishnashtami')) {
            newPath = '/krishnashtami-complete';
          } else if (host.includes('rathayatra')) {
            newPath = '/feedback';
          } else {
            newPath = cleanFallback;
          }
        }
        return `${baseUrl}${newPath}${parsed.search}${parsed.hash}`;
      }

      // If already on mecm.vercel.app, ensure it is cleanly formatted
      if (host === 'mecm.vercel.app') {
        return parsed.toString();
      }

      // Any other domain that is not mecm.vercel.app should be canonicalized to mecm.vercel.app
      let path = parsed.pathname;
      if (path === '/' || !path) {
        path = cleanFallback;
      }
      return `${baseUrl}${path}${parsed.search}${parsed.hash}`;
    } catch {
      return `${baseUrl}${cleanFallback}`;
    }
  }

  // Relative path
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Resolves the destination QR code URL for an event/festival.
 *
 * Routes:
 * - Krishnashtami -> https://mecm.vercel.app/krishnashtami-complete
 * - Rathayatra / default -> https://mecm.vercel.app/feedback
 * - Contacts Register -> https://mecm.vercel.app/contacts-register
 */
export function resolveFestivalQrUrl(
  festival?: { slug?: string | null; registration_url?: string | null; festival_name?: string | null } | null
): string {
  const baseUrl = getMecmBaseUrl();

  if (!festival) {
    return `${baseUrl}/feedback`;
  }

  const slug = (festival.slug || '').toLowerCase();
  const name = (festival.festival_name || '').toLowerCase();

  // If explicit registration_url exists, normalize it
  if (festival.registration_url && festival.registration_url.trim()) {
    const fallback = slug.includes('krishnashtami') || name.includes('krishnashtami')
      ? '/krishnashtami-complete'
      : '/feedback';
    return normalizeQrUrl(festival.registration_url, fallback);
  }

  // Derive route based on festival identity
  if (slug.includes('krishnashtami') || name.includes('krishnashtami')) {
    return `${baseUrl}/krishnashtami-complete`;
  }

  if (slug.includes('rathayatra') || name.includes('rathayatra')) {
    return `${baseUrl}/feedback`;
  }

  return `${baseUrl}/contacts-register`;
}
