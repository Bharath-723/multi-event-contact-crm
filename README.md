# HKM CRM-Based Contact Management & Event Operations Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-61DAFB?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4.0-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)

An enterprise-grade, multi-event CRM and operations management platform built for Hare Krishna Movement (HKM) festivals, registrations, volunteer coordination, and attendee follow-ups.

This document serves as the complete, beginner-friendly setup, execution, database architecture, and deployment guide for client teams and developers.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Major Features](#2-major-features)
3. [Technology Stack](#3-technology-stack)
4. [Prerequisites](#4-prerequisites)
5. [Download & Clone Project](#5-download--clone-project)
6. [Install Dependencies](#6-install-dependencies)
7. [Configure Environment Variables](#7-configure-environment-variables)
8. [Set Up Supabase Database](#8-set-up-supabase-database)
9. [Run Application Locally](#9-run-application-locally)
10. [First-Time Admin Setup](#10-first-time-admin-setup)
11. [Application Routes Directory](#11-application-routes-directory)
12. [Database Architecture & Schema](#12-database-architecture--schema)
13. [Contact Assignment Workflow](#13-contact-assignment-workflow)
14. [Testing & Production Build](#14-testing--production-build)
15. [Troubleshooting Guide](#15-troubleshooting-guide)
16. [Security & Compliance Notes](#16-security--compliance-notes)
17. [Limitations & Known Dependencies](#17-limitations--known-dependencies)

---

## 1. Project Overview

The **HKM CRM-Based Contact Management & Event Operations Platform** bridges public event registration portals with a centralized operational engine. It handles high-volume registration drives (e.g., *Rathayatra*, *Sri Krishnashtami*, and specialized *Contacts Register* drives), aggregates registrant records into unified **Master Contacts**, assigns contacts to volunteer **Operators** for follow-ups, captures feedback, manages on-site visitor check-ins, and renders real-time analytics.

### Registration Websites vs. Centralized CRM

* **Public Registration Pages:** Modern, high-conversion landing pages designed for public attendees with offline draft persistence, instant phone validation, and location autocomplete.
* **Centralized CRM System:** Back-office administrative tools providing real-time data tables, multi-festival switching, automated capacity-based assignment, call tracking, and status analytics.

---

## 2. Major Features

| Feature Module | Description | Primary Route / Location |
| :--- | :--- | :--- |
| **Rathayatra Registration** | Public multi-step registration form for Rathayatra festival attendees with transport, stay, and workshop preferences. | `/` |
| **Krishnashtami Registration** | Public registration portal tailored for Sri Krishnashtami festival. | `/krishnashtami-complete` |
| **Contacts Register Drive** | Specialized quick contact collection portal with instant draft saving and QR modal generation. | `/contacts-register` |
| **Master Contacts Dashboard** | Deduplicated, central directory aggregating attendee history across all festivals with phone normalization (`+91XXXXXXXXXX`). | `/admin/master_dashboard` |
| **Event Registrations Admin** | Searchable, filterable admin tables for festival-specific registrations with bulk manual assignment and CSV export. | `/admin/registrations` |
| **Contacts Register Admin** | Dedicated management dashboard for public contact drive registrations with status filtering and export capabilities. | `/admin/contacts-register` |
| **Operator Management** | Admin module for managing calling team members, setting language skills, active status, max call caps, and role types. | `/admin/operators` |
| **Operator Call Portal** | Dedicated portal for volunteers to review assigned contacts, make calls, log follow-up statuses, and record notes. | `/operator/portal` |
| **Auto-Assignment Engine** | Atomic SQL Stored Procedure (`rpc_auto_assign_contacts`) matching unassigned contacts to active operators by language and capacity caps. | Backend API `/api/assignments/auto` |
| **Feedback Management** | Post-event attendee feedback submission portal and administrative analysis suite. | `/feedback` & `/admin/feedback_dashboard` |
| **Visitor Check-In System** | On-site reception portal for logging walk-in visitors, assignees, and occupancy metrics. | `/visitor` & `/operator/visitor` |
| **Services Management** | Service booking and volunteer slot management interface for festival logistics. | `/admin/services` |

---

## 3. Technology Stack

* **Framework:** Next.js 16 (App Router)
* **Frontend Library:** React 19
* **Language:** TypeScript 5
* **Styling Engine:** TailwindCSS v4 with Next Themes (Dark/Light mode support)
* **Database & BaaS:** Supabase (PostgreSQL 15+, Row Level Security, Realtime Pub/Sub)
* **Form & Validation:** React Hook Form + Zod v4 validation schemas
* **Data Visualization:** Recharts for admin dashboard graphs & statistics
* **Animations & Micro-interactions:** Framer Motion & canvas-confetti
* **State & Query Management:** TanStack React Query v5
* **Authentication:** Custom JWT-based Operator Session Management & HTTP-only cookies (`jsonwebtoken`, `bcryptjs`)
* **QR Code Generation:** `qrcode` library

---

## 4. Prerequisites

Before installing the application locally, ensure your system has the following software installed:

1. **Node.js:** v18.18.0 or v20.x or higher ([Download Node.js](https://nodejs.org/))
2. **npm:** v9.x or higher (Included with Node.js)
3. **Git:** latest version ([Download Git](https://git-scm.com/))
4. **Supabase Account:** Free or Pro account on [Supabase.com](https://supabase.com)

### Verify Installation Commands

Open your terminal or command prompt and run:

```bash
node --version
# Expected output: v18.x.x or v20.x.x+

npm --version
# Expected output: 9.x.x or 10.x.x+

git --version
# Expected output: git version 2.x.x
```

---

## 5. Download & Clone Project

Open VS Code or your terminal and execute:

```bash
# Clone repository from GitHub
git clone https://github.com/Bharath-723/HKM.git

# Navigate into project directory
cd HKM
```

---

## 6. Install Dependencies

Install all node modules using `npm ci` (Clean Install based on `package-lock.json`):

```bash
npm ci
```

> **Note:** Installation typically takes 1-3 minutes depending on your internet connection speed.

---

## 7. Configure Environment Variables

The application requires specific environment variables to communicate with Supabase and execute server-side API routes safely.

### 1. Create `.env.local` File

#### Windows PowerShell:
```powershell
Copy-Item .env.example .env.local
```

#### macOS / Linux Terminal:
```bash
cp .env.example .env.local
```

### 2. Required Environment Variables Reference

Open `.env.local` in your text editor and fill in your Supabase credentials:

| Variable Name | Description & Usage | Exposure Level | Required? |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project API URL (e.g. `https://xyz.supabase.co`) | **Public** (Browser & Server) | **Yes** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Anonymous API Key for client queries | **Public** (Browser & Server) | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Service Role Key for Admin API routes & scripts | **SECRET** (Server-Side Only) | **Yes** |
| `OPERATOR_JWT_SECRET` | Secret key for signing Operator Portal session cookies | **SECRET** (Server-Side Only) | **Recommended** |
| `NEXT_PUBLIC_APP_URL` | Base website domain used for QR Code links (default: `http://localhost:3000`) | **Public** | Optional |
| `NEXT_PUBLIC_KRISHNASHTAMI_WHATSAPP_URL` | WhatsApp community group invite URL for registrant success pages | **Public** | Optional |
| `GEOAPIFY_API_KEY` | Key for address geocoding autocomplete on registration forms | **SECRET** | Optional |

> ⚠️ **CRITICAL SECURITY RULE:** `SUPABASE_SERVICE_ROLE_KEY` grants full access bypassing Row Level Security. **NEVER** commit `.env.local` to Git or share your service key publicly.

---

## 8. Set Up Supabase Database

Follow these steps to configure a fresh Supabase database for development or production:

### Step 1: Create a Supabase Project
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project**, select your organization, project name (e.g., `hkm-crm-dev`), and set a secure Database Password.
3. Choose your closest region and click **Create New Project**.

### Step 2: Retrieve API Keys
1. Go to **Project Settings** -> **API**.
2. Copy **Project URL** -> paste into `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`.
3. Copy **`anon` `public` key** -> paste into `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
4. Copy **`service_role` `secret` key** -> paste into `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

### Step 3: Run Database Migrations
Database schema migrations are located in `supabase/migrations/` and must be applied in strict chronological order.

1. Open **SQL Editor** in your Supabase Dashboard.
2. Run each `.sql` file in `supabase/migrations/` sequentially:

| Order | Migration File Name | Description |
| :---: | :--- | :--- |
| 1 | `20260626000000_init_schema.sql` | Core `rathayatra_registrations` table, RLS policies, and triggers |
| 2 | `20260630000000_add_occupation.sql` | Adds occupation tracking fields |
| 3 | `20260709000000_add_transportation.sql` | Adds transport and stay preference fields |
| 4 | `20260709100000_add_contact_operators.sql` | Adds `contact_operators` and `operator_assignments` tables |
| 5 | `20260709200000_enable_realtime_assignments.sql` | Enables Supabase Realtime publication on assignments |
| 6 | `20260709300000_allow_null_operator.sql` | Adjusts nullability for unassigned records |
| 7 | `20260710000000_auto_assignment_rpc.sql` | Initial SQL function for auto-assigning contacts |
| 8 | `20260710100000_auto_assignment_rpc_max_contacts.sql` | Capacity-capped auto assignment RPC |
| 9 | `20260710200000_phase3b_status_workflow.sql` | Call statuses, notes, and call attempt timestamps |
| 10 | `20260710300000_phase4_visitor_visits.sql` | On-site `visitor_visits` tracking schema |
| 11 | `20260718000000_service_management.sql` | Service booking and volunteer slot management |
| 12 | `20260718100000_update_rpc_exclude_not_coming.sql` | Excludes 'Not Coming' contacts from operator queues |
| 13 | `20260718200000_update_rpc_and_stats_not_coming.sql` | Updates status workflow analytics |
| 14 | `20260718300000_exclude_not_coming_from_assigned.sql` | Unassigns inactive contacts |
| 15 | `20260718400000_add_operator_role_types.sql` | Adds role types (`admin`, `caller`, `volunteer`) to operators |
| 16 | `20260807000000_feedback_contacts.sql` | Post-event feedback table schema |
| 17 | `20260808000000_feedback_assignment_reset.sql` | Feedback assignment resets |
| 18 | `20260813000000_multi_festival_schema.sql` | Multi-festival routing and schema abstractions |
| 19 | `20260813100000_add_registration_prasadam.sql` | Prasadam coupon and token tracking |
| 20 | `20260814000000_krishnashtami_dedicated_tables.sql` | `krishnashtami_registrations` & dedicated assignment schema |
| 21 | `20260814100000_enforce_active_assignment_uniqueness.sql` | Partial unique indexes preventing double operator assignments |
| 22 | `20260814110000_fix_contact_operators_fk_cascade.sql` | Cascade constraints cleanup |
| 23 | `20260815120000_atomic_capacity_assign_rpc.sql` | Race-condition safe atomic assignment RPC |
| 24 | `20260815140000_fix_status_check_constraints.sql` | Check constraints for valid operator call statuses |
| 25 | `20260820000000_add_standard_to_krishnashtami.sql` | Student standard/grade preferences |
| 26 | `20260822000000_add_next_week_and_not_answered_status.sql` | 'Call Next Week' and 'Not Answered' workflow statuses |
| 27 | `20260830000000_add_service_id_to_krishnashtami.sql` | Service ID relation for Krishnashtami |
| 28 | `20260903000000_master_contacts_schema.sql` | Unified deduplicated `master_contacts` & `master_contact_events` |
| 29 | `20261003000000_contacts_register_schema.sql` | Public drive `contacts_register` and dedicated assignment schema |

---

## 9. Run Application Locally

Start the Next.js development server:

```bash
npm run dev
```

The console will output:
```text
  ▲ Next.js 16.2.9
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 2.1s
```

Open your web browser and navigate to: **`http://localhost:3000`**

---

## 10. First-Time Admin Setup

To access the administrative dashboards (`/admin/dashboard`, `/admin/master_dashboard`, `/admin/operators`, etc.), you need an active Operator record with `admin` role.

### Step-by-Step Operator Creation

1. Go to your **Supabase Dashboard** -> **SQL Editor**.
2. Run the following query to insert your first admin operator:

```sql
INSERT INTO contact_operators (
  name,
  phone,
  email,
  languages,
  role,
  active,
  max_contacts
) VALUES (
  'System Admin',
  '9999999999',
  'admin@hkm.org',
  ARRAY['English', 'Telugu', 'Hindi'],
  'admin',
  true,
  1000
);
```

3. Navigate to **`http://localhost:3000/operator`**.
4. Enter `9999999999` to log into the Operator/Admin Session.

---

## 11. Application Routes Directory

### Public Pages
* `/` — Rathayatra Festival Public Registration Form
* `/krishnashtami-complete` — Sri Krishnashtami Festival Registration Portal
* `/contacts-register` — Contacts Register Public Drive Form
* `/feedback` — Attendee Feedback Portal
* `/visitor` — Walk-in Visitor Check-in Form
* `/success` — Registration Confirmation & QR Code Pass Page

### Operator & Calling Pages
* `/operator` — Operator Login Screen
* `/operator/portal` — Dedicated Operator Call Queue & Follow-up Interface
* `/operator/visitor` — On-site Reception & Visitor Desk

### Admin Dashboards (Protected)
* `/admin/dashboard` — General Festival Analytics Overview
* `/admin/master_dashboard` — Central Master Contacts Directory & Cross-Event History
* `/admin/registrations` — Rathayatra & Krishnashtami Registration Records & Manual Assignment
* `/admin/contacts-register` — Dedicated Public Drive Contacts Management
* `/admin/operators` — Volunteer Operator Management & Capacity Controls
* `/admin/feedback_dashboard` — Feedback Metrics & Rating Distribution
* `/admin/services` — Services & Volunteer Slot Management

---

## 12. Database Architecture & Schema

The platform employs a two-tier database strategy: **Source Registrations** and **Master Directory**.

```text
[Rathayatra Form]    [Krishnashtami Form]    [Contacts Drive]
        │                     │                     │
        ▼                     ▼                     ▼
 rathayatra_reg        krishnashtami_reg      contacts_register
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │ (Deduplication Trigger / API)
                              ▼
                     master_contacts (Unique Normalized Phone +91...)
                              │
                     master_contact_events (Event Participation History)
                              │
                     operator_assignments (Active Caller Assignment)
```

### Core Entity Relationships

* **`master_contacts`:** The single source of truth for all individuals. Unique by normalized 10-digit phone number. Stores primary contact metadata (`name`, `phone`, `whatsapp`, `email`, `area`, `city`).
* **`master_contact_events`:** Links a master contact to specific events with event-specific preferences (prasadam tickets, transport choice, accommodation, attendance status).
* **`contact_operators`:** Stores call center volunteers and administrators with max contact limits, assigned language arrays, and active toggles.
* **`operator_assignments`:** Holds active or historic links between an operator and a registration record with call status tracking (`Pending`, `Connected`, `Busy`, `Not Answered`, `Call Next Week`, `Converted`, `Not Interested`, `Not Coming`).

---

## 13. Contact Assignment Workflow

```text
               1. REGISTRATION
      Public attendee completes registration
                        │
                        ▼
            2. MASTER DEDUPLICATION
     Phone normalized & linked to Master Directory
                        │
                        ▼
            3. AUTO / MANUAL ASSIGNMENT
  Admin triggers assignment or RPC auto-assigns based on:
     • Matching Language Skills
     • Operator Active Status = TRUE
     • Current Load < max_contacts Limit
                        │
                        ▼
             4. OPERATOR CALL QUEUE
    Record appears instantly in Operator Portal
                        │
                        ▼
              5. CALL & FEEDBACK LOG
    Operator logs call status, notes & next action
                        │
                        ▼
              6. CENTRAL REPORTING
    Dashboard reflects updated metrics & conversion rates
```

---

## 14. Testing & Production Build

### 1. Run TypeScript Type Checker
Verify that all source code compiles cleanly without type errors:

```bash
npx tsc --noEmit
```

### 2. Execute Production Build
Validate that Next.js static and server rendering builds successfully:

```bash
npm run build
```

---

## 15. Troubleshooting Guide

### Issue 1: `TypeError: fetch failed` or Supabase Connection Error
* **Cause:** Incorrect or missing `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
* **Fix:** Verify that `.env.local` exists in the root directory and contains active keys from your Supabase dashboard. Restart `npm run dev` after updating `.env.local`.

### Issue 2: `permission denied for table ...` (RLS Error)
* **Cause:** Supabase Row Level Security policy is blocking anon queries or table migration missed an RLS grant policy.
* **Fix:** Ensure all migrations in `supabase/migrations/` were executed in order. Admin API routes require `SUPABASE_SERVICE_ROLE_KEY`.

### Issue 3: Port 3000 is Already in Use
* **Cause:** Another instance of Next.js or a web application is running on port 3000.
* **Fix:** Kill the existing node process or run dev on another port:
  ```bash
  npx kill-port 3000
  # Or start on port 3001:
  npx next dev -p 3001
  ```

### Issue 4: QR Codes Render Incorrect Domain
* **Cause:** `NEXT_PUBLIC_APP_URL` is omitted or set to localhost in production environment.
* **Fix:** Set `NEXT_PUBLIC_APP_URL=https://your-production-domain.com` in your production deployment environment settings.

---

## 16. Security & Compliance Notes

1. **Environment Protection:** `.env.local` and private credentials are excluded via `.gitignore`. Never force stage or commit credentials.
2. **Service Role Key Security:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses database RLS. Use it strictly inside server-side Next.js API routes (`src/app/api/`) or administrative CLI scripts.
3. **Data Privacy:** Exported contact CSVs and database dumps contain personal attendee information. Handle attendee data responsibly according to privacy regulations.
4. **Least Privilege Database Roles:** Ensure anon public users are restricted to inserting registrations and viewing public options via RLS policies.

---

## 17. Limitations & Known Dependencies

* **SMS / WhatsApp Gateway:** Automatic SMS notifications require integration with an external gateway provider (e.g., Twilio or WhatsApp Business API). Currently, WhatsApp invite buttons use direct `https://chat.whatsapp.com/` links.
* **Address Autocomplete:** Geocoding suggestions depend on `GEOAPIFY_API_KEY`. If omitted, manual address input remains fully functional.
* **Offline Draft Storage:** Registration form drafts are persisted in the user's browser `localStorage`. Clearing browser data will erase unsaved form drafts prior to submission.

---

*HKM CRM & Event Operations Platform Documentation — Prepared for Client Setup & Deployment.*
