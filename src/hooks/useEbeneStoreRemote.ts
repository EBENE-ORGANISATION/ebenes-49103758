import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  DonneesMensuelles,
  Employe,
  Facture,
  MoisData,
  Prime,
  Transaction,
  Absence,
  HeuresSup,
  ParamsAnnuels,
  TauxFiscaux,
  TAUX_DEFAUT,
  Article,
  Fournisseur,
  CategorieArticle,
  MouvementStock,
  Sanction,
} from "@/types/ebene";
import { moisKey, newId, genererMatricule } from "@/lib/ebene-utils";

/**
 * useEbeneStoreRemote
 *
 * Réplique exactement l'interface publique de useEbeneStore mais persiste
 * sur Supabase (table `app_state`, JSONB par clé) au lieu du localStorage.
 * Conserve un fallback localStorage en cas d'indisponibilité de Supabase
 * (lecture initiale et écritures), pour ne pas bloquer l'utilisateur.
 *
 * Toutes les opérations Supabase sont enveloppées dans try/catch et signalent
 * les échecs via toast.error(). Les changements sont également diffusés en
 * temps réel via postgres_changes (canal `app_state_sync_remote`).
 */

// ─── Clés cloud (table app_state) ───
const K_DONNEES = "donneesMensuelles";
const K_EMPLOYES = "employes";
const K_PARAMS_ANNUELS = "paramsAnnuels";
const K_TAUX = "tauxHistorique";
const K_ARTICLES = "articles";
const K_FOURNISSEURS = "fournisseurs";
const K_CATEGORIES_STOCK = "categoriesStock";
const K_SANCTIONS = "sanctions";

const ALL_KEYS = [
  K_DONNEES,
  K_EMPLOYES,
  K_PARAMS_ANNUELS,
  K_TAUX,
  K_ARTICLES,
  K_FOURNISSEURS,
  K_CATEGORIES_STOCK,
  K_SANCTIONS,
] as const;

// ─── Fallback localStorage ───
const LS_PREFIX = "ebene-remote:";
const lsKey = (k: string) => `${LS_PREFIX}${k}`;

