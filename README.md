# Rathayatra Volunteer Registration & Admin Management System

A production-ready, highly optimized, and secure Volunteer Registration and Admin Dashboard System. Engineered for maximum speed during high-concurrency public events (e.g., QR-code scans) and equipped with real-time updates for administrative coordinators.

---

## 🌟 Key Features

- **High-Speed Registration**: Fully responsive, mobile-first volunteer signup form optimized for instant load times (sub-second) upon scanning QR codes.
- **Branded Transition Experiences**: Premium, smooth, logo-branded transition loaders for donation redirections and form submissions using the Hare Krishna Movement visual design system.
- **Admin Control Panel**: Advanced, secure analytics dashboard tracking total registrations, volunteers, donors, dinner prasadam requests, and today's registrations.
- **Real-Time Synchronized Metrics**: Single Broadcast channel invalidates caches immediately upon new registration submissions, updating counts and Recharts visualizations in under 150ms.
- **Preserved Search & Navigation Filters**: Autocomplete filters with matching query text highlights in the registrations table, preserved in `sessionStorage` for seamless back-and-forth navigations.
- **Offline Shell & Draft Autosave**: Service Worker shell caching and browser draft auto-recovery on form refresh or redirect returns.
- **Enterprise Security Policy**: Strict PostgreSQL Row Level Security (RLS) policies allowing public submissions while restricting reading/modification/deletion to verified administrators only.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, Framer Motion, custom Glassmorphism tokens
- **Forms & Validation**: React Hook Form, Zod schema validation
- **Database & Realtime**: Supabase (Postgres, Realtime Broadcast channels, Security Definer RPCs)
- **State Management**: TanStack React Query v5
- **Visualizations**: Recharts


---

## Performance Architectures

1. **Sub-second Form Loading**: The public registration page is highly optimized. Heavy modules like Recharts and QR Code generators are code-split and loaded lazily.
2. **Atomic SQL RPC Transactions**: Form submissions call a PostgreSQL database function `register_volunteer` to check for phone duplicates and insert registration details along with multi-selection skills in a single atomic transaction.
3. **Instant Dashboard Synced state**: Supabase Realtime listens to updates on the `registrations` table. The dashboard triggers an automatic cache invalidation in React Query, instantly refreshing stats, volunteer slots, and charts without manual page reloads or polling.
4. **PWA Shell Caching**: An offline-ready Service Worker (`sw.js`) caches styling, layout components, and images for instant reload times.
5. **Local Draft Autocomplete**: Form progress is auto-saved on every keystroke to `localStorage`. If a user opts to donate, they are redirected to the external donation portal; upon returning, their draft registration is automatically restored. Loop prevention is implemented to prevent recurring redirects.

---

## Database Schema & Migrations

The full schema migration file is located in [supabase/migrations/20260626000000_init_schema.sql](file:///D:/rathayatra/supabase/migrations/20260626000000_init_schema.sql).

### Table Definitions

- **`admins`**: Access control table referencing `auth.users(id)`.
- **`registrations`**: Main user table containing personal information, conditional gender/area inputs, and dinner/donation status.
- **`volunteer_slots`**: Event volunteer schedules (e.g., `6:00–7:00 AM`).
- **`skills`**: Core volunteer skills (pre-populated with `Singing`, `Teaching`, `Musical Instruments`, `Video Editing`).
- **`registration_skills`**: Join table mapping registrations to multiple skills.
- **`notifications`**: Persistent unread registration logs for the admin center.
- **`audit_logs`**: Logs tracking admin actions (e.g. edits or deletes).

### Indexes for High Concurrency
- Indexes are configured on: `phone`, `created_at`, `volunteer_slot_id`, `wants_to_donate`, `donation_status`, `interested_to_dinner`, `gender`, `company_college`, and `area_of_stay`.

### Security: Row Level Security (RLS)
- RLS is **enabled** on all tables.
- **Public access** is permitted only for:
  - Inserting new registrations.
  - Selecting available skills and volunteer time slots.
- **Admin access** is restricted:
  - Only authenticated users whose `id` exists in the `admins` table can query registrations, edit records, delete entries, and fetch audit logs.

---

## Local Setup Instructions

### 1. Configure Supabase Database
1. Go to the [Supabase Dashboard](https://supabase.com/) and create a new project.
2. Open the **SQL Editor** in your Supabase project.
3. Copy the contents of `supabase/migrations/20260626000000_init_schema.sql` and run it in the editor.
4. Seed the admin credentials:
   - Go to **Authentication > Users** in Supabase and create an admin user (email and password).
   - Copy the generated User ID (UUID) for this user.
   - Go to the **SQL Editor** and run:
     ```sql
     INSERT INTO admins (id, email) VALUES ('<COPIED_UUID>', 'admin@example.com');
     ```

### 2. Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-public-key
```

### 3. Run Development Server
Install dependencies and launch the dev environment:
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the registration portal, and [http://localhost:3000/admin](http://localhost:3000/admin) to view the admin control panel.

---

## Production Deployment Guide

### Deploying Backend (Supabase)
- Table structures, functions, RLS policies, and triggers are already included in the SQL schema file. Ensure they are executed in your production Supabase database.
- Enable **Realtime** on the `registrations` and `notifications` tables in Supabase by going to **Database > Replication** and enabling replication for those tables.

### Deploying Frontend (Vercel)
1. Push the code repository to GitHub.
2. Link the repository in the **Vercel Dashboard**.
3. Add the following Environment Variables in the project setting panel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Hit **Deploy**. Vercel will bundle and statically optimize the routes automatically.

---

## 📄 License

This project is licensed under the MIT License.

