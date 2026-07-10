# Rathayatra Volunteer Registration & Attendance Management System (RC-1)

A production-ready, highly optimized, and secure Volunteer Registration and Admin Dashboard System. Engineered for maximum speed during high-concurrency public events and equipped with real-time updates for administrative coordinators.

---

## 🌟 Key Features

- **High-Speed Registration**: Mobile-first volunteer signup form optimized for instant load times (sub-second) upon scanning QR codes. Includes PG details and visibility constraints.
- **WhatsApp Group Card**: Branded transition and community invitation card on the successful registration page.
- **Admin Control Panel**: Advanced, secure analytics dashboard tracking registrations, volunteers, check-in logs, and dinner RSVPs in real-time.
- **Calling Assignment Engine**: Automatic and manual contact distribution to active operators with dry-run verification.
- **4-Status Calling Workflow**: Simplified operator calling pipeline (`Pending`, `Coming`, `Not Coming`, `Callback Required`).
- **Gate Check-In Center**: Scoped manual lookup, double check-in prevention, and instant entry approval.
- **Offline Shell & PWA**: Service Worker caching, offline shell fallback, and draft autosave recovery.
- **Enterprise Security Policy**: Strict server-side verification of operator boundaries (operators can only view/check-in assigned contacts) and admin permission layout guards.

---

## 📂 System Documentation Index

We have generated comprehensive documentation covering every aspect of the Release Candidate (RC-1) build inside the [`docs/`](file:///D:/rathayatra/docs/) folder:

1. **[`docs/DATABASE_SCHEMA.md`](file:///D:/rathayatra/docs/DATABASE_SCHEMA.md)**: Postgres tables, indexes, triggers, sequence-based Registration Number generators, and RLS policies.
2. **[`docs/ARCHITECTURE.md`](file:///D:/rathayatra/docs/ARCHITECTURE.md)**: System design, directory components map, operator JWT cookie session boundaries, and realtime subscription channels.
3. **[`docs/API_DOCUMENTATION.md`](file:///D:/rathayatra/docs/API_DOCUMENTATION.md)**: Backend endpoint routes (Visitor lookup, gate check-in, call status updates, realtime stats).
4. **[`docs/ADMIN_GUIDE.md`](file:///D:/rathayatra/docs/ADMIN_GUIDE.md)**: User manual for administrators (Dashboard views, operator provisioning, dry-run assignments, visitor logs, CSV export).
5. **[`docs/OPERATOR_GUIDE.md`](file:///D:/rathayatra/docs/OPERATOR_GUIDE.md)**: User manual for callers (Calling queue, direct dial links, direct WhatsApp chat logs, operator check-in lookup).
6. **[`docs/DEPLOYMENT_GUIDE.md`](file:///D:/rathayatra/docs/DEPLOYMENT_GUIDE.md)**: Supabase migrations execution, environment variables list, and Vercel cloud deployment.
7. **[`docs/SECURITY_REPORT.md`](file:///D:/rathayatra/docs/SECURITY_REPORT.md)**: Session boundary validation, SQLi mitigation, XSS, and CSRF protection.
8. **[`docs/PERFORMANCE_REPORT.md`](file:///D:/rathayatra/docs/PERFORMANCE_REPORT.md)**: Target vs measured latencies, database index efficiency, and rendering optimization.
9. **[`docs/TEST_REPORT.md`](file:///D:/rathayatra/docs/TEST_REPORT.md)**: E2E Rathayatra event simulation walkthrough, browser compatibility matrix, and responsive viewport tests (320px to 1440px).
10. **[`docs/RELEASE_NOTES.md`](file:///D:/rathayatra/docs/RELEASE_NOTES.md)**: RC-1 highlights, software dependency versions, and prerequisites.
11. **[`docs/CHANGELOG.md`](file:///D:/rathayatra/docs/CHANGELOG.md)**: Chronological project phase change logs.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, Framer Motion, custom Glassmorphism CSS tokens
- **Database & Realtime**: Supabase (Postgres, Realtime Broadcast channels, Security Definer RPCs)
- **State Management**: TanStack React Query v5
- **Visualizations**: Recharts

---

## 🚀 Local Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env.local` using `.env.example`.
3. Apply migrations in `supabase/migrations/` to your database instance (refer to `docs/DEPLOYMENT_GUIDE.md` for sequencing).
4. Run development server:
   ```bash
   npm run dev
   ```
5. Build and run production server:
   ```bash
   npm run build
   ```
   ```bash
   npm run start
   ```

---

## 📄 License

This project is licensed under the MIT License.