const lsRead = (k: string): unknown => {
  try {
    const raw = localStorage.getItem(lsKey(k));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const lsWrite = (k: string, value: unknown) => {
  try {
    localStorage.setItem(lsKey(k), JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
};

const ensureMois = (d: MoisData | undefined): MoisData => ({
  transactions: Array.isArray(d?.transactions) ? d!.transactions : [],
  factures: Array.isArray(d?.factures) ? d!.factures : [],
  primes:
    d && typeof d.primes === "object" && !Array.isArray(d.primes)
      ? d.primes
      : {},
  absences: Array.isArray(d?.absences) ? d!.absences : [],
  heuresSup:
    d && typeof d.heuresSup === "object" && !Array.isArray(d.heuresSup)
      ? d.heuresSup
      : {},
  retenues:
    d && typeof d.retenues === "object" && !Array.isArray(d.retenues)
      ? d.retenues
      : {},
  mouvementsStock: Array.isArray(d?.mouvementsStock) ? d!.mouvementsStock : [],
});

export const useEbeneStoreRemote = () => {
  const [donneesMensuelles, setDonneesMensuelles] = useState<DonneesMensuelles>({});
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [paramsAnnuels, setParamsAnnuels] = useState<Record<number, ParamsAnnuels>>({});
  const [tauxHistorique, setTauxHistorique] = useState<TauxFiscaux[]>([TAUX_DEFAUT]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [categoriesStock, setCategoriesStock] = useState<CategorieArticle[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const [loaded, setLoaded] = useState(false);

  // Anti-boucle : signature locale des dernières valeurs envoyées
  const localSig = useRef<Record<string, string>>({});
  // Mode dégradé : true si Supabase est injoignable
  const offlineMode = useRef<boolean>(false);
  // Évite de spammer le toast d'erreur réseau
  const offlineToastShown = useRef<boolean>(false);

  const notifyOffline = useCallback(() => {
    if (!offlineToastShown.current) {
      offlineToastShown.current = true;
      toast.error(
        "Connexion au serveur indisponible — les modifications sont enregistrées localement."
      );
    }
  }, []);

  const applyValue = useCallback((key: string, value: unknown) => {
    switch (key) {
      case K_DONNEES:
        setDonneesMensuelles((value as DonneesMensuelles) || {});
        break;
      case K_EMPLOYES:
        setEmployes(Array.isArray(value) ? (value as Employe[]) : []);
        break;
      case K_PARAMS_ANNUELS:
        setParamsAnnuels((value as Record<number, ParamsAnnuels>) || {});
        break;
      case K_TAUX: {
        const arr = Array.isArray(value) ? (value as TauxFiscaux[]) : [];
        setTauxHistorique(arr.length ? arr : [TAUX_DEFAUT]);
        break;
      }
      case K_ARTICLES:
        setArticles(Array.isArray(value) ? (value as Article[]) : []);
        break;
      case K_FOURNISSEURS:
        setFournisseurs(Array.isArray(value) ? (value as Fournisseur[]) : []);
        break;
      case K_CATEGORIES_STOCK:
        setCategoriesStock(Array.isArray(value) ? (value as CategorieArticle[]) : []);
        break;
      case K_SANCTIONS:
        setSanctions(Array.isArray(value) ? (value as Sanction[]) : []);
        break;
    }
  }, []);

  // Chargement initial (Supabase puis fallback localStorage) + realtime
  useEffect(() => {
    let cancelled = false;

    const loadFromLocal = () => {
      for (const key of ALL_KEYS) {
        const v = lsRead(key);
        if (v !== null) {
          localSig.current[key] = JSON.stringify(v);
          applyValue(key, v);
        }
      }
    };

    (async () => {
      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("key,value")
          .in("key", ALL_KEYS as unknown as string[]);

        if (error) throw error;

        if (!cancelled && data) {
          for (const row of data) {
            const sig = JSON.stringify(row.value);
            localSig.current[row.key] = sig;
            applyValue(row.key, row.value);
            // Met aussi à jour le cache local pour fallback ultérieur
            lsWrite(row.key, row.value);
          }
        }
      } catch (err) {
        offlineMode.current = true;
        notifyOffline();
        // Charger le cache local
        if (!cancelled) loadFromLocal();
        // eslint-disable-next-line no-console
        console.error("[useEbeneStoreRemote] load failed:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel("app_state_sync_remote")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "app_state" },
          (payload) => {
            const row = (payload.new ?? payload.old) as { key?: string; value?: unknown };
            if (!row?.key) return;
            const sig = JSON.stringify(row.value);
            if (localSig.current[row.key] === sig) return;
            localSig.current[row.key] = sig;
            applyValue(row.key, row.value);
            lsWrite(row.key, row.value);
          }
        )
        .subscribe();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[useEbeneStoreRemote] realtime subscribe failed:", err);
    }

    return () => {
      cancelled = true;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [applyValue, notifyOffline]);

  // Persistance vers le cloud avec fallback localStorage
  const persist = useCallback(
    async (key: string, value: unknown) => {
      const sig = JSON.stringify(value);
      if (localSig.current[key] === sig) return;
      localSig.current[key] = sig;

      // Toujours écrire dans le cache local (sécurité / offline)
      lsWrite(key, value);

      try {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("app_state")
          .upsert(
            {
              key,
              value: value as never,
              updated_by: userData.user?.id ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
        if (error) throw error;
        setLastSaved(new Date());
        // Si on était offline et que ça repasse, on reset le flag
        if (offlineMode.current) {
          offlineMode.current = false;
          offlineToastShown.current = false;
        }
      } catch (err) {
        offlineMode.current = true;
        notifyOffline();
        // eslint-disable-next-line no-console
        console.error(`[useEbeneStoreRemote] persist(${key}) failed:`, err);
      }
    },
    [notifyOffline]
  );

  useEffect(() => { if (loaded) persist(K_DONNEES, donneesMensuelles); }, [donneesMensuelles, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_EMPLOYES, employes); }, [employes, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_PARAMS_ANNUELS, paramsAnnuels); }, [paramsAnnuels, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_TAUX, tauxHistorique); }, [tauxHistorique, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_ARTICLES, articles); }, [articles, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_FOURNISSEURS, fournisseurs); }, [fournisseurs, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_CATEGORIES_STOCK, categoriesStock); }, [categoriesStock, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_SANCTIONS, sanctions); }, [sanctions, loaded, persist]);

  // ─── API publique : identique à useEbeneStore ───

  const getMois = useCallback(
    (annee: number, mois: number): MoisData => {
      return ensureMois(donneesMensuelles[moisKey(annee, mois)]);
    },
    [donneesMensuelles]
  );

  const updateMois = useCallback(
    (annee: number, mois: number, fn: (m: MoisData) => MoisData) => {
      setDonneesMensuelles((prev) => {
        const k = moisKey(annee, mois);
        const current = ensureMois(prev[k]);
        return { ...prev, [k]: fn(current) };
      });
    },
    []
  );

  const addTransaction = useCallback(
    (annee: number, mois: number, t: Omit<Transaction, "id">) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        transactions: [...m.transactions, { ...t, id: newId() }],
      }));
    },
    [updateMois]
  );

  const removeTransaction = useCallback(
    (annee: number, mois: number, id: number) => {
      updateMois(annee, mois, (m) => {
        const trans = m.transactions.find((t) => t.id === id);
        let factures = m.factures;
        if (trans?.source === "facture" && trans.factureId) {
          factures = factures.map((f) =>
            f.id === trans.factureId
              ? { ...f, statut: "en_attente", transactionId: null }
              : f
          );
        }
        return {
          ...m,
          transactions: m.transactions.filter((t) => t.id !== id),
          factures,
        };
      });
    },
    [updateMois]
  );

  const addFacture = useCallback(
    (annee: number, mois: number, f: Omit<Facture, "id">) => {
      const id = newId();
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: [...m.factures, { ...f, id }],
      }));
      return id;
    },
    [updateMois]
  );

  const updateFacture = useCallback(
    (annee: number, mois: number, id: number, patch: Partial<Facture>) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      }));
    },
    [updateMois]
  );

  const removeFacture = useCallback(
    (annee: number, mois: number, id: number) => {
      updateMois(annee, mois, (m) => {
        const f = m.factures.find((x) => x.id === id);
        let transactions = m.transactions;
        if (f?.transactionId) {
          transactions = transactions.filter((t) => t.id !== f.transactionId);
        }
        return {
          ...m,
          factures: m.factures.filter((x) => x.id !== id),
          transactions,
        };
      });
    },
    [updateMois]
  );

  const marquerPayee = useCallback(
    (annee: number, mois: number, factureId: number) => {
      updateMois(annee, mois, (m) => {
        const f = m.factures.find((x) => x.id === factureId);
        if (!f || f.statut === "payee" || f.statut === "proforma") return m;
        const transId = newId();
        const trans: Transaction = {
          id: transId,
          date: f.date,
          desc: `Facture ${f.numero} — ${f.client}`,
          type: "r",
          m: f.totalTtc,
          source: "facture",
          factureId: f.id,
          activite: f.activite,
        };
        return {
          ...m,
          transactions: [...m.transactions, trans],
          factures: m.factures.map((x) =>
            x.id === factureId
              ? { ...x, statut: "payee", transactionId: transId }
              : x
          ),
        };
      });
    },
    [updateMois]
  );

  const convertirProforma = useCallback(
    (annee: number, mois: number, factureId: number, nouveauNumero: string) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((x) =>
          x.id === factureId
            ? { ...x, statut: "en_attente", numero: nouveauNumero }
            : x
        ),
      }));
    },
    [updateMois]
  );

  // ─── Employés ───
  const addEmploye = useCallback((e: Omit<Employe, "id">) => {
    setEmployes((prev) => {
      const matricule =
        e.matricule && e.matricule.trim() ? e.matricule : genererMatricule(prev);
      return [...prev, { ...e, matricule, id: newId() }];
    });
  }, []);

  const removeEmploye = useCallback((id: number) => {
    setEmployes((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateEmploye = useCallback((id: number, patch: Partial<Employe>) => {
    setEmployes((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const addPrime = useCallback(
    (annee: number, mois: number, employeId: number, prime: Omit<Prime, "id">) => {
      updateMois(annee, mois, (m) => {
        const list = m.primes[employeId] || [];
        return {
          ...m,
          primes: { ...m.primes, [employeId]: [...list, { ...prime, id: newId() }] },
        };
      });
    },
    [updateMois]
  );

  const removePrime = useCallback(
    (annee: number, mois: number, employeId: number, primeId: number) => {
      updateMois(annee, mois, (m) => {
        const list = m.primes[employeId] || [];
        return {
          ...m,
          primes: {
            ...m.primes,
            [employeId]: list.filter((p) => p.id !== primeId),
          },
        };
      });
    },
    [updateMois]
  );

  // ─── Absences ───
  const addAbsence = useCallback(
    (annee: number, mois: number, a: Omit<Absence, "id">) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        absences: [...(m.absences || []), { ...a, id: newId() }],
      }));
    },
    [updateMois]
  );

  const removeAbsence = useCallback(
    (annee: number, mois: number, id: number) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        absences: (m.absences || []).filter((a) => a.id !== id),
      }));
    },
    [updateMois]
  );

  // ─── Heures supplémentaires ───
  const setHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number, hs: HeuresSup) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        heuresSup: { ...(m.heuresSup || {}), [employeId]: hs },
      }));
    },
    [updateMois]
  );

  // ─── Retenues ───
  const setRetenue = useCallback(
    (annee: number, mois: number, employeId: number, montant: number) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        retenues: { ...(m.retenues || {}), [employeId]: montant },
      }));
    },
    [updateMois]
  );

  // ─── Paramètres annuels ───
  const setParamAnnuel = useCallback(
    (annee: number, patch: Partial<ParamsAnnuels>) => {
      setParamsAnnuels((prev) => ({
        ...prev,
        [annee]: { ...(prev[annee] || {}), ...patch },
      }));
    },
    []
  );

  const getParamAnnuel = useCallback(
    (annee: number): ParamsAnnuels => paramsAnnuels[annee] || {},
    [paramsAnnuels]
  );

  // ─── Taux fiscaux versionnés ───
  const ajouterTaux = useCallback((t: TauxFiscaux) => {
    setTauxHistorique((prev) =>
      [...prev.filter((x) => x.dateEffet !== t.dateEffet), t].sort(
        (a, b) => new Date(a.dateEffet).getTime() - new Date(b.dateEffet).getTime()
      )
    );
  }, []);

  const supprimerTaux = useCallback((dateEffet: string) => {
    setTauxHistorique((prev) => {
      const next = prev.filter((x) => x.dateEffet !== dateEffet);
      return next.length === 0 ? [TAUX_DEFAUT] : next;
    });
  }, []);

  // ─── Stock : catégories ───
  const addCategorieStock = useCallback((nom: string) => {
    setCategoriesStock((prev) => [...prev, { id: newId(), nom }]);
  }, []);
  const removeCategorieStock = useCallback((id: number) => {
    setCategoriesStock((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ─── Stock : fournisseurs ───
  const addFournisseur = useCallback((f: Omit<Fournisseur, "id">) => {
    setFournisseurs((prev) => [...prev, { ...f, id: newId() }]);
  }, []);
  const updateFournisseur = useCallback((id: number, patch: Partial<Fournisseur>) => {
    setFournisseurs((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);
  const removeFournisseur = useCallback((id: number) => {
    setFournisseurs((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ─── Stock : articles ───
  const addArticle = useCallback((a: Omit<Article, "id">) => {
    setArticles((prev) => [...prev, { ...a, id: newId() }]);
  }, []);
  const updateArticle = useCallback((id: number, patch: Partial<Article>) => {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);
  const removeArticle = useCallback((id: number) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ─── Stock : mouvements (impactent stock + PMP pour entrées) ───
  const addMouvementStock = useCallback(
    (annee: number, mois: number, mvt: Omit<MouvementStock, "id">) => {
      const id = newId();
      updateMois(annee, mois, (m) => ({
        ...m,
        mouvementsStock: [...(m.mouvementsStock || []), { ...mvt, id }],
      }));
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== mvt.articleId) return a;
          let nouveauStock = a.stock;
          let nouveauPMP = a.prixAchat;
          if (mvt.type === "entree") {
            const valAvant = a.stock * a.prixAchat;
            const valEntree = mvt.quantite * (mvt.prixUnitaire ?? a.prixAchat);
            nouveauStock = a.stock + mvt.quantite;
            nouveauPMP =
              nouveauStock > 0 ? (valAvant + valEntree) / nouveauStock : a.prixAchat;
          } else if (mvt.type === "sortie") {
            nouveauStock = Math.max(0, a.stock - mvt.quantite);
          } else if (mvt.type === "ajustement") {
            nouveauStock = mvt.quantite;
          }
          return { ...a, stock: nouveauStock, prixAchat: nouveauPMP };
        })
      );
      return id;
    },
    [updateMois]
  );

  const removeMouvementStock = useCallback(
    (annee: number, mois: number, id: number) => {
      updateMois(annee, mois, (m) => {
        const mvt = (m.mouvementsStock || []).find((x) => x.id === id);
        if (mvt) {
          setArticles((prev) =>
            prev.map((a) => {
              if (a.id !== mvt.articleId) return a;
              if (mvt.type === "entree")
                return { ...a, stock: Math.max(0, a.stock - mvt.quantite) };
              if (mvt.type === "sortie")
                return { ...a, stock: a.stock + mvt.quantite };
              return a;
            })
          );
        }
        return {
          ...m,
          mouvementsStock: (m.mouvementsStock || []).filter((x) => x.id !== id),
        };
      });
    },
    [updateMois]
  );

  // ─── Sanctions disciplinaires ───
  const addSanction = useCallback((s: Omit<Sanction, "id">) => {
    setSanctions((prev) => [...prev, { ...s, id: newId() }]);
  }, []);
  const removeSanction = useCallback((id: number) => {
    setSanctions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const importerDonnees = useCallback(
    (data: { donneesMensuelles?: DonneesMensuelles; employes?: Employe[] }) => {
      setDonneesMensuelles(
        data.donneesMensuelles && typeof data.donneesMensuelles === "object"
          ? data.donneesMensuelles
          : {}
      );
      setEmployes(Array.isArray(data.employes) ? data.employes : []);
      const dataAny = data as {
        paramsAnnuels?: Record<number, ParamsAnnuels>;
        tauxHistorique?: TauxFiscaux[];
        articles?: Article[];
        fournisseurs?: Fournisseur[];
        categoriesStock?: CategorieArticle[];
        sanctions?: Sanction[];
      };
      if (dataAny.paramsAnnuels) setParamsAnnuels(dataAny.paramsAnnuels);
      if (Array.isArray(dataAny.tauxHistorique) && dataAny.tauxHistorique.length)
        setTauxHistorique(dataAny.tauxHistorique);
      if (Array.isArray(dataAny.articles)) setArticles(dataAny.articles);
      if (Array.isArray(dataAny.fournisseurs)) setFournisseurs(dataAny.fournisseurs);
      if (Array.isArray(dataAny.categoriesStock)) setCategoriesStock(dataAny.categoriesStock);
      if (Array.isArray(dataAny.sanctions)) setSanctions(dataAny.sanctions);
    },
    []
  );

  const anneesDisponibles = useMemo(() => {
    const s = new Set<number>();
    Object.keys(donneesMensuelles).forEach((k) => {
      const a = parseInt(k.split("-")[0], 10);
      if (!isNaN(a)) s.add(a);
    });
    const cur = new Date().getFullYear();
    const max = Math.max(2035, cur + 2, ...Array.from(s));
    const min = Math.min(2025, ...Array.from(s));
    const out: number[] = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
  }, [donneesMensuelles]);

  return {
    donneesMensuelles,
    employes,
    paramsAnnuels,
    tauxHistorique,
    articles,
    fournisseurs,
    categoriesStock,
    sanctions,
    lastSaved,
    getMois,
    addTransaction,
    removeTransaction,
    addFacture,
    updateFacture,
    removeFacture,
    marquerPayee,
    convertirProforma,
    addEmploye,
    removeEmploye,
    updateEmploye,
    addPrime,
    removePrime,
    addAbsence,
    removeAbsence,
    setHeuresSup,
    setRetenue,
    setParamAnnuel,
    getParamAnnuel,
    ajouterTaux,
    supprimerTaux,
    addCategorieStock,
    removeCategorieStock,
    addFournisseur,
    updateFournisseur,
    removeFournisseur,
    addArticle,
    updateArticle,
    removeArticle,
    addMouvementStock,
    removeMouvementStock,
    addSanction,
    removeSanction,
    importerDonnees,
    anneesDisponibles,
  };
};

export default useEbeneStoreRemote;