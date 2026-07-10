# Changelog — Rathayatra System

All notable changes to the project are documented chronologically in this file.

---

## [RC-1] — 2026-07-10
### Added
- Created `docs/` folder containing deployment, architecture, security, performance, test, database, and release documentation.
- Integrated official Community WhatsApp group invitation card on successful registration screen.
- Configured inline query changes on Search components to prevent unnecessary React renders.

### Fixed
- Fixed ESLint unused imports and variables across dashboard, search, and logs modules.
- Solved TypeScript join relation type casting errors by using safe explicit typings.
- Removed temporary migration scripts from `src/` to ensure build compliance.

---

## [Phase 4] — 2026-07-10
### Added
- Created `visitor_visits` database table for check-in logging.
- Set up automatic Registration Numbers (`REG-YYYY-000001`) via PostgreSQL sequences.
- Built manual check-in search API lookup prioritizing ID -> Phone -> Name.
- Integrated Check-In logs widget on Admin Dashboard.

---

## [Phase 3B] — 2026-07-10
### Added
- Standardized the 4-status operator workflow: `Pending`, `Coming`, `Not Coming`, `Callback Required`.
- Implemented operators performance metrics (assigned contacts, callback pending, coming confirmations).

---

## [Phase 3A] — 2026-07-10
### Added
- Built Contact Operators provisioning dashboard.
- Built Auto Assignment Engine with Dry-Run analysis checks.
- Enabled live-progress batch assignment overlays on the admin console.

---

## [Phase 2] — 2026-06-30
### Added
- Expanded registration demographics schema (Occupation details, PG details, Transportation needs).
- Implemented registration form visibility updates based on gender constraints.
