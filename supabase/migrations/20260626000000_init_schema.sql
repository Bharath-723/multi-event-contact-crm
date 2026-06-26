-- 20260626000000_init_schema.sql
-- Database schema for Volunteer Registration & Admin Management System

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Volunteer Slots Table
CREATE TABLE IF NOT EXISTS volunteer_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_time TEXT UNIQUE NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Skills Table
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Admins Table
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY, -- References auth.users(id) in Supabase Auth
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Registrations Table
CREATE TABLE IF NOT EXISTS registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    area_of_stay TEXT, -- Nullable, conditional on gender = 'Male'
    company_college TEXT NOT NULL,
    pg_name TEXT, -- Nullable, optional
    interested_to_volunteer BOOLEAN NOT NULL,
    volunteer_slot_id UUID REFERENCES volunteer_slots(id) ON DELETE SET NULL,
    interested_to_dinner BOOLEAN NOT NULL,
    wants_to_donate BOOLEAN NOT NULL,
    donation_status TEXT NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_phone CHECK (length(phone) = 10 AND phone ~ '^[0-9]+$'),
    CONSTRAINT chk_age CHECK (age >= 10 AND age <= 100),
    CONSTRAINT chk_gender CHECK (gender IN ('Male', 'Female')),
    CONSTRAINT chk_donation_status CHECK (donation_status IN ('Pending', 'User Opted to Donate', 'Completed', 'Failed'))
);

-- 5. Create Registration Skills (Join Table)
CREATE TABLE IF NOT EXISTS registration_skills (
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (registration_id, skill_id)
);

-- 6. Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID, -- Nullable if deleted or system event
    action TEXT NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --- INDEXES FOR OPTIMIZED PERFORMANCE ---
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON registrations(phone);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_volunteer_slot ON registrations(volunteer_slot_id);
CREATE INDEX IF NOT EXISTS idx_registrations_donation ON registrations(wants_to_donate, donation_status);
CREATE INDEX IF NOT EXISTS idx_registrations_prasadam ON registrations(interested_to_dinner);
CREATE INDEX IF NOT EXISTS idx_registrations_gender ON registrations(gender);
CREATE INDEX IF NOT EXISTS idx_registrations_company ON registrations(company_college);
CREATE INDEX IF NOT EXISTS idx_registrations_area ON registrations(area_of_stay);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read_created_at ON notifications(is_read, created_at DESC);

-- --- TRIGGERS ---

-- Trigger: Create notification on new registration
CREATE OR REPLACE FUNCTION create_registration_notification()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications (registration_id, is_read)
    VALUES (NEW.id, FALSE);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_after_registration_insert
AFTER INSERT ON registrations
FOR EACH ROW
EXECUTE FUNCTION create_registration_notification();

-- Trigger: Log registration updates & deletions to audit_logs
CREATE OR REPLACE FUNCTION log_registration_audit()
RETURNS TRIGGER AS $$
DECLARE
    current_admin_id UUID;
BEGIN
    -- Safely get current auth user from Supabase context
    BEGIN
        current_admin_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        current_admin_id := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (admin_id, action, details)
        VALUES (current_admin_id, 'DELETE_REGISTRATION', jsonb_build_object(
            'id', OLD.id,
            'full_name', OLD.full_name,
            'phone', OLD.phone,
            'deleted_at', NOW()
        ));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (admin_id, action, details)
        VALUES (current_admin_id, 'EDIT_REGISTRATION', jsonb_build_object(
            'id', NEW.id,
            'old_data', row_to_json(OLD),
            'new_data', row_to_json(NEW),
            'updated_at', NOW()
        ));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_registration_audit
AFTER UPDATE OR DELETE ON registrations
FOR EACH ROW
EXECUTE FUNCTION log_registration_audit();


-- --- ROW LEVEL SECURITY (RLS) POLICIES ---

-- Enable RLS on all tables
ALTER TABLE volunteer_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Volunteer Slots Policies
CREATE POLICY public_read_slots ON volunteer_slots
    FOR SELECT TO public
    USING (TRUE);

CREATE POLICY admin_write_slots ON volunteer_slots
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- 2. Skills Policies
CREATE POLICY public_read_skills ON skills
    FOR SELECT TO public
    USING (TRUE);

CREATE POLICY admin_write_skills ON skills
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- 3. Admins Policies
CREATE POLICY admin_read_self ON admins
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- 4. Registrations Policies
CREATE POLICY public_insert_registrations ON registrations
    FOR INSERT TO public
    WITH CHECK (TRUE);

CREATE POLICY admin_all_registrations ON registrations
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- 5. Registration Skills Policies
CREATE POLICY public_insert_reg_skills ON registration_skills
    FOR INSERT TO public
    WITH CHECK (TRUE);

CREATE POLICY admin_all_reg_skills ON registration_skills
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- 6. Notifications Policies
CREATE POLICY admin_all_notifications ON notifications
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- 7. Audit Logs Policies
CREATE POLICY admin_read_audit_logs ON audit_logs
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));


-- --- FUNCTIONS / RPC ---

-- Mark all notifications as read for admins
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS VOID AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()) THEN
        UPDATE notifications
        SET is_read = TRUE
        WHERE is_read = FALSE;
    ELSE
        RAISE EXCEPTION 'Unauthorized: User is not an admin.';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Atomic function to insert volunteer registration and skills
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
    p_skill_ids UUID[]
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
        wants_to_donate, donation_status
    )
    VALUES (
        p_full_name, p_phone, p_age, p_gender, p_area_of_stay, p_company_college, p_pg_name,
        p_interested_to_volunteer, p_volunteer_slot_id, p_interested_to_dinner,
        p_wants_to_donate, p_donation_status
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


-- --- PRE-POPULATE DATA ---

-- Populate Volunteer Slots
INSERT INTO volunteer_slots (slot_time, display_order) VALUES
('6:00–7:00 AM', 1),
('7:00–8:00 AM', 2),
('5:00–6:00 PM', 3),
('6:00–7:00 PM', 4),
('7:00–8:00 PM', 5),
('8:00–9:00 PM', 6),
('9:00–10:00 PM', 7)
ON CONFLICT (slot_time) DO NOTHING;

-- Populate Skills
INSERT INTO skills (name) VALUES
('Singing'),
('Teaching'),
('Musical Instruments'),
('Video Editing')
ON CONFLICT (name) DO NOTHING;
