-- CyberVault schema (run via Supabase SQL editor or CLI)
-- Requires pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- 1. User Profiles -----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'User' check (role in ('Admin','Manager','User')),
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

-- Self-access
create policy "Profiles: self access" on public.profiles
  for select, update using (id = auth.uid());
-- Admin full access
create policy "Profiles: Admin full" on public.profiles
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'));

-- 2. Credentials ------------------------------------------------------------
create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('password','ssh','api_token','certificate')),
  name text not null,
  value text not null, -- AES-256 encrypted blob
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.credentials enable row level security;
create policy "Credentials: owner" on public.credentials
  for all using (user_id = auth.uid());
-- Managers/Admins unrestricted
create policy "Credentials: elevated" on public.credentials
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Admin','Manager')));

-- 3. JIT Sessions -----------------------------------------------------------
create table if not exists public.jit_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  resource text not null,
  expires_at timestamp with time zone not null,
  active boolean default true,
  created_at timestamp with time zone default now()
);
create index if not exists idx_jit_active_expiry on public.jit_sessions(active, expires_at);

-- 4. Discovered Accounts -----------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  source text not null check (source in ('windows','linux','aws','azure')),
  username text,
  host text,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

-- 5. Privileged Sessions -----------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  target text not null,
  started_at timestamp with time zone default now(),
  ended_at timestamp with time zone,
  active boolean default true
);

-- 6. Session Logs -----------------------------------------------------------
create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  message text not null,
  timestamp timestamp with time zone default now()
);
create index if not exists idx_session_logs_session on public.session_logs(session_id);

-- 7. Access Policies --------------------------------------------------------
create table if not exists public.access_policies (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  resource text not null,
  action text not null,
  conditions jsonb,
  created_at timestamp with time zone default now()
);

-- 8. Audit Logs -------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  action text not null,
  resource text,
  metadata jsonb,
  created_at timestamp with time zone default now()
);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- 9. External Integrations --------------------------------------------------
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  token text,
  enabled boolean default true,
  created_at timestamp with time zone default now()
);

-- Enable RLS globally as needed, additional fine-grained policies can be added.

-- Done. Run `supabase db reset && supabase db push` or execute this script in the
-- Supabase SQL editor to create schema. 