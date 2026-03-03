-- RUN THIS IN SUPABASE SQL EDITOR

-- 1. Create Profiles Table (Public info for users)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  role text default 'user', -- 'admin', 'user'
  subscription_tier text default 'free', -- 'free', 'pro', 'enterprise'
  integrations jsonb, -- Stores API keys
  usage_count int default 0,
  created_at timestamptz default now()
);

-- 2. Create Quotes Table
create table public.quotes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  client_name text,
  quote_data jsonb,
  created_at timestamptz default now()
);

-- 3. Enable RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.quotes enable row level security;

-- 4. RLS Policies

-- Profiles: Users can see their own profile. Admins can see all.
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Admins can view all profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Admins can update potentially all" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Quotes: Users can CRUD their own quotes.
create policy "Users can CRUD own quotes" on public.quotes
  for all using (auth.uid() = user_id);

-- 5. Trigger to create Profile on Signup automatically (Optional security)
-- Since we do it in client currently, this is a backup.
-- Need to enable an insert policy for profiles if doing it from client.
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);
