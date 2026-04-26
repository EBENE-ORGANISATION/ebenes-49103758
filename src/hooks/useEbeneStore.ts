import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

// Clés cloud (table app_state)
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

export const useEbeneStore = () => {
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

  // Application d'une valeur reçue (initial ou realtime)
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

  // Chargement initial + realtime
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("app_state")
        .select("key,value")
        .in("key", ALL_KEYS as unknown as string[]);
      if (!cancelled && !error && data) {
        for (const row of data) {
          localSig.current[row.key] = JSON.stringify(row.value);
          applyValue(row.key, row.value);
        }
      }
      if (!cancelled) setLoaded(true);
    })();

    const channel = supabase
      .channel("app_state_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key?: string; value?: unknown };
          if (!row?.key) return;
          const sig = JSON.stringify(row.value);
          if (localSig.current[row.key] === sig) return; // déjà à jour localement
          localSig.current[row.key] = sig;
          applyValue(row.key, row.value);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [applyValue]);

  // Persistance vers le cloud (debounced par effet React)
  const persist = useCallback(async (key: string, value: unknown) => {
    const sig = JSON.stringify(value);
    if (localSig.current[key] === sig) return;
    localSig.current[key] = sig;
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
    if (!error) setLastSaved(new Date());
  }, []);

  useEffect(() => { if (loaded) persist(K_DONNEES, donneesMensuelles); }, [donneesMensuelles, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_EMPLOYES, employes); }, [employes, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_PARAMS_ANNUELS, paramsAnnuels); }, [paramsAnnuels, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_TAUX, tauxHistorique); }, [tauxHistorique, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_ARTICLES, articles); }, [articles, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_FOURNISSEURS, fournisseurs); }, [fournisseurs, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_CATEGORIES_STOCK, categoriesStock); }, [categoriesStock, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_SANCTIONS, sanctions); }, [sanctions, loaded, persist]);

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
    (
      annee: number,
      mois: number,
      id: number,
      patch: Partial<Facture>
    ) => {
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

  // Employés
  const addEmploye = useCallback((e: Omit<Employe, "id">) => {
    setEmployes((prev) => {
      const matricule = e.matricule && e.matricule.trim() ? e.matricule : genererMatricule(prev);
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

  // Absences
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

  // Heures supplémentaires
  const setHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number, hs: HeuresSup) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        heuresSup: { ...(m.heuresSup || {}), [employeId]: hs },
      }));
    },
    [updateMois]
  );

  // Retenues
  const setRetenue = useCallback(
    (annee: number, mois: number, employeId: number, montant: number) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        retenues: { ...(m.retenues || {}), [employeId]: montant },
      }));
    },
    [updateMois]
  );

  // Paramètres annuels (TH / RSL)
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

  // ─── Stock : mouvements (impactent le stock + PMP pour entrées) ───
  const addMouvementStock = useCallback(
    (annee: number, mois: number, mvt: Omit<MouvementStock, "id">) => {
      const id = newId();
      updateMois(annee, mois, (m) => ({
        ...m,
        mouvementsStock: [...(m.mouvementsStock || []), { ...mvt, id }],
      }));
      // Mise à jour du stock & PMP de l'article
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== mvt.articleId) return a;
          let nouveauStock = a.stock;
          let nouveauPMP = a.prixAchat;
          if (mvt.type === "entree") {
            const valAvant = a.stock * a.prixAchat;
            const valEntree = mvt.quantite * (mvt.prixUnitaire ?? a.prixAchat);
            nouveauStock = a.stock + mvt.quantite;
            nouveauPMP = nouveauStock > 0 ? (valAvant + valEntree) / nouveauStock : a.prixAchat;
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
          // rollback simple : entrée→on retire / sortie→on rend / ajustement→non rollback
          setArticles((prev) =>
            prev.map((a) => {
              if (a.id !== mvt.articleId) return a;
              if (mvt.type === "entree") return { ...a, stock: Math.max(0, a.stock - mvt.quantite) };
              if (mvt.type === "sortie") return { ...a, stock: a.stock + mvt.quantite };
              return a;
            })
          );
        }
        return { ...m, mouvementsStock: (m.mouvementsStock || []).filter((x) => x.id !== id) };
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