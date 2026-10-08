-- Décision du 2026-10-08 : une facture ne peut être encaissée (statut
-- « payée ») qu'après sa validation par le chef comptable. Les factures déjà
-- payées ne sont pas touchées : seul le passage au statut « payée » est contrôlé.
CREATE OR REPLACE FUNCTION public.interdire_encaissement_non_validee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.statut = 'payee'
     AND OLD.statut IS DISTINCT FROM 'payee'
     AND NEW.statut_validation IS DISTINCT FROM 'valide' THEN
    RAISE EXCEPTION 'FACTURE_NON_VALIDEE: la facture doit être validée avant d''être encaissée'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_factures_encaissement BEFORE UPDATE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.interdire_encaissement_non_validee();

REVOKE EXECUTE ON FUNCTION public.interdire_encaissement_non_validee() FROM anon, public;
