-- Base schema: tables created by Lovable (not in migrations)
-- =============================================================================
-- This file re-creates the 16 foundation tables that were originally created by
-- Lovable outside of any migration file.  Tables are ordered by dependency so
-- that foreign-key references resolve correctly on a fresh database.
--
-- NOTE: This file does NOT create functions, triggers, or RLS policies.
--       Those are handled by the individual migration files.
-- =============================================================================

-- ─── 0. Helper functions (created by Lovable, used by RLS policies) ─────────
-- plpgsql avoids body validation at creation time (tables come later).

CREATE OR REPLACE FUNCTION public.is_admin_general(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'admin_general'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_societe_access(_user_id uuid, _societe_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN public.is_admin_general(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_societes
      WHERE user_id = _user_id
        AND societe_id = _societe_id
    );
END;
$$;

-- ─── 1. societes ─────────────────────────────────────────────────────────────
-- Root entity: every other tenant-scoped table references societes.id

CREATE TABLE IF NOT EXISTS public.societes (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                   text          NOT NULL,
  adresse               text          NOT NULL DEFAULT '',
  email                 text          NOT NULL DEFAULT '',
  telephone             text          NOT NULL DEFAULT '',
  nif                   text          NOT NULL DEFAULT '',
  rccm                  text          NOT NULL DEFAULT '',
  representant          text          NOT NULL DEFAULT '',
  fonction_representant text          NOT NULL DEFAULT '',
  site_web              text          NOT NULL DEFAULT '',
  logo_url              text          NOT NULL DEFAULT '',
  slogan                text          NOT NULL DEFAULT '',
  mention_legale_pied   text          NOT NULL DEFAULT '',
  couleur_primaire      text          NOT NULL DEFAULT '#1F3864',
  couleur_secondaire    text          NOT NULL DEFAULT '#2E75B6',
  -- Multi-tenant / plan
  slug                  text,
  statut                text          NOT NULL DEFAULT 'active'
                        CHECK (statut IN ('active', 'suspendu', 'essai')),
  plan                  text          NOT NULL DEFAULT 'starter'
                        CHECK (plan IN ('starter', 'pro', 'enterprise')),
  -- Fiscal columns are added later by migration 20260524000001_fiscal_regime.sql
  -- DO NOT add them here (enum types don't exist yet)
  -- Ownership
  created_by            uuid,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS societes_slug_unique
  ON public.societes (slug) WHERE slug IS NOT NULL;

ALTER TABLE public.societes ENABLE ROW LEVEL SECURITY;


-- ─── 2. user_societes ────────────────────────────────────────────────────────
-- Junction table linking auth.users to societes (multi-tenant membership).

CREATE TABLE IF NOT EXISTS public.user_societes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  societe_id  uuid        NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_societes ENABLE ROW LEVEL SECURITY;


-- societe_config: created by migration 20260427025550 (skip here)
-- KEEPING THIS BLOCK COMMENTED OUT:
/*
CREATE TABLE IF NOT EXISTS public.societe_config (
  societe_id            uuid        PRIMARY KEY REFERENCES public.societes(id) ON DELETE CASCADE,
  -- Branding
  logo_url              text,
  couleur_primaire      text        DEFAULT '#1F3864',
  couleur_secondaire    text        DEFAULT '#2E75B6',
  couleur_accent        text        DEFAULT '#C55A11',
  police                text        DEFAULT 'Calibri',
  -- Contact / legal
  adresse               text,
  telephone             text,
  email                 text,
  site_web              text,
  nif                   text,
  rccm                  text,
  -- Document templates
  mention_facture       text,
  mention_contrat       text,
  format_facture        text        NOT NULL DEFAULT 'FAC-{YYYY}-{NNN}',
  format_devis          text        NOT NULL DEFAULT 'DEV-{YYYY}-{NNN}',
  compteur_facture      integer     NOT NULL DEFAULT 1,
  compteur_devis        integer     NOT NULL DEFAULT 1,
  -- Module toggles
  module_stock          boolean     NOT NULL DEFAULT false,
  module_grh            boolean     NOT NULL DEFAULT false,
  module_fiscalite      boolean     NOT NULL DEFAULT false,
  module_immobilisations boolean    NOT NULL DEFAULT false,
  module_ia             boolean     NOT NULL DEFAULT false,
  module_multi_societes boolean     NOT NULL DEFAULT false,
  -- Custom theme
  theme_custom          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.societe_config ENABLE ROW LEVEL SECURITY;
*/

-- ─── 4. services ─────────────────────────────────────────────────────────────
-- Organisational services within a societe (Comptabilite, GRH, custom...).

CREATE TABLE IF NOT EXISTS public.services (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  uuid        NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom         text        NOT NULL,
  description text,
  couleur     text        DEFAULT '#6366f1',
  built_in    boolean     NOT NULL DEFAULT false,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_societe_id ON public.services (societe_id);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;


-- ─── 5. service_membres ──────────────────────────────────────────────────────
-- Membership of users in services (chef or membre).

CREATE TABLE IF NOT EXISTS public.service_membres (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid        NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('chef', 'membre')),
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_service_membres_service_id ON public.service_membres (service_id);
CREATE INDEX IF NOT EXISTS idx_service_membres_user_id    ON public.service_membres (user_id);

ALTER TABLE public.service_membres ENABLE ROW LEVEL SECURITY;


-- ─── 6. custom_services ─────────────────────────────────────────────────────
-- User-defined service definitions for a societe.

CREATE TABLE IF NOT EXISTS public.custom_services (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          uuid        NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom                 text        NOT NULL,
  code                text        NOT NULL,
  description         text,
  workflow_validation boolean     NOT NULL DEFAULT false,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_services ENABLE ROW LEVEL SECURITY;


-- ─── 7. custom_postes ────────────────────────────────────────────────────────
-- Job positions within a custom_service.

CREATE TABLE IF NOT EXISTS public.custom_postes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid        NOT NULL REFERENCES public.custom_services(id) ON DELETE CASCADE,
  nom         text        NOT NULL,
  niveau      text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_postes ENABLE ROW LEVEL SECURITY;


-- ─── 8. user_custom_postes ───────────────────────────────────────────────────
-- Assignment of users to custom job positions.

CREATE TABLE IF NOT EXISTS public.user_custom_postes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  poste_id    uuid        NOT NULL REFERENCES public.custom_postes(id) ON DELETE CASCADE,
  societe_id  uuid        NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  granted_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_custom_postes ENABLE ROW LEVEL SECURITY;


-- ─── 9. bulletins_paie ───────────────────────────────────────────────────────
-- Payslips with workflow (brouillon -> valide -> paye).

CREATE TABLE IF NOT EXISTS public.bulletins_paie (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id        bigint      NOT NULL,
  employe_nom       text        NOT NULL,
  employe_user_id   uuid,
  societe_id        uuid        NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  mois              smallint    NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee             smallint    NOT NULL,
  -- Gains
  salaire_base      numeric     NOT NULL DEFAULT 0,
  sursalaire        numeric     NOT NULL DEFAULT 0,
  prime_anciennete  numeric     NOT NULL DEFAULT 0,
  hs_montant        numeric     NOT NULL DEFAULT 0,
  primes_diverses   numeric     NOT NULL DEFAULT 0,
  indemnites        numeric     NOT NULL DEFAULT 0,
  brut              numeric     NOT NULL DEFAULT 0,
  -- Employee deductions
  cnss_sal          numeric     NOT NULL DEFAULT 0,
  amu_sal           numeric     NOT NULL DEFAULT 0,
  irpp              numeric     NOT NULL DEFAULT 0,
  retenues_diverses numeric     NOT NULL DEFAULT 0,
  total_retenues    numeric     NOT NULL DEFAULT 0,
  net_a_payer       numeric     NOT NULL DEFAULT 0,
  -- Employer charges
  cnss_pat          numeric     NOT NULL DEFAULT 0,
  amu_pat           numeric     NOT NULL DEFAULT 0,
  cout_employeur    numeric     NOT NULL DEFAULT 0,
  -- Workflow
  statut            text        NOT NULL DEFAULT 'brouillon'
                    CHECK (statut IN ('brouillon', 'valide', 'paye')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz,
  -- One payslip per employee per period
  UNIQUE (employe_id, societe_id, mois, annee)
);

CREATE INDEX IF NOT EXISTS bulletins_societe_periode_idx
  ON public.bulletins_paie (societe_id, annee DESC, mois DESC);

CREATE INDEX IF NOT EXISTS bulletins_employe_user_idx
  ON public.bulletins_paie (employe_user_id, societe_id);

ALTER TABLE public.bulletins_paie ENABLE ROW LEVEL SECURITY;


-- ─── 10. portail_messages ────────────────────────────────────────────────────
-- Admin <-> Employee messaging for the employee portal.

CREATE TABLE IF NOT EXISTS public.portail_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       uuid        NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  employe_user_id  uuid        NOT NULL,
  contenu          text        NOT NULL CHECK (char_length(contenu) > 0),
  auteur           text        NOT NULL CHECK (auteur IN ('admin', 'employe')),
  lu               boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portail_messages_employe_idx
  ON public.portail_messages (employe_user_id, societe_id, created_at DESC);

ALTER TABLE public.portail_messages ENABLE ROW LEVEL SECURITY;


-- ─── 11. device_otps ─────────────────────────────────────────────────────────
-- One-time passwords for device verification.

CREATE TABLE IF NOT EXISTS public.device_otps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  code_hash   text        NOT NULL,
  device_fp   text,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_otps_user_idx
  ON public.device_otps (user_id, expires_at DESC);

ALTER TABLE public.device_otps ENABLE ROW LEVEL SECURITY;


-- ─── 12. email_send_log ──────────────────────────────────────────────────────
-- Audit log for outbound emails.

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text        NOT NULL,
  template_name   text        NOT NULL,
  status          text        NOT NULL,
  message_id      text,
  error_message   text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;


-- ─── 13. email_send_state ────────────────────────────────────────────────────
-- Singleton-style table for email sending configuration / rate-limit state.

CREATE TABLE IF NOT EXISTS public.email_send_state (
  id                            integer     PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  batch_size                    integer     NOT NULL DEFAULT 10,
  send_delay_ms                 integer     NOT NULL DEFAULT 500,
  auth_email_ttl_minutes        integer     NOT NULL DEFAULT 60,
  transactional_email_ttl_minutes integer   NOT NULL DEFAULT 1440,
  retry_after_until             timestamptz,
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;


-- ─── 14. email_unsubscribe_tokens ────────────────────────────────────────────
-- Tokens allowing recipients to unsubscribe from emails.

CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  token       text        NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;


-- ─── 15. suppressed_emails ───────────────────────────────────────────────────
-- Email addresses that should not receive mail (bounces, complaints, etc.).

CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  reason      text        NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;


-- user_feature_access: created by migration 20260427024845 (skip here)
