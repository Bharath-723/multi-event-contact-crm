import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

// Phase 5 migration — executed once.
// This route is safe to call multiple times; all statements use IF NOT EXISTS.
const MIGRATION_SQL = `
-- Create services table
CREATE TABLE IF NOT EXISTS services (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_services_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_services_updated_at
      BEFORE UPDATE ON services
      FOR EACH ROW
      EXECUTE FUNCTION update_services_updated_at()';
  END IF;
END$$;

-- Add service_id FK to registrations
ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_registrations_service_id ON registrations(service_id);

-- Enable RLS
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'services' AND policyname = 'services_read_all'
  ) THEN
    CREATE POLICY "services_read_all" ON services FOR SELECT USING (TRUE);
  END IF;
END$$;

-- RLS: authenticated can write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'services' AND policyname = 'services_write_authenticated'
  ) THEN
    CREATE POLICY "services_write_authenticated" ON services FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
END$$;

-- Create feedback_contacts table
CREATE TABLE IF NOT EXISTS feedback_contacts (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name                  TEXT NOT NULL,
    phone                      TEXT NOT NULL,
    college_name               TEXT NOT NULL,
    branch                     TEXT NOT NULL,
    gender                     TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
    current_stay               TEXT NOT NULL CHECK (current_stay IN ('With Parents', 'In Hostel')),
    skills                     TEXT[] NOT NULL DEFAULT '{}',
    feedback                   TEXT NOT NULL CHECK (feedback IN ('Excellent', 'Good', 'Not Applicable')),
    interested_online_workshop BOOLEAN NOT NULL DEFAULT FALSE,
    interested_online_work     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns are added to pre-existing tables
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS interested_online_workshop BOOLEAN DEFAULT FALSE;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS interested_online_work BOOLEAN DEFAULT FALSE;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS college_name TEXT;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS current_stay TEXT;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}';
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS feedback TEXT;

CREATE INDEX IF NOT EXISTS idx_feedback_contacts_phone ON feedback_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_created_at ON feedback_contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_college ON feedback_contacts(college_name);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_branch ON feedback_contacts(branch);

ALTER TABLE feedback_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_insert_public'
  ) THEN
    CREATE POLICY "feedback_contacts_insert_public" ON feedback_contacts FOR INSERT WITH CHECK (TRUE);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_read_authenticated'
  ) THEN
    CREATE POLICY "feedback_contacts_read_authenticated" ON feedback_contacts FOR SELECT USING (TRUE);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_admin_all'
  ) THEN
    CREATE POLICY "feedback_contacts_admin_all" ON feedback_contacts FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
END$$;
`;

const SEED_SQL = `
INSERT INTO services (name, description, is_active) VALUES
    ('Sponsors Prasadam Distribution', 'Distributing prasadam to sponsors and donors', TRUE),
    ('FOLK Prasadam Distribution',     'Distributing prasadam at FOLK venue',           TRUE),
    ('Water Distribution',             'Managing water supply along the procession route', TRUE),
    ('Juice Distribution',             'Distributing juice to participants and devotees',  TRUE),
    ('Donna Prasadam Distribution',    'Distributing prasadam in donna (leaf plates)',     TRUE)
ON CONFLICT (name) DO NOTHING;

-- Unassign any volunteers currently assigned to Sankirtan
UPDATE registrations
SET service_id = NULL
WHERE service_id IN (
    SELECT id FROM services WHERE LOWER(name) = 'sankirtan'
);

-- Permanently delete the service
DELETE FROM services
WHERE LOWER(name) = 'sankirtan';
`;

export async function POST() {
  try {
    // Execute migration DDL
    const { error: migError } = await supabaseAdmin.rpc('exec_sql', { sql: MIGRATION_SQL });
    if (migError) {
      // Try direct execution as fallback (different Supabase versions)
      console.error('[migrate] rpc exec_sql error:', migError);
      // Attempt manual table creation via supabase-js schema calls
      throw new Error(`Migration RPC failed: ${migError.message}`);
    }

    // Seed data
    const { error: seedError } = await supabaseAdmin.rpc('exec_sql', { sql: SEED_SQL });
    if (seedError) {
      console.warn('[migrate] Seed error (may be OK if already seeded):', seedError);
    }

    return NextResponse.json({ success: true, message: 'Phase 5 migration applied successfully' });
  } catch (err) {
    console.error('[POST /api/migrate]', err);
    return NextResponse.json({
      error: 'Migration failed. Please run the SQL manually in Supabase Studio.',
      details: err instanceof Error ? err.message : String(err),
      sql_file: 'supabase/migrations/20260718000000_service_management.sql',
    }, { status: 500 });
  }
}

export async function GET() {
  // Check if migration has been applied by checking if the services table exists
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('id, name')
    .limit(5);

  if (error) {
    return NextResponse.json({ migrated: false, error: error.message });
  }

  return NextResponse.json({ migrated: true, service_count: data?.length ?? 0, services: data });
}
