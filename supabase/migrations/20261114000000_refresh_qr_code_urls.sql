-- ============================================================
-- 20261114000000_refresh_qr_code_urls.sql
-- MECM: Refresh All Existing QR Code URLs to Production Domain
--
-- Replaces obsolete domains:
-- - https://rathayatra-three.vercel.app -> https://mecm.vercel.app/feedback
-- - https://krishnashtami-2026.vercel.app -> https://mecm.vercel.app/krishnashtami-complete
-- - http://localhost:3000 -> https://mecm.vercel.app
--
-- Preserves all event IDs, registration records, and historical data.
-- ============================================================

DO $$
BEGIN
  -- 1. Update festival_events table to canonical MECM production domain
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'festival_events') THEN
    UPDATE public.festival_events
    SET registration_url = 'https://mecm.vercel.app/feedback',
        updated_at = NOW()
    WHERE (slug = 'rathayatra-2026' OR festival_name ILIKE '%rathayatra%')
      AND (registration_url IS NULL OR registration_url NOT LIKE 'https://mecm.vercel.app%');

    UPDATE public.festival_events
    SET registration_url = 'https://mecm.vercel.app/krishnashtami-complete',
        updated_at = NOW()
    WHERE (slug = 'krishnashtami-2026' OR festival_name ILIKE '%krishnashtami%')
      AND (registration_url IS NULL OR registration_url NOT LIKE 'https://mecm.vercel.app%');

    -- 2. General sweep for any remaining rows containing old domains
    UPDATE public.festival_events
    SET registration_url = REPLACE(registration_url, 'https://rathayatra-three.vercel.app', 'https://mecm.vercel.app/feedback'),
        updated_at = NOW()
    WHERE registration_url LIKE '%rathayatra-three.vercel.app%';

    UPDATE public.festival_events
    SET registration_url = REPLACE(registration_url, 'https://krishnashtami-2026.vercel.app', 'https://mecm.vercel.app/krishnashtami-complete'),
        updated_at = NOW()
    WHERE registration_url LIKE '%krishnashtami-2026.vercel.app%';

    UPDATE public.festival_events
    SET registration_url = REPLACE(registration_url, 'http://localhost:3000', 'https://mecm.vercel.app'),
        updated_at = NOW()
    WHERE registration_url LIKE '%localhost:3000%';
  END IF;
END $$;
