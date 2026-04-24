import { useCallback, useEffect, useMemo, useState } from "react";
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

const LS_DONNEES = "ebene_donneesMensuelles";
const LS_EMPLOYES = "ebene_employes";
const LS_PARAMS_ANNUELS = "ebene_paramsAnnuels";
const LS_TAUX = "ebene_tauxHistorique";
const LS_ARTICLES = "ebene_articles";
const LS_FOURNISSEURS = "ebene_fournisseurs";
const LS_CATEGORIES_STOCK = "ebene_categoriesStock";
const LS_SANCTIONS = "ebene_sanctions";

const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
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

export const useEbeneStore = () => {
  const [donneesMensuelles, setDonneesMensuelles] = useState<DonneesMensuelles>(
    () => loadJSON<DonneesMensuelles>(LS_DONNEES, {})
  );
  const [employes, setEmployes] = useState<Employe[]>(() =>
    loadJSON<Employe[]>(LS_EMPLOYES, [])
  );
  const [paramsAnnuels, setParamsAnnuels] = useState<Record<number, ParamsAnnuels>>(
    () => loadJSON<Record<number, ParamsAnnuels>>(LS_PARAMS_ANNUELS, {})
  );
  const [tauxHistorique, setTauxHistorique] = useState<TauxFiscaux[]>(() =>
    loadJSON<TauxFiscaux[]>(LS_TAUX, [TAUX_DEFAUT])
  );
  const [articles, setArticles] = useState<Article[]>(() => loadJSON<Article[]>(LS_ARTICLES, []));
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>(() =>
    loadJSON<Fournisseur[]>(LS_FOURNISSEURS, [])
  );
  const [categoriesStock, setCategoriesStock] = useState<CategorieArticle[]>(() =>
    loadJSON<CategorieArticle[]>(LS_CATEGORIES_STOCK, [])
  );
  const [sanctions, setSanctions] = useState<Sanction[]>(() =>
    loadJSON<Sanction[]>(LS_SANCTIONS, [])
  );
  const [lastSaved, setLastSaved] = useState<Date>(new Date());

  useEffect(() => {
    try {
      localStorage.setItem(LS_DONNEES, JSON.stringify(donneesMensuelles));
      setLastSaved(new Date());
    } catch {}
  }, [donneesMensuelles]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_EMPLOYES, JSON.stringify(employes));
      setLastSaved(new Date());
    } catch {}
  }, [employes]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PARAMS_ANNUELS, JSON.stringify(paramsAnnuels));
      setLastSaved(new Date());
    } catch {}
  }, [paramsAnnuels]);

  useEffect(() => { try { localStorage.setItem(LS_TAUX, JSON.stringify(tauxHistorique)); setLastSaved(new Date()); } catch {} }, [tauxHistorique]);
  useEffect(() => { try { localStorage.setItem(LS_ARTICLES, JSON.stringify(articles)); setLastSaved(new Date()); } catch {} }, [articles]);
  useEffect(() => { try { localStorage.setItem(LS_FOURNISSEURS, JSON.stringify(fournisseurs)); setLastSaved(new Date()); } catch {} }, [fournisseurs]);
  useEffect(() => { try { localStorage.setItem(LS_CATEGORIES_STOCK, JSON.stringify(categoriesStock)); setLastSaved(new Date()); } catch {} }, [categoriesStock]);
  useEffect(() => { try { localStorage.setItem(LS_SANCTIONS, JSON.stringify(sanctions)); setLastSaved(new Date()); } catch {} }, [sanctions]);

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

  const importerDonnees = useCallback(
    (data: { donneesMensuelles?: DonneesMensuelles; employes?: Employe[] }) => {
      setDonneesMensuelles(
        data.donneesMensuelles && typeof data.donneesMensuelles === "object"
          ? data.donneesMensuelles
          : {}
      );
      setEmployes(Array.isArray(data.employes) ? data.employes : []);
      const dataAny = data as { paramsAnnuels?: Record<number, ParamsAnnuels> };
      if (dataAny.paramsAnnuels) setParamsAnnuels(dataAny.paramsAnnuels);
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
    importerDonnees,
    anneesDisponibles,
  };
};