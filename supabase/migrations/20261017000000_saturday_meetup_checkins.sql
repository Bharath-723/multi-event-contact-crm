-- ============================================================
-- 20261017000000_saturday_meetup_checkins.sql
-- HKM Admin Portal: Saturday Meet-up, Visitor Check-In & Unified Levels
--
-- Security & Safety Architecture:
-- 1. Classes Attended Counter:
--    - Adds non-negative classes_attended INT to master_contacts (Default 0).
--    - Cumulative count of successfully approved Visitor Check-Ins across all weeks.
--    - Independent of chanting and weekly check-in statuses.
-- 2. Archival-Preserving Check-In History:
--    - Creates master_contact_checkins audit table.
--    - Uses ON DELETE SET NULL on master_contact_id so deleting a Master Contact
--      never cascade-deletes historical attendance records.
--    - Normalized phone is stored directly on the check-in record for permanent identity audit.
--    - Unique constraint on (phone, weekly_period) enforces at most 1 approval per period.
-- 3. Friday 00:00:00 Asia/Kolkata Weekly Rollover:
--    - Deterministic period calculation without destructive deletion of history.
-- 4. Concurrency-Safe Atomic RPC:
--    - Row lock FOR UPDATE on master contact record.
--    - Cross-record advisory transaction lock on (normalized_phone, weekly_period).
--    - Phone validation enforcing at least 10 valid digits before approval.
--    - Safe unique_violation fallback verifying non-null check-in record or rolling back.
--    - SECURITY DEFINER with fixed search_path = public, pg_temp.
--    - Restricted strictly to service_role (called only from server-side requireAdmin).
-- ============================================================

-- 0. Ensure Canonical Indian Mobile Normalization Function Exists (idempotent; preserves existing if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'normalize_phone'
  ) THEN
    CREATE FUNCTION public.normalize_phone(p_phone text)
    RETURNS text AS $fn$
    DECLARE
      cleaned text;
    BEGIN
      IF p_phone IS NULL THEN RETURN NULL; END IF;
      cleaned := regexp_replace(p_phone, '\D', '', 'g');

      -- 12 digits starting with country code '91'
      IF length(cleaned) = 12 AND cleaned LIKE '91%' THEN
        cleaned := substring(cleaned from 3);
      -- 11 digits starting with trunk prefix '0'
      ELSIF length(cleaned) = 11 AND cleaned LIKE '0%' THEN
        cleaned := substring(cleaned from 2);
      END IF;

      -- Validate 10-digit Indian Mobile pattern (starts with 6, 7, 8, or 9)
      IF length(cleaned) = 10 AND cleaned ~ '^[6-9]\d{9}$' THEN
        RETURN cleaned;
      ELSE
        -- Return cleaned raw string for non-standard entries without blind truncation
        RETURN cleaned;
      END IF;
    END;
    $fn$ LANGUAGE plpgsql IMMUTABLE;
  END IF;
END $$;

-- 1. Add classes_attended to master_contacts
ALTER TABLE public.master_contacts
  ADD COLUMN IF NOT EXISTS classes_attended INT NOT NULL DEFAULT 0;

-- Non-negative check constraint for classes_attended
DO $$
DECLARE
  v_def TEXT;
  v_exp_ca TEXT := 'CHECK ((classes_attended >= 0))';
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.master_contacts'::regclass
    AND c.conname = 'chk_master_contacts_classes_attended';

  IF v_def IS NULL THEN
    ALTER TABLE public.master_contacts
      ADD CONSTRAINT chk_master_contacts_classes_attended
      CHECK (classes_attended >= 0);
  ELSIF v_def = v_exp_ca THEN
    -- Exact canonical match: preserve existing validated constraint without table lock churn
    NULL;
  ELSE
    RAISE EXCEPTION 'Constraint chk_master_contacts_classes_attended exists with unexpected definition: %. Manual review required.', v_def;
  END IF;
END $$;

