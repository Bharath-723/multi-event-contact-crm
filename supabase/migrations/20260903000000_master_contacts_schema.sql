-- Migration: Master Contacts & Global Contact Directory Architecture
-- Date: 2026-09-03
-- Safe, additive migration for Master Contacts global directory layer.

-- 1. Phone Normalization Function (Canonical Indian Mobile Validation Rule)
CREATE OR REPLACE FUNCTION normalize_phone(p_phone text)
RETURNS text AS $$
DECLARE
  cleaned text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  cleaned := regexp_replace(p_phone, '\D', '', 'g');

  -- 12 digits starting with country code '91'
  IF length(cleaned) = 12 AND cleaned LIKE '91%' THEN
    cleaned := substring(cleaned from 3);
  -- 11 digits starting with trunk prefix '0'
  ELSIF length(cleaned) = 11 AND cleaned LIKE '0%' THEN
    cleaned := substring(cleaned from 2);
  END IF;

  -- Validate 10-digit Indian Mobile pattern (starts with 6, 7, 8, or 9)
  IF length(cleaned) = 10 AND cleaned ~ '^[6-9]\d{9}$' THEN
    RETURN cleaned;
  ELSE
    -- Return cleaned raw string for non-standard entries without blind truncation
    RETURN cleaned;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Functional Expression Indexes on Source Tables (Non-destructive performance optimization for phone lookups)
CREATE INDEX IF NOT EXISTS idx_registrations_norm_phone ON registrations (normalize_phone(phone));
CREATE INDEX IF NOT EXISTS idx_krishnashtami_norm_phone ON krishnashtami_registrations (normalize_phone(phone));
CREATE INDEX IF NOT EXISTS idx_feedback_norm_phone ON feedback_contacts (normalize_phone(phone));

-- 3. Master Contacts Table (One Unique Row Per Normalized Phone)
CREATE TABLE IF NOT EXISTS master_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  age integer,
  gender text,
  area_of_stay text,
  company_college text,
  latest_registration_at timestamptz DEFAULT now(),
  latest_registration_source text,
  latest_registration_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Master Contact Events Table (Relationship mapping contact to 1 or more event attendances with event-specific context)
CREATE TABLE IF NOT EXISTS master_contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_contact_id uuid NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
  phone text NOT NULL,
  source text NOT NULL,
  event_display_name text NOT NULL,
  event_record_id text NOT NULL,
  event_date timestamptz DEFAULT now(),
  occupation text,
  standard text,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  interested_to_volunteer text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_master_contact_event UNIQUE (source, event_record_id)
);

-- 5. Master Contact Assignments Table (Dedicated Master Dashboard Assignment System with Full History Preservation)
CREATE TABLE IF NOT EXISTS master_contact_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_contact_id uuid NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'assigned',
  comments text,
  assigned_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Partial Unique Index guaranteeing MAX 1 ACTIVE ASSIGNMENT PER MASTER CONTACT while allowing unlimited historical rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_master_contact_assignment 
ON master_contact_assignments(master_contact_id) 
WHERE is_active = true;

