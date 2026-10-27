
-- 1. Étendre societes (sans casser l'existant)
alter table public.societes
  add column if not exists slug text,
  add column if not exists statut text not null default 'active',
  add column if not exists plan text not null default 'starter';

do $$ begin
  alter table public.societes
    add constraint societes_statut_check check (statut in ('active','suspendu','essai'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.societes
    add constraint societes_plan_check check (plan in ('starter','pro','enterprise'));
exception when duplicate_object then null; end $$;

create unique index if not exists societes_slug_unique
  on public.societes (slug) where slug is not null;

-- 2. Nouvelle table societe_config (1 ligne par société)
create table if not exists public.societe_config (
  societe_id uuid primary key references public.societes(id) on delete cascade,
  -- branding additionnel
  logo_url text,
  couleur_primaire text default '#1F3864',
  couleur_secondaire text default '#2E75B6',
  couleur_accent text default '#C55A11',
  police text default 'Calibri',
  -- légal
  adresse text,
  telephone text,
  email text,
  site_web text,
  nif text,
  rccm text,
  -- documents
  mention_facture text,
  mention_contrat text,
  -- modules actifs (super admin)
  module_stock boolean not null default true,
  module_grh boolean not null default true,
  module_fiscalite boolean not null default true,
  module_immobilisations boolean not null default false,
  -- personnalisation société
  theme_custom jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.societe_config enable row level security;

-- Lecture : super-admin OU membre de la société
drop policy if exists "View societe_config" on public.societe_config;
create policy "View societe_config" on public.societe_config
  for select to authenticated
  using (
    public.is_admin_general(auth.uid())
    or public.has_societe_access(auth.uid(), societe_id)
  );

-- Update : super-admin OU admin de la société (rôle 'admin' classique avec accès à la société)
drop policy if exists "Update societe_config" on public.societe_config;
create policy "Update societe_config" on public.societe_config
  for update to authenticated
  using (
    public.is_admin_general(auth.uid())
    or (public.is_admin(auth.uid()) and public.has_societe_access(auth.uid(), societe_id))
  )
  with check (
    public.is_admin_general(auth.uid())
    or (public.is_admin(auth.uid()) and public.has_societe_access(auth.uid(), societe_id))
  );

-- Insert / Delete : super-admin uniquement
drop policy if exists "Insert societe_config" on public.societe_config;
create policy "Insert societe_config" on public.societe_config
  for insert to authenticated
  with check (public.is_admin_general(auth.uid()));

drop policy if exists "Delete societe_config" on public.societe_config;
create policy "Delete societe_config" on public.societe_config
  for delete to authenticated
  using (public.is_admin_general(auth.uid()));

-- Trigger updated_at
drop trigger if exists trg_societe_config_updated on public.societe_config;
create trigger trg_societe_config_updated
  before update on public.societe_config
  for each row execute function public.update_updated_at_column();

-- 3. Auto-création d'une ligne societe_config à chaque nouvelle société
create or replace function public.handle_new_societe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.societe_config (societe_id)
  values (new.id)
  on conflict (societe_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_societe_config on public.societes;
create trigger trg_create_societe_config
  after insert on public.societes
  for each row execute function public.handle_new_societe();

-- Backfill : créer config pour les sociétés existantes
insert into public.societe_config (societe_id)
select id from public.societes s
where not exists (
  select 1 from public.societe_config c where c.societe_id = s.id
);
