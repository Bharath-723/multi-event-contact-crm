-- 20260718000000_service_management.sql
-- Phase 5: Dynamic Service Allocation & Operations Dashboard (v1.1.0)
-- Creates the services master table and links it to registrations.

-- ─── 1. Create services table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_services_updated_at ON services;
CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_services_updated_at();

-- ─── 3. Add service_id to registrations ──────────────────────────────────────
ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_service_id ON registrations(service_id);

-- ─── 4. Seed initial services ────────────────────────────────────────────────
INSERT INTO services (name, description, is_active) VALUES
    ('Sponsors Prasadam Distribution', 'Distributing prasadam to sponsors and donors', TRUE),
    ('FOLK Prasadam Distribution',     'Distributing prasadam at FOLK venue',           TRUE),
    ('Water Distribution',             'Managing water supply along the procession route', TRUE),
    ('Juice Distribution',             'Distributing juice to participants and devotees',  TRUE),
    ('Donna Prasadam Distribution',    'Distributing prasadam in donna (leaf plates)',     TRUE)
ON CONFLICT (name) DO NOTHING;

-- ─── 5. Row Level Security ───────────────────────────────────────────────────
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read active services (needed for public dropdown)
CREATE POLICY "services_read_all" ON services
    FOR SELECT
    USING (TRUE);

-- Only authenticated users can insert/update/delete
CREATE POLICY "services_write_authenticated" ON services
    FOR ALL
    TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- ─── 6. Enable Realtime ──────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE services;

-- ─── 7. Cleanup Sankirtan ────────────────────────────────────────────────────
UPDATE registrations
SET service_id = NULL
WHERE service_id IN (
    SELECT id FROM services WHERE LOWER(name) = 'sankirtan'
);

DELETE FROM services
WHERE LOWER(name) = 'sankirtan';

