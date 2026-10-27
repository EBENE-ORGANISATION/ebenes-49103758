-- Ajout du rôle dashboard_viewer à l'enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dashboard_viewer';
