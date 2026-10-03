-- ============================================================
-- 20261003000000_contacts_register_schema.sql
-- Production Migration for Contacts Register Layer
-- Standardized, Additive, Idempotent & Non-Destructive
-- ============================================================

-- 1. Ensure normalize_phone function exists safely without replacing existing production logic
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'normalize_phone'
  ) THEN
    CREATE FUNCTION public.normalize_phone(p_phone text)
    RETURNS text AS $fn$
    DECLARE
      cleaned text;
    BEGIN
      IF p_phone IS NULL THEN RETURN NULL; END IF;
      cleaned := regexp_replace(p_phone, '\D', '', 'g');

      IF length(cleaned) = 12 AND cleaned LIKE '91%' THEN
        cleaned := substring(cleaned from 3);
      ELSIF length(cleaned) = 11 AND cleaned LIKE '0%' THEN
        cleaned := substring(cleaned from 2);
      END IF;

      IF length(cleaned) = 10 AND cleaned ~ '^[6-9]\d{9}$' THEN
        RETURN cleaned;
      ELSE
        RETURN cleaned;
      END IF;
    END;
    $fn$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;
  END IF;
END$$;

-- 2. Dedicated Table for Contacts Register
CREATE TABLE IF NOT EXISTS public.contacts_register (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name                  TEXT NOT NULL,
    phone                      TEXT NOT NULL,
    college_name               TEXT NOT NULL,
    area_of_stay               TEXT NOT NULL,
    gender                     TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
    current_stay               TEXT NOT NULL CHECK (current_stay IN ('With Parents', 'In Hostel')),
    pg_name                    TEXT,
    skills                     TEXT[] NOT NULL DEFAULT '{}',
    interested_online_workshop BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_contacts_register_pg_name CHECK (
      (current_stay = 'With Parents' AND pg_name IS NULL) OR
      (current_stay = 'In Hostel' AND pg_name IS NOT NULL AND length(trim(pg_name)) >= 2)
    )
);

-- 3. Database-enforced normalized phone uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_register_phone_unique
    ON public.contacts_register (normalize_phone(phone));

-- 4. Supporting Performance Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_register_phone
    ON public.contacts_register (phone);
CREATE INDEX IF NOT EXISTS idx_contacts_register_created_at
    ON public.contacts_register (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_register_college
    ON public.contacts_register (college_name);
CREATE INDEX IF NOT EXISTS idx_contacts_register_area
    ON public.contacts_register (area_of_stay);
CREATE INDEX IF NOT EXISTS idx_contacts_register_gender
    ON public.contacts_register (gender);

-- 5. Row Level Security & Explicit Grants
ALTER TABLE public.contacts_register ENABLE ROW LEVEL SECURITY;

-- Explicit Table Grants for PostgREST
GRANT INSERT ON public.contacts_register TO anon, authenticated;
GRANT ALL ON public.contacts_register TO service_role;

-- RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contacts_register'
      AND policyname = 'contacts_register_insert_public'
  ) THEN
    CREATE POLICY "contacts_register_insert_public"
      ON public.contacts_register
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (TRUE);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contacts_register'
      AND policyname = 'contacts_register_service_role_all'
  ) THEN
    CREATE POLICY "contacts_register_service_role_all"
      ON public.contacts_register
      FOR ALL
      TO service_role
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;
END$$;

-- 6. Register contacts_register in Event Sources Registry (DO NOTHING if row exists to protect configuration)
INSERT INTO public.event_sources (source_key, display_name, table_name, is_active)
VALUES ('contacts_register', 'Contacts Register', 'contacts_register', true)
ON CONFLICT (source_key) DO NOTHING;

-- 7. Update recalculate_master_latest_info to safely include contacts_register
CREATE OR REPLACE FUNCTION recalculate_master_latest_info(p_phone text)
RETURNS void AS $$
DECLARE
  v_latest RECORD;
  v_master_id uuid;
BEGIN
  SELECT id INTO v_master_id FROM public.master_contacts WHERE phone = p_phone;
  IF v_master_id IS NULL THEN RETURN; END IF;

  WITH source_union AS (
    SELECT 'krishnashtami' AS source, id::text AS record_id, full_name AS name, age, gender, area_of_stay, company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
    FROM public.krishnashtami_registrations
    WHERE normalize_phone(phone) = p_phone
    UNION ALL
    SELECT 'rathayatra' AS source, id::text AS record_id, full_name AS name, age, gender, area_of_stay, company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
    FROM public.registrations
    WHERE normalize_phone(phone) = p_phone
    UNION ALL
    SELECT 'feedback_contacts' AS source, id::text AS record_id, full_name AS name, NULL AS age, gender, current_stay AS area_of_stay, college_name AS company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
    FROM public.feedback_contacts
    WHERE normalize_phone(phone) = p_phone
    UNION ALL
    SELECT 'contacts_register' AS source, id::text AS record_id, full_name AS name, NULL AS age, gender, area_of_stay, college_name AS company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
    FROM public.contacts_register
    WHERE normalize_phone(phone) = p_phone
  )
  SELECT * INTO v_latest
  FROM source_union
  ORDER BY created_at DESC, source DESC, record_id DESC
  LIMIT 1;

  IF v_latest IS NOT NULL THEN
    UPDATE public.master_contacts SET
      name = COALESCE(v_latest.name, master_contacts.name),
      age = COALESCE(v_latest.age, master_contacts.age),
      gender = COALESCE(v_latest.gender, master_contacts.gender),
      area_of_stay = COALESCE(v_latest.area_of_stay, master_contacts.area_of_stay),
      company_college = COALESCE(v_latest.company_college, master_contacts.company_college),
      latest_registration_at = v_latest.created_at,
      latest_registration_source = v_latest.source,
      latest_registration_id = v_latest.record_id,
      updated_at = now()
    WHERE id = v_master_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8. Non-Destructive Master Sync Trigger Function
--    NO deletion of master_contacts during phone updates; preserves all assignment history.
CREATE OR REPLACE FUNCTION sync_contacts_register_to_master()
RETURNS trigger AS $$
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

  -- Upsert master event association
  IF v_master_id IS NOT NULL THEN
    INSERT INTO public.master_contact_events (
      master_contact_id, phone, source, event_display_name, event_record_id, event_date, created_at
    ) VALUES (
      v_master_id, v_phone, 'contacts_register', 'Contacts Register', NEW.id::text, v_created_at, now()
    )
    ON CONFLICT (source, event_record_id) DO UPDATE SET
      master_contact_id = EXCLUDED.master_contact_id,
      phone = EXCLUDED.phone,
      event_display_name = EXCLUDED.event_display_name,
      event_date = EXCLUDED.event_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Revoke default public execution privileges and grant service_role/postgres only
REVOKE EXECUTE ON FUNCTION sync_contacts_register_to_master() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_contacts_register_to_master() TO service_role, postgres;

-- Attach trigger to contacts_register table
DROP TRIGGER IF EXISTS trg_sync_contacts_register_master ON public.contacts_register;
CREATE TRIGGER trg_sync_contacts_register_master
AFTER INSERT OR UPDATE ON public.contacts_register
FOR EACH ROW EXECUTE FUNCTION sync_contacts_register_to_master();

-- 9. PostgREST Schema Reload
NOTIFY pgrst, 'reload schema';
