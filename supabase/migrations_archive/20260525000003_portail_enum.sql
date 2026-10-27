-- P3 : Enum app_module — ajouter la valeur 'portail'
-- Permet d'attribuer des overrides de permissions sur le module portail employé.
-- ADD VALUE IF NOT EXISTS est idempotent (PostgreSQL 9.3+).

ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'portail';
