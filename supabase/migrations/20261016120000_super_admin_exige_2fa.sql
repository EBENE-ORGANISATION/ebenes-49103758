-- Le super-administrateur ne contourne les règles multi-sociétés qu'après son code 2FA.
-- Avant, le 2FA n'était exigé que par l'écran : un mot de passe volé suffisait côté API.
-- Quand la fonction vérifie l'appelant lui-même (toutes les politiques passent auth.uid()),
-- la session doit être en aal2. Les appels du service (auth.uid() nul) sont inchangés.
create or replace function public.is_admin_general(_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $function$
begin
  return exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text = 'admin_general'
  )
  and (
    _user_id is distinct from auth.uid()
    or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
end;
$function$;
