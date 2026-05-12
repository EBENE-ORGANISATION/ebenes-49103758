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

// ─── Hooks data relationnels (Phase B.4) ────────────────────────────────────
import { useEmployes } from "@/hooks/data/useEmployes";
import { useArticles } from "@/hooks/data/useArticles";
import { useFournisseurs } from "@/hooks/data/useFournisseurs";
import { useCategoriesStock } from "@/hooks/data/useCategoriesStock";
import { useImmobilisations } from "@/hooks/data/useImmobilisations";
import { useParamsAnnuels } from "@/hooks/data/useParamsAnnuels";
import { useSanctions } from "@/hooks/data/useSanctions";

/**
 * useEbeneStoreRemote — v2 (Phase B.4 proxy de dépréciation)
 *
 * Les entités simples (employes, articles, fournisseurs, categoriesStock,
 * immobilisations, paramsAnnuels, sanctions) sont désormais lues et écrites
 * via les tables relationnelles Supabase (hooks TanStack Query).
 *
 * `donneesMensuelles` (transactions, factures, primes, absences, heuresSup,
 * retenues, mouvementsStock, devis) et `tauxHistorique` restent dans app_state
 * le temps de la migration complète (Phase B.5 future).
 *
 * L'interface publique exposée aux composants est IDENTIQUE à l'ancienne —
 * aucun composant n'a besoin d'être modifié.
 */

// ─── Clés app_state restantes ────────────────────────────────────────────────
const K_DONNEES = "donneesMensuelles";
const K_TAUX = "tauxHistorique";

// Clés conservées uniquement pour la purge du cache localStorage au démarrage
const LEGACY_KEYS = [
  "employes",
  "paramsAnnuels",
  "articles",
  "fournisseurs",
  "categoriesStock",
  "sanctions",
  "immobilisations",
] as const;

const ALL_KEYS = [K_DONNEES, K_TAUX] as const;

// ─── Fallback localStorage ───────────────────────────────────────────────────
const LS_PREFIX = "ebene-remote:";

const lsKey = (k: string, sid: string | null) =>
  sid ? `${LS_PREFIX}s:${sid}:${k}` : `${LS_PREFIX}${k}`;