-- 6. Dynamic Event Sources Registry (Extensible for future event sources e.g. Rama Navami 2026)
CREATE TABLE IF NOT EXISTS event_sources (
  source_key text PRIMARY KEY,
  display_name text NOT NULL,
  table_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Seed existing event sources
INSERT INTO event_sources (source_key, display_name, table_name) VALUES
  ('krishnashtami', 'Krishnashtami 2026', 'krishnashtami_registrations'),
  ('rathayatra', 'Rathayatra 2026', 'registrations'),
  ('feedback_contacts', 'Feedback Contact', 'feedback_contacts')
ON CONFLICT (source_key) DO UPDATE SET display_name = EXCLUDED.display_name, table_name = EXCLUDED.table_name;

-- 7. Indexes for fast query performance & search
CREATE INDEX IF NOT EXISTS idx_master_contacts_phone ON master_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_master_contacts_name ON master_contacts(name);
CREATE INDEX IF NOT EXISTS idx_master_contacts_area ON master_contacts(area_of_stay);
CREATE INDEX IF NOT EXISTS idx_master_contacts_company ON master_contacts(company_college);
CREATE INDEX IF NOT EXISTS idx_master_contacts_gender ON master_contacts(gender);
CREATE INDEX IF NOT EXISTS idx_master_contacts_latest_at ON master_contacts(latest_registration_at);

CREATE INDEX IF NOT EXISTS idx_master_contact_events_master_id ON master_contact_events(master_contact_id);
CREATE INDEX IF NOT EXISTS idx_master_contact_events_phone ON master_contact_events(phone);
CREATE INDEX IF NOT EXISTS idx_master_contact_events_source ON master_contact_events(source);
CREATE INDEX IF NOT EXISTS idx_master_contact_events_event_date ON master_contact_events(event_date);
CREATE INDEX IF NOT EXISTS idx_master_contact_events_occupation ON master_contact_events(occupation);
CREATE INDEX IF NOT EXISTS idx_master_contact_events_standard ON master_contact_events(standard);

CREATE INDEX IF NOT EXISTS idx_master_assignments_master_id ON master_contact_assignments(master_contact_id);
CREATE INDEX IF NOT EXISTS idx_master_assignments_operator_id ON master_contact_assignments(operator_id);
CREATE INDEX IF NOT EXISTS idx_master_assignments_active ON master_contact_assignments(is_active);
CREATE INDEX IF NOT EXISTS idx_master_assignments_status ON master_contact_assignments(status);

-- 8. Atomic Database-Enforced Assignment RPC with Row Locking & Capacity Check BEFORE Deactivation
CREATE OR REPLACE FUNCTION assign_master_contact_atomic(
  p_master_contact_id uuid,
  p_operator_id uuid,
  p_assigned_by uuid DEFAULT NULL,
  p_max_capacity integer DEFAULT 40
) RETURNS jsonb 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_count integer;
  v_existing_active_id uuid;
  v_existing_operator_id uuid;
  v_op_active boolean;
  v_master_exists boolean;
  v_new_id uuid;
  HARD_MAX_CAPACITY CONSTANT integer := 40;
BEGIN
  -- 1. Lock target operator row FOR UPDATE to serialize concurrent assignments for this operator
  SELECT is_active INTO v_op_active
  FROM contact_operators
  WHERE id = p_operator_id
  FOR UPDATE;

  IF v_op_active IS NULL OR NOT v_op_active THEN
    RETURN jsonb_build_object('success', false, 'message', 'Operator not found or is disabled');
  END IF;

  -- 2. Lock target master contact row FOR UPDATE to serialize concurrent reassignments for this contact
  SELECT (id IS NOT NULL) INTO v_master_exists
  FROM master_contacts
  WHERE id = p_master_contact_id
  FOR UPDATE;

  IF v_master_exists IS NULL OR NOT v_master_exists THEN
    RETURN jsonb_build_object('success', false, 'message', 'Master contact not found');
  END IF;

  -- 3. Find existing active assignment for this master contact
  SELECT id, operator_id INTO v_existing_active_id, v_existing_operator_id
  FROM master_contact_assignments
  WHERE master_contact_id = p_master_contact_id AND is_active = true;

  -- 4. If already assigned to target operator, return already_assigned with NO changes
  IF v_existing_active_id IS NOT NULL AND v_existing_operator_id = p_operator_id THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already assigned to this operator', 'status', 'already_assigned');
  END IF;

  -- 5. Count current active assignments for target operator
  SELECT count(*) INTO v_current_count
  FROM master_contact_assignments
  WHERE operator_id = p_operator_id AND is_active = true;

  -- 6. CHECK CAPACITY BEFORE MAKING ANY ASSIGNMENT DEACTIVATION OR MODIFICATION
  IF v_current_count >= HARD_MAX_CAPACITY THEN
    RETURN jsonb_build_object('success', false, 'message', 'Operator capacity limit reached (Max ' || HARD_MAX_CAPACITY || ')');
  END IF;

  -- 7. ONLY AFTER CAPACITY IS CONFIRMED: Deactivate previous active assignment, if any
  IF v_existing_active_id IS NOT NULL THEN
    UPDATE master_contact_assignments
    SET is_active = false, updated_at = now()
    WHERE id = v_existing_active_id;
  END IF;

  -- 8. Insert new active assignment
  INSERT INTO master_contact_assignments (
    master_contact_id, operator_id, is_active, status, assigned_at, updated_at
  ) VALUES (
    p_master_contact_id, p_operator_id, true, 'assigned', now(), now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'message', 'Assigned successfully', 'assignment_id', v_new_id);
END;
$$;

-- Explicit EXECUTE permissions: service_role ONLY (Direct client-side RPC invocation blocked for authenticated/anon users)
REVOKE EXECUTE ON FUNCTION assign_master_contact_atomic(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_master_contact_atomic(uuid, uuid, uuid, integer) TO service_role;

-- Helper procedure to recalculate a master contact's latest registration metadata DIRECTLY from original source tables' created_at
CREATE OR REPLACE FUNCTION recalculate_master_latest_info(p_phone text)
RETURNS void AS $$
DECLARE
  v_latest RECORD;
  v_master_id uuid;
BEGIN
  SELECT id INTO v_master_id FROM master_contacts WHERE phone = p_phone;
  IF v_master_id IS NULL THEN RETURN; END IF;

  -- Directly query original source tables for all records matching p_phone
  WITH source_union AS (
    SELECT 'krishnashtami' AS source, id::text AS record_id, full_name AS name, age, gender, area_of_stay, company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
    FROM krishnashtami_registrations
    WHERE normalize_phone(phone) = p_phone
    UNION ALL
    SELECT 'rathayatra' AS source, id::text AS record_id, full_name AS name, age, gender, area_of_stay, company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
    FROM registrations
    WHERE normalize_phone(phone) = p_phone
    UNION ALL
    SELECT 'feedback_contacts' AS source, id::text AS record_id, full_name AS name, NULL AS age, gender, current_stay AS area_of_stay, college_name AS company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
    FROM feedback_contacts
    WHERE normalize_phone(phone) = p_phone
  )
  SELECT * INTO v_latest
  FROM source_union
  ORDER BY created_at DESC, source DESC, record_id DESC
  LIMIT 1;

  IF v_latest IS NOT NULL THEN
    UPDATE master_contacts SET
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
$$ LANGUAGE plpgsql;

-- 9. Trigger Function to automatically sync new/updated registrations to master layer
CREATE OR REPLACE FUNCTION sync_registration_to_master()
RETURNS trigger AS $$
DECLARE
  v_phone text;
  v_old_phone text;
  v_source text;
  v_event_display_name text;
  v_master_id uuid;
  v_old_master_id uuid;
  v_name text;
  v_age integer;
  v_gender text;
  v_area text;
  v_company text;
  v_occupation text;
  v_standard text;
  v_service_id uuid;
  v_volunteer text;
  v_created_at timestamptz;
  v_existing_latest_at timestamptz;
  v_existing_latest_source text;
  v_existing_latest_id text;
  v_is_newer boolean;
  v_rem_count integer;
BEGIN
  IF TG_TABLE_NAME = 'krishnashtami_registrations' THEN
    v_source := 'krishnashtami';
    v_event_display_name := 'Krishnashtami 2026';
    v_name := NEW.full_name;
    v_phone := normalize_phone(NEW.phone);
    IF TG_OP = 'UPDATE' THEN v_old_phone := normalize_phone(OLD.phone); END IF;
    v_age := NEW.age;
    v_gender := NEW.gender;
    v_area := NEW.area_of_stay;
    v_company := NEW.company_college;
    v_occupation := NEW.occupation;
    v_standard := NEW.standard;
    v_service_id := NEW.service_id;
    v_volunteer := CASE WHEN NEW.interested_to_volunteer IS TRUE THEN 'Yes' WHEN NEW.interested_to_volunteer IS FALSE THEN 'No' ELSE NULL END;
    v_created_at := COALESCE(NEW.created_at, now());
  ELSIF TG_TABLE_NAME = 'registrations' THEN
    v_source := 'rathayatra';
    v_event_display_name := 'Rathayatra 2026';
    v_name := NEW.full_name;
    v_phone := normalize_phone(NEW.phone);
    IF TG_OP = 'UPDATE' THEN v_old_phone := normalize_phone(OLD.phone); END IF;
    v_age := NEW.age;
    v_gender := NEW.gender;
    v_area := NEW.area_of_stay;
    v_company := NEW.company_college;
    v_occupation := NEW.occupation;
    v_standard := NULL;
    v_service_id := NEW.service_id;
    v_volunteer := CASE WHEN NEW.interested_to_volunteer IS TRUE THEN 'Yes' WHEN NEW.interested_to_volunteer IS FALSE THEN 'No' ELSE NULL END;
    v_created_at := COALESCE(NEW.created_at, now());
  ELSIF TG_TABLE_NAME = 'feedback_contacts' THEN
    v_source := 'feedback_contacts';
    v_event_display_name := 'Feedback Contact';
    v_name := NEW.full_name;
    v_phone := normalize_phone(NEW.phone);
    IF TG_OP = 'UPDATE' THEN v_old_phone := normalize_phone(OLD.phone); END IF;
    v_age := NULL;
    v_gender := NEW.gender;
    v_area := NEW.current_stay;
    v_company := NEW.college_name;
    v_occupation := NEW.branch;
    v_standard := NULL;
    v_service_id := NULL;
    v_volunteer := NULL;
    v_created_at := COALESCE(NEW.created_at, now());
  ELSE
    RETURN NEW;
  END IF;

  IF v_phone IS NULL OR length(v_phone) = 0 THEN
    RETURN NEW;
  END IF;

  -- Phone Change Handling: If phone number was changed during UPDATE
  IF TG_OP = 'UPDATE' AND v_old_phone IS NOT NULL AND v_old_phone <> v_phone THEN
    SELECT master_contact_id INTO v_old_master_id
    FROM master_contact_events
    WHERE source = v_source AND event_record_id = NEW.id::text;

    IF v_old_master_id IS NOT NULL THEN
      DELETE FROM master_contact_events
      WHERE source = v_source AND event_record_id = NEW.id::text;

      SELECT count(*) INTO v_rem_count
      FROM master_contact_events
      WHERE master_contact_id = v_old_master_id;

      IF v_rem_count = 0 THEN
        DELETE FROM master_contacts WHERE id = v_old_master_id;
      ELSE
        PERFORM recalculate_master_latest_info(v_old_phone);
      END IF;
    END IF;
  END IF;

  -- Fetch existing master contact by phone
  SELECT id, latest_registration_at, latest_registration_source, latest_registration_id
  INTO v_master_id, v_existing_latest_at, v_existing_latest_source, v_existing_latest_id
  FROM master_contacts
  WHERE phone = v_phone;

  IF v_master_id IS NOT NULL THEN
    -- Standardized Deterministic Tuple Comparison Rule: (created_at DESC, source DESC, record_id DESC)
    v_is_newer := FALSE;
    IF v_existing_latest_at IS NULL THEN
      v_is_newer := TRUE;
    ELSIF v_created_at > v_existing_latest_at THEN
      v_is_newer := TRUE;
    ELSIF v_created_at = v_existing_latest_at THEN
      IF v_source > COALESCE(v_existing_latest_source, '') THEN
        v_is_newer := TRUE;
      ELSIF v_source = COALESCE(v_existing_latest_source, '') AND NEW.id::text >= COALESCE(v_existing_latest_id, '') THEN
        v_is_newer := TRUE;
      END IF;
    END IF;

    IF v_is_newer THEN
      -- Update ALL latest registration fields together atomically
      UPDATE master_contacts SET
        name = COALESCE(v_name, master_contacts.name),
        age = COALESCE(v_age, master_contacts.age),
        gender = COALESCE(v_gender, master_contacts.gender),
        area_of_stay = COALESCE(v_area, master_contacts.area_of_stay),
        company_college = COALESCE(v_company, master_contacts.company_college),
        latest_registration_at = v_created_at,
        latest_registration_source = v_source,
        latest_registration_id = NEW.id::text,
        updated_at = now()
      WHERE id = v_master_id;
    ELSE
      -- Incoming registration is older: COALESCE missing non-null fields without overwriting latest registration metadata
      UPDATE master_contacts SET
        name = COALESCE(master_contacts.name, v_name),
        age = COALESCE(master_contacts.age, v_age),
        gender = COALESCE(master_contacts.gender, v_gender),
        area_of_stay = COALESCE(master_contacts.area_of_stay, v_area),
        company_college = COALESCE(master_contacts.company_college, v_company),
        updated_at = now()
      WHERE id = v_master_id;
    END IF;
  ELSE
    -- Insert new master contact record with native PostgreSQL Tuple Comparison ON CONFLICT handling
    INSERT INTO master_contacts (
      phone, name, age, gender, area_of_stay, company_college, latest_registration_at, latest_registration_source, latest_registration_id, created_at, updated_at
    ) VALUES (
      v_phone, v_name, v_age, v_gender, v_area, v_company, v_created_at, v_source, NEW.id::text, v_created_at, now()
    )
    ON CONFLICT (phone) DO UPDATE SET
      name = EXCLUDED.name,
      age = EXCLUDED.age,
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
      SELECT id INTO v_master_id FROM master_contacts WHERE phone = v_phone;
    END IF;
  END IF;

  -- Upsert into master_contact_events with event-specific attributes
  IF v_master_id IS NOT NULL THEN
    INSERT INTO master_contact_events (
      master_contact_id, phone, source, event_display_name, event_record_id, event_date, occupation, standard, service_id, interested_to_volunteer, created_at
    ) VALUES (
      v_master_id, v_phone, v_source, v_event_display_name, NEW.id::text, v_created_at, v_occupation, v_standard, v_service_id, v_volunteer, now()
    )
    ON CONFLICT (source, event_record_id) DO UPDATE SET
      master_contact_id = EXCLUDED.master_contact_id,
      phone = EXCLUDED.phone,
      event_display_name = EXCLUDED.event_display_name,
      event_date = EXCLUDED.event_date,
      occupation = EXCLUDED.occupation,
      standard = EXCLUDED.standard,
      service_id = EXCLUDED.service_id,
      interested_to_volunteer = EXCLUDED.interested_to_volunteer;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to event tables
DROP TRIGGER IF EXISTS trg_sync_krishnashtami_master ON krishnashtami_registrations;
CREATE TRIGGER trg_sync_krishnashtami_master
AFTER INSERT OR UPDATE ON krishnashtami_registrations
FOR EACH ROW EXECUTE FUNCTION sync_registration_to_master();

DROP TRIGGER IF EXISTS trg_sync_rathayatra_master ON registrations;
CREATE TRIGGER trg_sync_rathayatra_master
AFTER INSERT OR UPDATE ON registrations
FOR EACH ROW EXECUTE FUNCTION sync_registration_to_master();

DROP TRIGGER IF EXISTS trg_sync_feedback_master ON feedback_contacts;
CREATE TRIGGER trg_sync_feedback_master
AFTER INSERT OR UPDATE ON feedback_contacts
FOR EACH ROW EXECUTE FUNCTION sync_registration_to_master();

-- 10. Idempotent Backfill Helper Function
CREATE OR REPLACE FUNCTION sync_single_record(
  p_source text,
  p_event_display_name text,
  p_record_id text,
  p_name text,
  p_phone text,
  p_age integer,
  p_gender text,
  p_area text,
  p_company text,
  p_occupation text,
  p_standard text,
  p_service_id uuid,
  p_volunteer text,
  p_created_at timestamptz
) RETURNS void AS $$
DECLARE
  v_norm_phone text;
  v_master_id uuid;
  v_existing_latest_at timestamptz;
  v_existing_latest_source text;
  v_existing_latest_id text;
  v_is_newer boolean;
BEGIN
  v_norm_phone := normalize_phone(p_phone);
  IF v_norm_phone IS NULL OR length(v_norm_phone) = 0 THEN
    RETURN;
  END IF;

  SELECT id, latest_registration_at, latest_registration_source, latest_registration_id
  INTO v_master_id, v_existing_latest_at, v_existing_latest_source, v_existing_latest_id
  FROM master_contacts
  WHERE phone = v_norm_phone;

  IF v_master_id IS NOT NULL THEN
    v_is_newer := FALSE;
    IF v_existing_latest_at IS NULL THEN
      v_is_newer := TRUE;
    ELSIF p_created_at > v_existing_latest_at THEN
      v_is_newer := TRUE;
    ELSIF p_created_at = v_existing_latest_at THEN
      IF p_source > COALESCE(v_existing_latest_source, '') THEN
        v_is_newer := TRUE;
      ELSIF p_source = COALESCE(v_existing_latest_source, '') AND p_record_id >= COALESCE(v_existing_latest_id, '') THEN
        v_is_newer := TRUE;
      END IF;
    END IF;

    IF v_is_newer THEN
      UPDATE master_contacts SET
        name = COALESCE(p_name, master_contacts.name),
        age = COALESCE(p_age, master_contacts.age),
        gender = COALESCE(p_gender, master_contacts.gender),
        area_of_stay = COALESCE(p_area, master_contacts.area_of_stay),
        company_college = COALESCE(p_company, master_contacts.company_college),
        latest_registration_at = p_created_at,
        latest_registration_source = p_source,
        latest_registration_id = p_record_id,
        updated_at = now()
      WHERE id = v_master_id;
    ELSE
      UPDATE master_contacts SET
        name = COALESCE(master_contacts.name, p_name),
        age = COALESCE(master_contacts.age, p_age),
        gender = COALESCE(master_contacts.gender, p_gender),
        area_of_stay = COALESCE(master_contacts.area_of_stay, p_area),
        company_college = COALESCE(master_contacts.company_college, p_company),
        updated_at = now()
      WHERE id = v_master_id;
    END IF;
  ELSE
    INSERT INTO master_contacts (
      phone, name, age, gender, area_of_stay, company_college, latest_registration_at, latest_registration_source, latest_registration_id, created_at, updated_at
    ) VALUES (
      v_norm_phone, p_name, p_age, p_gender, p_area, p_company, COALESCE(p_created_at, now()), p_source, p_record_id, COALESCE(p_created_at, now()), now()
    )
    ON CONFLICT (phone) DO UPDATE SET
      name = EXCLUDED.name,
      age = EXCLUDED.age,
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
      SELECT id INTO v_master_id FROM master_contacts WHERE phone = v_norm_phone;
    END IF;
  END IF;

  IF v_master_id IS NOT NULL THEN
    INSERT INTO master_contact_events (
      master_contact_id, phone, source, event_display_name, event_record_id, event_date, occupation, standard, service_id, interested_to_volunteer, created_at
    ) VALUES (
      v_master_id, v_norm_phone, p_source, p_event_display_name, p_record_id, COALESCE(p_created_at, now()), p_occupation, p_standard, p_service_id, p_volunteer, now()
    )
    ON CONFLICT (source, event_record_id) DO UPDATE SET
      master_contact_id = EXCLUDED.master_contact_id,
      phone = EXCLUDED.phone,
      event_display_name = EXCLUDED.event_display_name,
      event_date = EXCLUDED.event_date,
      occupation = EXCLUDED.occupation,
      standard = EXCLUDED.standard,
      service_id = EXCLUDED.service_id,
      interested_to_volunteer = EXCLUDED.interested_to_volunteer;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION backfill_master_contacts()
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  -- Backfill all records across all tables sorted strictly by created_at ASC, source ASC, record_id ASC
  FOR r IN (
    SELECT 'krishnashtami' AS source, 'Krishnashtami 2026' AS display_name, id::text AS record_id, full_name, phone, age, gender, area_of_stay, company_college, occupation, standard, service_id, CASE WHEN interested_to_volunteer IS TRUE THEN 'Yes' WHEN interested_to_volunteer IS FALSE THEN 'No' ELSE NULL END AS volunteer, created_at
    FROM krishnashtami_registrations
    UNION ALL
    SELECT 'rathayatra' AS source, 'Rathayatra 2026' AS display_name, id::text AS record_id, full_name, phone, age, gender, area_of_stay, company_college, occupation, NULL AS standard, service_id, CASE WHEN interested_to_volunteer IS TRUE THEN 'Yes' WHEN interested_to_volunteer IS FALSE THEN 'No' ELSE NULL END AS volunteer, created_at
    FROM registrations
    UNION ALL
    SELECT 'feedback_contacts' AS source, 'Feedback Contact' AS display_name, id::text AS record_id, full_name, phone, NULL AS age, gender, current_stay AS area_of_stay, college_name AS company_college, branch AS occupation, NULL AS standard, NULL AS service_id, NULL AS volunteer, created_at
    FROM feedback_contacts
    ORDER BY created_at ASC, source ASC, record_id ASC
  ) LOOP
    PERFORM sync_single_record(r.source, r.display_name, r.record_id, r.full_name, r.phone, r.age, r.gender, r.area_of_stay, r.company_college, r.occupation, r.standard, r.service_id, r.volunteer, r.created_at);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 11. Strict Admin-Only Row-Level Security (RLS) Policies
ALTER TABLE master_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_contact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_contact_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_contacts_admin_select" ON master_contacts;
CREATE POLICY "master_contacts_admin_select" ON master_contacts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "master_contact_events_admin_select" ON master_contact_events;
CREATE POLICY "master_contact_events_admin_select" ON master_contact_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "master_assignments_admin_select" ON master_contact_assignments;
CREATE POLICY "master_assignments_admin_select" ON master_contact_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "event_sources_admin_select" ON event_sources;
CREATE POLICY "event_sources_admin_select" ON event_sources
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "master_contacts_service_role_all" ON master_contacts;
CREATE POLICY "master_contacts_service_role_all" ON master_contacts
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "master_contact_events_service_role_all" ON master_contact_events;
CREATE POLICY "master_contact_events_service_role_all" ON master_contact_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "master_assignments_service_role_all" ON master_contact_assignments;
CREATE POLICY "master_assignments_service_role_all" ON master_contact_assignments
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
