-- Une panne de notification ne doit jamais empêcher une transition métier.
CREATE OR REPLACE FUNCTION private.notifier_cabinet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ancien text;
  evenement text;
BEGIN
  IF TG_OP = 'UPDATE' THEN ancien := OLD.etat; END IF;
  evenement := CASE
    WHEN TG_OP = 'INSERT' AND NEW.etat = 'invitation' THEN 'invitation_recue'
    WHEN ancien = 'invitation' AND NEW.etat = 'actif' THEN 'invitation_acceptee'
    WHEN ancien = 'invitation' AND NEW.etat = 'termine' THEN 'invitation_close'
    WHEN ancien = 'actif' AND NEW.etat = 'depart_demande' THEN 'depart_demande'
    WHEN ancien = 'depart_demande' AND NEW.etat = 'termine' THEN 'depart_valide'
    WHEN ancien = 'depart_demande' AND NEW.etat = 'actif' THEN 'depart_annule'
    ELSE NULL
  END;
  IF evenement IS NULL THEN RETURN NEW; END IF;
  BEGIN
    PERFORM private.appeler_fonction_interne('notification-cabinet',
      jsonb_build_object('dossier_id', NEW.id, 'ancien', ancien, 'nouveau', NEW.etat));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Notification cabinet impossible : événement %, dossier %', evenement, NEW.id;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notifier_cabinet() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.notifier_cabinet() TO service_role;

DROP TRIGGER IF EXISTS trg_notifier_cabinet ON public.cabinet_dossiers;
CREATE TRIGGER trg_notifier_cabinet AFTER INSERT OR UPDATE OF etat
ON public.cabinet_dossiers FOR EACH ROW EXECUTE FUNCTION private.notifier_cabinet();
