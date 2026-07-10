# Deployment Guide — Rathayatra Management System

This document provides instructions for provisioning database structures, configuring environments, compiling builds, and deploying the app to Vercel.

---

## 1. Supabase Database Provisioning

1. Create a new Supabase Project.
2. Navigate to the SQL Editor in the Supabase Dashboard.
3. Apply the schema migration files located in `/supabase/migrations` chronologically:
   - `20260626000000_init_schema.sql` (initial structures)
   - `20260630000000_add_occupation.sql` (occupation field details)
   - `20260709000000_add_transportation.sql` (transportation details)
   - `20260709100000_add_contact_operators.sql` (operators database structure)
   - `20260709200000_enable_realtime_assignments.sql` (realtime configurations)
   - `20260709300000_allow_null_operator.sql` (assignment adjustments)
   - `20260710000000_auto_assignment_rpc.sql` (assignment RPC)
   - `20260710100000_auto_assignment_rpc_max_contacts.sql` (capacity parameters)
   - `20260710200000_phase3b_status_workflow.sql` (calling status upgrades)
   - `20260710300000_phase4_visitor_visits.sql` (check-in journal schema)
4. Enable Supabase Realtime replication on `contact_assignments`, `registrations`, and `visitor_visits` tables.
5. Seed the initial admin account:
   - Create a user in Supabase Authentication.
   - Insert their auth UUID and email into the `admins` table.

---

## 2. Environment Variables (`.env.local`)

Configure the following variables in Vercel or your local environment file:

```env
# Client-side Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Server-side service role credential (bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Custom secret key for Operator JWT token sign/verify
OPERATOR_JWT_SECRET=your-random-jwt-secret-string
```

---

## 3. PWA Compilation & Service Worker

When running the Next.js production build compiler:
```bash
npm run build
```
This script triggers `node scripts/build-sw.js` prior to compiling the Next pages. It automatically computes file checksum hashes, invalidates service worker cache versions (`sw.js`), and registers offline fallbacks.

---

## 4. Vercel Hosting Deployment

1. Install Vercel CLI or connect your Github repository.
2. Link your workspace and select Next.js project type.
3. Configure the environment variables in the project settings.
4. Trigger the deployment:
   ```bash
   vercel --prod
   ```
