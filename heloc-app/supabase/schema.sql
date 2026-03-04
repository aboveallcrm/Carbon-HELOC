-- ============================================================
-- Helper: is_super_admin() — reusable across all non-profiles policies
-- (Cannot be used on profiles table itself — circular dependency)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;


-- Create Profiles Table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  role text check (role in ('super_admin', 'admin', 'user')) default 'user',
  current_tier text check (current_tier in ('carbon', 'titanium', 'platinum', 'obsidian', 'diamond')) default 'carbon',
  subscription_status text check (subscription_status in ('active', 'trialing', 'canceled', 'past_due', 'suspended')) default 'trialing',

  -- Loan Officer Profile Fields
  display_name text,
  phone text,
  nmls_number text,
  company_name text,
  headshot_url text,
  lead_notifications_email boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null

);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies for Profiles
-- (Super admin uses hardcoded UUID to avoid circular dependency with is_super_admin())
drop policy if exists "Users can view own profile." on public.profiles;
create policy "Users can view own profile." on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile." on public.profiles;
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

drop policy if exists "super_admin_select_all" on public.profiles;
create policy "super_admin_select_all" on public.profiles for select
  using (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

drop policy if exists "super_admin_update_all" on public.profiles;
create policy "super_admin_update_all" on public.profiles for update
  using (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid)
  with check (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

drop policy if exists "super_admin_insert_all" on public.profiles;
create policy "super_admin_insert_all" on public.profiles for insert
  with check (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

drop policy if exists "super_admin_delete_all" on public.profiles;
create policy "super_admin_delete_all" on public.profiles for delete
  using (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Create User Integrations Table (Bonzo, GHL)
create table if not exists public.user_integrations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  provider text not null, -- 'bonzo', 'ghl'
  api_key text,
  webhook_url text, -- optional override
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, provider)
);

alter table public.user_integrations enable row level security;

-- Users can view own integrations EXCEPT heloc_keys (AI keys are server-side only)
drop policy if exists "Users can view own integrations." on public.user_integrations;
create policy "Users can view own integrations." on public.user_integrations for select using (
  auth.uid() = user_id AND provider != 'heloc_keys'
);

drop policy if exists "Users can insert own integrations." on public.user_integrations;
create policy "Users can insert own integrations." on public.user_integrations for insert with check (
  auth.uid() = user_id AND provider != 'heloc_keys'
);

drop policy if exists "Users can update own integrations." on public.user_integrations;
create policy "Users can update own integrations." on public.user_integrations for update using (
  auth.uid() = user_id AND provider != 'heloc_keys'
);

-- Super Admin full access to all integrations (including heloc_keys)
drop policy if exists "Super Admin full access to integrations." on public.user_integrations;
create policy "Super Admin full access to integrations." on public.user_integrations for all
  using (is_super_admin());

-- Create Quotes Table
create table if not exists public.quotes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  quote_data jsonb not null default '{}',
  status text default 'draft',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.quotes enable row level security;

drop policy if exists "Users can view own quotes." on public.quotes;
create policy "Users can view own quotes." on public.quotes for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own quotes." on public.quotes;
create policy "Users can insert own quotes." on public.quotes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own quotes." on public.quotes;
create policy "Users can update own quotes." on public.quotes for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own quotes." on public.quotes;
create policy "Users can delete own quotes." on public.quotes for delete using (auth.uid() = user_id);

drop policy if exists "Super admin full access to quotes" on public.quotes;
create policy "Super admin full access to quotes" on public.quotes for all
  using (is_super_admin());

-- Create Leads Table
create table if not exists public.leads (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  source text default 'webhook',
  crm_source text default 'webhook',
  crm_contact_id text,
  status text default 'New',
  stage text default 'new',
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.leads enable row level security;

drop policy if exists "Users can view own leads." on public.leads;
create policy "Users can view own leads." on public.leads for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own leads." on public.leads;
create policy "Users can insert own leads." on public.leads for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own leads." on public.leads;
create policy "Users can update own leads." on public.leads for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own leads." on public.leads;
create policy "Users can delete own leads." on public.leads for delete using (auth.uid() = user_id);

drop policy if exists "leads_super_admin_all" on public.leads;
create policy "leads_super_admin_all" on public.leads for all
  using (is_super_admin());

-- Create App Settings Table (Global Keys - Super Admin Only)
create table if not exists public.app_settings (
  key text primary key,
  value text,
  description text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.app_settings enable row level security;

drop policy if exists "Super Admins can manage app settings." on public.app_settings;
create policy "Super Admins can manage app settings." on public.app_settings for all
  using (is_super_admin());

-- Trigger to create profile on signup
-- Auto-assigns super_admin + diamond for barraganmortgage@gmail.com
create or replace function public.handle_new_user()
returns trigger as $$
begin
  if new.email = 'barraganmortgage@gmail.com' then
    insert into public.profiles (id, email, role, current_tier, subscription_status)
    values (new.id, new.email, 'super_admin', 'diamond', 'active');
  else
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'user');
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists to avoid duplication error (though create trigger ... if not exists isn't standard in old pg, dropping is safer)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Guard: Prevent accidental role/tier downgrade of super admin
-- ============================================================
create or replace function public.protect_super_admin()
returns trigger as $$
begin
  -- If this is the super admin account, force role + tier back
  if old.id = '795aea13-6aba-45f2-97d4-04576f684557'::uuid then
    new.role := 'super_admin';
    new.current_tier := 'diamond';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_protect_super_admin on public.profiles;
create trigger trg_protect_super_admin
  before update on public.profiles
  for each row execute procedure public.protect_super_admin();
