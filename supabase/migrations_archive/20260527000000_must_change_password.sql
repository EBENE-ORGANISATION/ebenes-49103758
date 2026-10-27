-- Migration : Changement de mot de passe obligatoire à la première connexion
-- Ajoute `must_change_password` à la table profiles.
-- Valeur défaut FALSE : les comptes existants ne sont pas impactés.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Si TRUE, l''utilisateur est forcé à changer son mot de passe à la prochaine connexion.
   Positionné à TRUE automatiquement lors d''une création de compte ou d''un reset password admin.
   Remis à FALSE par l''utilisateur lui-même après avoir défini son nouveau mot de passe.';
