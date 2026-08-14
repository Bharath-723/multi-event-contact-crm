-- ============================================================
-- 20260814000000_krishnashtami_dedicated_tables.sql
-- Dedicated Physical Tables Migration for Krishnashtami 2026 (v4.2.0 Hardened & Signature-Cleaned)
-- SAFETY: Transaction-safe (BEGIN ... COMMIT), non-destructive, additive schema.
-- Preserves all 826 Rathayatra registrations, 1041 assignments, 242 visits, 9 services intact.
-- ============================================================

BEGIN;

-- ─── 1. CONCURRENCY-SAFE REGISTRATION NUMBER SEQUENCE ─────────────────────────
CREATE SEQUENCE IF NOT EXISTS krishnashtami_reg_no_seq START WITH 1 INCREMENT BY 1;

-- ─── 2. CREATE krishnashtami_registrations DEDICATED TABLE ────────────────────
CREATE TABLE IF NOT EXISTS krishnashtami_registrations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name               TEXT NOT NULL,
    phone                   TEXT UNIQUE NOT NULL,
    age                     INTEGER NOT NULL,
    gender                  TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
    area_of_stay            TEXT,
    company_college         TEXT NOT NULL,
    pg_name                 TEXT,
    interested_to_volunteer BOOLEAN NOT NULL DEFAULT FALSE,
    volunteer_slot_id       UUID REFERENCES volunteer_slots(id) ON DELETE SET NULL,
    interested_to_dinner    BOOLEAN NOT NULL DEFAULT FALSE,
    wants_to_donate         BOOLEAN NOT NULL DEFAULT FALSE,
    donation_status         TEXT NOT NULL DEFAULT 'Pending' CHECK (donation_status IN ('Pending', 'User Opted to Donate', 'Completed', 'Failed')),
    registration_no         TEXT UNIQUE,
    occupation              TEXT,
    transportation_required TEXT DEFAULT 'No',
    festival_event_id       UUID NOT NULL REFERENCES festival_events(id) ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_krishnashtami_phone CHECK (length(phone) = 10 AND phone ~ '^[0-9]+$'),
    CONSTRAINT chk_krishnashtami_age CHECK (age >= 10 AND age <= 100)
);

CREATE INDEX IF NOT EXISTS idx_krish_regs_phone ON krishnashtami_registrations(phone);
CREATE INDEX IF NOT EXISTS idx_krish_regs_created_at ON krishnashtami_registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_krish_regs_festival ON krishnashtami_registrations(festival_event_id);

-- Synchronize sequence with highest existing KRISH-2026-XXXX registration number if present
DO $$
DECLARE
    v_max_num INT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(registration_no FROM 'KRISH-2026-([0-9]+)') AS INTEGER)), 0)
    INTO v_max_num
    FROM krishnashtami_registrations
    WHERE registration_no LIKE 'KRISH-2026-%';

    IF v_max_num > 0 THEN
        PERFORM setval('krishnashtami_reg_no_seq', v_max_num);
    END IF;
END $$;

-- ─── 3. CREATE krishnashtami_registration_skills JOIN TABLE ───────────────────
CREATE TABLE IF NOT EXISTS krishnashtami_registration_skills (
    registration_id UUID REFERENCES krishnashtami_registrations(id) ON DELETE CASCADE,
    skill_id        UUID REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (registration_id, skill_id)
);

