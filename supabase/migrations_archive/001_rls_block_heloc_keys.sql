-- Migration: Block user reads on heloc_keys rows (AI keys server-side only)
-- Run this in Supabase SQL Editor to apply to the live database

-- Drop old permissive policies
drop policy if exists "Users can view own integrations." on public.user_integrations;
drop policy if exists "Users can insert own integrations." on public.user_integrations;
drop policy if exists "Users can update own integrations." on public.user_integrations;

-- Users can view/insert/update own integrations EXCEPT heloc_keys
create policy "Users can view own integrations." on public.user_integrations for select using (
  auth.uid() = user_id AND provider != 'heloc_keys'
);

create policy "Users can insert own integrations." on public.user_integrations for insert with check (
  auth.uid() = user_id AND provider != 'heloc_keys'
);

create policy "Users can update own integrations." on public.user_integrations for update using (
  auth.uid() = user_id AND provider != 'heloc_keys'
);

-- Super Admin full access to all integrations (including heloc_keys for managing per-user AI keys)
drop policy if exists "Super Admin full access to integrations." on public.user_integrations;
create policy "Super Admin full access to integrations." on public.user_integrations for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
);
