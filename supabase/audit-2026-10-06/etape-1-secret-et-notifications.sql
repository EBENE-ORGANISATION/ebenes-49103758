-- ÉTAPE 1/4 — Secret interne + triggers de notification
-- Coller dans Supabase > SQL Editor, puis Run.
begin;

-- 1. Rotation du secret interne (il a pu être lu tant que la fonction était publique).
--    Edge Functions et triggers le relisent dans le Vault à chaque appel : pas d'autre changement requis.
select vault.update_secret(
  (select id from vault.secrets where name = 'internal_webhook_secret'),
  encode(extensions.gen_random_bytes(32), 'hex')
);

-- 2. Les triggers de notification appelaient encore l'ancien projet Lovable
--    (nmeyylvltlvvcvbhvxpz) : les notifications de validation partaient vers la mauvaise base.
do $$
declare f text; def text;
begin
  foreach f in array array['public.notify_validation_change()', 'public.notify_validation_insert()'] loop
    def := pg_get_functiondef(f::regprocedure);
    def := replace(def, 'nmeyylvltlvvcvbhvxpz', 'yblucgmxofyelziwlvxu');
    def := replace(def, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZXl5bHZsdGx2dmN2Ymh2eHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDE5MjcsImV4cCI6MjA5Mjc3NzkyN30.WHA2ss_eKgLiumvinjfd7NaL-FggH5TbVgpqUvDKh5Q', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlibHVjZ214b2Z5ZWx6aXdsdnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODgxNzUsImV4cCI6MjA5Mjg2NDE3NX0.BI4CPBi1_lWYx-n9eCg_OErZhb94DGbq8VEhEn9hNZg');
    execute def;
  end loop;
end $$;

commit;

-- Vérification : les deux lignes doivent afficher nouvelle_url = true, ancienne_url = false
select p.proname,
       position('yblucgmxofyelziwlvxu' in pg_get_functiondef(p.oid)) > 0 as nouvelle_url,
       position('nmeyylvltlvvcvbhvxpz' in pg_get_functiondef(p.oid)) > 0 as ancienne_url
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'notify_validation%';
