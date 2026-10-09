-- Décision du 2026-10-09 : bilan d'ouverture et clôture d'exercice.
-- Un exercice clôturé est verrouillé : plus d'écriture ni d'opération datée
-- de cet exercice (les administrateurs peuvent le rouvrir).
CREATE TABLE IF NOT EXISTS public.exercices (
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee integer NOT NULL,
  statut text NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'cloture')),
  date_cloture timestamptz,
  cloture_par uuid DEFAULT auth.uid(),
  affectation jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (societe_id, annee)
);
ALTER TABLE public.exercices ENABLE ROW LEVEL SECURITY;

CREATE POLICY exercices_select ON public.exercices FOR SELECT TO authenticated
  USING (public.est_personnel((SELECT auth.uid()), societe_id));
CREATE POLICY exercices_ecriture ON public.exercices FOR ALL TO authenticated
  USING (
    public.is_admin_general((SELECT auth.uid()))
    OR (public.has_societe_access((SELECT auth.uid()), societe_id)
        AND (public.is_admin((SELECT auth.uid())) OR public.is_chef_compta((SELECT auth.uid()))))
  )
  WITH CHECK (
    public.is_admin_general((SELECT auth.uid()))
    OR (public.has_societe_access((SELECT auth.uid()), societe_id)
        AND (public.is_admin((SELECT auth.uid())) OR public.is_chef_compta((SELECT auth.uid()))))
  );

-- Seul un administrateur rouvre un exercice clôturé
CREATE OR REPLACE FUNCTION public.controle_reouverture_exercice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF OLD.statut = 'cloture' AND NEW.statut = 'ouvert' AND auth.uid() IS NOT NULL
     AND NOT (public.is_admin(auth.uid()) OR public.is_admin_general(auth.uid())) THEN
    RAISE EXCEPTION 'EXERCICE_REOUVERTURE: seul un administrateur peut rouvrir un exercice clôturé' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_exercices_reouverture BEFORE UPDATE ON public.exercices
  FOR EACH ROW EXECUTE FUNCTION public.controle_reouverture_exercice();

-- Verrou : pas d'écriture ni d'opération dans un exercice clôturé (les
-- à-nouveaux générés à la clôture appartiennent à l'exercice suivant).
CREATE OR REPLACE FUNCTION public.interdire_exercice_cloture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
       SELECT 1 FROM public.exercices e WHERE e.societe_id = OLD.societe_id AND e.annee = OLD.annee AND e.statut = 'cloture') THEN
    RAISE EXCEPTION 'EXERCICE_CLOTURE: l''exercice % est clôturé', OLD.annee USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
       SELECT 1 FROM public.exercices e WHERE e.societe_id = NEW.societe_id AND e.annee = NEW.annee AND e.statut = 'cloture') THEN
    RAISE EXCEPTION 'EXERCICE_CLOTURE: l''exercice % est clôturé', NEW.annee USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE TRIGGER trg_exercice_cloture BEFORE INSERT OR UPDATE OR DELETE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.interdire_exercice_cloture();
CREATE TRIGGER trg_exercice_cloture BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.interdire_exercice_cloture();
CREATE TRIGGER trg_exercice_cloture BEFORE INSERT OR UPDATE OR DELETE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.interdire_exercice_cloture();

REVOKE EXECUTE ON FUNCTION public.controle_reouverture_exercice() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.interdire_exercice_cloture() FROM anon, public;
