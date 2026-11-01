-- Suivi manuel des déclarations ; mêmes droits directs que les informations fiscales.
DO $$ BEGIN
  IF public.module_de_table('suivi_declarations') IS DISTINCT FROM 'fiscalite' THEN
    RAISE EXCEPTION 'suivi_declarations : module fiscalite attendu.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.suivi_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee smallint NOT NULL,
  mois smallint NOT NULL CHECK (mois BETWEEN 1 AND 12),
  type text NOT NULL CHECK (type IN ('TVA', 'CNSS', 'IRPP', 'patente')),
  statut text NOT NULL CHECK (statut IN ('deposee', 'payee')),
  date date NOT NULL DEFAULT current_date,
  par uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (societe_id, annee, mois, type),
  CHECK (type <> 'patente' OR mois IN (3, 6, 9, 12))
);
ALTER TABLE public.suivi_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.suivi_declarations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suivi_declarations TO authenticated;
GRANT ALL ON public.suivi_declarations TO service_role;

DROP POLICY IF EXISTS suivi_declarations_select ON public.suivi_declarations;
CREATE POLICY suivi_declarations_select ON public.suivi_declarations
  FOR SELECT TO authenticated USING (public.est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS suivi_declarations_ecriture ON public.suivi_declarations;
CREATE POLICY suivi_declarations_ecriture ON public.suivi_declarations
  FOR ALL TO authenticated
  USING (public.is_admin_general((SELECT auth.uid())) OR
    (public.has_societe_access((SELECT auth.uid()), societe_id) AND
      (public.is_admin((SELECT auth.uid())) OR public.in_service_compta((SELECT auth.uid())))))
  WITH CHECK (public.is_admin_general((SELECT auth.uid())) OR
    (public.has_societe_access((SELECT auth.uid()), societe_id) AND
      (public.is_admin((SELECT auth.uid())) OR public.in_service_compta((SELECT auth.uid())))));

DROP POLICY IF EXISTS cabinet_lecture ON public.suivi_declarations;
CREATE POLICY cabinet_lecture ON public.suivi_declarations FOR SELECT TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 1))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_insert ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_insert ON public.suivi_declarations FOR INSERT TO authenticated
  WITH CHECK (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_update ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_update ON public.suivi_declarations FOR UPDATE TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]))
  WITH CHECK (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_delete ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_delete ON public.suivi_declarations FOR DELETE TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 3))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_lecture ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_lecture ON public.suivi_declarations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 1))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_insert ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_insert ON public.suivi_declarations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_update ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_update ON public.suivi_declarations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]))
  WITH CHECK (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_delete ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_delete ON public.suivi_declarations AS RESTRICTIVE FOR DELETE TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 3))::uuid[]));

CREATE OR REPLACE FUNCTION public.forcer_par_declaration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fonction$
BEGIN
  NEW.par := auth.uid();
  RETURN NEW;
END
$fonction$;
REVOKE ALL ON FUNCTION public.forcer_par_declaration() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_par_declaration ON public.suivi_declarations;
CREATE TRIGGER trg_par_declaration BEFORE INSERT OR UPDATE ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.forcer_par_declaration();
DROP TRIGGER IF EXISTS trg_societe_immuable ON public.suivi_declarations;
CREATE TRIGGER trg_societe_immuable BEFORE UPDATE OF societe_id ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.interdire_changement_societe('societe_id');
DROP TRIGGER IF EXISTS audit_suivi_declarations ON public.suivi_declarations;
CREATE TRIGGER audit_suivi_declarations AFTER INSERT OR UPDATE OR DELETE ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
