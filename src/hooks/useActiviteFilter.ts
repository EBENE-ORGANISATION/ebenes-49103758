/**
 * useActiviteFilter — source de vérité pour le compartiment d'activité courant,
 * porté par le paramètre d'URL `?aid=` (comme `?sid=` pour la société).
 *
 * `null` = « Toutes les activités » (vue consolidée). Une valeur = filtrage sur
 * cette activité + estampillage des nouvelles saisies avec cet id.
 *
 * Le paramètre est conservé au sein du HashRouter et cohabite avec `sid`/`tab`.
 */
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const useActiviteFilter = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const currentActiviteId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("aid");
  }, [location.search]);

  const setActiviteId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(location.search);
      if (id) params.set("aid", id);
      else params.delete("aid");
      navigate({ search: params.toString() });
    },
    [location.search, navigate],
  );

  return { currentActiviteId, setActiviteId };
};
