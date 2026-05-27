CREATE TABLE public.device_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired')),
  confirmation_token TEXT UNIQUE,
  token_expires_at TIMESTAMPTZ,
  user_agent TEXT,
  ip TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_sessions_user ON public.device_sessions(user_id, status, last_seen_at);
CREATE INDEX idx_device_sessions_token ON public.device_sessions(confirmation_token) WHERE confirmation_token IS NOT NULL;

GRANT SELECT ON public.device_sessions TO authenticated;
GRANT ALL ON public.device_sessions TO service_role;

ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sessions"
  ON public.device_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_device_sessions_updated_at
  BEFORE UPDATE ON public.device_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();