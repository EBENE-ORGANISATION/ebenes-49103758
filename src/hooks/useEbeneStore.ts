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
  Devis,
  Immobilisation,
  COMPTES_IMMO_DEFAUT,
} from "@/types/ebene";
import { moisKey, newId, genererMatricule } from "@/lib/ebene-utils";
import { logAction } from "@/lib/audit";
import { amortissementsAnnee } from "@/lib/amortissements";
import { useSociete, societeKey } from "@/hooks/useSocieteContext";

// Clés cloud (table app_state)
const K_DONNEES = "donneesMensuelles";
const K_EMPLOYES = "employes";
const K_PARAMS_ANNUELS = "paramsAnnuels";
const K_TAUX = "tauxHistorique";
const K_ARTICLES = "articles";
const K_FOURNISSEURS = "fournisseurs";
const K_CATEGORIES_STOCK = "categoriesStock";
const K_SANCTIONS = "sanctions";
const K_IMMOBILISATIONS = "immobilisations";

const ALL_KEYS = [
  K_DONNEES,
  K_EMPLOYES,
  K_PARAMS_ANNUELS,
  K_TAUX,
  K_ARTICLES,
  K_FOURNISSEURS,
  K_CATEGORIES_STOCK,
  K_SANCTIONS,
  K_IMMOBILISATIONS,
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
  devis: Array.isArray(d?.devis) ? d!.devis : [],
});

