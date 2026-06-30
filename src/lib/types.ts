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
