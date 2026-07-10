export interface VolunteerSlot {
  id: string;
  slot_time: string;
  display_order: number;
}

export interface Skill {
  id: string;
  name: string;
}

export interface Registration {
  id: string;
  full_name: string;
  phone: string;
  age: number;
  gender: 'Male' | 'Female';
  occupation?: string | null;
  area_of_stay?: string | null;
  company_college: string;
  pg_name?: string | null;
  interested_to_volunteer: boolean;
  volunteer_slot_id?: string | null;
  volunteer_slots?: VolunteerSlot | null;
  interested_to_dinner: boolean;
  wants_to_donate: boolean;
  donation_status: 'Pending' | 'User Opted to Donate' | 'Completed' | 'Failed';
  transportation_required?: string | null;
  created_at: string;
  skills?: Skill[];
}

export interface RegistrationSkill {
  registration_id: string;
  skill_id: string;
}

export interface Notification {
  id: string;
  registration_id: string;
  is_read: boolean;
  created_at: string;
  registrations?: {
    full_name: string;
    phone: string;
    created_at: string;
  } | null;
}

export interface AuditLog {
  id: string;
  admin_id?: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

// Chart/Analytics Interfaces
export interface DailyRegistrationStat {
  date: string;
  count: number;
}

export interface VolunteerSlotStat {
  slot: string;
  count: number;
}

export interface DonationStat {
  status: string;
  count: number;
}

export interface SkillStat {
  skill: string;
  count: number;
}

export interface GenderRatioStat {
  gender: string;
  count: number;
}

export interface AreaStat {
  area: string;
  count: number;
}

export interface CompanyStat {
  company: string;
  count: number;
}

// ============================================================
// Contact Operator Module Types (Phase 1 — Isolated)
// ============================================================

export type AssignmentStatus =
  | 'Pending'
  | 'Coming'
  | 'Not Coming'
  | 'Callback Required';

/** @deprecated Legacy statuses — kept only for migration reference. Do not use in new code. */
export type LegacyAssignmentStatus =
  | 'Called'
  | 'Confirmed'
  | 'No Answer'
  | 'Wrong Number'
  | 'Completed'
  | 'Visited';


export interface ContactOperator {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
  // Stats — joined in API response
  total_assigned?: number;
  total_pending?: number;
  total_completed?: number;  // legacy — maps to Coming
  total_coming?: number;
  total_not_coming?: number;
  total_called?: number;
  total_confirmed?: number;
  call_success_pct?: number;
}

export interface ContactAssignment {
  id: string;
  registration_id: string;
  operator_id: string;
  assigned_by?: string | null;
  assigned_at: string;
  called_at?: string | null;
  status: AssignmentStatus;
  remarks?: string | null;
  is_active: boolean;
  // Future Visitor QR Module fields (nullable now)
  visited?: boolean | null;
  visited_at?: string | null;
  visited_by?: string | null;
  visit_method?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentWithRegistration extends ContactAssignment {
  operator?: Pick<ContactOperator, 'id' | 'name' | 'email' | 'phone'> | null;
  registration?: {
    id: string;
    full_name: string;
    phone: string;
    age?: number;
    gender?: string;
    area_of_stay?: string | null;
    occupation?: string | null;
    company_college?: string;
    interested_to_volunteer?: boolean;
    interested_to_dinner?: boolean;
    transportation_required?: string | null;
    created_at: string;
  } | null;
}

export interface OperatorSession {
  operatorId: string;
  name: string;
  email: string;
  iat?: number;
  exp?: number;
}
