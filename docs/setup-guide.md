# Complete Client Setup & Installation Guide

## HKM CRM & Event Operations Platform

This guide provides end-to-end instructions for installing, configuring, running, and troubleshooting the HKM CRM platform on a fresh development machine.

---

## Step 1: System Requirements & Prerequisites

Ensure the following tools are installed before beginning:

1. **Git:** ([Download Git](https://git-scm.com/))
2. **Node.js LTS (v18.x or v20.x+):** ([Download Node.js](https://nodejs.org/))
3. **VS Code or code editor of choice:** ([Download VS Code](https://code.visualstudio.com/))

### Verification Commands

Run these in PowerShell or Terminal:

```bash
node -v
npm -v
git --version
```

---

## Step 2: Download & Extract Project Codebase

### Option A: Using Git Clone (Recommended)

```bash
git clone https://github.com/Bharath-723/HKM.git
cd HKM
```

### Option B: Using ZIP Download
1. Download repository ZIP from GitHub.
2. Extract to a local folder (e.g. `C:\Projects\HKM`).
3. Open terminal in the extracted directory.

---

## Step 3: Install Project Dependencies

Run the clean dependency installer:

```bash
npm ci
```

Do not delete `package-lock.json`. If `npm ci` flags node engine warnings, you may run `npm install`.

---

## Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:

**PowerShell (Windows):**
```powershell
Copy-Item .env.example .env.local
```

**Bash (Mac / Linux):**
```bash
cp .env.example .env.local
```

2. Open `.env.local` and configure your credentials:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_secret_service_role_key
OPERATOR_JWT_SECRET=your_secret_jwt_key
```

---

## Step 5: Database Provisioning (Supabase)

1. Create a free project on [Supabase Dashboard](https://supabase.com).
2. Go to **SQL Editor**.
3. Sequentially execute SQL files from `supabase/migrations/`:
   * `20260626000000_init_schema.sql`
   * `20260630000000_add_occupation.sql`
   * `...` (All files up to `20261003000000_contacts_register_schema.sql`)

---

## Step 6: Create Initial Admin Account

In Supabase SQL Editor, execute:

```sql
INSERT INTO contact_operators (
  name, phone, email, languages, role, active, max_contacts
) VALUES (
  'Default Admin', '9999999999', 'admin@hkm.org', ARRAY['English', 'Telugu'], 'admin', true, 500
);
```

---

## Step 7: Launch Local Development Server

Run:

```bash
npm run dev
```

Access the application in your browser at:
`http://localhost:3000`

Login to the Operator/Admin portal at:
`http://localhost:3000/operator` using phone `9999999999`.

---

*HKM Client Setup Guide — October 2026*
