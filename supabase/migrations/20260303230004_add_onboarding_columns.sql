-- Add onboarding tracking columns to profiles table
-- Used by the setup wizard to persist progress across sessions

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='profiles' AND column_name='onboarding_completed') THEN
        ALTER TABLE public.profiles ADD COLUMN onboarding_completed boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='profiles' AND column_name='onboarding_step') THEN
        ALTER TABLE public.profiles ADD COLUMN onboarding_step integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='profiles' AND column_name='onboarding_data') THEN
        ALTER TABLE public.profiles ADD COLUMN onboarding_data jsonb DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='profiles' AND column_name='crm_preference') THEN
        ALTER TABLE public.profiles ADD COLUMN crm_preference text;
    END IF;
END $$;
