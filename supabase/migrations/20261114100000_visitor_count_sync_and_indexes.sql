-- Migration: 20261114100000_visitor_count_sync_and_indexes.sql
-- Description: Synchronize Saturday Meetup visitor counts with approved check-ins,
--              optimize composite indexes for high-speed sub-50ms query execution.

-- 1. High-Performance Composite Indexes
CREATE INDEX IF NOT EXISTS idx_mca_active_period_status
ON public.master_contact_assignments(is_active, status_weekly_period, status);

CREATE INDEX IF NOT EXISTS idx_mcc_period_phone
ON public.master_contact_checkins(weekly_period, phone);

CREATE INDEX IF NOT EXISTS idx_mcc_period_contact
ON public.master_contact_checkins(weekly_period, master_contact_id);

-- 2. Update archive_saturday_meetup_visitor_history to count all approved check-ins as visitors
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

    -- Total approved unique check-ins for that week
    SELECT count(DISTINCT phone)
    INTO v_total_att
    FROM public.master_contact_checkins
    WHERE weekly_period = v_rec.weekly_period;

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
      v_total_att,
      v_total_att,
      NOW()
    )
    ON CONFLICT (weekly_period)
    DO UPDATE SET
      total_visitors = EXCLUDED.total_visitors,
      total_attendance = EXCLUDED.total_attendance;

    IF FOUND THEN
      v_archived_count := v_archived_count + 1;
    END IF;
  END LOOP;

  RETURN v_archived_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_saturday_meetup_visitor_history(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_saturday_meetup_visitor_history(TEXT) TO authenticated, service_role;
