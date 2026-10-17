-- ============================================================
-- 20261015120000_admin_portal_features_update.sql
-- HKM Admin Portal Complete Feature Update:
-- 1. Add level to registrations & krishnashtami_registrations (defaults to 'level-0')
-- 2. Add chanting column, non-negative check, and atomic RPC to master_contacts
-- 3. Add profession, interested_bhagavad_gita, and comments to contacts_register
-- ============================================================

-- 1. Registrations level (Default 'level-0')
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'level-0';

ALTER TABLE public.krishnashtami_registrations
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'level-0';

-- 2. Master Contacts Chanting Counter (Default 0, non-negative)
ALTER TABLE public.master_contacts
  ADD COLUMN IF NOT EXISTS chanting INT NOT NULL DEFAULT 0;

-- Add or preserve non-negative check constraint for chanting
DO $$
DECLARE
  v_def TEXT;
  v_exp_chanting TEXT := 'CHECK ((chanting >= 0))';
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.master_contacts'::regclass
    AND c.conname = 'chk_master_contacts_chanting';

  IF v_def IS NULL THEN
    ALTER TABLE public.master_contacts
      ADD CONSTRAINT chk_master_contacts_chanting
      CHECK (chanting >= 0);
  ELSIF v_def = v_exp_chanting THEN
    -- Exact canonical match: preserve existing validated constraint without table lock churn
    NULL;
  ELSE
    RAISE EXCEPTION 'Constraint chk_master_contacts_chanting exists with unexpected definition: %. Manual review required.', v_def;
  END IF;
END $$;

-- Concurrency-safe atomic RPC for increment/decrement/set of chanting count
CREATE OR REPLACE FUNCTION public.update_master_contact_chanting(
  p_contact_id UUID,
  p_delta INT DEFAULT 0,
  p_set_val INT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_val INT;
BEGIN
  IF p_set_val IS NOT NULL THEN
    IF p_set_val < 0 THEN
      RAISE EXCEPTION 'Chanting count cannot be negative';
    END IF;
    UPDATE public.master_contacts
    SET chanting = p_set_val, updated_at = NOW()
    WHERE id = p_contact_id
    RETURNING chanting INTO v_new_val;
  ELSE
    UPDATE public.master_contacts
    SET chanting = GREATEST(0, COALESCE(chanting, 0) + p_delta), updated_at = NOW()
    WHERE id = p_contact_id
    RETURNING chanting INTO v_new_val;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact with ID % not found', p_contact_id USING ERRCODE = 'P0002';
  END IF;

  RETURN v_new_val;
END;
$$;

-- Restrict execution strictly to service_role (Direct execution blocked for anon, authenticated, and public)
REVOKE EXECUTE ON FUNCTION public.update_master_contact_chanting(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_master_contact_chanting(UUID, INT, INT) TO service_role;

-- 3. Contacts Register New Fields: Profession, Bhagavad Gita Interest, Comments/Query
ALTER TABLE public.contacts_register
  ADD COLUMN IF NOT EXISTS profession TEXT,
  ADD COLUMN IF NOT EXISTS interested_bhagavad_gita BOOLEAN,
  ADD COLUMN IF NOT EXISTS comments TEXT;

-- Add or preserve profession check constraint
DO $$
DECLARE
  v_def TEXT;
  v_exp_profession TEXT := 'CHECK (((profession IS NULL) OR (profession = ANY (ARRAY[''Student''::text, ''Working''::text, ''Business''::text, ''Others''::text]))))';
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.contacts_register'::regclass
    AND c.conname = 'chk_contacts_register_profession';

  IF v_def IS NULL THEN
    ALTER TABLE public.contacts_register
      ADD CONSTRAINT chk_contacts_register_profession
      CHECK (profession IS NULL OR profession IN ('Student', 'Working', 'Business', 'Others'));
  ELSIF v_def = v_exp_profession THEN
    -- Exact canonical match: preserve existing validated constraint without table lock churn
    NULL;
  ELSE
    RAISE EXCEPTION 'Constraint chk_contacts_register_profession exists with unexpected definition: %. Manual review required.', v_def;
  END IF;
END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
