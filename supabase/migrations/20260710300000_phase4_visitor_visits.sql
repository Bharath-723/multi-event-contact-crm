-- ============================================================
-- 20260710300000_phase4_visitor_visits.sql
-- Phase 4: Visitor Management and Check-In Schema
-- Immutable Registration Numbers, Dedicated visits table, and Realtime integration.
-- ============================================================

-- 1. Create a sequence for registration numbers
CREATE SEQUENCE IF NOT EXISTS registration_seq START WITH 1;

-- 2. Add permanent, unique, human-readable registration_no to registrations
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS registration_no TEXT UNIQUE;

-- 3. Create BEFORE INSERT trigger to auto-generate registration_no
CREATE OR REPLACE FUNCTION assign_registration_no()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.registration_no IS NULL THEN
        NEW.registration_no := 'REG-' || to_char(COALESCE(NEW.created_at, NOW()), 'YYYY') || '-' || lpad(nextval('registration_seq')::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_registration_no ON registrations;
CREATE TRIGGER trg_assign_registration_no
    BEFORE INSERT ON registrations
    FOR EACH ROW
    EXECUTE FUNCTION assign_registration_no();

-- 4. Backfill existing registrations with sequence-based registration_no
-- This is executed safely on all current NULL entries.
UPDATE registrations
SET registration_no = 'REG-' || to_char(created_at, 'YYYY') || '-' || lpad(nextval('registration_seq')::text, 6, '0')
WHERE registration_no IS NULL;

-- 5. Create visitor_visits table (single source of attendance check-in)
CREATE TABLE IF NOT EXISTS visitor_visits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    visited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    visited_by      UUID REFERENCES contact_operators(id) ON DELETE SET NULL, -- References contact operator
    visited_by_admin BOOLEAN DEFAULT FALSE,
    visit_method    TEXT NOT NULL CHECK (visit_method = 'MANUAL_SEARCH'),
    remarks         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_visit_per_registration UNIQUE (registration_id) -- Duplicate protection
);

-- 6. Indexes for optimized manual search & logs
CREATE INDEX IF NOT EXISTS idx_registrations_registration_no ON registrations(registration_no);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_registration_id ON visitor_visits(registration_id);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_visited_at ON visitor_visits(visited_at DESC);

-- 7. RLS Policies for visitor_visits
ALTER TABLE visitor_visits ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY admin_all_visitor_visits ON visitor_visits
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- Enable Supabase Realtime for visitor_visits table
ALTER PUBLICATION supabase_realtime ADD TABLE visitor_visits;
