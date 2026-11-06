-- Relecture sécurité du 06/11/2026 : codes d'appareil et app_state.
-- Les codes étaient lisibles par le client et sans limite d'essais. Désormais,
-- émission et consommation sont sérialisées par utilisateur, via service_role.
-- app_state conserve les règles par société et la lecture du signal de mise à jour.
-- Test : supabase/tests/securite_otp_app_state.sql.
-- Migration rejouable : IF EXISTS / IF NOT EXISTS et CREATE OR REPLACE.

-- B. device_otps : plus aucun accès direct client
drop policy if exists device_otp_select on public.device_otps;
drop policy if exists device_otp_insert on public.device_otps;
drop policy if exists device_otp_update on public.device_otps;
revoke all on public.device_otps from anon, authenticated;
alter table public.device_otps add column if not exists essais integer not null default 0;
create index if not exists device_otps_user_created_idx on public.device_otps (user_id, created_at desc);

create or replace function public.emettre_code_appareil(_user_id uuid, _code_hash text, _device_fp text)
returns text language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('device_otp:' || _user_id::text));
  if (select count(*) from public.device_otps
       where user_id = _user_id and created_at > now() - interval '1 hour') >= 5 then
    return 'trop';
  end if;
  delete from public.device_otps where user_id = _user_id and created_at < now() - interval '24 hours';
  update public.device_otps set used = true where user_id = _user_id and used = false;
  insert into public.device_otps (user_id, code_hash, device_fp, expires_at)
  values (_user_id, _code_hash, _device_fp, now() + interval '10 minutes');
  return 'ok';
end $$;

create or replace function public.verifier_code_appareil(_user_id uuid, _code_hash text)
returns text language plpgsql security invoker set search_path = public as $$
declare o record;
begin
  perform pg_advisory_xact_lock(hashtext('device_otp:' || _user_id::text));
  select id, code_hash, essais into o from public.device_otps
   where user_id = _user_id and used = false and expires_at > now()
   order by created_at desc limit 1;
  if not found then return 'absent'; end if;
  if o.code_hash = _code_hash then
    update public.device_otps set used = true where id = o.id;
    return 'ok';
  end if;
  update public.device_otps set essais = essais + 1, used = (essais + 1 >= 5) where id = o.id;
  return case when o.essais + 1 >= 5 then 'bloque' else 'faux' end;
end $$;

revoke all on function public.emettre_code_appareil(uuid, text, text) from public, anon, authenticated;
revoke all on function public.verifier_code_appareil(uuid, text) from public, anon, authenticated;
grant execute on function public.emettre_code_appareil(uuid, text, text) to service_role;
grant execute on function public.verifier_code_appareil(uuid, text) to service_role;

-- C. app_state
drop policy if exists "Authenticated users can view app_state" on public.app_state;
drop policy if exists "Service members can insert app_state" on public.app_state;
drop policy if exists "Service members can update app_state" on public.app_state;
drop policy if exists "Chefs and admin can delete app_state" on public.app_state;
drop policy if exists app_state_signal_maj_lecture on public.app_state;
create policy app_state_signal_maj_lecture on public.app_state
  for select to authenticated using (key = 'global:update_signal');
