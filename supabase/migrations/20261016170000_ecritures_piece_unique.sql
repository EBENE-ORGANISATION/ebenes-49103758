-- Une pièce comptable ne peut être passée qu'une fois (par société et par activité).
-- Constaté le 2026-10-16 : deux clics sur « Comptabiliser dotations » doublaient
-- les dotations (la garde de l'écran lisait une liste pas encore rafraîchie).
-- Les écritures par activité d'une même pièce (variation de stock) restent permises.
CREATE UNIQUE INDEX IF NOT EXISTS ecritures_piece_unique
  ON public.ecritures_comptables (societe_id, numero_piece, COALESCE(activite_id, '00000000-0000-0000-0000-000000000000'::uuid));
