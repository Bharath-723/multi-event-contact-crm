-- 20261017000002_contacts_register_profession_to_occupation.sql
-- ============================================================================
-- Fix Contacts Register Profession -> Master Dashboard Occupation Mapping
--
-- Purpose:
--   1. Replaces public.sync_contacts_register_to_master() trigger function to map
--      contacts_register.profession to master_contact_events.occupation.
--   2. Ensures incoming null/empty profession preserves existing non-empty occupation.
--   3. Safe, idempotent historical backfill of contacts_register.profession
--      into master_contact_events.occupation:
--      a) Inserts any missing master_contact_events rows for contacts_register
--      b) Updates existing events where occupation is NULL or empty
--   4. Preserves all phone-change handling, latest-registration ordering,
--      master contact identities, assignment history, and RLS permissions.
--
-- Safety:
--   - Transaction-safe: Wrapped in BEGIN ... COMMIT.
--   - Non-destructive: Existing non-empty occupations are never overwritten.
--   - Trigger preservation: Does NOT drop existing production trigger unnecessarily.
--   - Preserves contacts_register.profession column and its check constraint intact.
-- ============================================================================

BEGIN;

-- 1. Replace sync_contacts_register_to_master function with profession -> occupation mapping
CREATE OR REPLACE FUNCTION public.sync_contacts_register_to_master()
RETURNS TRIGGER AS $$
DECLARE
  v_phone text;
  v_old_phone text;
  v_master_id uuid;
  v_old_master_id uuid;
  v_name text;
  v_gender text;
  v_area text;
  v_company text;
  v_created_at timestamptz;
  v_existing_latest_at timestamptz;
  v_existing_latest_source text;
  v_existing_latest_id text;
  v_is_newer boolean;
BEGIN
  v_phone := normalize_phone(NEW.phone);
  IF TG_OP = 'UPDATE' THEN v_old_phone := normalize_phone(OLD.phone); END IF;
  v_name := NEW.full_name;
  v_gender := NEW.gender;
  v_area := NEW.area_of_stay;
  v_company := NEW.college_name;
  v_created_at := COALESCE(NEW.created_at, '1970-01-01T00:00:00Z'::timestamptz);

  IF v_phone IS NULL OR length(v_phone) = 0 THEN
    RETURN NEW;
  END IF;

  -- Phone Change Handling: NON-DESTRUCTIVE RECONCILIATION
  -- Disassociates the event from old master contact and recalculates old phone metadata.
  -- NEVER deletes public.master_contacts or master_contact_assignments!
  IF TG_OP = 'UPDATE' AND v_old_phone IS NOT NULL AND v_old_phone <> v_phone THEN
    SELECT master_contact_id INTO v_old_master_id
    FROM public.master_contact_events
    WHERE source = 'contacts_register' AND event_record_id = NEW.id::text;

    IF v_old_master_id IS NOT NULL THEN
      DELETE FROM public.master_contact_events
      WHERE source = 'contacts_register' AND event_record_id = NEW.id::text;

      -- Recalculate latest registration metadata for old phone without deleting master contact identity
      PERFORM recalculate_master_latest_info(v_old_phone);
    END IF;
  END IF;

  -- Fetch existing master contact by phone
  SELECT id, latest_registration_at, latest_registration_source, latest_registration_id
  INTO v_master_id, v_existing_latest_at, v_existing_latest_source, v_existing_latest_id
  FROM public.master_contacts
  WHERE phone = v_phone;

  IF v_master_id IS NOT NULL THEN
    -- Standardized Deterministic Tuple Comparison Rule: (created_at DESC, source DESC, record_id DESC)
    v_is_newer := FALSE;
    IF v_existing_latest_at IS NULL THEN
      v_is_newer := TRUE;
    ELSIF v_created_at > v_existing_latest_at THEN
      v_is_newer := TRUE;
    ELSIF v_created_at = v_existing_latest_at THEN
      IF 'contacts_register' > COALESCE(v_existing_latest_source, '') THEN
        v_is_newer := TRUE;
      ELSIF 'contacts_register' = COALESCE(v_existing_latest_source, '') AND NEW.id::text >= COALESCE(v_existing_latest_id, '') THEN
        v_is_newer := TRUE;
      END IF;
    END IF;

    IF v_is_newer THEN
      -- Update ALL latest registration fields together atomically
      UPDATE public.master_contacts SET
        name = COALESCE(v_name, master_contacts.name),
        gender = COALESCE(v_gender, master_contacts.gender),
        area_of_stay = COALESCE(v_area, master_contacts.area_of_stay),
        company_college = COALESCE(v_company, master_contacts.company_college),
        latest_registration_at = v_created_at,
        latest_registration_source = 'contacts_register',
        latest_registration_id = NEW.id::text,
        updated_at = now()
      WHERE id = v_master_id;
    ELSE
      -- Incoming registration is older: COALESCE missing non-null fields without overwriting latest registration metadata
      UPDATE public.master_contacts SET
        name = COALESCE(master_contacts.name, v_name),
        gender = COALESCE(master_contacts.gender, v_gender),
        area_of_stay = COALESCE(master_contacts.area_of_stay, v_area),
        company_college = COALESCE(master_contacts.company_college, v_company),
        updated_at = now()
      WHERE id = v_master_id;
    END IF;
  ELSE
    -- Insert new master contact record with native PostgreSQL Tuple Comparison ON CONFLICT handling
    INSERT INTO public.master_contacts (
      phone, name, age, gender, area_of_stay, company_college, latest_registration_at, latest_registration_source, latest_registration_id, created_at, updated_at
    ) VALUES (
      v_phone, v_name, NULL, v_gender, v_area, v_company, v_created_at, 'contacts_register', NEW.id::text, v_created_at, now()
    )
    ON CONFLICT (phone) DO UPDATE SET
      name = EXCLUDED.name,
      gender = EXCLUDED.gender,
      area_of_stay = EXCLUDED.area_of_stay,
      company_college = EXCLUDED.company_college,
      latest_registration_at = EXCLUDED.latest_registration_at,
      latest_registration_source = EXCLUDED.latest_registration_source,
      latest_registration_id = EXCLUDED.latest_registration_id,
      updated_at = now()
    WHERE (EXCLUDED.latest_registration_at, EXCLUDED.latest_registration_source, EXCLUDED.latest_registration_id) >= 
          (COALESCE(master_contacts.latest_registration_at, '1970-01-01T00:00:00Z'::timestamptz), COALESCE(master_contacts.latest_registration_source, ''), COALESCE(master_contacts.latest_registration_id, ''))
    RETURNING id INTO v_master_id;

    IF v_master_id IS NULL THEN
      SELECT id INTO v_master_id FROM public.master_contacts WHERE phone = v_phone;
    END IF;
  END IF;

  -- Upsert master event association with canonical occupation mapping
  IF v_master_id IS NOT NULL THEN
    INSERT INTO public.master_contact_events (
      master_contact_id, phone, source, event_display_name, event_record_id, event_date, created_at, occupation
    ) VALUES (
      v_master_id, v_phone, 'contacts_register', 'Contacts Register', NEW.id::text, v_created_at, now(),
      CASE 
        WHEN NEW.profession IS NOT NULL AND trim(NEW.profession) <> '' THEN NEW.profession
        ELSE NULL
      END
    )
    ON CONFLICT (source, event_record_id) DO UPDATE SET
      master_contact_id = EXCLUDED.master_contact_id,
      phone = EXCLUDED.phone,
      event_display_name = EXCLUDED.event_display_name,
      event_date = EXCLUDED.event_date,
      occupation = COALESCE(NULLIF(trim(EXCLUDED.occupation), ''), master_contact_events.occupation);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Revoke default public execution privileges and grant service_role/postgres only
