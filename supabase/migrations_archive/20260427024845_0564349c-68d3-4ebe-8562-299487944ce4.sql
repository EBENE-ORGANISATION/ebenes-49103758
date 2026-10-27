
-- Enum des fonctionnalités du header contrôlables par l'admin
do $$ begin
  create type public.header_feature as enum (
    'alertes',
    'recap_annuel',
    'archives',
    'json_io',
    'users_admin',
    'audit_log'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.user_feature_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature public.header_feature not null,
  enabled boolean not null default true,
  granted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature)
);

alter table public.user_feature_access enable row level security;

drop policy if exists "Users view own features" on public.user_feature_access;
create policy "Users view own features"
  on public.user_feature_access for select to authenticated
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "Admins insert features" on public.user_feature_access;
create policy "Admins insert features"
  on public.user_feature_access for insert to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins update features" on public.user_feature_access;
create policy "Admins update features"
  on public.user_feature_access for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Admins delete features" on public.user_feature_access;
create policy "Admins delete features"
  on public.user_feature_access for delete to authenticated
  using (public.is_admin(auth.uid()));