export const useEbeneStore = () => {
  // ─── Multi-société ───
  // societeId : société active (écritures + lectures normales)
  // consolide : si true, le store agrège en LECTURE SEULE l'union de toutes
  // les sociétés accessibles. Toute écriture est ignorée dans ce mode.
  const { societeId, societes, consolide } = useSociete();

  const [donneesMensuelles, setDonneesMensuelles] = useState<DonneesMensuelles>({});
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [paramsAnnuels, setParamsAnnuels] = useState<Record<number, ParamsAnnuels>>({});
  const [tauxHistorique, setTauxHistorique] = useState<TauxFiscaux[]>([TAUX_DEFAUT]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [categoriesStock, setCategoriesStock] = useState<CategorieArticle[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [immobilisations, setImmobilisations] = useState<Immobilisation[]>([]);
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
      case K_IMMOBILISATIONS:
        setImmobilisations(Array.isArray(value) ? (value as Immobilisation[]) : []);
        break;
    }
  }, []);

  // Chargement initial + realtime
  useEffect(() => {
    // Réinitialise complètement l'état lorsqu'on change de société (ou
    // qu'on bascule en mode consolidé). On évite ainsi toute fuite de
    // données entre sociétés.
    setLoaded(false);
    setDonneesMensuelles({});
    setEmployes([]);
    setParamsAnnuels({});
    setTauxHistorique([TAUX_DEFAUT]);
    setArticles([]);
    setFournisseurs([]);
    setCategoriesStock([]);
    setSanctions([]);
    setImmobilisations([]);
    localSig.current = {};

    let cancelled = false;

    // ─── Mode consolidé ───────────────────────────────────────────────
    // Charge toutes les sociétés accessibles et agrège les données en
    // lecture seule (additionne les Map/Array, fusionne par mois). Aucune
    // écriture ne sera persistée tant que ce mode est actif.
    if (consolide) {
      (async () => {
        const allKeysExpanded = societes.flatMap((s) =>
          ALL_KEYS.map((k) => societeKey(s.id, k))
        );
        if (allKeysExpanded.length === 0) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const { data, error } = await supabase
          .from("app_state")
          .select("key,value")
          .in("key", allKeysExpanded);
        if (cancelled || error || !data) {
          if (!cancelled) setLoaded(true);
          return;
        }
        // Agrégation par baseKey
        const grouped: Record<string, unknown[]> = {};
        for (const row of data) {
          const base = row.key.includes(":") ? row.key.split(":").slice(2).join(":") : row.key;
          (grouped[base] ||= []).push(row.value);
        }
        // donneesMensuelles : merge profond mois par mois
        const merged: DonneesMensuelles = {};
        (grouped[K_DONNEES] || []).forEach((v) => {
          const dm = (v as DonneesMensuelles) || {};
          for (const [mk, m] of Object.entries(dm)) {
            const cur = ensureMois(merged[mk]);
            const inc = ensureMois(m);
            merged[mk] = {
              transactions: [...cur.transactions, ...inc.transactions],
              factures: [...cur.factures, ...inc.factures],
              primes: { ...cur.primes, ...inc.primes },
              absences: [...(cur.absences || []), ...(inc.absences || [])],
              heuresSup: { ...(cur.heuresSup || {}), ...(inc.heuresSup || {}) },
              retenues: { ...(cur.retenues || {}), ...(inc.retenues || {}) },
              mouvementsStock: [...(cur.mouvementsStock || []), ...(inc.mouvementsStock || [])],
              devis: [...(cur.devis || []), ...(inc.devis || [])],
            };
          }
        });
        setDonneesMensuelles(merged);
        setEmployes((grouped[K_EMPLOYES] || []).flatMap((v) => (Array.isArray(v) ? (v as Employe[]) : [])));
        setArticles((grouped[K_ARTICLES] || []).flatMap((v) => (Array.isArray(v) ? (v as Article[]) : [])));
        setFournisseurs((grouped[K_FOURNISSEURS] || []).flatMap((v) => (Array.isArray(v) ? (v as Fournisseur[]) : [])));
        setCategoriesStock((grouped[K_CATEGORIES_STOCK] || []).flatMap((v) => (Array.isArray(v) ? (v as CategorieArticle[]) : [])));
        setSanctions((grouped[K_SANCTIONS] || []).flatMap((v) => (Array.isArray(v) ? (v as Sanction[]) : [])));
        setImmobilisations((grouped[K_IMMOBILISATIONS] || []).flatMap((v) => (Array.isArray(v) ? (v as Immobilisation[]) : [])));
        // Pour les taux et params : on prend le premier non-vide rencontré
        const firstTaux = (grouped[K_TAUX] || []).find((v) => Array.isArray(v) && (v as unknown[]).length > 0);
        if (firstTaux) setTauxHistorique(firstTaux as TauxFiscaux[]);
        const firstParams = (grouped[K_PARAMS_ANNUELS] || []).find((v) => v && typeof v === "object");
        if (firstParams) setParamsAnnuels(firstParams as Record<number, ParamsAnnuels>);
        if (!cancelled) setLoaded(true);
      })();
      // Pas de realtime en mode consolidé (lecture seule)
      return () => { cancelled = true; };
    }

    // ─── Mode normal : 1 société ──────────────────────────────────────
    const keys = ALL_KEYS.map((k) => societeKey(societeId, k));
    (async () => {
      const { data, error } = await supabase
        .from("app_state")
        .select("key,value")
        .in("key", keys);
      if (!cancelled && !error && data) {
        for (const row of data) {
          // dérive la baseKey depuis "s:<id>:base" ou "base"
          const base = row.key.includes(":") ? row.key.split(":").slice(2).join(":") : row.key;
          localSig.current[base] = JSON.stringify(row.value);
          applyValue(base, row.value);
        }
      }
      if (!cancelled) setLoaded(true);
    })();

    const channel = supabase
      .channel(`app_state_sync:${societeId ?? "legacy"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key?: string; value?: unknown };
          if (!row?.key) return;
          // Ignore les changements des autres sociétés
          if (societeId) {
            if (!row.key.startsWith(`s:${societeId}:`)) return;
          } else {
            if (row.key.includes(":")) return;
          }
          const base = row.key.includes(":") ? row.key.split(":").slice(2).join(":") : row.key;
          const sig = JSON.stringify(row.value);
          if (localSig.current[base] === sig) return;
          localSig.current[base] = sig;
          applyValue(base, row.value);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [applyValue, societeId, consolide, societes]);

  // Persistance vers le cloud (debounced par effet React)
  const persist = useCallback(async (baseKey: string, value: unknown) => {
    // En mode consolidé, on ne persiste rien (lecture seule)
    if (consolide) return;
    const sig = JSON.stringify(value);
    if (localSig.current[baseKey] === sig) return;
    localSig.current[baseKey] = sig;
    const fullKey = societeKey(societeId, baseKey);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("app_state")
      .upsert(
        {
          key: fullKey,
          value: value as never,
          updated_by: userData.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (!error) setLastSaved(new Date());
  }, [societeId, consolide]);

  useEffect(() => { if (loaded) persist(K_DONNEES, donneesMensuelles); }, [donneesMensuelles, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_EMPLOYES, employes); }, [employes, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_PARAMS_ANNUELS, paramsAnnuels); }, [paramsAnnuels, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_TAUX, tauxHistorique); }, [tauxHistorique, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_ARTICLES, articles); }, [articles, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_FOURNISSEURS, fournisseurs); }, [fournisseurs, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_CATEGORIES_STOCK, categoriesStock); }, [categoriesStock, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_SANCTIONS, sanctions); }, [sanctions, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_IMMOBILISATIONS, immobilisations); }, [immobilisations, loaded, persist]);

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
      const id = newId();
      const newT: Transaction = { ...t, id, statut: t.statut || "en_validation" };
      updateMois(annee, mois, (m) => ({
        ...m,
        transactions: [...m.transactions, newT],
      }));
      void logAction("INSERT", "transactions", id, null, newT);
    },
    [updateMois]
  );

  const removeTransaction = useCallback(
    (annee: number, mois: number, id: number) => {
      let removed: Transaction | undefined;
      updateMois(annee, mois, (m) => {
        const trans = m.transactions.find((t) => t.id === id);
        removed = trans;
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
      void logAction("DELETE", "transactions", id, removed ?? null, null);
    },
    [updateMois]
  );

  const addFacture = useCallback(
    (annee: number, mois: number, f: Omit<Facture, "id">) => {
      const id = newId();
      const newF: Facture = { ...f, id, statutValidation: f.statutValidation || "en_validation" };
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: [...m.factures, newF],
      }));
      void logAction("INSERT", "factures", id, null, newF);
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
      let before: Facture | undefined;
      let after: Facture | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((f) => {
          if (f.id !== id) return f;
          before = f;
          after = { ...f, ...patch };
          return after;
        }),
      }));
      void logAction("UPDATE", "factures", id, before ?? null, after ?? null);
    },
    [updateMois]
  );

  const removeFacture = useCallback(
    (annee: number, mois: number, id: number) => {
      let removed: Facture | undefined;
      updateMois(annee, mois, (m) => {
        const f = m.factures.find((x) => x.id === id);
        removed = f;
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
      void logAction("DELETE", "factures", id, removed ?? null, null);
    },
    [updateMois]
  );

  const marquerPayee = useCallback(
    (annee: number, mois: number, factureId: number) => {
      let beforeF: Facture | undefined;
      let afterF: Facture | undefined;
      updateMois(annee, mois, (m) => {
        const f = m.factures.find((x) => x.id === factureId);
        if (!f || f.statut === "payee" || f.statut === "proforma") return m;
        beforeF = f;
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
          statut: "valide",
        };
        afterF = { ...f, statut: "payee", transactionId: transId };
        return {
          ...m,
          transactions: [...m.transactions, trans],
          factures: m.factures.map((x) =>
            x.id === factureId ? afterF! : x
          ),
        };
      });
      if (beforeF && afterF) {
        void logAction("MARQUER_PAYEE", "factures", factureId, beforeF, afterF);
      }
    },
    [updateMois]
  );

  const convertirProforma = useCallback(
    (annee: number, mois: number, factureId: number, nouveauNumero: string) => {
      let before: Facture | undefined;
      let after: Facture | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((x) => {
          if (x.id !== factureId) return x;
          before = x;
          after = { ...x, statut: "en_attente", numero: nouveauNumero };
          return after;
        }),
      }));
      void logAction("CONVERTIR_PROFORMA", "factures", factureId, before ?? null, after ?? null);
    },
    [updateMois]
  );

  // ─── Devis ─────────────────────────────────────────────────────────────
  const addDevis = useCallback(
    (annee: number, mois: number, d: Omit<Devis, "id">) => {
      const id = newId();
      const newD: Devis = { ...d, id, statut: d.statut || "envoye" };
      updateMois(annee, mois, (m) => ({
        ...m,
        devis: [...(m.devis || []), newD],
      }));
      void logAction("INSERT", "devis", id, null, newD);
      return id;
    },
    [updateMois]
  );

  const removeDevis = useCallback(
    (annee: number, mois: number, id: number) => {
      let removed: Devis | undefined;
      updateMois(annee, mois, (m) => {
        const list = m.devis || [];
        removed = list.find((x) => x.id === id);
        return { ...m, devis: list.filter((x) => x.id !== id) };
      });
      void logAction("DELETE", "devis", id, removed ?? null, null);
    },
    [updateMois]
  );

  const updateDevis = useCallback(
    (annee: number, mois: number, id: number, patch: Partial<Devis>) => {
      let before: Devis | undefined;
      let after: Devis | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        devis: (m.devis || []).map((d) => {
          if (d.id !== id) return d;
          before = d;
          after = { ...d, ...patch };
          return after;
        }),
      }));
      void logAction("UPDATE", "devis", id, before ?? null, after ?? null);
    },
    [updateMois]
  );

  /**
   * Convertit un devis en facture définitive : appelle addFacture() puis
   * marque le devis comme 'converti' avec la référence de la facture créée.
   * Renvoie l'id de la facture créée.
   */
  const convertirDevisEnFacture = useCallback(
    (annee: number, mois: number, devisId: number, numeroFacture: string): number | null => {
      const m = ensureMois(donneesMensuelles[moisKey(annee, mois)]);
      const d = (m.devis || []).find((x) => x.id === devisId);
      if (!d) return null;
      const factureId = addFacture(annee, mois, {
        numero: numeroFacture,
        client: d.client,
        date: d.date,
        lignes: d.lignes,
        reduction: d.reduction,
        avecTva: d.avecTva,
        statut: "en_attente",
        transactionId: null,
        totalHT: d.totalHT,
        totalTva: d.totalTva,
        totalTtc: d.totalTtc,
        activite: d.activite,
      });
      let before: Devis | undefined;
      let after: Devis | undefined;
      updateMois(annee, mois, (mm) => ({
        ...mm,
        devis: (mm.devis || []).map((x) => {
          if (x.id !== devisId) return x;
          before = x;
          after = { ...x, statut: "converti", factureId };
          return after;
        }),
      }));
      void logAction("CONVERTIR_DEVIS", "devis", devisId, before ?? null, after ?? null);
      return factureId;
    },
    [addFacture, donneesMensuelles, updateMois]
  );

  // ─── Workflow de validation ───
  const validerTransaction = useCallback(
    (annee: number, mois: number, id: number) => {
      let before: Transaction | undefined;
      let after: Transaction | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        transactions: m.transactions.map((t) => {
          if (t.id !== id) return t;
          before = t;
          after = { ...t, statut: "valide", motifRejet: undefined };
          return after;
        }),
      }));
      void logAction("VALIDER_TRANSACTION", "transactions", id, before ?? null, after ?? null);
    },
    [updateMois]
  );

  const rejeterTransaction = useCallback(
    (annee: number, mois: number, id: number, motif: string) => {
      let before: Transaction | undefined;
      let after: Transaction | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        transactions: m.transactions.map((t) => {
          if (t.id !== id) return t;
          before = t;
          after = { ...t, statut: "rejete", motifRejet: motif };
          return after;
        }),
      }));
      void logAction("REJETER_TRANSACTION", "transactions", id, before ?? null, after ?? null);
    },
    [updateMois]
  );

  const validerFacture = useCallback(
    (annee: number, mois: number, id: number) => {
      let before: Facture | undefined;
      let after: Facture | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((f) => {
          if (f.id !== id) return f;
          before = f;
          after = { ...f, statutValidation: "valide", motifRejet: undefined };
          return after;
        }),
      }));
      void logAction("VALIDER_FACTURE", "factures", id, before ?? null, after ?? null);
    },
    [updateMois]
  );

  const rejeterFacture = useCallback(
    (annee: number, mois: number, id: number, motif: string) => {
      let before: Facture | undefined;
      let after: Facture | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((f) => {
          if (f.id !== id) return f;
          before = f;
          after = { ...f, statutValidation: "rejete", motifRejet: motif };
          return after;
        }),
      }));
      void logAction("REJETER_FACTURE", "factures", id, before ?? null, after ?? null);
    },
    [updateMois]
  );

  // ─── Workflow GRH : primes ───
  const validerPrime = useCallback(
    (annee: number, mois: number, employeId: number, primeId: number) => {
      let before: Prime | undefined;
      let after: Prime | undefined;
      updateMois(annee, mois, (m) => {
        const list = m.primes[employeId] || [];
        return {
          ...m,
          primes: {
            ...m.primes,
            [employeId]: list.map((p) => {
              if (p.id !== primeId) return p;
              before = p;
              after = { ...p, statutValidation: "valide", motifRejet: undefined };
              return after;
            }),
          },
        };
      });
      void logAction("VALIDER_PRIME", "primes", primeId, before ?? null, after ?? null);
    },
    [updateMois]
  );

  const rejeterPrime = useCallback(
    (annee: number, mois: number, employeId: number, primeId: number, motif: string) => {
      let before: Prime | undefined;
      let after: Prime | undefined;
      updateMois(annee, mois, (m) => {
        const list = m.primes[employeId] || [];
        return {
          ...m,
          primes: {
            ...m.primes,
            [employeId]: list.map((p) => {
              if (p.id !== primeId) return p;
              before = p;
              after = { ...p, statutValidation: "rejete", motifRejet: motif };
              return after;
            }),
          },
        };
      });
      void logAction("REJETER_PRIME", "primes", primeId, before ?? null, after ?? null);
    },
    [updateMois]
  );

  // ─── Workflow GRH : absences ───
  const validerAbsence = useCallback(
    (annee: number, mois: number, id: number) => {
      let before: Absence | undefined;
      let after: Absence | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        absences: (m.absences || []).map((a) => {
          if (a.id !== id) return a;
          before = a;
          after = { ...a, statutValidation: "valide", motifRejet: undefined };
          return after;
        }),
      }));
      void logAction("VALIDER_ABSENCE", "absences", id, before ?? null, after ?? null);
    },
    [updateMois]
  );

  const rejeterAbsence = useCallback(
    (annee: number, mois: number, id: number, motif: string) => {
      let before: Absence | undefined;
      let after: Absence | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        absences: (m.absences || []).map((a) => {
          if (a.id !== id) return a;
          before = a;
          after = { ...a, statutValidation: "rejete", motifRejet: motif };
          return after;
        }),
      }));
      void logAction("REJETER_ABSENCE", "absences", id, before ?? null, after ?? null);
    },
    [updateMois]
  );

  // ─── Workflow GRH : heures supplémentaires ───
  const validerHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number) => {
      let before: HeuresSup | undefined;
      let after: HeuresSup | undefined;
      updateMois(annee, mois, (m) => {
        const cur = (m.heuresSup || {})[employeId];
        if (!cur) return m;
        before = cur;
        after = { ...cur, statutValidation: "valide", motifRejet: undefined };
        return {
          ...m,
          heuresSup: { ...(m.heuresSup || {}), [employeId]: after },
        };
      });
      void logAction("VALIDER_HEURES_SUP", "heuresSup", employeId, before ?? null, after ?? null);
    },
    [updateMois]
  );

  const rejeterHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number, motif: string) => {
      let before: HeuresSup | undefined;
      let after: HeuresSup | undefined;
      updateMois(annee, mois, (m) => {
        const cur = (m.heuresSup || {})[employeId];
        if (!cur) return m;
        before = cur;
        after = { ...cur, statutValidation: "rejete", motifRejet: motif };
        return {
          ...m,
          heuresSup: { ...(m.heuresSup || {}), [employeId]: after },
        };
      });
      void logAction("REJETER_HEURES_SUP", "heuresSup", employeId, before ?? null, after ?? null);
    },
    [updateMois]
  );

  // ─── Workflow GRH : sanctions ───
  const validerSanction = useCallback(
    (id: number) => {
      let before: Sanction | undefined;
      let after: Sanction | undefined;
      setSanctions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          before = s;
          after = { ...s, statutValidation: "valide", motifRejet: undefined };
          return after;
        })
      );
      void logAction("VALIDER_SANCTION", "sanctions", id, before ?? null, after ?? null);
    },
    []
  );

  const rejeterSanction = useCallback(
    (id: number, motif: string) => {
      let before: Sanction | undefined;
      let after: Sanction | undefined;
      setSanctions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          before = s;
          after = { ...s, statutValidation: "rejete", motifRejet: motif };
          return after;
        })
      );
      void logAction("REJETER_SANCTION", "sanctions", id, before ?? null, after ?? null);
    },
    []
  );

  // Employés
  const addEmploye = useCallback((e: Omit<Employe, "id">) => {
    let added: Employe | undefined;
    setEmployes((prev) => {
      const matricule = e.matricule && e.matricule.trim() ? e.matricule : genererMatricule(prev);
      added = {
        ...e,
        matricule,
        id: newId(),
        statutValidation: e.statutValidation || "en_validation",
      };
      return [...prev, added];
    });
    if (added) void logAction("INSERT", "employes", added.id, null, added);
  }, []);

  const removeEmploye = useCallback((id: number) => {
    let removed: Employe | undefined;
    setEmployes((prev) => {
      removed = prev.find((e) => e.id === id);
      return prev.filter((e) => e.id !== id);
    });
    void logAction("DELETE", "employes", id, removed ?? null, null);
  }, []);

  const updateEmploye = useCallback((id: number, patch: Partial<Employe>) => {
    let before: Employe | undefined;
    let after: Employe | undefined;
    setEmployes((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        before = e;
        after = { ...e, ...patch };
        return after;
      })
    );
    void logAction("UPDATE", "employes", id, before ?? null, after ?? null);
  }, []);

  const validerEmploye = useCallback((id: number) => {
    let before: Employe | undefined;
    let after: Employe | undefined;
    setEmployes((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        before = e;
        after = { ...e, statutValidation: "valide", motifRejet: undefined };
        return after;
      })
    );
    void logAction("VALIDER_EMPLOYE", "employes", id, before ?? null, after ?? null);
  }, []);

  const rejeterEmploye = useCallback((id: number, motif: string) => {
    let before: Employe | undefined;
    let after: Employe | undefined;
    setEmployes((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        before = e;
        after = { ...e, statutValidation: "rejete", motifRejet: motif };
        return after;
      })
    );
    void logAction("REJETER_EMPLOYE", "employes", id, before ?? null, after ?? null);
  }, []);

  const addPrime = useCallback(
    (annee: number, mois: number, employeId: number, prime: Omit<Prime, "id">) => {
      const id = newId();
      const newP: Prime = {
        ...prime,
        id,
        statutValidation: prime.statutValidation || "en_validation",
      };
      updateMois(annee, mois, (m) => {
        const list = m.primes[employeId] || [];
        return {
          ...m,
          primes: { ...m.primes, [employeId]: [...list, newP] },
        };
      });
      void logAction("INSERT", "primes", id, null, { ...newP, employeId });
    },
    [updateMois]
  );

  const removePrime = useCallback(
    (annee: number, mois: number, employeId: number, primeId: number) => {
      let removed: Prime | undefined;
      updateMois(annee, mois, (m) => {
        const list = m.primes[employeId] || [];
        removed = list.find((p) => p.id === primeId);
        return {
          ...m,
          primes: {
            ...m.primes,
            [employeId]: list.filter((p) => p.id !== primeId),
          },
        };
      });
      void logAction("DELETE", "primes", primeId, removed ? { ...removed, employeId } : null, null);
    },
    [updateMois]
  );

  // Absences
  const addAbsence = useCallback(
    (annee: number, mois: number, a: Omit<Absence, "id">) => {
      const id = newId();
      const newA: Absence = {
        ...a,
        id,
        statutValidation: a.statutValidation || "en_validation",
      };
      updateMois(annee, mois, (m) => ({
        ...m,
        absences: [...(m.absences || []), newA],
      }));
      void logAction("INSERT", "absences", id, null, newA);
    },
    [updateMois]
  );

  const removeAbsence = useCallback(
    (annee: number, mois: number, id: number) => {
      let removed: Absence | undefined;
      updateMois(annee, mois, (m) => {
        removed = (m.absences || []).find((a) => a.id === id);
        return {
          ...m,
          absences: (m.absences || []).filter((a) => a.id !== id),
        };
      });
      void logAction("DELETE", "absences", id, removed ?? null, null);
    },
    [updateMois]
  );

  // Heures supplémentaires
  const setHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number, hs: HeuresSup) => {
      let before: HeuresSup | undefined;
      const newHs: HeuresSup = {
        ...hs,
        statutValidation: hs.statutValidation || "en_validation",
      };
      updateMois(annee, mois, (m) => {
        before = (m.heuresSup || {})[employeId];
        return {
          ...m,
          heuresSup: { ...(m.heuresSup || {}), [employeId]: newHs },
        };
      });
      void logAction("UPDATE", "heuresSup", employeId, before ?? null, newHs);
    },
    [updateMois]
  );

  // Retenues
  const setRetenue = useCallback(
    (annee: number, mois: number, employeId: number, montant: number) => {
      let before: number | undefined;
      updateMois(annee, mois, (m) => {
        before = (m.retenues || {})[employeId];
        return {
          ...m,
          retenues: { ...(m.retenues || {}), [employeId]: montant },
        };
      });
      void logAction("UPDATE", "retenues", employeId, before ?? null, montant);
    },
    [updateMois]
  );

  // Paramètres annuels (TH / RSL)
  const setParamAnnuel = useCallback(
    (annee: number, patch: Partial<ParamsAnnuels>) => {
      let before: ParamsAnnuels | undefined;
      let after: ParamsAnnuels | undefined;
      setParamsAnnuels((prev) => {
        before = prev[annee];
        after = { ...(prev[annee] || {}), ...patch };
        return {
          ...prev,
          [annee]: after,
        };
      });
      void logAction("UPDATE", "paramsAnnuels", annee, before ?? null, after ?? null);
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
    void logAction("INSERT", "tauxHistorique", t.dateEffet, null, t);
  }, []);
  const supprimerTaux = useCallback((dateEffet: string) => {
    let removed: TauxFiscaux | undefined;
    setTauxHistorique((prev) => {
      removed = prev.find((x) => x.dateEffet === dateEffet);
      const next = prev.filter((x) => x.dateEffet !== dateEffet);
      return next.length === 0 ? [TAUX_DEFAUT] : next;
    });
    void logAction("DELETE", "tauxHistorique", dateEffet, removed ?? null, null);
  }, []);

  // ─── Stock : catégories ───
  const addCategorieStock = useCallback((nom: string) => {
    const id = newId();
    setCategoriesStock((prev) => [...prev, { id, nom }]);
    void logAction("INSERT", "categoriesStock", id, null, { id, nom });
  }, []);
  const removeCategorieStock = useCallback((id: number) => {
    let removed: CategorieArticle | undefined;
    setCategoriesStock((prev) => {
      removed = prev.find((c) => c.id === id);
      return prev.filter((c) => c.id !== id);
    });
    void logAction("DELETE", "categoriesStock", id, removed ?? null, null);
  }, []);

  // ─── Stock : fournisseurs ───
  const addFournisseur = useCallback((f: Omit<Fournisseur, "id">) => {
    const id = newId();
    const newF: Fournisseur = { ...f, id };
    setFournisseurs((prev) => [...prev, newF]);
    void logAction("INSERT", "fournisseurs", id, null, newF);
  }, []);
  const updateFournisseur = useCallback((id: number, patch: Partial<Fournisseur>) => {
    let before: Fournisseur | undefined;
    let after: Fournisseur | undefined;
    setFournisseurs((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        before = f;
        after = { ...f, ...patch };
        return after;
      })
    );
    void logAction("UPDATE", "fournisseurs", id, before ?? null, after ?? null);
  }, []);
  const removeFournisseur = useCallback((id: number) => {
    let removed: Fournisseur | undefined;
    setFournisseurs((prev) => {
      removed = prev.find((f) => f.id === id);
      return prev.filter((f) => f.id !== id);
    });
    void logAction("DELETE", "fournisseurs", id, removed ?? null, null);
  }, []);

  // ─── Stock : articles ───
  const addArticle = useCallback((a: Omit<Article, "id">) => {
    const id = newId();
    const newA: Article = { ...a, id };
    setArticles((prev) => [...prev, newA]);
    void logAction("INSERT", "articles", id, null, newA);
  }, []);
  const updateArticle = useCallback((id: number, patch: Partial<Article>) => {
    let before: Article | undefined;
    let after: Article | undefined;
    setArticles((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        before = a;
        after = { ...a, ...patch };
        return after;
      })
    );
    void logAction("UPDATE", "articles", id, before ?? null, after ?? null);
  }, []);
  const removeArticle = useCallback((id: number) => {
    let removed: Article | undefined;
    setArticles((prev) => {
      removed = prev.find((a) => a.id === id);
      return prev.filter((a) => a.id !== id);
    });
    void logAction("DELETE", "articles", id, removed ?? null, null);
  }, []);

  // ─── Stock : mouvements (impactent le stock + PMP pour entrées) ───
  const addMouvementStock = useCallback(
    (annee: number, mois: number, mvt: Omit<MouvementStock, "id">) => {
      const id = newId();
      const newMvt: MouvementStock = { ...mvt, id };
      updateMois(annee, mois, (m) => ({
        ...m,
        mouvementsStock: [...(m.mouvementsStock || []), newMvt],
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
      void logAction("INSERT", "mouvementsStock", id, null, newMvt);
      return id;
    },
    [updateMois]
  );

  const removeMouvementStock = useCallback(
    (annee: number, mois: number, id: number) => {
      let removed: MouvementStock | undefined;
      updateMois(annee, mois, (m) => {
        const mvt = (m.mouvementsStock || []).find((x) => x.id === id);
        removed = mvt;
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
      void logAction("DELETE", "mouvementsStock", id, removed ?? null, null);
    },
    [updateMois]
  );

  // ─── Sanctions disciplinaires ───
  const addSanction = useCallback((s: Omit<Sanction, "id">) => {
    const id = newId();
    const newS: Sanction = {
      ...s,
      id,
      statutValidation: s.statutValidation || "en_validation",
    };
    setSanctions((prev) => [...prev, newS]);
    void logAction("INSERT", "sanctions", id, null, newS);
  }, []);
  const removeSanction = useCallback((id: number) => {
    let removed: Sanction | undefined;
    setSanctions((prev) => {
      removed = prev.find((s) => s.id === id);
      return prev.filter((s) => s.id !== id);
    });
    void logAction("DELETE", "sanctions", id, removed ?? null, null);
  }, []);

  // ─── Immobilisations ───
  const addImmobilisation = useCallback((i: Omit<Immobilisation, "id">) => {
    const id = newId();
    // Si comptesSYSCOHADA non renseignés, on déduit depuis la catégorie.
    const comptes =
      i.comptesSYSCOHADA && i.comptesSYSCOHADA.actif
        ? i.comptesSYSCOHADA
        : i.categorie
          ? COMPTES_IMMO_DEFAUT[i.categorie]
          : { actif: "24", amortissementCumule: "284", dotation: "6813" };
    const newI: Immobilisation = { ...i, id, comptesSYSCOHADA: comptes };
    setImmobilisations((prev) => [...prev, newI]);
    void logAction("INSERT", "immobilisations", id, null, newI);
    return id;
  }, []);

  const removeImmobilisation = useCallback((id: number) => {
    let removed: Immobilisation | undefined;
    setImmobilisations((prev) => {
      removed = prev.find((i) => i.id === id);
      return prev.filter((i) => i.id !== id);
    });
    void logAction("DELETE", "immobilisations", id, removed ?? null, null);
  }, []);

  const updateImmobilisation = useCallback(
    (id: number, patch: Partial<Immobilisation>) => {
      let before: Immobilisation | undefined;
      let after: Immobilisation | undefined;
      setImmobilisations((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          before = i;
          after = { ...i, ...patch };
          return after;
        })
      );
      void logAction("UPDATE", "immobilisations", id, before ?? null, after ?? null);
    },
    []
  );

  /**
   * Retourne, pour l'année donnée, la liste des dotations / cumuls / VNC
   * de toutes les immobilisations enregistrées.
   */
  const getAmortissements = useCallback(
    (annee: number) => amortissementsAnnee(immobilisations, annee),
    [immobilisations]
  );

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
        immobilisations?: Immobilisation[];
      };
      if (dataAny.paramsAnnuels) setParamsAnnuels(dataAny.paramsAnnuels);
      if (Array.isArray(dataAny.tauxHistorique) && dataAny.tauxHistorique.length)
        setTauxHistorique(dataAny.tauxHistorique);
      if (Array.isArray(dataAny.articles)) setArticles(dataAny.articles);
      if (Array.isArray(dataAny.fournisseurs)) setFournisseurs(dataAny.fournisseurs);
      if (Array.isArray(dataAny.categoriesStock)) setCategoriesStock(dataAny.categoriesStock);
      if (Array.isArray(dataAny.sanctions)) setSanctions(dataAny.sanctions);
      if (Array.isArray(dataAny.immobilisations)) setImmobilisations(dataAny.immobilisations);
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
    addDevis,
    removeDevis,
    updateDevis,
    convertirDevisEnFacture,
    validerTransaction,
    rejeterTransaction,
    validerFacture,
    rejeterFacture,
    validerPrime,
    rejeterPrime,
    validerAbsence,
    rejeterAbsence,
    validerHeuresSup,
    rejeterHeuresSup,
    validerSanction,
    rejeterSanction,
    addEmploye,
    removeEmploye,
    updateEmploye,
    validerEmploye,
    rejeterEmploye,
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
    immobilisations,
    addImmobilisation,
    removeImmobilisation,
    updateImmobilisation,
    getAmortissements,
    importerDonnees,
    anneesDisponibles,
  };
};