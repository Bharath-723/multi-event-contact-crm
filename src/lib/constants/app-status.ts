export type RegistrationStatus = 'OPEN' | 'CLOSED' | 'MAINTENANCE';

/**
 * Central registration status configuration.
 * Single source of truth for the application.
 * Set to 'CLOSED' for Krishnashtami 2026 Registration.
 */
export const REGISTRATION_STATUS: RegistrationStatus = 'CLOSED';
