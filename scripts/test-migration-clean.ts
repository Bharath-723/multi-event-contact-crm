import { PGlite } from '@electric-sql/pglite';
import * as fs from 'node:fs';

async function test() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE OR REPLACE FUNCTION public.normalize_phone(p text) RETURNS text LANGUAGE sql AS $$ SELECT regexp_replace(COALESCE(p, ''), '\\D', '', 'g'); $$;
    CREATE TABLE public.contact_operators (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, email TEXT, is_active BOOLEAN DEFAULT true);
    CREATE TABLE public.master_contacts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), phone TEXT UNIQUE, name TEXT, gender TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.master_contact_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), master_contact_id UUID REFERENCES public.master_contacts(id), source TEXT, event_record_id TEXT, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.master_contact_assignments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), master_contact_id UUID REFERENCES public.master_contacts(id), operator_id UUID REFERENCES public.contact_operators(id), is_active BOOLEAN DEFAULT true, status TEXT DEFAULT 'assigned', assigned_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.registrations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), full_name TEXT, phone TEXT, gender TEXT, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.contact_assignments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), registration_id UUID REFERENCES public.registrations(id), operator_id UUID REFERENCES public.contact_operators(id), is_active BOOLEAN DEFAULT true, status TEXT DEFAULT 'Pending', remarks TEXT, assigned_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.krishnashtami_registrations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), full_name TEXT, phone TEXT, gender TEXT, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.krishnashtami_contact_assignments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), registration_id UUID REFERENCES public.krishnashtami_registrations(id), operator_id UUID REFERENCES public.contact_operators(id), is_active BOOLEAN DEFAULT true, status TEXT DEFAULT 'Pending', assigned_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.feedback_contacts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), full_name TEXT, phone TEXT, gender TEXT, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.feedback_contact_assignments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), feedback_contact_id UUID REFERENCES public.feedback_contacts(id), operator_id UUID REFERENCES public.contact_operators(id), is_active BOOLEAN DEFAULT true, status TEXT DEFAULT 'Assigned', notes TEXT, assigned_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), action TEXT, details JSONB, created_at TIMESTAMPTZ DEFAULT now());
  `);
  const sql = fs.readFileSync('supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql', 'utf8');
  console.log('Applying migration on clean DB...');
  await db.exec(sql);
  console.log('First run successful!');
  console.log('Applying migration second time for idempotency...');
  await db.exec(sql);
  console.log('Second run successful!');
}

test().catch(e => { console.error('FAILED:', e); process.exit(1); });

