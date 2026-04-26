-- Table app_state : stockage partagé JSONB par clé
CREATE TABLE public.app_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur authentifié
CREATE POLICY "Authenticated users can view app_state"
ON public.app_state FOR SELECT
TO authenticated
USING (true);

-- Insert : admin, comptable, rh, saisie
CREATE POLICY "Roles can insert app_state"
ON public.app_state FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'comptable'::public.app_role)
  OR public.has_role(auth.uid(), 'rh'::public.app_role)
  OR public.has_role(auth.uid(), 'saisie'::public.app_role)
);

-- Update : admin, comptable, rh, saisie
CREATE POLICY "Roles can update app_state"
ON public.app_state FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'comptable'::public.app_role)
  OR public.has_role(auth.uid(), 'rh'::public.app_role)
  OR public.has_role(auth.uid(), 'saisie'::public.app_role)
);

-- Delete : admin, comptable, rh seulement
CREATE POLICY "Privileged roles can delete app_state"
ON public.app_state FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'comptable'::public.app_role)
  OR public.has_role(auth.uid(), 'rh'::public.app_role)
);

-- Trigger updated_at
CREATE TRIGGER update_app_state_updated_at
BEFORE UPDATE ON public.app_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger
CREATE TRIGGER audit_app_state
AFTER INSERT OR UPDATE OR DELETE ON public.app_state
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- Realtime
ALTER TABLE public.app_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;

-- Index sur key (déjà UNIQUE mais explicite)
CREATE INDEX idx_app_state_key ON public.app_state(key);