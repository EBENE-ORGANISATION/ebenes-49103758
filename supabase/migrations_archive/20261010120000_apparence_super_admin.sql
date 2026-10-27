-- Apparence d'une société (couleurs, police, réglages d'affichage) : réservée au super-administrateur.
-- La politique RLS « Update societe_config » laisse l'admin de la société modifier sa fiche ;
-- ce déclencheur bloque uniquement les colonnes d'apparence pour tout autre que le super-admin.
-- Les appels sans utilisateur (service_role, migrations) ne sont pas concernés.

create or replace function public.verrou_apparence_societe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin_general(auth.uid()) then
    return new;
  end if;

  if new.couleur_primaire is distinct from old.couleur_primaire
     or new.couleur_secondaire is distinct from old.couleur_secondaire
     or new.couleur_accent is distinct from old.couleur_accent
     or new.police is distinct from old.police
     or new.theme_custom is distinct from old.theme_custom then
    raise exception 'Apparence réservée au super-administrateur'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.verrou_apparence_societe() from public, anon, authenticated;

drop trigger if exists trg_verrou_apparence_societe on public.societe_config;
create trigger trg_verrou_apparence_societe
  before update on public.societe_config
  for each row execute function public.verrou_apparence_societe();
