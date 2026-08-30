-- 20260830000000_add_service_id_to_krishnashtami.sql
-- Add service_id to krishnashtami_registrations and make services.festival_event_id optional for shared catalog

ALTER TABLE public.krishnashtami_registrations
    ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_krish_regs_service_id ON public.krishnashtami_registrations(service_id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'services' AND column_name = 'festival_event_id'
    ) THEN
        ALTER TABLE public.services ALTER COLUMN festival_event_id DROP NOT NULL;
    END IF;
END $$;
