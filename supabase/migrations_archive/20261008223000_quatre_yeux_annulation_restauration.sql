-- Contrôles de gestion (décisions du 2026-10-08)
--  1. Quatre yeux : on ne valide pas sa propre saisie, sauf l'administrateur.
--  2. Une facture validée, payée ou annulée ne se supprime plus (on l'annule).
--  3. Les comptes de l'écriture (charge/produit, Banque/Caisse, TVA) sont
--     enregistrés avec l'opération, pour la recréer à l'identique quand on
--     la restaure depuis la corbeille.

-- ── 1. Auteur de chaque saisie ──────────────────────────────────────────────
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cree_par uuid DEFAULT auth.uid();
ALTER TABLE public.factures     ADD COLUMN IF NOT EXISTS cree_par uuid DEFAULT auth.uid();
ALTER TABLE public.absences     ADD COLUMN IF NOT EXISTS cree_par uuid DEFAULT auth.uid();
ALTER TABLE public.primes       ADD COLUMN IF NOT EXISTS cree_par uuid DEFAULT auth.uid();
ALTER TABLE public.heures_sup   ADD COLUMN IF NOT EXISTS cree_par uuid DEFAULT auth.uid();
ALTER TABLE public.sanctions    ADD COLUMN IF NOT EXISTS cree_par uuid DEFAULT auth.uid();
ALTER TABLE public.employes     ADD COLUMN IF NOT EXISTS cree_par uuid DEFAULT auth.uid();
ALTER TABLE public.ecritures_comptables ALTER COLUMN cree_par SET DEFAULT auth.uid();

-- Refuse le passage au statut « validé » par l'auteur de la saisie (sauf
-- admin). L'auteur ne peut pas être modifié. Saisies anciennes (auteur
-- inconnu) et opérations serveur (auth.uid() nul) : pas de contrôle.
-- TG_ARGV[0] = colonne de statut, TG_ARGV[1] = valeur « validé ».
CREATE OR REPLACE FUNCTION public.controle_quatre_yeux()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  colonne text := TG_ARGV[0];
  valeur_valide text := TG_ARGV[1];
  ancien text;
  nouveau text;
  uid uuid := auth.uid();
BEGIN
  NEW.cree_par := OLD.cree_par;
  EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', colonne, colonne)
    INTO ancien, nouveau USING OLD, NEW;
  IF uid IS NOT NULL
     AND nouveau = valeur_valide
     AND ancien IS DISTINCT FROM valeur_valide
     AND OLD.cree_par = uid
     AND NOT (public.is_admin(uid) OR public.is_admin_general(uid)) THEN
    RAISE EXCEPTION 'QUATRE_YEUX: vous ne pouvez pas valider votre propre saisie'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_quatre_yeux BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.controle_quatre_yeux('statut', 'valide');
CREATE TRIGGER trg_quatre_yeux BEFORE UPDATE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.controle_quatre_yeux('statut', 'valide');
CREATE TRIGGER trg_quatre_yeux BEFORE UPDATE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.controle_quatre_yeux('statut_validation', 'valide');
CREATE TRIGGER trg_quatre_yeux BEFORE UPDATE ON public.absences
  FOR EACH ROW EXECUTE FUNCTION public.controle_quatre_yeux('statut_validation', 'valide');
CREATE TRIGGER trg_quatre_yeux BEFORE UPDATE ON public.primes
  FOR EACH ROW EXECUTE FUNCTION public.controle_quatre_yeux('statut_validation', 'valide');
CREATE TRIGGER trg_quatre_yeux BEFORE UPDATE ON public.heures_sup
  FOR EACH ROW EXECUTE FUNCTION public.controle_quatre_yeux('statut_validation', 'valide');
CREATE TRIGGER trg_quatre_yeux BEFORE UPDATE ON public.sanctions
  FOR EACH ROW EXECUTE FUNCTION public.controle_quatre_yeux('statut_validation', 'valide');
CREATE TRIGGER trg_quatre_yeux BEFORE UPDATE ON public.employes
  FOR EACH ROW EXECUTE FUNCTION public.controle_quatre_yeux('statut_validation', 'valide');

-- ── 2. Une facture validée, payée ou annulée ne se supprime plus ───────────
CREATE OR REPLACE FUNCTION public.interdire_suppression_facture_engagee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.statut_validation = 'valide' OR OLD.statut IN ('payee', 'annulee'))
     AND (TG_OP = 'DELETE' OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'FACTURE_ENGAGEE: une facture validée, payée ou annulée ne peut pas être supprimée ; annulez-la'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE TRIGGER trg_factures_suppression BEFORE UPDATE OR DELETE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.interdire_suppression_facture_engagee();

-- ── 3. Comptes de l'écriture, enregistrés avec l'opération ─────────────────
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS compte text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tresorerie text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS avec_tva boolean;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS compte_tresorerie text;

REVOKE EXECUTE ON FUNCTION public.controle_quatre_yeux() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.interdire_suppression_facture_engagee() FROM anon, public;
