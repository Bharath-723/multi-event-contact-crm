-- ============================================================
-- 20260813000000_multi_festival_schema.sql
-- Multi-Festival Event Architecture Migration (v3.5.0 Production-Verified)
-- SAFETY: Transaction-safe (BEGIN ... COMMIT), non-destructive, additive schema update.
-- Preserves all 826 existing Rathayatra registrations, 9 services, 3 slots, 1041 assignments.
-- ============================================================

BEGIN;

-- ─── 1. CREATE festival_events MASTER TABLE ─────────────────────────────────
CREATE TABLE IF NOT EXISTS festival_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_name       TEXT NOT NULL,
    event_year          INTEGER NOT NULL,
    slug                TEXT UNIQUE NOT NULL,
    registration_url    TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    registration_open   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_festival_events_name_year UNIQUE (festival_name, event_year)
);

-- Trigger for updated_at on festival_events
CREATE OR REPLACE FUNCTION update_festival_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_festival_events_updated_at') THEN
        CREATE TRIGGER trg_festival_events_updated_at
            BEFORE UPDATE ON festival_events
            FOR EACH ROW
            EXECUTE FUNCTION update_festival_events_updated_at();
    END IF;
END$$;

-- RLS Policies for festival_events
ALTER TABLE festival_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'festival_events' AND policyname = 'fe_read_public') THEN
        CREATE POLICY fe_read_public ON festival_events FOR SELECT USING (TRUE);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'festival_events' AND policyname = 'fe_admin_all') THEN
        CREATE POLICY fe_admin_all ON festival_events FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
    END IF;
END$$;

-- Enable Realtime for festival_events safely (Check pg_publication_tables first)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = 'festival_events'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE festival_events;
        END IF;
    END IF;
END$$;

-- ─── 2. SEED / UPDATE FESTIVAL EVENTS ────────────────────────────────────────
INSERT INTO festival_events (festival_name, event_year, slug, registration_url, is_active, registration_open)
VALUES
    ('Rathayatra', 2026, 'rathayatra-2026', 'https://rathayatra-three.vercel.app', TRUE, FALSE),
    ('Krishnashtami', 2026, 'krishnashtami-2026', 'https://krishnashtami-2026.vercel.app', TRUE, TRUE)
ON CONFLICT (slug) DO UPDATE
SET registration_url = EXCLUDED.registration_url,
    registration_open = EXCLUDED.registration_open,
    is_active = EXCLUDED.is_active;

-- ─── 3. ADD festival_event_id TO CORE TABLES & BACKFILL ────────────────────

-- 3A. Registrations
ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS festival_event_id UUID REFERENCES festival_events(id) ON DELETE RESTRICT;

UPDATE registrations
SET festival_event_id = (SELECT id FROM festival_events WHERE slug = 'rathayatra-2026')
WHERE festival_event_id IS NULL;

ALTER TABLE registrations
    ALTER COLUMN festival_event_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_festival_event_id ON registrations(festival_event_id);

