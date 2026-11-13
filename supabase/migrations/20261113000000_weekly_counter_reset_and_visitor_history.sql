-- ============================================================
-- LOCAL DEVELOPMENT ARTIFACT — DO NOT EXECUTE DIRECTLY IN PRODUCTION
-- 20261113000000_weekly_counter_reset_and_visitor_history.sql
--
-- MECM — Weekly Dashboard Counter Reset & Historical Visitor Tracking
--
-- Architectural Specification:
-- 1. Persistent Saturday Meetup Visitor History Table:
--    - Stores each Saturday Meetup's total approved visitors and total attendance.
--    - Unique constraint on weekly_period enforces idempotence and prevents duplicate entries.
--    - Retains historical visitor records permanently across weekly rollovers.
-- 2. Status Weekly Period Column on Master Contact Assignments:
--    - Adds nullable status_weekly_period TEXT to public.master_contact_assignments.
--    - Records the weekly period (e.g. '2026-11-13') when a call status was last logged.
--    - Allows weekly status counters (Coming, Not Coming, Not Answered, Next Week, Pending)
--      to start from 0 for the new weekly period without unassigning contacts.
-- 3. Invariant Preservation:
--    - ZERO contact unassignments or deletions.
--    - master_contact_assignments.is_active remains untouched.
--    - Assigned contacts, total operators, and active operators remain intact indefinitely.
--    - Historical attendance check-in records and classes_attended remain permanent.
-- ============================================================

BEGIN;

-- ── 1. Create Saturday Meetup Visitor History Table ─────────────────────────
CREATE TABLE IF NOT EXISTS public.saturday_meetup_visitor_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekly_period TEXT NOT NULL UNIQUE,
    meetup_date DATE NOT NULL,
    meetup_date_label TEXT NOT NULL,
    total_visitors INT NOT NULL DEFAULT 0,
    total_attendance INT NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient ordering and lookups
CREATE INDEX IF NOT EXISTS idx_smvh_weekly_period ON public.saturday_meetup_visitor_history(weekly_period);
CREATE INDEX IF NOT EXISTS idx_smvh_meetup_date ON public.saturday_meetup_visitor_history(meetup_date DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.saturday_meetup_visitor_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (admins) to select historical visitor records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saturday_meetup_visitor_history'
      AND policyname = 'smvh_select_authenticated'
  ) THEN
    CREATE POLICY "smvh_select_authenticated"
      ON public.saturday_meetup_visitor_history
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Allow service_role full management
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saturday_meetup_visitor_history'
      AND policyname = 'smvh_all_service_role'
  ) THEN
    CREATE POLICY "smvh_all_service_role"
      ON public.saturday_meetup_visitor_history
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── 2. Add status_weekly_period to master_contact_assignments ───────────────
ALTER TABLE public.master_contact_assignments
ADD COLUMN IF NOT EXISTS status_weekly_period TEXT;

CREATE INDEX IF NOT EXISTS idx_mca_status_weekly_period
ON public.master_contact_assignments(status_weekly_period);

-- Populate status_weekly_period for existing assignments based on updated_at
UPDATE public.master_contact_assignments
SET status_weekly_period = public.get_current_weekly_period(updated_at)
WHERE status_weekly_period IS NULL AND updated_at IS NOT NULL;

-- ── 3. Idempotent Visitor History Archival Function ─────────────────────────
CREATE OR REPLACE FUNCTION public.archive_saturday_meetup_visitor_history(p_current_period TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_meetup_date DATE;
  v_meetup_label TEXT;
  v_total_att INT;
  v_total_vis INT;
  v_archived_count INT := 0;
BEGIN
  -- For every past weekly period in master_contact_checkins
  FOR v_rec IN
    SELECT DISTINCT weekly_period
    FROM public.master_contact_checkins
    WHERE weekly_period < p_current_period
    ORDER BY weekly_period ASC
  LOOP
    -- Calculate Saturday Meetup date (start Friday + 1 day)
    v_meetup_date := (v_rec.weekly_period::date + INTERVAL '1 day')::date;
    v_meetup_label := 'Saturday, ' || to_char(v_meetup_date, 'DD Mon YYYY');

    -- Total check-ins for that week
    SELECT count(*)
    INTO v_total_att
    FROM public.master_contact_checkins
    WHERE weekly_period = v_rec.weekly_period;

    -- Total approved visitors (check-ins whose master_contact_id was not actively assigned)
    SELECT count(*)
    INTO v_total_vis
    FROM public.master_contact_checkins mcc
    WHERE mcc.weekly_period = v_rec.weekly_period
      AND NOT EXISTS (
        SELECT 1 FROM public.master_contact_assignments mca
        WHERE mca.master_contact_id = mcc.master_contact_id
          AND mca.is_active = true
      );

    -- Insert into history table idempotently
    INSERT INTO public.saturday_meetup_visitor_history (
      weekly_period,
      meetup_date,
      meetup_date_label,
      total_visitors,
      total_attendance,
      archived_at
    ) VALUES (
      v_rec.weekly_period,
      v_meetup_date,
      v_meetup_label,
      v_total_vis,
      v_total_att,
      NOW()
    )
    ON CONFLICT (weekly_period) DO NOTHING;

    IF FOUND THEN
      v_archived_count := v_archived_count + 1;
    END IF;
  END LOOP;

  RETURN v_archived_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_saturday_meetup_visitor_history(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_saturday_meetup_visitor_history(TEXT) TO authenticated, service_role;

COMMIT;

