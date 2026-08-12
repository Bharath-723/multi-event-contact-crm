-- ============================================================
-- 20260807000000_feedback_contacts.sql
-- Feedback Contacts table for Feedback Registration System (v2.0.0)
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback_contacts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name              TEXT NOT NULL,
    phone                  TEXT NOT NULL,
    college_name           TEXT NOT NULL,
    branch                 TEXT NOT NULL,
    gender                 TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
    current_stay           TEXT NOT NULL CHECK (current_stay IN ('With Parents', 'In Hostel')),
    skills                 TEXT[] NOT NULL DEFAULT '{}',
    feedback               TEXT NOT NULL CHECK (feedback IN ('Excellent', 'Good', 'Not Applicable')),
    interested_online_workshop BOOLEAN NOT NULL DEFAULT FALSE,
    interested_online_work     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns exist on pre-existing tables
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS interested_online_workshop BOOLEAN DEFAULT FALSE;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS interested_online_work BOOLEAN DEFAULT FALSE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_phone ON feedback_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_created_at ON feedback_contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_college ON feedback_contacts(college_name);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_branch ON feedback_contacts(branch);

-- Enable RLS
ALTER TABLE feedback_contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert feedback contacts via API
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_insert_public'
  ) THEN
    CREATE POLICY "feedback_contacts_insert_public" ON feedback_contacts 
    FOR INSERT 
    WITH CHECK (TRUE);
  END IF;
END$$;

-- Policy: Read access for all authenticated users (Admins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_read_authenticated'
  ) THEN
    CREATE POLICY "feedback_contacts_read_authenticated" ON feedback_contacts 
    FOR SELECT 
    USING (TRUE);
  END IF;
END$$;

-- Policy: Admin full management
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_admin_all'
  ) THEN
    CREATE POLICY "feedback_contacts_admin_all" ON feedback_contacts 
    FOR ALL 
    TO authenticated 
    USING (TRUE) 
    WITH CHECK (TRUE);
  END IF;
END$$;

-- Enable Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE feedback_contacts;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore if already added to publication
    NULL;
END$$;
