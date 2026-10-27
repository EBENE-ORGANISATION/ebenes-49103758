-- Ajouter les nouveaux rôles à l'enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chef_compta';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'membre_compta';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chef_grh';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'membre_grh';