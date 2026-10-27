-- Rattachement compte ↔ société : une seule ligne par paire.
-- Les fonctions super-admin-ops (create_societe) et admin-users font un
-- upsert « onConflict: user_id,societe_id » : sans cette contrainte, Postgres
-- refuse l'opération et le compte n'était jamais rattaché à la société.
ALTER TABLE public.user_societes
  ADD CONSTRAINT user_societes_user_id_societe_id_key UNIQUE (user_id, societe_id);