-- ─── 4. CREATE krishnashtami_registration_prasadam DEDICATED TABLE ───────────
CREATE TABLE IF NOT EXISTS krishnashtami_registration_prasadam (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id   UUID NOT NULL REFERENCES krishnashtami_registrations(id) ON DELETE CASCADE,
    festival_event_id UUID NOT NULL REFERENCES festival_events(id) ON DELETE RESTRICT,
    prasadam_type     TEXT NOT NULL CHECK (prasadam_type IN ('Breakfast', 'Lunch', 'Dinner')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_krish_prasadam_reg_type UNIQUE (registration_id, prasadam_type)
);

CREATE INDEX IF NOT EXISTS idx_krish_prasadam_reg ON krishnashtami_registration_prasadam(registration_id);
CREATE INDEX IF NOT EXISTS idx_krish_prasadam_fest ON krishnashtami_registration_prasadam(festival_event_id);

-- ─── 5. CREATE krishnashtami_contact_assignments DEDICATED TABLE ─────────────
CREATE TABLE IF NOT EXISTS krishnashtami_contact_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES krishnashtami_registrations(id) ON DELETE CASCADE,
    operator_id     UUID NOT NULL REFERENCES contact_operators(id) ON DELETE RESTRICT,
    assigned_by     TEXT DEFAULT 'admin',
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    called_at       TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'Pending',
    remarks         TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    visited         BOOLEAN DEFAULT FALSE,
    visited_at      TIMESTAMPTZ,
    visited_by      TEXT,
    visit_method    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_krish_ca_reg ON krishnashtami_contact_assignments(registration_id);
CREATE INDEX IF NOT EXISTS idx_krish_ca_op ON krishnashtami_contact_assignments(operator_id);
CREATE INDEX IF NOT EXISTS idx_krish_ca_status ON krishnashtami_contact_assignments(status);
CREATE INDEX IF NOT EXISTS idx_krish_ca_active ON krishnashtami_contact_assignments(is_active);

-- ─── 6. CREATE krishnashtami_visitor_visits DEDICATED TABLE ──────────────────
CREATE TABLE IF NOT EXISTS krishnashtami_visitor_visits (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id  UUID NOT NULL REFERENCES krishnashtami_registrations(id) ON DELETE CASCADE,
    visited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    visited_by       TEXT,
    visited_by_admin TEXT,
    visit_method     TEXT,
    remarks          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_krish_vv_reg ON krishnashtami_visitor_visits(registration_id);

-- ─── 7. UPDATE NOTIFICATIONS TABLE ──────────────────────────────────────────
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS krishnashtami_registration_id UUID REFERENCES krishnashtami_registrations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_krish_reg ON notifications(krishnashtami_registration_id);

-- ─── 8. CLEANLY DROP PREVIOUS OVERLOADED RPC SIGNATURES ───────────────────────
DROP FUNCTION IF EXISTS public.register_krishnashtami_volunteer(
    text, text, integer, text, text, text, text, boolean, uuid, boolean, boolean, text, uuid[], text, text, uuid
);

-- ─── 9. CREATE HARDENED 17-PARAMETER register_krishnashtami_volunteer RPC ──────
CREATE OR REPLACE FUNCTION public.register_krishnashtami_volunteer(
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
    p_festival_event_id UUID DEFAULT NULL,
    p_prasadam_types TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_registration_id UUID;
    v_skill_id UUID;
    v_prasadam_type TEXT;
    v_seq_val BIGINT;
    v_reg_no TEXT;
    v_krish_event_id UUID;
BEGIN
    -- 1. Resolve Krishnashtami 2026 festival_event_id strictly from database
    SELECT id INTO v_krish_event_id 
    FROM festival_events 
    WHERE slug = 'krishnashtami-2026';

    IF v_krish_event_id IS NULL THEN
        RAISE EXCEPTION 'Krishnashtami-2026 festival event not found in database' USING ERRCODE = '22004';
    END IF;

    -- 2. Strict Festival ID Validation: Reject any provided festival ID that is not krishnashtami-2026
    IF p_festival_event_id IS NOT NULL AND p_festival_event_id <> v_krish_event_id THEN
        RAISE EXCEPTION 'Invalid festival_event_id % for Krishnashtami registration. Expected Krishnashtami event %',
            p_festival_event_id, v_krish_event_id USING ERRCODE = '22000';
    END IF;

    -- 3. Check for duplicate phone in krishnashtami_registrations
    IF EXISTS (SELECT 1 FROM krishnashtami_registrations WHERE phone = p_phone) THEN
        RAISE EXCEPTION 'Phone number % is already registered for Krishnashtami.', p_phone USING ERRCODE = '23505';
    END IF;

    -- 4. Generate concurrency-safe registration number using PostgreSQL Sequence
    v_seq_val := nextval('krishnashtami_reg_no_seq');
    v_reg_no := 'KRISH-2026-' || LPAD(v_seq_val::text, 4, '0');

    -- 5. Insert registration record into krishnashtami_registrations
    INSERT INTO krishnashtami_registrations (
        full_name, phone, age, gender, area_of_stay, company_college, pg_name,
        interested_to_volunteer, volunteer_slot_id, interested_to_dinner,
        wants_to_donate, donation_status, registration_no, occupation,
        transportation_required, festival_event_id
    )
    VALUES (
        p_full_name, p_phone, p_age, p_gender, p_area_of_stay, p_company_college, p_pg_name,
        p_interested_to_volunteer, p_volunteer_slot_id, p_interested_to_dinner,
        p_wants_to_donate, p_donation_status, v_reg_no, p_occupation,
        p_transportation_required, v_krish_event_id
    )
    RETURNING id INTO v_registration_id;

    -- 6. Atomic insertion of skills into krishnashtami_registration_skills
    IF p_skill_ids IS NOT NULL AND array_length(p_skill_ids, 1) > 0 THEN
        FOREACH v_skill_id IN ARRAY p_skill_ids LOOP
            INSERT INTO krishnashtami_registration_skills (registration_id, skill_id)
            VALUES (v_registration_id, v_skill_id);
        END LOOP;
    END IF;

    -- 7. Atomic insertion of prasadam selections into krishnashtami_registration_prasadam
    IF p_prasadam_types IS NOT NULL AND array_length(p_prasadam_types, 1) > 0 THEN
        FOREACH v_prasadam_type IN ARRAY p_prasadam_types LOOP
            INSERT INTO krishnashtami_registration_prasadam (registration_id, festival_event_id, prasadam_type)
            VALUES (v_registration_id, v_krish_event_id, v_prasadam_type);
        END LOOP;
    END IF;

    -- 8. Atomic insertion of notification into notifications table
    INSERT INTO notifications (krishnashtami_registration_id, is_read)
    VALUES (v_registration_id, FALSE);

    RETURN v_registration_id;
END;
$$;

-- ─── 10. RLS POLICIES FOR EXPLICIT ACCESS CONTROL ─────────────────────────────
ALTER TABLE krishnashtami_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE krishnashtami_registration_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE krishnashtami_registration_prasadam ENABLE ROW LEVEL SECURITY;
ALTER TABLE krishnashtami_contact_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE krishnashtami_visitor_visits ENABLE ROW LEVEL SECURITY;

-- NO PUBLIC READ PERMISSIONS ON REGISTRATION PII DATA
-- Public / Anon is ONLY granted EXECUTE permission on the atomic registration RPC.
-- Direct SELECT/INSERT/UPDATE/DELETE on krishnashtami_registrations is BLOCKED for anon.

-- 1. krishnashtami_registrations RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'krishnashtami_registrations' AND policyname = 'krish_regs_admin_all') THEN
        CREATE POLICY krish_regs_admin_all ON krishnashtami_registrations FOR ALL TO authenticated, service_role USING (TRUE) WITH CHECK (TRUE);
    END IF;
END$$;

-- 2. krishnashtami_registration_skills RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'krishnashtami_registration_skills' AND policyname = 'krish_skills_admin_all') THEN
        CREATE POLICY krish_skills_admin_all ON krishnashtami_registration_skills FOR ALL TO authenticated, service_role USING (TRUE) WITH CHECK (TRUE);
    END IF;
END$$;

-- 3. krishnashtami_registration_prasadam RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'krishnashtami_registration_prasadam' AND policyname = 'krish_prasadam_admin_all') THEN
        CREATE POLICY krish_prasadam_admin_all ON krishnashtami_registration_prasadam FOR ALL TO authenticated, service_role USING (TRUE) WITH CHECK (TRUE);
    END IF;