const tk = (sid: string, k: string) => `s:${sid}:${k}`;
const untk = (key: string, sid: string): string | null => {
  const prefix = `s:${sid}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
};

const lsRead = (k: string, sid: string | null): unknown => {
  try {
    const raw = localStorage.getItem(lsKey(k, sid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const lsWrite = (k: string, sid: string | null, value: unknown) => {
  try {
    localStorage.setItem(lsKey(k, sid), JSON.stringify(value));
  } catch { /* ignore quota errors */ }
};

const ensureMois = (d: MoisData | undefined): MoisData => ({
  transactions: Array.isArray(d?.transactions) ? d!.transactions : [],
  factures: Array.isArray(d?.factures) ? d!.factures : [],
  primes:
    d && typeof d.primes === "object" && !Array.isArray(d.primes) ? d.primes : {},
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

export const useEbeneStoreRemote = (societeId: string | null = null) => {
  // ─── État app_state (donneesMensuelles + tauxHistorique uniquement) ────────
  const [donneesMensuelles, setDonneesMensuelles] = useState<DonneesMensuelles>({});
  const [tauxHistorique, setTauxHistorique] = useState<TauxFiscaux[]>([TAUX_DEFAUT]);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const [loaded, setLoaded] = useState(false);

  // ─── Entités relationnelles (hooks TanStack Query) ─────────────────────────
  const tqEmployes = useEmployes(societeId);
  const tqArticles = useArticles(societeId);
  const tqFournisseurs = useFournisseurs(societeId);
  const tqCategories = useCategoriesStock(societeId);
  const tqImmobilisations = useImmobilisations(societeId);
  const tqParams = useParamsAnnuels(societeId);
  const tqSanctions = useSanctions(societeId);

  // Raccourcis lisibles (même noms que l'ancien useState)
  const employes = tqEmployes.employes;
  const articles = tqArticles.articles;
  const fournisseurs = tqFournisseurs.fournisseurs;
  const categoriesStock = tqCategories.categoriesStock;
  const immobilisations = tqImmobilisations.immobilisations;
  const paramsAnnuels = tqParams.paramsAnnuels;
  const sanctions = tqSanctions.sanctions;

  // ─── Statut Google Drive ───────────────────────────────────────────────────
  const [driveStatus, setDriveStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [driveLastBackup, setDriveLastBackup] = useState<Date | null>(null);
  const [driveLastError, setDriveLastError] = useState<string | null>(null);
  const driveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const significantWritesRef = useRef<number>(0);

  const localSig = useRef<Record<string, string>>({});
  const offlineMode = useRef<boolean>(false);
  const offlineToastShown = useRef<boolean>(false);

  const notifyOffline = useCallback(() => {
    if (!offlineToastShown.current) {
      offlineToastShown.current = true;
      toast.error(
        "Connexion au serveur indisponible — les modifications sont enregistrées localement.",
      );
    }
  }, []);

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

  const markSignificantWrite = useCallback(() => {
    significantWritesRef.current += 1;
    if (driveDebounceRef.current) clearTimeout(driveDebounceRef.current);
    driveDebounceRef.current = setTimeout(() => { void flushDriveBackup(); }, 30_000);
  }, [flushDriveBackup]);

  const triggerDriveBackup = useCallback(async () => {
    if (driveDebounceRef.current) {
      clearTimeout(driveDebounceRef.current);
      driveDebounceRef.current = null;
    }
    await flushDriveBackup();
  }, [flushDriveBackup]);

  // ─── applyValue : seulement pour les 2 clés app_state restantes ───────────
  const applyValue = useCallback((key: string, value: unknown) => {
    switch (key) {
      case K_DONNEES:
        setDonneesMensuelles((value as DonneesMensuelles) || {});
        break;
      case K_TAUX: {
        const arr = Array.isArray(value) ? (value as TauxFiscaux[]) : [];
        setTauxHistorique(arr.length ? arr : [TAUX_DEFAUT]);
        break;
      }
    }
  }, []);

  // ─── Reset au changement de société ───────────────────────────────────────
  // Seuls donneesMensuelles et tauxHistorique sont à reseter manuellement ;
  // les hooks TQ se réinitialisent automatiquement quand societeId change.
  useEffect(() => {
    setLoaded(false);
    setDonneesMensuelles({});
    setTauxHistorique([TAUX_DEFAUT]);
    localSig.current = {};
    offlineMode.current = false;
    offlineToastShown.current = false;

    // Purge des clés localStorage des entités migrées (one-shot par société)
    if (societeId) {
      try {
        LEGACY_KEYS.forEach((k) => {
          localStorage.removeItem(lsKey(k, societeId));
          localStorage.removeItem(lsKey(k, null));
        });
      } catch { /* ignore */ }
    }
  }, [societeId]);

  // ─── Chargement initial + Realtime (app_state : K_DONNEES + K_TAUX) ───────
  useEffect(() => {
    let cancelled = false;

    const loadFromLocal = () => {
      for (const key of ALL_KEYS) {
        const v = lsRead(key, societeId);
        if (v !== null) {
          localSig.current[key] = JSON.stringify(v);
          applyValue(key, v);
        }
      }
    };

    (async () => {
      try {
        const dbKeys = societeId
          ? ALL_KEYS.map((k) => tk(societeId, k))
          : [...ALL_KEYS as unknown as string[]];

        const { data, error } = await supabase
          .from("app_state")
          .select("key,value")
          .in("key", dbKeys);

        if (error) throw error;

        if (!cancelled && data) {
          const seenKeys = new Set<string>();
          for (const row of data) {
            const raw = societeId ? untk(row.key, societeId) : row.key;
            if (!raw) continue;
            seenKeys.add(raw);
            const sig = JSON.stringify(row.value);
            localSig.current[raw] = sig;
            applyValue(raw, row.value);
            lsWrite(raw, societeId, row.value);
          }
          for (const key of ALL_KEYS) {
            if (seenKeys.has(key)) continue;
            const localValue = lsRead(key, societeId);
            if (localValue !== null) {
              localSig.current[key] = JSON.stringify(localValue);
              applyValue(key, localValue);
            }
          }
        }
      } catch (err) {
        offlineMode.current = true;
        notifyOffline();
        if (!cancelled) loadFromLocal();
        console.error("[useEbeneStoreRemote] load failed:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const scopePrefix = societeId ? `s:${societeId}:` : null;
      const realtimeFilter = scopePrefix ? `key=like.${scopePrefix}%` : undefined;
      const channelConfig = realtimeFilter
        ? { event: "*" as const, schema: "public", table: "app_state", filter: realtimeFilter }
        : { event: "*" as const, schema: "public", table: "app_state" };
      channel = supabase
        .channel(`app_state_sync_remote_${societeId ?? "anon"}`)
        .on("postgres_changes", channelConfig, (payload) => {
          const row = (payload.new ?? payload.old) as { key?: string; value?: unknown };
          if (!row?.key) return;
          if (scopePrefix && !row.key.startsWith(scopePrefix)) return;
          const raw = societeId ? untk(row.key, societeId) : row.key;
          if (!raw) return;
          if (!(ALL_KEYS as readonly string[]).includes(raw)) return;
          const sig = JSON.stringify(row.value);
          if (localSig.current[raw] === sig) return;
          localSig.current[raw] = sig;
          applyValue(raw, row.value);
          lsWrite(raw, societeId, row.value);
        })
        .subscribe();
    } catch (err) {
      console.error("[useEbeneStoreRemote] realtime subscribe failed:", err);
    }

    return () => {
      cancelled = true;
      if (channel) { try { supabase.removeChannel(channel); } catch { /* ignore */ } }
    };
  }, [applyValue, notifyOffline, societeId]);

  // ─── Persistance app_state (K_DONNEES + K_TAUX uniquement) ───────────────
  const persist = useCallback(
    async (key: string, value: unknown) => {
      const sig = JSON.stringify(value);
      if (localSig.current[key] === sig) return;
      localSig.current[key] = sig;
      lsWrite(key, societeId, value);
      const dbKey = societeId ? tk(societeId, key) : key;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("app_state")
          .upsert(
            {
              key: dbKey,
              value: value as never,
              updated_by: userData.user?.id ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
          );
        if (error) throw error;
        setLastSaved(new Date());
        if (offlineMode.current) {
          offlineMode.current = false;
          offlineToastShown.current = false;
        }
      } catch (err) {
        offlineMode.current = true;
        notifyOffline();
        console.error(`[useEbeneStoreRemote] persist(${dbKey}) failed:`, err);
      }
    },
    [notifyOffline, societeId],
  );

  useEffect(() => { if (loaded) persist(K_DONNEES, donneesMensuelles); }, [donneesMensuelles, loaded, persist]);
  useEffect(() => { if (loaded) persist(K_TAUX, tauxHistorique); }, [tauxHistorique, loaded, persist]);

  // ─── Snapshot Drive (lit les données TQ + app_state) ─────────────────────
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
      importerDonnees: () => { /* placeholder */ },
    };
  }, [donneesMensuelles, employes, paramsAnnuels, tauxHistorique, articles, fournisseurs, categoriesStock, sanctions]);

  useEffect(() => {
    return () => {
      if (driveDebounceRef.current) {
        clearTimeout(driveDebounceRef.current);
        driveDebounceRef.current = null;
      }
    };
  }, []);

  // ─── API publique ─────────────────────────────────────────────────────────

  const getMois = useCallback(
    (annee: number, mois: number): MoisData =>
      ensureMois(donneesMensuelles[moisKey(annee, mois)]),
    [donneesMensuelles],
  );

  const updateMois = useCallback(
    (annee: number, mois: number, fn: (m: MoisData) => MoisData) => {
      setDonneesMensuelles((prev) => {
        const k = moisKey(annee, mois);
        const current = ensureMois(prev[k]);
        return { ...prev, [k]: fn(current) };
      });
    },
    [],
  );

  // ─── Transactions (dans donneesMensuelles — app_state) ────────────────────
  const addTransaction = useCallback(
    (annee: number, mois: number, t: Omit<Transaction, "id">) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        transactions: [...m.transactions, { ...t, id: newId() }],
      }));
      markSignificantWrite();
    },
    [updateMois, markSignificantWrite],
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
              : f,
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
    [updateMois, markSignificantWrite],
  );

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
    [updateMois],
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
    [updateMois],
  );

  // ─── Factures (dans donneesMensuelles — app_state) ────────────────────────
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
    [updateMois, markSignificantWrite],
  );

  const updateFacture = useCallback(
    (annee: number, mois: number, id: number, patch: Partial<Facture>) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      }));
    },
    [updateMois],
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
    [updateMois, markSignificantWrite],
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
            x.id === factureId ? { ...x, statut: "payee", transactionId: transId } : x,
          ),
        };
      });
    },
    [updateMois],
  );

  const convertirProforma = useCallback(
    (annee: number, mois: number, factureId: number, nouveauNumero: string) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((x) =>
          x.id === factureId ? { ...x, statut: "en_attente", numero: nouveauNumero } : x,
        ),
      }));
    },
    [updateMois],
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
    [updateMois],
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
    [updateMois],
  );

  // ─── Devis (dans donneesMensuelles — app_state) ───────────────────────────
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
    [updateMois],
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
    [updateMois],
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
    [updateMois],
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
    [addFacture, donneesMensuelles, updateMois],
  );

  // ─── GRH : Primes (dans donneesMensuelles — app_state) ───────────────────
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
    [updateMois],
  );

  const removePrime = useCallback(
    (annee: number, mois: number, employeId: number, primeId: number) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        primes: {
          ...m.primes,
          [employeId]: (m.primes[employeId] || []).filter((p) => p.id !== primeId),
        },
      }));
    },
    [updateMois],
  );

  const validerPrime = useCallback(
    (annee: number, mois: number, employeId: number, primeId: number) => {
      let before: Prime | undefined;
      let after: Prime | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        primes: {
          ...m.primes,
          [employeId]: (m.primes[employeId] || []).map((p) => {
            if (p.id !== primeId) return p;
            before = p;
            after = { ...p, statutValidation: "valide", motifRejet: undefined };
            return after;
          }),
        },
      }));
      void logAction("VALIDER_PRIME", "primes", primeId, before ?? null, after ?? null);
    },
    [updateMois],
  );

  const rejeterPrime = useCallback(
    (annee: number, mois: number, employeId: number, primeId: number, motif: string) => {
      let before: Prime | undefined;
      let after: Prime | undefined;
      updateMois(annee, mois, (m) => ({
        ...m,
        primes: {
          ...m.primes,
          [employeId]: (m.primes[employeId] || []).map((p) => {
            if (p.id !== primeId) return p;
            before = p;
            after = { ...p, statutValidation: "rejete", motifRejet: motif };
            return after;
          }),
        },
      }));
      void logAction("REJETER_PRIME", "primes", primeId, before ?? null, after ?? null);
    },
    [updateMois],
  );

  // ─── GRH : Absences (dans donneesMensuelles — app_state) ─────────────────
  const addAbsence = useCallback(
    (annee: number, mois: number, a: Omit<Absence, "id">) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        absences: [...(m.absences || []), { ...a, id: newId() }],
      }));
    },
    [updateMois],
  );

  const removeAbsence = useCallback(
    (annee: number, mois: number, id: number) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        absences: (m.absences || []).filter((a) => a.id !== id),
      }));
    },
    [updateMois],
  );

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
    [updateMois],
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
    [updateMois],
  );

  // ─── GRH : Heures supplémentaires (dans donneesMensuelles — app_state) ────
  const setHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number, hs: HeuresSup) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        heuresSup: { ...(m.heuresSup || {}), [employeId]: hs },
      }));
    },
    [updateMois],
  );

  const validerHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number) => {
      let before: HeuresSup | undefined;
      let after: HeuresSup | undefined;
      updateMois(annee, mois, (m) => {
        const cur = (m.heuresSup || {})[employeId];
        if (!cur) return m;
        before = cur;
        after = { ...cur, statutValidation: "valide", motifRejet: undefined };
        return { ...m, heuresSup: { ...(m.heuresSup || {}), [employeId]: after } };
      });
      void logAction("VALIDER_HEURES_SUP", "heuresSup", employeId, before ?? null, after ?? null);
    },
    [updateMois],
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
        return { ...m, heuresSup: { ...(m.heuresSup || {}), [employeId]: after } };
      });
      void logAction("REJETER_HEURES_SUP", "heuresSup", employeId, before ?? null, after ?? null);
    },
    [updateMois],
  );

  // ─── GRH : Retenues (dans donneesMensuelles — app_state) ─────────────────
  const setRetenue = useCallback(
    (annee: number, mois: number, employeId: number, montant: number) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        retenues: { ...(m.retenues || {}), [employeId]: montant },
      }));
    },
    [updateMois],
  );

  // ─── Taux fiscaux (app_state) ─────────────────────────────────────────────
  const ajouterTaux = useCallback((t: TauxFiscaux) => {
    setTauxHistorique((prev) =>
      [...prev.filter((x) => x.dateEffet !== t.dateEffet), t].sort(
        (a, b) => new Date(a.dateEffet).getTime() - new Date(b.dateEffet).getTime(),
      ),
    );
  }, []);

  const supprimerTaux = useCallback((dateEffet: string) => {
    setTauxHistorique((prev) => {
      const next = prev.filter((x) => x.dateEffet !== dateEffet);
      return next.length === 0 ? [TAUX_DEFAUT] : next;
    });
  }, []);

  // ─── Paramètres annuels → table relationnelle ─────────────────────────────
  const setParamAnnuel = useCallback(
    (annee: number, patch: Partial<ParamsAnnuels>) => {
      const current = tqParams.getParamAnnuel(annee);
      void tqParams.setParamAnnuel(annee, { ...current, ...patch });
    },
    [tqParams],
  );

  const getParamAnnuel = useCallback(
    (annee: number): ParamsAnnuels => tqParams.getParamAnnuel(annee),
    [tqParams],
  );

  // ─── Employés → table relationnelle ──────────────────────────────────────
  const addEmploye = useCallback(
    (e: Omit<Employe, "id">) => {
      if (!societeId) return;
      const matricule =
        e.matricule?.trim() ? e.matricule : genererMatricule(employes);
      void tqEmployes.addEmploye({ ...e, matricule })
        .then((saved) => {
          // Auto-création du compte portail si l'employé a un email
          if (e.email?.trim()) {
            supabase.functions
              .invoke("admin-users", {
                body: {
                  action: "create_employe_account",
                  email: e.email.trim(),
                  employe_nom: e.nom,
                  societe_id: societeId,
                },
              })
              .then(({ data, error }) => {
                if (!error && data?.ok && data.user_id) {
                  void tqEmployes.updateEmploye(saved.id, {
                    userId: data.user_id as string,
                  });
                }
              })
              .catch(() => undefined);
          }
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la création de l'employé"));
    },
    [societeId, employes, tqEmployes, markSignificantWrite],
  );

  const removeEmploye = useCallback(
    (id: number) => {
      if (!societeId) return;
      void tqEmployes.removeEmploye(id)
        .then(() => markSignificantWrite())
        .catch(() => toast.error("Erreur lors de la suppression de l'employé"));
    },
    [societeId, tqEmployes, markSignificantWrite],
  );

  const updateEmploye = useCallback(
    (id: number, patch: Partial<Employe>) => {
      if (!societeId) return;
      void tqEmployes.updateEmploye(id, patch)
        .catch(() => toast.error("Erreur lors de la mise à jour de l'employé"));
    },
    [societeId, tqEmployes],
  );

  const validerEmploye = useCallback(
    (id: number) => {
      void tqEmployes.validerEmploye(id)
        .then(() => void logAction("VALIDER_EMPLOYE", "employes", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation"));
    },
    [tqEmployes],
  );

  const rejeterEmploye = useCallback(
    (id: number, motif: string) => {
      void tqEmployes.rejeterEmploye(id, motif)
        .then(() => void logAction("REJETER_EMPLOYE", "employes", id, null, { id, motif }))
        .catch(() => toast.error("Erreur lors du rejet"));
    },
    [tqEmployes],
  );

  // ─── Stock : catégories → table relationnelle ─────────────────────────────
  const addCategorieStock = useCallback(
    (nom: string) => {
      void tqCategories.addCategorieStock({ nom })
        .catch(() => toast.error("Erreur lors de l'ajout de la catégorie"));
    },
    [tqCategories],
  );

  const removeCategorieStock = useCallback(
    (id: number) => {
      void tqCategories.removeCategorieStock(id)
        .catch(() => toast.error("Erreur lors de la suppression de la catégorie"));
    },
    [tqCategories],
  );

  // ─── Stock : fournisseurs → table relationnelle ───────────────────────────
  const addFournisseur = useCallback(
    (f: Omit<Fournisseur, "id">) => {
      void tqFournisseurs.addFournisseur(f)
        .catch(() => toast.error("Erreur lors de l'ajout du fournisseur"));
    },
    [tqFournisseurs],
  );

  const updateFournisseur = useCallback(
    (id: number, patch: Partial<Fournisseur>) => {
      // Non exposé dans useFournisseurs pour l'instant — no-op silencieux
      console.warn("[store] updateFournisseur non encore migré", id, patch);
    },
    [],
  );

  const removeFournisseur = useCallback(
    (id: number) => {
      void tqFournisseurs.removeFournisseur(id)
        .catch(() => toast.error("Erreur lors de la suppression du fournisseur"));
    },
    [tqFournisseurs],
  );

  // ─── Stock : articles → table relationnelle ───────────────────────────────
  const addArticle = useCallback(
    (a: Omit<Article, "id">) => {
      void tqArticles.addArticle(a)
        .catch(() => toast.error("Erreur lors de l'ajout de l'article"));
    },
    [tqArticles],
  );

  const updateArticle = useCallback(
    (id: number, patch: Partial<Article>) => {
      void tqArticles.updateArticle(id, patch)
        .catch(() => toast.error("Erreur lors de la mise à jour de l'article"));
    },
    [tqArticles],
  );

  const removeArticle = useCallback(
    (id: number) => {
      void tqArticles.removeArticle(id)
        .catch(() => toast.error("Erreur lors de la suppression de l'article"));
    },
    [tqArticles],
  );

  // ─── Stock : mouvements (dans donneesMensuelles + article mis à jour) ─────
  const addMouvementStock = useCallback(
    (annee: number, mois: number, mvt: Omit<MouvementStock, "id">) => {
      const id = newId();
      updateMois(annee, mois, (m) => ({
        ...m,
        mouvementsStock: [...(m.mouvementsStock || []), { ...mvt, id }],
      }));
      // Mise à jour du stock + PMP dans la table relationnelle
      const article = articles.find((a) => a.id === mvt.articleId);
      if (article && societeId) {
        let nouveauStock = article.stock;
        let nouveauPMP = article.prixAchat;
        if (mvt.type === "entree") {
          const valAvant = article.stock * article.prixAchat;
          const valEntree = mvt.quantite * (mvt.prixUnitaire ?? article.prixAchat);
          nouveauStock = article.stock + mvt.quantite;
          nouveauPMP =
            nouveauStock > 0 ? (valAvant + valEntree) / nouveauStock : article.prixAchat;
        } else if (mvt.type === "sortie") {
          nouveauStock = Math.max(0, article.stock - mvt.quantite);
        } else if (mvt.type === "ajustement") {
          nouveauStock = mvt.quantite;
        }
        void tqArticles.updateArticle(article.id, {
          stock: nouveauStock,
          prixAchat: nouveauPMP,
        }).catch(() => toast.error("Erreur lors de la mise à jour du stock"));
      }
      return id;
    },
    [updateMois, articles, societeId, tqArticles],
  );

  const removeMouvementStock = useCallback(
    (annee: number, mois: number, id: number) => {
      updateMois(annee, mois, (m) => {
        const mvt = (m.mouvementsStock || []).find((x) => x.id === id);
        if (mvt) {
          const article = articles.find((a) => a.id === mvt.articleId);
          if (article && societeId) {
            let nouveauStock = article.stock;
            if (mvt.type === "entree")
              nouveauStock = Math.max(0, article.stock - mvt.quantite);
            if (mvt.type === "sortie") nouveauStock = article.stock + mvt.quantite;
            void tqArticles.updateArticle(article.id, { stock: nouveauStock })
              .catch(() => toast.error("Erreur lors de la mise à jour du stock"));
          }
        }
        return {
          ...m,
          mouvementsStock: (m.mouvementsStock || []).filter((x) => x.id !== id),
        };
      });
    },
    [updateMois, articles, societeId, tqArticles],
  );

  // ─── Sanctions → table relationnelle ─────────────────────────────────────
  const addSanction = useCallback(
    (s: Omit<Sanction, "id">) => {
      void tqSanctions.addSanction(s)
        .then((saved) => void logAction("INSERT", "sanctions", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de l'ajout de la sanction"));
    },
    [tqSanctions],
  );

  const removeSanction = useCallback(
    (id: number) => {
      void tqSanctions.removeSanction(id)
        .then(() => void logAction("DELETE", "sanctions", id, null, null))
        .catch(() => toast.error("Erreur lors de la suppression de la sanction"));
    },
    [tqSanctions],
  );

  const validerSanction = useCallback(
    (id: number) => {
      void tqSanctions.validerSanction(id)
        .then(() => void logAction("VALIDER_SANCTION", "sanctions", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation"));
    },
    [tqSanctions],
  );

  const rejeterSanction = useCallback(
    (id: number, motif: string) => {
      void tqSanctions.rejeterSanction(id, motif)
        .then(() => void logAction("REJETER_SANCTION", "sanctions", id, null, { id, motif }))
        .catch(() => toast.error("Erreur lors du rejet"));
    },
    [tqSanctions],
  );

  // ─── Immobilisations → table relationnelle ────────────────────────────────
  const addImmobilisation = useCallback(
    (i: Omit<Immobilisation, "id">) => {
      const comptes =
        i.comptesSYSCOHADA?.actif
          ? i.comptesSYSCOHADA
          : i.categorie
            ? COMPTES_IMMO_DEFAUT[i.categorie]
            : { actif: "24", amortissementCumule: "284", dotation: "6813" };
      void tqImmobilisations.addImmobilisation({ ...i, comptesSYSCOHADA: comptes })
        .then((saved) => {
          void logAction("INSERT", "immobilisations", saved.id, null, saved);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de l'ajout de l'immobilisation"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqImmobilisations, markSignificantWrite],
  );

  const removeImmobilisation = useCallback(
    (id: number) => {
      void tqImmobilisations.removeImmobilisation(id)
        .then(() => void logAction("DELETE", "immobilisations", id, null, null))
        .catch(() => toast.error("Erreur lors de la suppression de l'immobilisation"));
    },
    [tqImmobilisations],
  );

  const updateImmobilisation = useCallback(
    (id: number, patch: Partial<Immobilisation>) => {
      void tqImmobilisations.updateImmobilisation(id, patch)
        .then(() => void logAction("UPDATE", "immobilisations", id, null, patch))
        .catch(() => toast.error("Erreur lors de la mise à jour de l'immobilisation"));
    },
    [tqImmobilisations],
  );

  const getAmortissements = useCallback(
    (annee: number) => amortissementsAnnee(immobilisations, annee),
    [immobilisations],
  );

  // ─── Import JSON (partiel — entités relationnelles exclues) ──────────────
  const importerDonnees = useCallback(
    (data: {
      donneesMensuelles?: DonneesMensuelles;
      tauxHistorique?: TauxFiscaux[];
    }) => {
      if (
        data.donneesMensuelles &&
        typeof data.donneesMensuelles === "object"
      ) {
        setDonneesMensuelles(data.donneesMensuelles);
      }
      const dataAny = data as { tauxHistorique?: TauxFiscaux[] };
      if (Array.isArray(dataAny.tauxHistorique) && dataAny.tauxHistorique.length)
        setTauxHistorique(dataAny.tauxHistorique);

      toast.info(
        "Import partiel : employés, articles, immobilisations et sanctions " +
        "doivent être importés via leur module respectif.",
      );
    },
    [],
  );

  // ─── Années disponibles ───────────────────────────────────────────────────
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

  // ─── Interface publique (identique à l'ancienne version) ─────────────────
  return {
    donneesMensuelles,
    employes,
    paramsAnnuels,
    tauxHistorique,
    articles,
    fournisseurs,
    categoriesStock,
    sanctions,
    immobilisations,
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
    addImmobilisation,
    removeImmobilisation,
    updateImmobilisation,
    getAmortissements,
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

export function nettoyerAncienCacheLocalStorage(societeId: string) {
  const OLD_PREFIX = "ebene-remote:";
  const SCOPED_PREFIX = `ebene-remote:s:${societeId}:`;
  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(OLD_PREFIX) && !key.startsWith(SCOPED_PREFIX)) {
      const isAnotherSociety = key.startsWith(`${OLD_PREFIX}s:`);
      if (!isAnotherSociety) keysToDelete.push(key);
    }
  }
  if (keysToDelete.length > 0) keysToDelete.forEach((k) => localStorage.removeItem(k));
}
