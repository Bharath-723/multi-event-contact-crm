# Security & Compliance Policy

## HKM CRM & Event Operations Platform

This document outlines the security architecture, environment variable policies, credential protection, Row Level Security (RLS) enforcement, and privacy standards of the HKM CRM platform.

---

## 1. Secrets & Credential Management Policy

### 1.1 Strict Ignored Files
The following files contain private runtime configurations and **MUST NEVER** be committed to Git repositories:

* `.env`
* `.env.local`
* `.env.production`
* `.env.vercel*`

The repository enforces these exclusions in `.gitignore`. Only `.env.example` containing non-sensitive placeholders is committed to source control.

### 1.2 Key Exposure & Access Levels

| Key Type | Variable Name | Permitted Scope | Risk Level |
| :--- | :--- | :--- | :--- |
| **Supabase Anon Key** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Browser & Server | Low (Constrained by RLS) |
| **Supabase Service Role Key** | `SUPABASE_SERVICE_ROLE_KEY` | Server-Side API Handler ONLY | **CRITICAL (Bypasses RLS)** |
| **Operator JWT Secret** | `OPERATOR_JWT_SECRET` | Server-Side Next.js Runtime | **HIGH (Authenticates Admins)** |

---

## 2. Row Level Security (RLS) Enforcement

1. **Deny Public Reads by Default:** Tables storing personal attendee information (names, phone numbers, addresses) do not grant unrestricted public `SELECT` access to anonymous client connections.
2. **Restricted Client Submissions:** Public anon users are restricted to `INSERT` operations on public registration forms (`rathayatra_registrations`, `krishnashtami_registrations`, `contacts_register`).
3. **Admin API Isolation:** Administrative reads, updates, CSV exports, and operator assignments are executed exclusively via Next.js API endpoints (`src/app/api/`) utilizing server-side validation and the Service Role client.

---

## 3. Data Privacy & GDPR/Personal Data Protection

* **Attendee Phone Normalization:** Phone numbers are standardized to `+91XXXXXXXXXX` for deduplication.
* **No Hardcoded Data:** Development database dumps and real attendee contact exports must never be checked into Git source control.
* **Separation of Environments:** Development testing should utilize synthetic or dummy attendee data. Do not connect local development runtimes to live production database credentials.

---

## 4. Emergency Credential Rotation Procedure

If a secret (such as `SUPABASE_SERVICE_ROLE_KEY` or `OPERATOR_JWT_SECRET`) is accidentally exposed:

1. **Rotate Supabase API Key:** Go to Supabase Dashboard -> Project Settings -> API -> Click **Roll API Secret**.
2. **Update Environment Variables:** Immediately update `.env.local` and your production environment variables (Vercel/hosting server).
3. **Revoke Active Operator Sessions:** Update `OPERATOR_JWT_SECRET` to invalidate all active JWT cookie sessions.

---

*HKM Security Policy — October 2026*
