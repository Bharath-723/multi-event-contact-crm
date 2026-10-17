-- ============================================================
-- 20261015000000_contacts_register_nullable_current_stay.sql
-- Allow NULL current_stay and pg_name for female registrants
-- in the contacts_register table while enforcing gender-specific
-- integrity rules for male registrants.
--
-- Safety & Production Preservation:
--   1. Ensures current_stay and pg_name allow NULL (idempotent, safe no-op
--      if already nullable).
--   2. Inspects legacy constraints (contacts_register_current_stay_check,
--      chk_contacts_register_pg_name) before removal:
--      - Drops only if verified as conflicting with female NULL stay rules.
--      - Raises an exception for manual review if an unexpected definition is found.
--   3. Inspects active constraint definitions against exact normalized logic:
--      - If chk_contacts_register_current_stay matches the canonical definition,
--        it is preserved untouched without lock churn or table re-scans.
--      - If chk_contacts_register_gender_stay matches the canonical definition,
--        it is preserved untouched without lock churn or table re-scans.
--      - If absent, creates the constraint.
--      - If present but divergent, raises a clear exception for manual review
--        rather than silently overwriting an unknown production constraint.
--   4. Non-destructive: preserves existing records, indexes, triggers,
--      RLS policies, and Master Contacts sync.
-- ============================================================

-- 1. Ensure columns allow NULL (idempotent no-op if already nullable)
ALTER TABLE public.contacts_register
  ALTER COLUMN current_stay DROP NOT NULL;

ALTER TABLE public.contacts_register
  ALTER COLUMN pg_name DROP NOT NULL;

-- 2. Inspect and safely retire legacy conflicting constraints if present
DO $$
DECLARE
  v_def TEXT;
BEGIN
  -- Inspect legacy auto-generated column check: contacts_register_current_stay_check
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.contacts_register'::regclass
    AND c.conname = 'contacts_register_current_stay_check';

  IF v_def IS NOT NULL THEN
    -- Drops only if it conflicts with NULL current_stay (i.e. does not permit NULL)
    IF v_def NOT LIKE '%IS NULL%' THEN
      ALTER TABLE public.contacts_register DROP CONSTRAINT contacts_register_current_stay_check;
    ELSE
      RAISE EXCEPTION 'Legacy constraint contacts_register_current_stay_check exists with unexpected definition: %. Manual review required.', v_def;
    END IF;
  END IF;

  -- Inspect legacy named check: chk_contacts_register_pg_name
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.contacts_register'::regclass
    AND c.conname = 'chk_contacts_register_pg_name';

  IF v_def IS NOT NULL THEN
    -- Drops only if it matches the legacy pre-gender definition superseded by chk_contacts_register_gender_stay
    IF v_def LIKE '%In Hostel%' AND v_def LIKE '%pg_name%' THEN
      ALTER TABLE public.contacts_register DROP CONSTRAINT chk_contacts_register_pg_name;
    ELSE
      RAISE EXCEPTION 'Legacy constraint chk_contacts_register_pg_name exists with unexpected definition: %. Manual review required.', v_def;
    END IF;
  END IF;
END $$;

-- 3. Add or preserve permitted value constraint for current_stay
DO $$
DECLARE
  v_def TEXT;
  v_exp_stay_1 TEXT := 'CHECK (((current_stay IS NULL) OR (current_stay = ANY (ARRAY[''With Parents''::text, ''In Hostel''::text]))))';
  v_exp_stay_2 TEXT := 'CHECK (((current_stay IS NULL) OR (current_stay = ANY (ARRAY[''In Hostel''::text, ''With Parents''::text]))))';
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.contacts_register'::regclass
    AND c.conname = 'chk_contacts_register_current_stay';

  IF v_def IS NULL THEN
    ALTER TABLE public.contacts_register
      ADD CONSTRAINT chk_contacts_register_current_stay
      CHECK (current_stay IS NULL OR current_stay IN ('With Parents', 'In Hostel'));
  ELSIF v_def = v_exp_stay_1 OR v_def = v_exp_stay_2 THEN
    -- Exact canonical match: preserve existing validated constraint without table lock churn
    NULL;
  ELSE
    RAISE EXCEPTION 'Constraint chk_contacts_register_current_stay exists with unexpected definition: %. Manual review required.', v_def;
  END IF;
END $$;

-- 4. Add or preserve comprehensive gender-specific integrity constraint
DO $$
DECLARE
  v_def TEXT;
  v_exp_gender TEXT := 'CHECK ((((gender = ''Female''::text) AND (current_stay IS NULL) AND ((pg_name IS NULL) OR (length(TRIM(BOTH FROM pg_name)) = 0))) OR ((gender = ''Male''::text) AND (current_stay IS NOT NULL) AND (((current_stay = ''With Parents''::text) AND ((pg_name IS NULL) OR (length(TRIM(BOTH FROM pg_name)) = 0))) OR ((current_stay = ''In Hostel''::text) AND (pg_name IS NOT NULL) AND (length(TRIM(BOTH FROM pg_name)) >= 2))))))';
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.contacts_register'::regclass
    AND c.conname = 'chk_contacts_register_gender_stay';

  IF v_def IS NULL THEN
    ALTER TABLE public.contacts_register
      ADD CONSTRAINT chk_contacts_register_gender_stay
      CHECK (
        (gender = 'Female' AND current_stay IS NULL AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
        (gender = 'Male'   AND current_stay IS NOT NULL AND (
          (current_stay = 'With Parents' AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
          (current_stay = 'In Hostel'    AND pg_name IS NOT NULL AND length(trim(pg_name)) >= 2)
        ))
      );
  ELSIF v_def = v_exp_gender THEN
    -- Exact canonical match: preserve existing validated constraint without table lock churn
    NULL;
  ELSE
    RAISE EXCEPTION 'Constraint chk_contacts_register_gender_stay exists with unexpected definition: %. Manual review required.', v_def;
  END IF;
END $$;

-- 5. Notify PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
