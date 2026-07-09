-- Add transportation_required column to registrations as TEXT
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS transportation_required TEXT DEFAULT 'No';


CREATE OR REPLACE FUNCTION register_volunteer(
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
    p_occupation TEXT,
    p_transportation_required TEXT
)
RETURNS UUID AS $$
DECLARE
    v_registration_id UUID;
    v_skill_id UUID;
BEGIN
    -- Check for duplicate phone number
    IF EXISTS (SELECT 1 FROM registrations WHERE phone = p_phone) THEN
        RAISE EXCEPTION 'Phone number % is already registered.', p_phone USING ERRCODE = '23505';
    END IF;

    -- Insert registration
    INSERT INTO registrations (
        full_name, phone, age, gender, area_of_stay, company_college, pg_name,
        interested_to_volunteer, volunteer_slot_id, interested_to_dinner,
        wants_to_donate, donation_status, occupation, transportation_required
    )
    VALUES (
        p_full_name, p_phone, p_age, p_gender, p_area_of_stay, p_company_college, p_pg_name,
        p_interested_to_volunteer, p_volunteer_slot_id, p_interested_to_dinner,
        p_wants_to_donate, p_donation_status, p_occupation, p_transportation_required
    )
    RETURNING id INTO v_registration_id;

    -- Insert associated skills
    IF p_skill_ids IS NOT NULL AND array_length(p_skill_ids, 1) > 0 THEN
        FOREACH v_skill_id IN ARRAY p_skill_ids LOOP
            INSERT INTO registration_skills (registration_id, skill_id)
            VALUES (v_registration_id, v_skill_id);
        END LOOP;
    END IF;

    RETURN v_registration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Redefine the 14-argument register_volunteer function to call the 15-argument one (maintains backward compatibility)
CREATE OR REPLACE FUNCTION register_volunteer(
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
    p_occupation TEXT
)
RETURNS UUID AS $$
BEGIN
    RETURN register_volunteer(
        p_full_name, p_phone, p_age, p_gender, p_area_of_stay, p_company_college, p_pg_name,
        p_interested_to_volunteer, p_volunteer_slot_id, p_interested_to_dinner,
        p_wants_to_donate, p_donation_status, p_skill_ids, p_occupation, 'No'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
