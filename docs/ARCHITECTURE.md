# System Architecture Documentation

## HKM CRM & Event Operations Platform

This document describes the high-level system architecture, component distribution, data pipelines, state management, and backend interactions of the HKM CRM platform.

---

## 1. High-Level System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT TIER                                       │
│                                                                                 │
│   ┌─────────────────────┐  ┌──────────────────────────┐  ┌────────────────────┐ │
│   │ Public Attendees    │  │ Volunteer Operators      │  │ System Admins      │ │
│   │ • Public Forms      │  │ • Operator Portal        │  │ • Master Dashboard │ │
│   │ • Success / QR      │  │ • Call Queue & Log       │  │ • Assignment Mgmt  │ │
│   │ • Feedback          │  │ • Visitor Reception      │  │ • Services & Stats │ │
│   └──────────┬──────────┘  └─────────────┬────────────┘  └─────────┬──────────┘ │
└──────────────┼───────────────────────────┼─────────────────────────┼────────────┘
               │                           │                         │
               ▼                           ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             NEXT.JS 16 APPLICATION TIER                         │
│                                                                                 │
│  ┌────────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐ │
│  │ App Router Pages       │  │ API Routes & Proxy   │  │ Middleware / Auth   │ │
│  │ (React Server/Client)  │  │ (Server-Side Logic)  │  │ (JWT Session Cookies)│ │
│  └───────────┬────────────┘  └───────────┬──────────┘  └───────────┬─────────┘ │
└──────────────┼───────────────────────────┼─────────────────────────┼────────────┘
               │                           │                         │
               ▼                           ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               DATABASE & BAAS TIER                              │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                              SUPABASE                                     │  │
│  │                                                                           │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐  │  │
│  │  │ Source Tables       │  │ Master Directory    │  │ SQL Functions    │  │  │
│  │  │ • rathayatra_reg    │  │ • master_contacts   │  │ • auto_assign_rpc│  │  │
│  │  │ • krishnashtami_reg │  │ • master_events     │  │ • capacity_checks│  │  │
│  │  │ • contacts_register │  │ • assignments       │  │ • deduplication  │  │  │
│  │  └─────────────────────┘  └─────────────────────┘  └──────────────────┘  │  │
│  │                                                                           │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Row Level Security (RLS) & Realtime Engine                          │  │  │
│  │  └─────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Layered Component Overview

### 2.1 Presentation & UI Layer
* **Next.js App Router (`src/app`):** Declarative route-based layout rendering.
* **Component Library (`src/components`):** Reusable UI elements including forms, charts, tables, modals, and navigation components.
* **Styling:** Utility-first CSS via TailwindCSS v4 and CSS variables for theme switching (Dark/Light mode via `next-themes`).

### 2.2 Client-Side State & Persistence
* **React Hook Form & Zod:** Managing client-side form state, real-time input validation, and error messaging.
* **Local Storage Persistence:** Draft form caching in browser `localStorage` ensuring attendees do not lose inputs on accidental tab closure.
* **TanStack React Query:** Asynchronous state caching, pagination, optimistic UI updates, and data fetching for administrative dashboards.

### 2.3 Backend API & Server Operations
* **Next.js Server API Routes (`src/app/api/`):** Serverless handlers managing contact updates, bulk assignments, authentication verification, and geocoding proxies.
* **Operator Session Management (`src/lib/operator-auth.ts`):** JWT token issue and HTTP-only cookie setting for volunteer operator security.
* **Supabase Admin Client (`src/lib/supabase-admin.ts`):** Server-side client initialized with `SUPABASE_SERVICE_ROLE_KEY` for administrative operations bypassing RLS.

---

## 3. Key Operational Workflows

### 3.1 Contact Ingestion & Normalization
1. Attendee submits registration on `/`, `/krishnashtami-complete`, or `/contacts-register`.
2. Form validates phone format (10-digit clean digits).
3. Payload is inserted into source-specific table (e.g. `rathayatra_registrations`).
4. Database triggers or server-side resolvers execute `upsert_master_contact` to ensure the phone number is added/updated in `master_contacts` with standard `+91XXXXXXXXXX` formatting.

### 3.2 Auto-Assignment Engine
1. Admin initiates assignment preview or execution from `/admin/registrations`.
2. API calls Supabase RPC function `rpc_auto_assign_contacts`.
3. RPC executes atomic matching algorithm:
   - Queries unassigned registrations.
   - Filters active operators (`active = true`).
   - Matches language preferences between contact and operator.
   - Checks operator capacity (`current_assigned_count < max_contacts`).
   - Atomically inserts assignment records into `operator_assignments`.

### 3.3 Operator Call Queue & Logging
1. Operator logs into `/operator` with registered phone.
2. Operator accesses `/operator/portal`.
3. System fetches assignments for the operator ID.
4. Operator dials contact, selects status (e.g. `Connected`, `Converted`, `Call Next Week`), enters call notes, and submits.
5. Record updates immediately, and stats reflect across admin analytics dashboards.

---

*HKM Architecture Documentation — Last Updated October 2026*
