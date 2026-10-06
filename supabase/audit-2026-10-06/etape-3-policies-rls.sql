-- ÉTAPE 3/4 — Policies RLS : auth.uid() calculé une fois par requête
-- La logique d'accès ne change pas.
begin;

-- 6. RLS : auth.uid() évalué une fois par requête au lieu d'une fois par ligne (149 policies).
do $$
declare r record; q text; c text;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := regexp_replace(r.qual,       '(?<!SELECT )auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    c := regexp_replace(r.with_check, '(?<!SELECT )auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    if q is distinct from r.qual then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, q);
    end if;
    if c is distinct from r.with_check then
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, c);
    end if;
  end loop;
end $$;

commit;

-- Vérification : doit afficher 0 (plus aucune policy avec auth.uid() « nu »)
select count(*) as policies_restantes
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)';
