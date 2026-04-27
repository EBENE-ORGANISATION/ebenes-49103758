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
  Devis,
  Immobilisation,
  COMPTES_IMMO_DEFAUT,
} from "@/types/ebene";
import { moisKey, newId, genererMatricule } from "@/lib/ebene-utils";
import { backupToDrive, type EbeneStoreLike } from "@/lib/googleDrive";
import { amortissementsAnnee } from "@/lib/amortissements";
import { logAction } from "@/lib/audit";

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
  devis: Array.isArray(d?.devis) ? d!.devis : [],
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
  const [immobilisations, setImmobilisations] = useState<Immobilisation[]>([]);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const [loaded, setLoaded] = useState(false);

  // ─── Statut de sauvegarde Google Drive ───
  const [driveStatus, setDriveStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [driveLastBackup, setDriveLastBackup] = useState<Date | null>(null);
  const [driveLastError, setDriveLastError] = useState<string | null>(null);
  const driveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const significantWritesRef = useRef<number>(0);

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

  // ─── Backup Google Drive (debounced 30s) ───
  // On garde une ref vers le snapshot courant pour pouvoir le lire au flush.
  const snapshotRef = useRef<EbeneStoreLike | null>(null);

  const flushDriveBackup = useCallback(async () => {
    if (!snapshotRef.current) return;
    setDriveStatus("syncing");
    setDriveLastError(null);
    const result = await backupToDrive(snapshotRef.current, { silent: true });
    if (result.ok) {
      setDriveStatus("success");
      setDriveLastBackup(new Date());
    } else {
      setDriveStatus("error");
      setDriveLastError(result.error ?? "Erreur inconnue");
    }
  }, []);

  /** Marque une écriture significative et programme un backup Drive dans 30s. */
  const markSignificantWrite = useCallback(() => {
    significantWritesRef.current += 1;
    if (driveDebounceRef.current) clearTimeout(driveDebounceRef.current);
    driveDebounceRef.current = setTimeout(() => {
      void flushDriveBackup();
    }, 30_000);
  }, [flushDriveBackup]);

  /** Force un backup immédiat (appelé par le bouton "Sauvegarder sur Drive"). */
  const triggerDriveBackup = useCallback(async () => {
    if (driveDebounceRef.current) {
      clearTimeout(driveDebounceRef.current);
      driveDebounceRef.current = null;
    }
    await flushDriveBackup();
  }, [flushDriveBackup]);

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
  useEffect(() => { if (loaded) persist(K_IMMOBILISATIONS, immobilisations); }, [immobilisations, loaded, persist]);

  // Garde une vue à jour du store pour le flush Drive (lit la dernière valeur au moment du timeout)
  useEffect(() => {
    snapshotRef.current = {
      donneesMensuelles,
      employes,
      paramsAnnuels,
      tauxHistorique,
      articles,
      fournisseurs,
      categoriesStock,
      sanctions,
      importerDonnees: () => {
        /* placeholder, restauration via store complet */
      },
    };
  }, [
    donneesMensuelles,
    employes,
    paramsAnnuels,
    tauxHistorique,
    articles,
    fournisseurs,
    categoriesStock,
    sanctions,
  ]);

  // Cleanup du timer de backup au unmount
  useEffect(() => {
    return () => {
      if (driveDebounceRef.current) {
        clearTimeout(driveDebounceRef.current);
        driveDebounceRef.current = null;
      }
    };
  }, []);

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
      markSignificantWrite();
    },
    [updateMois, markSignificantWrite]
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
      markSignificantWrite();
    },
    [updateMois, markSignificantWrite]
  );

  const addFacture = useCallback(
    (annee: number, mois: number, f: Omit<Facture, "id">) => {
      const id = newId();
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: [...m.factures, { ...f, id }],
      }));
      markSignificantWrite();
      return id;
    },
    [updateMois, markSignificantWrite]
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
      markSignificantWrite();
    },
    [updateMois, markSignificantWrite]
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
    markSignificantWrite();
  }, [markSignificantWrite]);

  const removeEmploye = useCallback((id: number) => {
    setEmployes((prev) => prev.filter((e) => e.id !== id));
    markSignificantWrite();
  }, [markSignificantWrite]);

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
    let added: Sanction | undefined;
    setSanctions((prev) => {
      added = { ...s, id: newId() };
      return [...prev, added];
    });
    if (added) void logAction("INSERT", "sanctions", added.id, null, added);
  }, []);
  const removeSanction = useCallback((id: number) => {
    let removed: Sanction | undefined;
    setSanctions((prev) => {
      removed = prev.find((s) => s.id === id);
      return prev.filter((s) => s.id !== id);
    });
    void logAction("DELETE", "sanctions", id, removed ?? null, null);
  }, []);

  // ─── Devis ───
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

  // ─── Workflow de validation : transactions / factures ───
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
  const validerSanction = useCallback((id: number) => {
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
  }, []);

  const rejeterSanction = useCallback((id: number, motif: string) => {
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
  }, []);

  // ─── Workflow GRH : employés ───
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

  // ─── Immobilisations ───
  const addImmobilisation = useCallback((i: Omit<Immobilisation, "id">) => {
    const id = newId();
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
    // ─── Statut Google Drive ───
    driveStatus,
    driveLastBackup,
    driveLastError,
    triggerDriveBackup,
  };
};

export default useEbeneStoreRemote;