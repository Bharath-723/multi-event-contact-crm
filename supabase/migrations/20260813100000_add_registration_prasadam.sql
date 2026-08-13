-- ============================================================
-- 20260813100000_add_registration_prasadam.sql
-- Adds dedicated registration_prasadam table for Krishnashtami 2026.
-- SAFETY: Transaction-safe (BEGIN...COMMIT), non-destructive, additive only.
-- Preserves all 826 existing Rathayatra registrations and interested_to_dinner.
-- Does NOT drop or modify any existing columns or tables.
-- ============================================================

BEGIN;

-- 1. Ensure composite unique constraint on registrations(id, festival_event_id)
-- Required to enforce database-level multi-tenant festival consistency.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_registrations_id_festival'
    ) THEN
        ALTER TABLE registrations 
        ADD CONSTRAINT uq_registrations_id_festival UNIQUE (id, festival_event_id);
    END IF;
END$$;

-- 2. Create dedicated Prasadam table with composite foreign key for festival isolation
CREATE TABLE IF NOT EXISTS registration_prasadam (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id   UUID NOT NULL,
    festival_event_id UUID NOT NULL,
    prasadam_type     TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reg_prasadam UNIQUE (registration_id, prasadam_type),
    CONSTRAINT chk_prasadam_type CHECK (prasadam_type IN ('Breakfast', 'Lunch', 'Dinner')),
    CONSTRAINT fk_reg_prasadam_registration_festival 
        FOREIGN KEY (registration_id, festival_event_id) 
        REFERENCES registrations(id, festival_event_id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reg_prasadam_festival 
        FOREIGN KEY (festival_event_id) 
        REFERENCES festival_events(id) 
        ON DELETE RESTRICT
);

-- 3. Indexes for fast query lookups
CREATE INDEX IF NOT EXISTS idx_reg_prasadam_registration_id   ON registration_prasadam(registration_id);
CREATE INDEX IF NOT EXISTS idx_reg_prasadam_festival_event_id ON registration_prasadam(festival_event_id);
CREATE INDEX IF NOT EXISTS idx_reg_prasadam_prasadam_type     ON registration_prasadam(prasadam_type);

-- 4. Row Level Security (Restricted to authenticated admin and service_role ONLY)
ALTER TABLE registration_prasadam ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'registration_prasadam' AND policyname = 'rp_admin_all') THEN
        CREATE POLICY rp_admin_all ON registration_prasadam
            FOR ALL TO authenticated, service_role USING (TRUE) WITH CHECK (TRUE);
    END IF;
END$$;

-- 5. Grants (No anon access granted)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE registration_prasadam TO authenticated, service_role;

-- 6. Enable Realtime safely
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'registration_prasadam'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE registration_prasadam;
        END IF;
    END IF;
END$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
