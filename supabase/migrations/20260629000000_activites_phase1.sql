-- ============================================================================
-- Fonctionnalité "Activités" — Phase 1 : fondation base de données
-- ----------------------------------------------------------------------------
-- Compartimente les données d'UNE société en plusieurs activités libres
-- (définies par l'admin). Ajoute une table `activites` + colonne `activite_id`
-- (nullable) sur les tables finances/stock/immobilisations. Non destructif.
-- Backfill : crée une activité "Général" par société et y rattache l'existant.
-- ============================================================================

-- ─── Table activites ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  uuid        NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom         text        NOT NULL,
  couleur     text        NOT NULL DEFAULT '#6366f1',
  actif       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activites_societe ON public.activites(societe_id);
ALTER TABLE public.activites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activites_select ON public.activites;
CREATE POLICY activites_select ON public.activites FOR SELECT TO authenticated
  USING (public.is_admin_general(auth.uid()) OR public.has_societe_access(auth.uid(), societe_id));

DROP POLICY IF EXISTS activites_write ON public.activites;
CREATE POLICY activites_write ON public.activites FOR ALL TO authenticated
  USING (public.is_admin_general(auth.uid()) OR (public.is_admin(auth.uid()) AND public.has_societe_access(auth.uid(), societe_id)))
  WITH CHECK (public.is_admin_general(auth.uid()) OR (public.is_admin(auth.uid()) AND public.has_societe_access(auth.uid(), societe_id)));

GRANT ALL ON public.activites TO anon, authenticated, service_role;

-- ─── Colonne activite_id (nullable, ON DELETE SET NULL) ─────────────────────
ALTER TABLE public.transactions        ADD COLUMN IF NOT EXISTS activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL;
ALTER TABLE public.factures            ADD COLUMN IF NOT EXISTS activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL;
ALTER TABLE public.devis               ADD COLUMN IF NOT EXISTS activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL;
ALTER TABLE public.ecritures_comptables ADD COLUMN IF NOT EXISTS activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL;
ALTER TABLE public.articles            ADD COLUMN IF NOT EXISTS activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL;
ALTER TABLE public.mouvements_stock    ADD COLUMN IF NOT EXISTS activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL;
ALTER TABLE public.immobilisations     ADD COLUMN IF NOT EXISTS activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL;

-- ─── Index de filtrage (société, activité) ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_activite ON public.transactions(societe_id, activite_id);
CREATE INDEX IF NOT EXISTS idx_factures_activite     ON public.factures(societe_id, activite_id);
CREATE INDEX IF NOT EXISTS idx_devis_activite        ON public.devis(societe_id, activite_id);
CREATE INDEX IF NOT EXISTS idx_ecritures_activite    ON public.ecritures_comptables(societe_id, activite_id);
CREATE INDEX IF NOT EXISTS idx_articles_activite     ON public.articles(societe_id, activite_id);
CREATE INDEX IF NOT EXISTS idx_mouvstock_activite    ON public.mouvements_stock(societe_id, activite_id);
CREATE INDEX IF NOT EXISTS idx_immo_activite         ON public.immobilisations(societe_id, activite_id);

-- ─── Backfill : activité "Général" par société + rattachement de l'existant ──
DO $$
DECLARE s RECORD; aid uuid;
BEGIN
  FOR s IN SELECT id FROM public.societes LOOP
    SELECT id INTO aid FROM public.activites WHERE societe_id = s.id AND nom = 'Général' LIMIT 1;
    IF aid IS NULL THEN
      INSERT INTO public.activites (societe_id, nom, couleur) VALUES (s.id, 'Général', '#6366f1') RETURNING id INTO aid;
    END IF;
    UPDATE public.transactions        SET activite_id = aid WHERE societe_id = s.id AND activite_id IS NULL;
    UPDATE public.factures            SET activite_id = aid WHERE societe_id = s.id AND activite_id IS NULL;
    UPDATE public.devis               SET activite_id = aid WHERE societe_id = s.id AND activite_id IS NULL;
    UPDATE public.ecritures_comptables SET activite_id = aid WHERE societe_id = s.id AND activite_id IS NULL;
    UPDATE public.articles            SET activite_id = aid WHERE societe_id = s.id AND activite_id IS NULL;
    UPDATE public.mouvements_stock    SET activite_id = aid WHERE societe_id = s.id AND activite_id IS NULL;
    UPDATE public.immobilisations     SET activite_id = aid WHERE societe_id = s.id AND activite_id IS NULL;
  END LOOP;
END $$;
