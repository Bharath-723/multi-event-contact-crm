export const RATHAYATRA_EVENT_ID = '4ce7287c-4aea-42f8-8d7d-03b698438e4c';
export const KRISHNASHTAMI_EVENT_ID = '7852cff8-e784-4e91-b990-a9838ea59ff1';

export type ContactSource = 'rathayatra' | 'krishnashtami' | 'feedback_contacts';

export function normalizeSource(source: string | null | undefined): ContactSource {
  if (!source) return 'rathayatra';
  const s = source.toLowerCase().trim();
  if (s === 'krishnashtami') return 'krishnashtami';
  if (s === 'feedback' || s === 'feedback_contacts') return 'feedback_contacts';
  return 'rathayatra';
}

export interface FestivalSourceConfig {
  isKrishnashtami: boolean;
  regTable: 'krishnashtami_registrations' | 'registrations';
  skillsJoinTable: 'krishnashtami_registration_skills' | 'registration_skills';
  prasadamTable: 'krishnashtami_registration_prasadam' | 'registration_prasadam';
  assignmentsTable: 'krishnashtami_contact_assignments' | 'contact_assignments';
  visitsTable: 'krishnashtami_visitor_visits' | 'visitor_visits';
  notificationRel: 'krishnashtami_registrations!krishnashtami_registration_id' | 'registrations!registration_id';
  notificationKey: 'krishnashtami_registration_id' | 'registration_id';
}

export function getRegistrationSource(selectedEventId: string | null): FestivalSourceConfig {
  const isKrishnashtami = selectedEventId === KRISHNASHTAMI_EVENT_ID;
  return {
    isKrishnashtami,
    regTable: isKrishnashtami ? 'krishnashtami_registrations' : 'registrations',
    skillsJoinTable: isKrishnashtami ? 'krishnashtami_registration_skills' : 'registration_skills',
    prasadamTable: isKrishnashtami ? 'krishnashtami_registration_prasadam' : 'registration_prasadam',
    assignmentsTable: isKrishnashtami ? 'krishnashtami_contact_assignments' : 'contact_assignments',
    visitsTable: isKrishnashtami ? 'krishnashtami_visitor_visits' : 'visitor_visits',
    notificationRel: isKrishnashtami
      ? 'krishnashtami_registrations!krishnashtami_registration_id'
      : 'registrations!registration_id',
    notificationKey: isKrishnashtami ? 'krishnashtami_registration_id' : 'registration_id',
  };
}
