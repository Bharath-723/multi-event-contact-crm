# System Architecture — Rathayatra Attendance & Assignment System

This document outlines the technical design, application flow, state management, and communication channels of the Rathayatra festival management app.

---

## 1. Technical Stack

- **Framework**: Next.js 16.2.9 (App Router)
- **Database / Backend**: Supabase PostgreSQL (auth, schemas, triggers, realtime replication channels)
- **State Management & Data Fetching**: React Query (TanStack Query v5) for server cache; React local state for UI transitions
- **Styling**: Tailwind CSS & Vanilla CSS glassmorphic tokens
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **PWA Capabilities**: Service Worker caching, offline shell fallback, and upgrade lifecycle handlers

---

## 2. Component Design & Structural Layout

The project follows Next.js App Router folder structure:

```
src/
├── app/
│   ├── admin/                    # Admin Routes (Layout protected by admins table validation)
│   │   ├── dashboard/            # Real-time metrics dashboard, check-ins log
│   │   ├── operator/             # Operator Portal (Authentication portal & caller list)
│   │   │   ├── portal/           # Seeding assignments queue, remarks notes editor
│   │   │   └── visitor/          # Operator visitor manual search check-in
│   │   ├── operators/            # Admin view to provision/edit Operators capacity
│   │   ├── registrations/        # Admin tabular registrations view
│   │   └── visitor/              # Admin-level Visitor Check-In Center
│   ├── api/                      # Protected NextJS Route Handlers (APIs)
│   │   ├── assignments/          # Auto assignments seeding & status patches
│   │   ├── operators/            # Operator authentication and sessions hydration
│   │   └── visitor/              # Real-time stats aggregates & check-in logs
│   └── success/                  # Registration successful page (WhatsApp invite card)
├── components/                   # Shared UI Components (Bell notifications, theme toggle)
├── lib/                          # Client libraries (Supabase client, types, auth helpers)
└── scripts/                      # Service worker compilers and seed helpers
```

---

## 3. Security Boundary & Gatekeeper Flow

Authentication is split into two independent domains for security:

### Admin Authentication
- Authenticated via **Supabase GoTrue Auth**.
- **Gatekeeper Validation**: Before rendering any admin path `/admin/*` (except login `/admin`), the client layout queries the `admins` table. If the authenticated user ID is missing from `admins`, they are immediately logged out and redirected.

### Operator Authentication
- Authenticated via a custom **JWT cookie session** (`operator-session`).
- Cookie settings: `HttpOnly`, `SameSite=Strict`, `Secure` (in production).
- Operator sessions are validated server-side. Every operator API query is scoped to the operator's ID decoded from the JWT token.

---

## 4. Real-time Communication Channels

The application leverages Supabase Realtime replication channels:
- **`dashboard_realtime_refetch`**: Listens to insertions on `registrations` and `visitor_visits` tables. Triggers automatic cache invalidations on TanStack Query client to keep charts and counters in sync.
- **`visitor_visits_realtime`**: Refetches the Live Logs list and strip counters upon successful gate check-ins.
- **`operator_assignments_realtime`**: Notifies active operators instantly when contacts are assigned, removed, or reassigned.
