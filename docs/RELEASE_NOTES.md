# Release Notes — Release Candidate (RC-1)

Rathayatra Attendance & Assignment System version **RC-1** is a stable release ready for production deployment.

---

## 1. Key Features

- **PWA Capabilities**: Service worker implementation caching assets and layouts, with offline check-in lookups.
- **Admin Dashboard**: Real-time attendance strip, recent registrations, and real-time check-in logs.
- **Volunteer Assignment Engine**: Automatic and manual contact distribution to active operators with dry-run verification.
- **4-Status Calling Workflow**: Simplified caller operators status workflow (Pending, Coming, Not Coming, Callback Required).
- **Gate Check-In Center**: Scoped manual lookups, double check-in prevention, and instant entry approvals.
- **Audit Logging**: Comprehensive logging of status updates, check-ins, and batch assignment operations.
- **WhatsApp Integration**: Invitation card on successful registration page to join the community chat.

---

## 2. Requirements & Dependencies

- **Node.js**: v18.0.0 or later
- **Database**: PostgreSQL 14+ (hosted via Supabase)
- **Primary Dependencies**:
  - `next`: `16.2.9`
  - `react`: `19.2.4`
  - `@supabase/supabase-js`: `^2.108.2`
  - `@tanstack/react-query`: `^5.101.1`
  - `framer-motion`: `^12.42.0`
  - `lucide-react`: `^1.21.0`
  - `bcryptjs` / `jsonwebtoken` (Operator custom JWT sessions)
