-- ============================================================
-- 20261003000000_contacts_register_schema.sql
-- Dedicated schema for Contacts Register form
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts_register (
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
    created_at                 TIMESTAMPTZ DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_register_phone ON contacts_register(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_register_created_at ON contacts_register(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_register_college ON contacts_register(college_name);
CREATE INDEX IF NOT EXISTS idx_contacts_register_area ON contacts_register(area_of_stay);

ALTER TABLE contacts_register ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contacts_register' AND policyname = 'contacts_register_insert_public'
  ) THEN
    CREATE POLICY "contacts_register_insert_public" ON contacts_register FOR INSERT WITH CHECK (TRUE);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contacts_register' AND policyname = 'contacts_register_read_authenticated'
  ) THEN
    CREATE POLICY "contacts_register_read_authenticated" ON contacts_register FOR SELECT USING (TRUE);
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
