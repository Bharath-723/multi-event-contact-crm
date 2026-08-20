-- ============================================================
-- 20260820000000_add_standard_to_krishnashtami.sql
-- Add standard column & update register_krishnashtami_volunteer RPC
-- ============================================================

BEGIN;

-- 1. Add standard column to krishnashtami_registrations
ALTER TABLE public.krishnashtami_registrations
ADD COLUMN IF NOT EXISTS standard TEXT NULL;

-- 2. Add check constraint allowing only valid options or NULL
ALTER TABLE public.krishnashtami_registrations
DROP CONSTRAINT IF EXISTS krishnashtami_registrations_standard_check;

ALTER TABLE public.krishnashtami_registrations
ADD CONSTRAINT krishnashtami_registrations_standard_check
CHECK (
  standard IS NULL
  OR standard IN ('1st Year', '2nd Year', '3rd Year', '4th Year')
);

-- 3. Update register_krishnashtami_volunteer RPC
CREATE OR REPLACE FUNCTION public.register_krishnashtami_volunteer(
    p_full_name TEXT,
    p_phone TEXT,
    p_age INTEGER,
    p_gender TEXT,
    p_area_of_stay TEXT,
    p_company_college TEXT,
    p_pg_name TEXT,
    p_interested_to_volunteer BOOLEAN,
    p_volunteer_slot_id UUID,
    p_interested_to_dinner BOOLEAN,
    p_wants_to_donate BOOLEAN,
    p_donation_status TEXT,
    p_skill_ids UUID[],
    p_occupation TEXT DEFAULT NULL,
    p_transportation_required TEXT DEFAULT NULL,
    p_festival_event_id UUID DEFAULT NULL,
    p_prasadam_types TEXT[] DEFAULT NULL,
    p_standard TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_registration_id UUID;
    v_skill_id UUID;
    v_prasadam_type TEXT;
    v_seq_val BIGINT;
    v_reg_no TEXT;
    v_krish_event_id UUID;
    v_clean_standard TEXT;
BEGIN
    SELECT id INTO v_krish_event_id 
    FROM festival_events 
    WHERE slug = 'krishnashtami-2026';

    IF v_krish_event_id IS NULL THEN
        RAISE EXCEPTION 'Krishnashtami-2026 festival event not found in database' USING ERRCODE = '22004';
    END IF;

    IF p_festival_event_id IS NOT NULL AND p_festival_event_id <> v_krish_event_id THEN
        RAISE EXCEPTION 'Invalid festival_event_id % for Krishnashtami registration. Expected Krishnashtami event %',
            p_festival_event_id, v_krish_event_id USING ERRCODE = '22000';
    END IF;

    IF EXISTS (SELECT 1 FROM krishnashtami_registrations WHERE phone = p_phone) THEN
        RAISE EXCEPTION 'Phone number % is already registered for Krishnashtami.', p_phone USING ERRCODE = '23505';
    END IF;

    IF p_occupation = 'Student' THEN
        v_clean_standard := p_standard;
    ELSE
        v_clean_standard := NULL;
    END IF;

    v_seq_val := nextval('krishnashtami_reg_no_seq');
    v_reg_no := 'KRISH-2026-' || LPAD(v_seq_val::text, 4, '0');

    INSERT INTO krishnashtami_registrations (
        full_name, phone, age, gender, area_of_stay, company_college, pg_name,
        interested_to_volunteer, volunteer_slot_id, interested_to_dinner,
        wants_to_donate, donation_status, registration_no, occupation,
        transportation_required, festival_event_id, standard
    )
    VALUES (
        p_full_name, p_phone, p_age, p_gender, p_area_of_stay, p_company_college, p_pg_name,
        p_interested_to_volunteer, p_volunteer_slot_id, p_interested_to_dinner,
        p_wants_to_donate, p_donation_status, v_reg_no, p_occupation,
        p_transportation_required, v_krish_event_id, v_clean_standard
    )
    RETURNING id INTO v_registration_id;

    IF p_skill_ids IS NOT NULL AND array_length(p_skill_ids, 1) > 0 THEN
        FOREACH v_skill_id IN ARRAY p_skill_ids LOOP
            INSERT INTO krishnashtami_registration_skills (registration_id, skill_id)
            VALUES (v_registration_id, v_skill_id);
        END LOOP;
    END IF;

    IF p_prasadam_types IS NOT NULL AND array_length(p_prasadam_types, 1) > 0 THEN
        FOREACH v_prasadam_type IN ARRAY p_prasadam_types LOOP
            INSERT INTO krishnashtami_registration_prasadam (registration_id, festival_event_id, prasadam_type)
            VALUES (v_registration_id, v_krish_event_id, v_prasadam_type);
        END LOOP;
    END IF;

    INSERT INTO notifications (krishnashtami_registration_id, is_read)
    VALUES (v_registration_id, FALSE);

    RETURN v_registration_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_krishnashtami_volunteer(
    text, text, integer, text, text, text, text, boolean, uuid, boolean, boolean, text, uuid[], text, text, uuid, text[], text
) TO anon, authenticated, service_role;

COMMIT;