-- Surgical & Safe Phone Uniqueness Scope Change:
-- Dynamically identify and drop ONLY single-column unique constraints on column 'phone'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'registrations'::regclass
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND a.attname = 'phone'
    ) LOOP
        EXECUTE format('ALTER TABLE registrations DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END$$;

ALTER TABLE registrations DROP CONSTRAINT IF EXISTS uq_registrations_phone_festival;
ALTER TABLE registrations ADD CONSTRAINT uq_registrations_phone_festival UNIQUE (phone, festival_event_id);

-- 3B. Services
ALTER TABLE services
    ADD COLUMN IF NOT EXISTS festival_event_id UUID REFERENCES festival_events(id) ON DELETE RESTRICT;

UPDATE services
SET festival_event_id = (SELECT id FROM festival_events WHERE slug = 'rathayatra-2026')
WHERE festival_event_id IS NULL;

ALTER TABLE services
    ALTER COLUMN festival_event_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_services_festival_event_id ON services(festival_event_id);

-- 3C. Volunteer Slots
ALTER TABLE volunteer_slots
    ADD COLUMN IF NOT EXISTS festival_event_id UUID REFERENCES festival_events(id) ON DELETE RESTRICT;

UPDATE volunteer_slots
SET festival_event_id = (SELECT id FROM festival_events WHERE slug = 'rathayatra-2026')
WHERE festival_event_id IS NULL;

ALTER TABLE volunteer_slots
    ALTER COLUMN festival_event_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_volunteer_slots_festival_event_id ON volunteer_slots(festival_event_id);

-- Surgical & Safe Volunteer Slot Uniqueness Scope Change:
-- Dynamically identify and drop ONLY single-column unique constraints on column 'slot_time'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'volunteer_slots'::regclass
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND a.attname = 'slot_time'
    ) LOOP
        EXECUTE format('ALTER TABLE volunteer_slots DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END$$;

ALTER TABLE volunteer_slots DROP CONSTRAINT IF EXISTS uq_volunteer_slots_festival_slot;
ALTER TABLE volunteer_slots ADD CONSTRAINT uq_volunteer_slots_festival_slot UNIQUE (festival_event_id, slot_time);

-- Additional Performance Indexes
CREATE INDEX IF NOT EXISTS idx_contact_assignments_op_active ON contact_assignments(operator_id, is_active);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_registration ON visitor_visits(registration_id);

-- ─── 4. SEED KRISHNASHTAMI VOLUNTEER SLOTS ─────────────────────────────────
INSERT INTO volunteer_slots (slot_time, display_order, festival_event_id)
VALUES
    ('7:00 AM – 1:00 PM', 1, (SELECT id FROM festival_events WHERE slug = 'krishnashtami-2026')),
    ('3:00 PM – 9:00 PM', 2, (SELECT id FROM festival_events WHERE slug = 'krishnashtami-2026')),
    ('6:00 PM – 12:00 AM', 3, (SELECT id FROM festival_events WHERE slug = 'krishnashtami-2026')),
    ('Full Day (7AM – 12AM)', 4, (SELECT id FROM festival_events WHERE slug = 'krishnashtami-2026'))
ON CONFLICT (festival_event_id, slot_time) DO NOTHING;

-- ─── 5. CLEANLY DROP EXACT PRODUCTION OVERLOADED SIGNATURES ──────────────────
-- OID 17717 (13 arguments)
DROP FUNCTION IF EXISTS public.register_volunteer(
    text, text, integer, text, text, text, text, boolean, uuid, boolean, boolean, text, uuid[]
);

-- OID 17945 (14 arguments)
DROP FUNCTION IF EXISTS public.register_volunteer(
    text, text, integer, text, text, text, text, boolean, uuid, boolean, boolean, text, uuid[], text
);

-- OID 18229 (15 arguments)
DROP FUNCTION IF EXISTS public.register_volunteer(
    text, text, integer, text, text, text, text, boolean, uuid, boolean, boolean, text, uuid[], text, text
);

-- Cleanly drop overloaded variants of other RPC functions
DROP FUNCTION IF EXISTS public.assign_operator_to_registration(uuid, integer);
DROP FUNCTION IF EXISTS public.assign_operator_to_registration(uuid, integer, uuid);

DROP FUNCTION IF EXISTS public.get_operator_stats(uuid);
DROP FUNCTION IF EXISTS public.get_operator_stats(uuid, uuid);

DROP FUNCTION IF EXISTS public.get_contact_module_summary();
DROP FUNCTION IF EXISTS public.get_contact_module_summary(uuid);

-- ─── 6. CREATE UNAMBIGUOUS HARDENED register_volunteer RPC (16 ARGS) ────────
CREATE OR REPLACE FUNCTION public.register_volunteer(
    p_full_name TEXT,
    p_phone TEXT,
    p_age INTEGER,
    p_gender TEXT,
    p_area_of_stay TEXT,
    p_company_college TEXT,
    p_pg_name TEXT,
    p_interested_to_volunteer BOOLEAN,
    p_volunteer_slot_id UUID,
    p_interested_to_dinner BOOLEAN,
    p_wants_to_donate BOOLEAN,
    p_donation_status TEXT,
    p_skill_ids UUID[],
    p_occupation TEXT DEFAULT NULL,
    p_transportation_required TEXT DEFAULT NULL,
    p_festival_event_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_registration_id UUID;
    v_skill_id UUID;
BEGIN
    -- 1. MANDATORY p_festival_event_id validation. No silent fallback.
    IF p_festival_event_id IS NULL THEN
        RAISE EXCEPTION 'p_festival_event_id is required' USING ERRCODE = '22004';
    END IF;

    -- 2. Validate that supplied festival_event_id exists in festival_events
    IF NOT EXISTS (SELECT 1 FROM festival_events WHERE id = p_festival_event_id) THEN
        RAISE EXCEPTION 'Invalid festival_event_id: %', p_festival_event_id USING ERRCODE = '22000';
    END IF;

    -- 3. Validate that volunteer_slot_id belongs to the supplied festival_event_id
    IF p_volunteer_slot_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM volunteer_slots 
            WHERE id = p_volunteer_slot_id AND festival_event_id = p_festival_event_id
        ) THEN
            RAISE EXCEPTION 'Volunteer slot % does not belong to festival event %', p_volunteer_slot_id, p_festival_event_id USING ERRCODE = '22000';
        END IF;
    END IF;

    -- 4. Check for duplicate phone WITHIN THE SAME FESTIVAL EVENT
    IF EXISTS (
        SELECT 1 FROM registrations 
        WHERE phone = p_phone AND festival_event_id = p_festival_event_id
    ) THEN
        RAISE EXCEPTION 'Phone number % is already registered for this event.', p_phone USING ERRCODE = '23505';
    END IF;

    -- 5. Insert registration with explicit festival_event_id
    INSERT INTO registrations (
        full_name, phone, age, gender, area_of_stay, company_college, pg_name,
        interested_to_volunteer, volunteer_slot_id, interested_to_dinner,
        wants_to_donate, donation_status, occupation, transportation_required,
        festival_event_id
    )
    VALUES (
        p_full_name, p_phone, p_age, p_gender, p_area_of_stay, p_company_college, p_pg_name,
        p_interested_to_volunteer, p_volunteer_slot_id, p_interested_to_dinner,
        p_wants_to_donate, p_donation_status, p_occupation, p_transportation_required,
        p_festival_event_id
    )
    RETURNING id INTO v_registration_id;

    -- 6. Insert associated skills
    IF p_skill_ids IS NOT NULL AND array_length(p_skill_ids, 1) > 0 THEN
        FOREACH v_skill_id IN ARRAY p_skill_ids LOOP
            INSERT INTO registration_skills (registration_id, skill_id)
            VALUES (v_registration_id, v_skill_id);
        END LOOP;
    END IF;

    RETURN v_registration_id;
END;
$$;

-- ─── 7. CREATE UNAMBIGUOUS HARDENED assign_operator_to_registration RPC ──────
CREATE OR REPLACE FUNCTION public.assign_operator_to_registration(
    p_registration_id UUID,
    p_max_contacts INTEGER,
    p_festival_event_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_chosen_operator_id UUID;
    v_active_count INTEGER;
    v_assignment_id UUID;
    v_registration_event_id UUID;
BEGIN
    -- 1. Require p_festival_event_id
    IF p_festival_event_id IS NULL THEN
        RAISE EXCEPTION 'p_festival_event_id is required for operator assignment' USING ERRCODE = '22004';
    END IF;

    -- 2. Validate registration exists and retrieve its festival_event_id
    SELECT festival_event_id INTO v_registration_event_id FROM registrations WHERE id = p_registration_id;
    
    IF v_registration_event_id IS NULL THEN
        RAISE EXCEPTION 'Registration % not found', p_registration_id USING ERRCODE = '22000';
    END IF;

    -- 3. Reject cross-festival assignment attempts
    IF v_registration_event_id <> p_festival_event_id THEN
        RAISE EXCEPTION 'Cross-festival assignment rejected: Registration % (event %) does not match requested festival event %',
            p_registration_id, v_registration_event_id, p_festival_event_id USING ERRCODE = '22000';
    END IF;

    -- Duplicate Protection: Check if registration already has an active assignment
    IF EXISTS (
        SELECT 1 FROM contact_assignments 
        WHERE registration_id = p_registration_id 
          AND is_active = TRUE
        FOR UPDATE
    ) THEN
        RETURN NULL;
    END IF;

    -- Block future automatic assignment if registration has ever been marked 'Not Coming'
    IF EXISTS (
        SELECT 1 FROM contact_assignments
        WHERE registration_id = p_registration_id
          AND status = 'Not Coming'
    ) THEN
        RETURN NULL;
    END IF;

    -- Find eligible operator scoped by festival capacity safety
    SELECT co.id INTO v_chosen_operator_id
    FROM contact_operators co
    LEFT JOIN (
        SELECT ca.operator_id, COUNT(*) AS active_cnt, MAX(ca.assigned_at) AS last_assigned
        FROM contact_assignments ca
        JOIN registrations r ON r.id = ca.registration_id
        WHERE ca.is_active = TRUE
          AND r.festival_event_id = v_registration_event_id
        GROUP BY ca.operator_id
    ) stats ON stats.operator_id = co.id
    WHERE co.is_active = TRUE
      AND (co.operator_type IS NULL OR co.operator_type = 'operator')
      AND COALESCE(stats.active_cnt, 0) < p_max_contacts
    ORDER BY 
        COALESCE(stats.active_cnt, 0) ASC, 
        COALESCE(stats.last_assigned, '1970-01-01 00:00:00+00'::TIMESTAMPTZ) ASC, 
        co.created_at ASC
    LIMIT 1
    FOR UPDATE OF co;

    IF v_chosen_operator_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Check capacity within the festival event context
    SELECT COUNT(*) INTO v_active_count
    FROM contact_assignments ca
    JOIN registrations r ON r.id = ca.registration_id
    WHERE ca.operator_id = v_chosen_operator_id
      AND ca.is_active = TRUE
      AND r.festival_event_id = v_registration_event_id;

    IF v_active_count >= p_max_contacts THEN
        RETURN NULL;
    END IF;

    -- Insert new active assignment
    INSERT INTO contact_assignments (registration_id, operator_id, is_active, status)
    VALUES (p_registration_id, v_chosen_operator_id, TRUE, 'Pending')
    RETURNING id INTO v_assignment_id;

    -- Insert audit log
    INSERT INTO audit_logs (admin_id, action, details)
    VALUES (NULL, 'ASSIGNMENT_CREATED', jsonb_build_object(
        'assignment_id', v_assignment_id,
        'registration_id', p_registration_id,
        'operator_id', v_chosen_operator_id,
        'assigned_by', 'system_auto',
        'festival_event_id', v_registration_event_id
    ));

    RETURN v_chosen_operator_id;
END;
$$;

-- ─── 8. CREATE UNAMBIGUOUS HARDENED get_operator_stats RPC ─────────────────
CREATE OR REPLACE FUNCTION public.get_operator_stats(
    p_operator_id UUID,
    p_festival_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_assigned   BIGINT,
    total_pending    BIGINT,
    total_coming     BIGINT,
    total_not_coming BIGINT,
    total_callback   BIGINT,
    total_completed  BIGINT,
    total_called     BIGINT,
    total_confirmed  BIGINT,
    call_success_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)                                                         AS total_assigned,
        COUNT(*) FILTER (WHERE ca.status = 'Pending')                   AS total_pending,
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_coming,
        COUNT(*) FILTER (WHERE ca.status = 'Not Coming')                AS total_not_coming,
        COUNT(*) FILTER (WHERE ca.status = 'Callback Required')         AS total_callback,
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_completed,
        COUNT(*) FILTER (WHERE ca.status <> 'Pending')                  AS total_called,
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_confirmed,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE ca.status = 'Coming')::NUMERIC
                / COUNT(*)::NUMERIC * 100, 1
            )
        END                                                              AS call_success_pct
    FROM contact_assignments ca
    JOIN registrations r ON r.id = ca.registration_id
    WHERE ca.operator_id = p_operator_id
      AND (ca.is_active = TRUE OR ca.status = 'Not Coming')
      AND (p_festival_event_id IS NULL OR r.festival_event_id = p_festival_event_id);
