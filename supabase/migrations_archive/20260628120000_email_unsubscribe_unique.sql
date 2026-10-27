-- ============================================================================
-- Emails transactionnels — envoi direct via Resend (sans pgmq ni Lovable)
-- ----------------------------------------------------------------------------
-- La fonction send-transactional-email fait désormais un upsert sur
-- email_unsubscribe_tokens(email) et envoie directement via l'API Resend.
-- L'upsert onConflict='email' exige une contrainte unique sur `email`
-- (absente du schéma de base créé par Lovable). On l'ajoute ici, plus un
-- index unique sur `token` pour les lookups de désinscription.
-- Idempotent.
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribe_tokens_token_key
  ON public.email_unsubscribe_tokens (token);
