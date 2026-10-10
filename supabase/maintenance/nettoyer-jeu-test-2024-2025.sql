-- Suppression du jeu de données 2024-2025 de la société « EBENE SERVICES - TEST »
-- (chargé le 10/10/2026 entre 22:35 et 22:48 UTC : factures JEU-*, transactions,
-- bulletins, immobilisations « Jeu de test 2024-2025 », emprunt « Banque Test »,
-- écritures AN-2025 / JEU-* et celles générées par ces pièces).
--
-- Les factures payées ou validées ne peuvent pas être supprimées depuis
-- l'application (déclencheur trg_factures_suppression) et les exercices clos
-- sont protégés (trg_exercice_cloture) : le script les désactive le temps de la
-- transaction, pour cette société seulement.
--
-- À exécuter dans l'éditeur SQL de Supabase. Rien d'autre n'est touché : le
-- journal d'audit est conservé, les données saisies dans l'application avant
-- ou après le chargement restent en place.

begin;

do $$
begin
  if not exists (select 1 from societes where id = '3458ac49-0fd5-4872-8162-f233ff20501e' and nom ilike '%TEST%') then
    raise exception 'Société TEST introuvable : rien n''est supprimé';
  end if;
end $$;

create temporary table jeu_bornes on commit drop as
select '3458ac49-0fd5-4872-8162-f233ff20501e'::uuid as societe_id,
       timestamptz '2026-10-10 22:35:00+00' as debut,
       timestamptz '2026-10-10 22:48:00+00' as fin;

alter table factures disable trigger trg_factures_suppression;
alter table factures disable trigger trg_exercice_cloture;
alter table transactions disable trigger trg_exercice_cloture;
alter table ecritures_comptables disable trigger trg_exercice_cloture;

delete from ecritures_comptables e using jeu_bornes b
 where e.societe_id = b.societe_id and e.created_at between b.debut and b.fin;
delete from transactions t using jeu_bornes b
 where t.societe_id = b.societe_id and t.created_at between b.debut and b.fin;
delete from bulletins_paie p using jeu_bornes b
 where p.societe_id = b.societe_id and p.created_at between b.debut and b.fin;
delete from factures f using jeu_bornes b
 where f.societe_id = b.societe_id and f.created_at between b.debut and b.fin and f.numero like 'JEU-%';
delete from immobilisations i using jeu_bornes b
 where i.societe_id = b.societe_id and i.created_at between b.debut and b.fin;
delete from emprunts m using jeu_bornes b
 where m.societe_id = b.societe_id and m.created_at between b.debut and b.fin;

alter table factures enable trigger trg_factures_suppression;
alter table factures enable trigger trg_exercice_cloture;
alter table transactions enable trigger trg_exercice_cloture;
alter table ecritures_comptables enable trigger trg_exercice_cloture;

-- Contrôle : tout doit être à 0 avant le commit
select 'reste' as controle,
  (select count(*) from factures f, jeu_bornes b where f.societe_id = b.societe_id and f.numero like 'JEU-%') as factures,
  (select count(*) from ecritures_comptables e, jeu_bornes b where e.societe_id = b.societe_id and e.annee < 2026) as ecritures_2024_2025,
  (select count(*) from transactions t, jeu_bornes b where t.societe_id = b.societe_id and t.annee < 2026) as transactions_2024_2025,
  (select count(*) from bulletins_paie p, jeu_bornes b where p.societe_id = b.societe_id and p.annee < 2026) as bulletins_2024_2025;

commit;