END;
$$;

-- ─── 9. CREATE UNAMBIGUOUS HARDENED get_contact_module_summary RPC ──────────
CREATE OR REPLACE FUNCTION public.get_contact_module_summary(
    p_festival_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_operators     BIGINT,
    active_operators    BIGINT,
    total_assigned      BIGINT,
    total_pending       BIGINT,
    total_completed     BIGINT,
    completion_pct      NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM contact_operators)                    AS total_operators,
        (SELECT COUNT(*) FROM contact_operators WHERE is_active=TRUE) AS active_operators,
        COUNT(*)                                                    AS total_assigned,
        COUNT(*) FILTER (WHERE ca.status = 'Pending')              AS total_pending,
        COUNT(*) FILTER (WHERE ca.status = 'Coming')               AS total_completed,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE ca.status = 'Coming')::NUMERIC
                / COUNT(*)::NUMERIC * 100, 1
            )
        END                                                         AS completion_pct
    FROM contact_assignments ca
    JOIN registrations r ON r.id = ca.registration_id
    WHERE ca.is_active = TRUE
      AND (p_festival_event_id IS NULL OR r.festival_event_id = p_festival_event_id);
END;
$$;

-- ─── 10. EXPLICIT LEAST-PRIVILEGE PERMISSIONS WITH COMPLETE SIGNATURES ────────
-- Public / Anon: Read-only access to registration metadata dropdowns & EXECUTE on registration RPC
GRANT SELECT ON TABLE festival_events TO anon;
GRANT SELECT ON TABLE services TO anon;
GRANT SELECT ON TABLE volunteer_slots TO anon;
GRANT SELECT ON TABLE skills TO anon;

GRANT EXECUTE ON FUNCTION public.register_volunteer(
    text, text, integer, text, text, text, text, boolean, uuid, boolean, boolean, text, uuid[], text, text, uuid
) TO anon;

-- Authenticated Admin & Service Role: Explicit operational privileges per table
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE festival_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE registrations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE registration_skills TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE services TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE volunteer_slots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact_operators TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact_assignments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE visitor_visits TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE audit_logs TO authenticated, service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Explicit Function EXECUTE Grants with Exact Signatures
GRANT EXECUTE ON FUNCTION public.register_volunteer(
    text, text, integer, text, text, text, text, boolean, uuid, boolean, boolean, text, uuid[], text, text, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assign_operator_to_registration(
    uuid, integer, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_operator_stats(
    uuid, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_contact_module_summary(
    uuid
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
