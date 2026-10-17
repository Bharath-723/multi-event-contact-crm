-- ============================================================================
-- Migration: 20261017000001_update_level_progression_rules.sql
-- Description: Update HKM Level Progression Rules in approve_master_contact_checkin RPC
-- 
-- Revised Unified Level Hierarchy:
--   0 classes:       level-0 (No level)
--   1 class:         level-1 (AOMC)
--   2–10 classes:    level-2 (Foundation)
--   11–20 classes:   level-3 (Prilims)
--   21+ classes:     level-4 (Enhance)
-- ============================================================================

-- 1. Update approve_master_contact_checkin RPC with revised progression rules
CREATE OR REPLACE FUNCTION public.approve_master_contact_checkin(
  p_contact_id UUID,
  p_admin_id UUID DEFAULT NULL,
  p_admin_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id UUID;
  v_raw_phone TEXT;
  v_clean_phone TEXT;
  v_classes_attended INT;
  v_weekly_period TEXT;
  v_existing_id UUID;
  v_existing_at TIMESTAMPTZ;
  v_existing_admin TEXT;
  v_new_checkin_id UUID;
  v_new_checked_at TIMESTAMPTZ;
  v_new_count INT;
  v_new_level TEXT;
BEGIN
  -- 1. Determine current weekly period
  v_weekly_period := public.get_current_weekly_period(NOW());

  -- 2. Row Lock on master contact to eliminate concurrency races on this record
  SELECT id, phone, classes_attended
  INTO v_contact_id, v_raw_phone, v_classes_attended
  FROM public.master_contacts
  WHERE id = p_contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master contact % not found', p_contact_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Canonical phone normalization & strict Indian Mobile validation (10 digits starting with 6-9)
  v_clean_phone := public.normalize_phone(v_raw_phone);
  IF v_clean_phone IS NULL OR length(v_clean_phone) != 10 OR v_clean_phone !~ '^[6-9]\d{9}$' THEN
    RAISE EXCEPTION 'Cannot approve check-in: Master contact % has an invalid mobile number "%" (normalized: "%"). A valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 is required.',
      p_contact_id, COALESCE(v_raw_phone, 'NULL'), COALESCE(v_clean_phone, 'NULL')
      USING ERRCODE = '22023';
  END IF;

  -- 4. Cross-record advisory transaction lock on (normalized_phone, weekly_period)
  -- Serializes simultaneous approvals across duplicate master contact rows sharing the same phone
  PERFORM pg_advisory_xact_lock(hashtext('mcc_' || v_clean_phone || '_' || v_weekly_period));

  -- 5. Check for existing approval in this weekly period (by contact ID or normalized phone)
  SELECT id, checked_in_at, admin_email
  INTO v_existing_id, v_existing_at, v_existing_admin
  FROM public.master_contact_checkins
  WHERE weekly_period = v_weekly_period
    AND (phone = v_clean_phone OR master_contact_id = p_contact_id);

  IF FOUND THEN
    -- Determine level for current classes_attended
    IF v_classes_attended = 0 THEN
      v_new_level := 'level-0';
    ELSIF v_classes_attended = 1 THEN
      v_new_level := 'level-1';
    ELSIF v_classes_attended >= 2 AND v_classes_attended <= 10 THEN
      v_new_level := 'level-2';
    ELSIF v_classes_attended >= 11 AND v_classes_attended <= 20 THEN
      v_new_level := 'level-3';
    ELSE
      v_new_level := 'level-4';
    END IF;

    -- Idempotent return: already approved in this weekly period; DO NOT increment classes_attended
    RETURN jsonb_build_object(
      'success', true,
      'already_approved', true,
      'weekly_period', v_weekly_period,
      'checkin_id', v_existing_id,
      'checked_in_at', v_existing_at,
      'admin_email', v_existing_admin,
      'classes_attended', v_classes_attended,
      'level', v_new_level
    );
  END IF;

  -- 6. Insert new check-in record using canonical normalized phone
  -- Uses ON CONFLICT (phone, weekly_period) DO NOTHING to prevent transaction abortion,
  -- backed by serialization failure handling (40001) if concurrent commit is invisible.
  BEGIN
    INSERT INTO public.master_contact_checkins (
      master_contact_id,
      phone,
      weekly_period,
      checked_in_at,
      approved_by,
      admin_email
    ) VALUES (
      p_contact_id,
      v_clean_phone,
      v_weekly_period,
      NOW(),
      p_admin_id,
      p_admin_email
    )
    ON CONFLICT (phone, weekly_period) DO NOTHING
    RETURNING id, checked_in_at INTO v_new_checkin_id, v_new_checked_at;
  EXCEPTION WHEN unique_violation THEN
    -- Fallback for concurrent collision on partial index idx_mcc_contact_period
    v_new_checkin_id := NULL;
  END;

  IF v_new_checkin_id IS NULL THEN
    -- Check-in collision: fetch the committed check-in record
    SELECT id, checked_in_at, admin_email
    INTO v_existing_id, v_existing_at, v_existing_admin
    FROM public.master_contact_checkins
    WHERE weekly_period = v_weekly_period
      AND (phone = v_clean_phone OR master_contact_id = p_contact_id)
    ORDER BY checked_in_at DESC
    LIMIT 1;

    -- Safety verification under all transaction isolation levels:
    -- If the concurrent row is invisible (e.g. under REPEATABLE READ snapshot isolation),
    -- raise SQLSTATE 40001 (serialization_failure) to instruct caller to retry cleanly.
    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Concurrent check-in collision detected for contact % (phone: %) in period %, but committed record is not visible in current transaction snapshot. Please retry.',
        p_contact_id, v_clean_phone, v_weekly_period
        USING ERRCODE = '40001';
    END IF;

    IF v_classes_attended = 0 THEN
      v_new_level := 'level-0';
    ELSIF v_classes_attended = 1 THEN
      v_new_level := 'level-1';
    ELSIF v_classes_attended >= 2 AND v_classes_attended <= 10 THEN
      v_new_level := 'level-2';
    ELSIF v_classes_attended >= 11 AND v_classes_attended <= 20 THEN
      v_new_level := 'level-3';
    ELSE
      v_new_level := 'level-4';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'already_approved', true,
      'weekly_period', v_weekly_period,
      'checkin_id', v_existing_id,
      'checked_in_at', v_existing_at,
      'admin_email', v_existing_admin,
      'classes_attended', v_classes_attended,
      'level', v_new_level
    );
  END IF;

  -- 7. Atomically increment classes_attended and update level code
  v_new_count := COALESCE(v_classes_attended, 0) + 1;

  IF v_new_count = 0 THEN
    v_new_level := 'level-0';
  ELSIF v_new_count = 1 THEN
    v_new_level := 'level-1';
  ELSIF v_new_count >= 2 AND v_new_count <= 10 THEN
    v_new_level := 'level-2';
  ELSIF v_new_count >= 11 AND v_new_count <= 20 THEN
    v_new_level := 'level-3';
  ELSE
    v_new_level := 'level-4';
  END IF;

  UPDATE public.master_contacts
  SET classes_attended = v_new_count,
      level = v_new_level,
      updated_at = NOW()
  WHERE id = p_contact_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_approved', false,
    'weekly_period', v_weekly_period,
    'checkin_id', v_new_checkin_id,
    'checked_in_at', v_new_checked_at,
    'admin_email', p_admin_email,
    'classes_attended', v_new_count,
    'level', v_new_level
  );
END;
$$;

-- Security: Restricted strictly to service_role (invoked via server-side requireAdmin)
REVOKE ALL ON FUNCTION public.approve_master_contact_checkin(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_master_contact_checkin(UUID, UUID, TEXT) TO service_role;

-- 2. Synchronize level on existing master_contacts safely from classes_attended
UPDATE public.master_contacts
SET level = CASE
  WHEN classes_attended <= 0 THEN 'level-0'
  WHEN classes_attended = 1 THEN 'level-1'
  WHEN classes_attended >= 2 AND classes_attended <= 10 THEN 'level-2'
  WHEN classes_attended >= 11 AND classes_attended <= 20 THEN 'level-3'
  ELSE 'level-4'
END
WHERE classes_attended IS NOT NULL;