REVOKE EXECUTE ON FUNCTION public.sync_contacts_register_to_master() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_contacts_register_to_master() TO service_role, postgres;

-- 2. Ensure trigger exists without dropping or interrupting concurrent operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_contacts_register_master'
      AND tgrelid = 'public.contacts_register'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_sync_contacts_register_master
    AFTER INSERT OR UPDATE ON public.contacts_register
    FOR EACH ROW EXECUTE FUNCTION public.sync_contacts_register_to_master();
  END IF;
END $$;

-- 3. Idempotent Backfill Step A: Create missing master_contact_events for any orphan contacts_register rows
INSERT INTO public.master_contact_events (
  master_contact_id, phone, source, event_display_name, event_record_id, event_date, created_at, occupation
)
SELECT 
  mc.id,
  normalize_phone(cr.phone),
  'contacts_register',
  'Contacts Register',
  cr.id::text,
  COALESCE(cr.created_at, now()),
  COALESCE(cr.created_at, now()),
  NULLIF(trim(cr.profession), '')
FROM public.contacts_register cr
JOIN public.master_contacts mc ON mc.phone = normalize_phone(cr.phone)
WHERE normalize_phone(cr.phone) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.master_contact_events mce
    WHERE mce.source = 'contacts_register' AND mce.event_record_id = cr.id::text
  )
ON CONFLICT (source, event_record_id) DO NOTHING;

-- 4. Idempotent Backfill Step B: Populate occupation where currently NULL or empty
-- Preserves any existing non-empty occupations
UPDATE public.master_contact_events mce
SET occupation = NULLIF(trim(cr.profession), '')
FROM public.contacts_register cr
WHERE mce.source = 'contacts_register'
  AND mce.event_record_id = cr.id::text
  AND cr.profession IS NOT NULL
  AND trim(cr.profession) <> ''
  AND (mce.occupation IS NULL OR trim(mce.occupation) = '');

-- 5. PostgREST Schema Reload
NOTIFY pgrst, 'reload schema';

COMMIT;
