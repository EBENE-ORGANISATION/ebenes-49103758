CREATE TABLE IF NOT EXISTS public.ecritures_comptables (
  id bigserial PRIMARY KEY,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee integer NOT NULL,
  mois integer NOT NULL CHECK (mois BETWEEN 1 AND 12),
  journal text NOT NULL CHECK (journal IN ('AC', 'VE', 'BQ', 'CA', 'OD', 'AN')),
  numero_piece text NOT NULL DEFAULT '',
  libelle text NOT NULL DEFAULT '',
  lignes jsonb NOT NULL DEFAULT '[]',
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'valide', 'cloture')),
  facture_id bigint REFERENCES public.factures(id) ON DELETE SET NULL,
  bulletin_id uuid REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,
  cree_par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  valide_par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motif_rejet text,
  piece_jointe text,
  piece_jointe_nom text,
  piece_jointe_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecritures_societe_mois
  ON public.ecritures_comptables(societe_id, annee, mois);

CREATE INDEX IF NOT EXISTS idx_ecritures_journal
  ON public.ecritures_comptables(societe_id, journal);

CREATE INDEX IF NOT EXISTS idx_ecritures_statut
  ON public.ecritures_comptables(societe_id, statut);

ALTER TABLE public.ecritures_comptables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ecritures_select" ON public.ecritures_comptables
  FOR SELECT USING (
    public.has_societe_access(auth.uid(), societe_id)
  );

CREATE POLICY "ecritures_insert" ON public.ecritures_comptables
  FOR INSERT WITH CHECK (
    public.has_societe_access(auth.uid(), societe_id)
  );

CREATE POLICY "ecritures_update" ON public.ecritures_comptables
  FOR UPDATE USING (
    public.has_societe_access(auth.uid(), societe_id)
  );

CREATE POLICY "ecritures_delete" ON public.ecritures_comptables
  FOR DELETE USING (
    public.has_societe_access(auth.uid(), societe_id)
  );

CREATE OR REPLACE FUNCTION public.update_ecritures_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ecritures_updated_at
  ON public.ecritures_comptables;

CREATE TRIGGER trg_ecritures_updated_at
  BEFORE UPDATE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.update_ecritures_updated_at();