-- 2. Auditable Visitor Check-Ins Table (Archival-Preserving)
CREATE TABLE IF NOT EXISTS public.master_contact_checkins (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_contact_id UUID REFERENCES public.master_contacts(id) ON DELETE SET NULL,
  phone             TEXT NOT NULL,
  weekly_period     TEXT NOT NULL,
  checked_in_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by       UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  admin_email       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_mcc_phone_period UNIQUE (phone, weekly_period),
  CONSTRAINT chk_mcc_phone_valid CHECK (phone ~ '^[6-9]\d{9}$')
);

-- Upgrade existing table if it was created with NOT NULL or ON DELETE CASCADE
DO $$
DECLARE
  v_confdeltype "char";
  v_attnotnull BOOLEAN;
BEGIN
  -- Ensure master_contact_id column is nullable
  SELECT a.attnotnull INTO v_attnotnull
  FROM pg_attribute a
  WHERE a.attrelid = 'public.master_contact_checkins'::regclass
    AND a.attname = 'master_contact_id';

  IF v_attnotnull = true THEN
    ALTER TABLE public.master_contact_checkins
      ALTER COLUMN master_contact_id DROP NOT NULL;
  END IF;

  -- Ensure foreign key is ON DELETE SET NULL ('n') instead of CASCADE ('c')
  SELECT c.confdeltype INTO v_confdeltype
  FROM pg_constraint c
  WHERE c.conrelid = 'public.master_contact_checkins'::regclass
    AND c.conname = 'master_contact_checkins_master_contact_id_fkey';

  IF v_confdeltype = 'c' THEN
    ALTER TABLE public.master_contact_checkins
      DROP CONSTRAINT master_contact_checkins_master_contact_id_fkey,
      ADD CONSTRAINT master_contact_checkins_master_contact_id_fkey
        FOREIGN KEY (master_contact_id)
        REFERENCES public.master_contacts(id)
        ON DELETE SET NULL;
  END IF;

  -- Ensure phone format check constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.master_contact_checkins'::regclass
      AND conname = 'chk_mcc_phone_valid'
  ) THEN
    ALTER TABLE public.master_contact_checkins
      ADD CONSTRAINT chk_mcc_phone_valid
      CHECK (phone ~ '^[6-9]\d{9}$');
  END IF;
END $$;

-- Partial unique index on master_contact_id per weekly period when not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcc_contact_period
  ON public.master_contact_checkins (master_contact_id, weekly_period)
  WHERE master_contact_id IS NOT NULL;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_mcc_master_contact_id ON public.master_contact_checkins(master_contact_id);
CREATE INDEX IF NOT EXISTS idx_mcc_phone ON public.master_contact_checkins(phone);
CREATE INDEX IF NOT EXISTS idx_mcc_weekly_period ON public.master_contact_checkins(weekly_period);
CREATE INDEX IF NOT EXISTS idx_mcc_checked_in_at ON public.master_contact_checkins(checked_in_at DESC);

-- Enable Row Level Security
ALTER TABLE public.master_contact_checkins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'master_contact_checkins'
      AND policyname = 'admin_all_master_contact_checkins'
  ) THEN
    CREATE POLICY admin_all_master_contact_checkins ON public.master_contact_checkins
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));
  END IF;
END $$;

-- Enable Supabase Realtime idempotently
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'master_contact_checkins'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.master_contact_checkins;
    END IF;
  END IF;
END $$;

-- 3. Helper: Calculate active weekly period (Friday 00:00:00 Asia/Kolkata rollover)
CREATE OR REPLACE FUNCTION public.get_current_weekly_period(p_timestamp TIMESTAMPTZ DEFAULT NOW())
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kolkata_time TIMESTAMP;
  v_dow INT;
  v_days_back INT;
  v_period_start DATE;
BEGIN
  v_kolkata_time := timezone('Asia/Kolkata', p_timestamp);
  v_dow := EXTRACT(DOW FROM v_kolkata_time)::INT; -- 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  v_days_back := (v_dow - 5 + 7) % 7;
  v_period_start := (v_kolkata_time::DATE - v_days_back);
  RETURN to_char(v_period_start, 'YYYY-MM-DD');
END;
$$;

-- 4. Atomic RPC: Concurrency-Safe Check-In Approval & Level Progression
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