END$$;

-- 4. krishnashtami_contact_assignments RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'krishnashtami_contact_assignments' AND policyname = 'krish_ca_admin_all') THEN
        CREATE POLICY krish_ca_admin_all ON krishnashtami_contact_assignments FOR ALL TO authenticated, service_role USING (TRUE) WITH CHECK (TRUE);
    END IF;
END$$;

-- 5. krishnashtami_visitor_visits RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'krishnashtami_visitor_visits' AND policyname = 'krish_vv_admin_all') THEN
        CREATE POLICY krish_vv_admin_all ON krishnashtami_visitor_visits FOR ALL TO authenticated, service_role USING (TRUE) WITH CHECK (TRUE);
    END IF;
END$$;

-- Explicit Function Permissions:
-- Anon is ONLY granted EXECUTE on register_krishnashtami_volunteer
GRANT EXECUTE ON FUNCTION public.register_krishnashtami_volunteer(
    text, text, integer, text, text, text, text, boolean, uuid, boolean, boolean, text, uuid[], text, text, uuid, text[]
) TO anon, authenticated, service_role;

-- Sequence security: Only authenticated and service_role are granted sequence access (anon excluded)
GRANT USAGE, SELECT ON SEQUENCE krishnashtami_reg_no_seq TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE krishnashtami_registrations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE krishnashtami_registration_skills TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE krishnashtami_registration_prasadam TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE krishnashtami_contact_assignments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE krishnashtami_visitor_visits TO authenticated, service_role;

-- ─── 11. ENABLE SUPABASE REALTIME FOR ALL REQUIRED TABLES ───────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'krishnashtami_registrations') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE krishnashtami_registrations;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'krishnashtami_contact_assignments') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE krishnashtami_contact_assignments;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'krishnashtami_registration_prasadam') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE krishnashtami_registration_prasadam;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'krishnashtami_visitor_visits') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE krishnashtami_visitor_visits;
        END IF;
    END IF;
END$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
