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
  StatutValidation,
} from "@/types/ebene";
import { moisKey, genererMatricule } from "@/lib/ebene-utils";
import { backupToDrive, type EbeneStoreLike } from "@/lib/googleDrive";
import { amortissementsAnnee } from "@/lib/amortissements";
import { logAction } from "@/lib/audit";

// ─── Hooks data relationnels ─────────────────────────────────────────────────
import { useEmployes } from "@/hooks/data/useEmployes";
import { useArticles } from "@/hooks/data/useArticles";
import { useFournisseurs } from "@/hooks/data/useFournisseurs";
import { useCategoriesStock } from "@/hooks/data/useCategoriesStock";
import { useImmobilisations } from "@/hooks/data/useImmobilisations";
import { useParamsAnnuels } from "@/hooks/data/useParamsAnnuels";
import { useSanctions } from "@/hooks/data/useSanctions";
import { useAbsences } from "@/hooks/data/useAbsences";
import { useHeuresSup } from "@/hooks/data/useHeuresSup";
import { usePrimes } from "@/hooks/data/usePrimes";
import { useRetenues } from "@/hooks/data/useRetenues";
import { useTransactions } from "@/hooks/data/useTransactions";
import { useFactures } from "@/hooks/data/useFactures";
import { useDevis } from "@/hooks/data/useDevis";
import { useMouvementsStock } from "@/hooks/data/useMouvementsStock";

/**
 * useEbeneStoreRemote — v3 (migration complète vers Supabase)
 *
 * TOUTES les entités métier sont lues et écrites via les tables relationnelles
 * Supabase (hooks TanStack Query). Seul `tauxHistorique` reste en app_state
 * (configuration fiscale versionnée, non-entité business).
 *
 * `donneesMensuelles` est un useMemo calculé depuis les hooks TQ — il reste
 * disponible dans l'interface publique pour Dashboard, RecapAnnuelModal, etc.
 *
 * L'interface publique exposée aux composants est IDENTIQUE à l'ancienne —
 * aucun composant n'a besoin d'être modifié.
 */

// ─── Seule clé app_state restante ────────────────────────────────────────────
const K_TAUX = "tauxHistorique";
const ALL_KEYS = [K_TAUX] as const;

// Clés conservées pour la purge localStorage au changement de société
const LEGACY_KEYS = [
  "employes",
  "paramsAnnuels",
  "articles",
  "fournisseurs",
  "categoriesStock",
  "sanctions",
  "immobilisations",
  "donneesMensuelles",
] as const;

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


export const useEbeneStoreRemote = (societeId: string | null = null) => {
  // ─── État app_state (tauxHistorique uniquement) ───────────────────────────
  // donneesMensuelles est désormais calculé depuis les hooks TQ (voir useMemo
  // plus bas). Plus aucune entité n'est stockée dans app_state sauf tauxHistorique.
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
  const tqAbsences = useAbsences(societeId);
  const tqHeuresSup = useHeuresSup(societeId);
  const tqPrimes = usePrimes(societeId);
  const tqRetenues = useRetenues(societeId);
  const tqTransactions = useTransactions(societeId);
  const tqFactures = useFactures(societeId);
  const tqDevis = useDevis(societeId);
  const tqMouvements = useMouvementsStock(societeId);

  // Raccourcis lisibles (même noms que l'ancien useState)
  const employes = tqEmployes.employes;
  const articles = tqArticles.articles;
  const fournisseurs = tqFournisseurs.fournisseurs;
  const categoriesStock = tqCategories.categoriesStock;
  const immobilisations = tqImmobilisations.immobilisations;
  const paramsAnnuels = tqParams.paramsAnnuels;
  const sanctions = tqSanctions.sanctions;

  // ─── donneesMensuelles : calculé depuis tous les hooks TQ ─────────────────
  // Remplace complètement l'ancien useState. Toutes les entités mensuelles
  // proviennent des tables relationnelles Supabase via TanStack Query.
  const donneesMensuelles = useMemo<DonneesMensuelles>(() => {
    const allKeys = new Set<string>([
      ...Object.keys(tqTransactions.transactions),
      ...Object.keys(tqFactures.factures),
      ...Object.keys(tqAbsences.absences),
      ...Object.keys(tqPrimes.primes),
      ...Object.keys(tqHeuresSup.heuresSup),
      ...Object.keys(tqRetenues.retenues),
      ...Object.keys(tqMouvements.mouvementsStock),
      ...Object.keys(tqDevis.devis),
    ]);
    const result: DonneesMensuelles = {};
    for (const key of allKeys) {
      result[key] = {
        transactions: tqTransactions.transactions[key] ?? [],
        factures: tqFactures.factures[key] ?? [],
        absences: tqAbsences.absences[key] ?? [],
        primes: tqPrimes.primes[key] ?? {},
        heuresSup: tqHeuresSup.heuresSup[key] ?? {},
        retenues: tqRetenues.retenues[key] ?? {},
        mouvementsStock: tqMouvements.mouvementsStock[key] ?? [],
        devis: tqDevis.devis[key] ?? [],
      };
    }
    return result;
  }, [
    tqTransactions.transactions,
    tqFactures.factures,
    tqAbsences.absences,
    tqPrimes.primes,
    tqHeuresSup.heuresSup,
    tqRetenues.retenues,
    tqMouvements.mouvementsStock,
    tqDevis.devis,
  ]);

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
    setLastSaved(new Date());
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

  // ─── applyValue : uniquement pour K_TAUX ─────────────────────────────────
  const applyValue = useCallback((key: string, value: unknown) => {
    if (key === K_TAUX) {
      const arr = Array.isArray(value) ? (value as TauxFiscaux[]) : [];
      setTauxHistorique(arr.length ? arr : [TAUX_DEFAUT]);
    }
  }, []);

  // ─── Reset au changement de société ───────────────────────────────────────
  // tauxHistorique est le seul état manuel — les hooks TQ se réinitialisent
  // automatiquement quand societeId change.
  useEffect(() => {
    setLoaded(false);
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

  // ─── Chargement initial + Realtime (app_state : K_TAUX uniquement) ─────────
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

  // ─── Persistance app_state (K_TAUX uniquement) ───────────────────────────
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
    (annee: number, mois: number): MoisData => {
      const key = moisKey(annee, mois);
      return {
        transactions: tqTransactions.transactions[key] ?? [],
        factures: tqFactures.factures[key] ?? [],
        absences: tqAbsences.absences[key] ?? [],
        primes: tqPrimes.primes[key] ?? {},
        heuresSup: tqHeuresSup.heuresSup[key] ?? {},
        retenues: tqRetenues.retenues[key] ?? {},
        mouvementsStock: tqMouvements.mouvementsStock[key] ?? [],
        devis: tqDevis.devis[key] ?? [],
      };
    },
    [
      tqTransactions.transactions,
      tqFactures.factures,
      tqAbsences.absences,
      tqPrimes.primes,
      tqHeuresSup.heuresSup,
      tqRetenues.retenues,
      tqMouvements.mouvementsStock,
      tqDevis.devis,
    ],
  );

  // ─── Transactions → table relationnelle ──────────────────────────────────
  const addTransaction = useCallback(
    (annee: number, mois: number, t: Omit<Transaction, "id">) => {
      void tqTransactions.addTransaction(annee, mois, t)
        .then((saved) => {
          void logAction("INSERT", "transactions", saved.id, null, saved);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de l'ajout de la transaction"));
    },
    [tqTransactions, markSignificantWrite],
  );

  const removeTransaction = useCallback(
    (annee: number, mois: number, id: number) => {
      const key = moisKey(annee, mois);
      const trans = (tqTransactions.transactions[key] ?? []).find((t) => t.id === id);
      void tqTransactions.removeTransaction(id)
        .then(async () => {
          if (trans?.source === "facture" && trans.factureId) {
            await tqFactures.updateFacture(trans.factureId, {
              statut: "en_attente",
              transactionId: null,
            }).catch(() => undefined);
          }
          void logAction("DELETE", "transactions", id, trans ?? null, null);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la suppression de la transaction"));
    },
    [tqTransactions, tqFactures, markSignificantWrite],
  );

  const validerTransaction = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqTransactions.validerTransaction(id)
        .then(() => void logAction("VALIDER_TRANSACTION", "transactions", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation de la transaction"));
    },
    [tqTransactions],
  );

  const rejeterTransaction = useCallback(
    (_annee: number, _mois: number, id: number, motif: string) => {
      void tqTransactions.rejeterTransaction(id, motif)
        .then(() => void logAction("REJETER_TRANSACTION", "transactions", id, null, { id, motif }))
        .catch(() => toast.error("Erreur lors du rejet de la transaction"));
    },
    [tqTransactions],
  );

  // ─── Factures → table relationnelle ──────────────────────────────────────
  const addFacture = useCallback(
    (annee: number, mois: number, f: Omit<Facture, "id">) => {
      void tqFactures.createFacture(annee, mois, f)
        .then((saved) => {
          void logAction("INSERT", "factures", saved.id, null, saved);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la création de la facture"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqFactures, markSignificantWrite],
  );

  const updateFacture = useCallback(
    (_annee: number, _mois: number, id: number, patch: Partial<Facture>) => {
      void tqFactures.updateFacture(id, patch as Parameters<typeof tqFactures.updateFacture>[1])
        .catch(() => toast.error("Erreur lors de la mise à jour de la facture"));
    },
    [tqFactures],
  );

  const removeFacture = useCallback(
    (annee: number, mois: number, id: number) => {
      const key = moisKey(annee, mois);
      const f = (tqFactures.factures[key] ?? []).find((x) => x.id === id);
      void tqFactures.removeFacture(id)
        .then(async () => {
          if (f?.transactionId) {
            await tqTransactions.removeTransaction(f.transactionId).catch(() => undefined);
          }
          void logAction("DELETE", "factures", id, f ?? null, null);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la suppression de la facture"));
    },
    [tqFactures, tqTransactions, markSignificantWrite],
  );

  const marquerPayee = useCallback(
    (annee: number, mois: number, factureId: number) => {
      const key = moisKey(annee, mois);
      const f = (tqFactures.factures[key] ?? []).find((x) => x.id === factureId);
      if (!f || f.statut === "payee" || f.statut === "proforma") return;
      void tqTransactions.addTransaction(annee, mois, {
        date: f.date,
        desc: `Facture ${f.numero} — ${f.client}`,
        type: "r",
        m: f.totalTtc,
        source: "facture",
        factureId: f.id,
        activite: f.activite,
      })
        .then((trans) =>
          tqFactures.updateFacture(factureId, {
            statut: "payee",
            transactionId: trans.id,
          })
        )
        .catch(() => toast.error("Erreur lors du marquage comme payée"));
    },
    [tqFactures, tqTransactions],
  );

  const convertirProforma = useCallback(
    (_annee: number, _mois: number, factureId: number, nouveauNumero: string) => {
      void tqFactures.updateFacture(factureId, {
        statut: "en_attente",
        numero: nouveauNumero,
      }).catch(() => toast.error("Erreur lors de la conversion du proforma"));
    },
    [tqFactures],
  );

  const validerFacture = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqFactures.validerFacture(id)
        .then(() => void logAction("VALIDER_FACTURE", "factures", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation de la facture"));
    },
    [tqFactures],
  );

  const rejeterFacture = useCallback(
    (_annee: number, _mois: number, id: number, motif: string) => {
      void tqFactures.rejeterFacture(id, motif)
        .then(() => void logAction("REJETER_FACTURE", "factures", id, null, { id, motif }))
        .catch(() => toast.error("Erreur lors du rejet de la facture"));
    },
    [tqFactures],
  );

  // ─── Devis → table relationnelle ─────────────────────────────────────────
  const addDevis = useCallback(
    (annee: number, mois: number, d: Omit<Devis, "id">) => {
      void tqDevis.createDevis(annee, mois, { ...d, statut: d.statut || "envoye" })
        .then((saved) => void logAction("INSERT", "devis", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de la création du devis"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqDevis],
  );

  const removeDevis = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqDevis.removeDevis(id)
        .then(() => void logAction("DELETE", "devis", id, null, null))
        .catch(() => toast.error("Erreur lors de la suppression du devis"));
    },
    [tqDevis],
  );

  const updateDevis = useCallback(
    (_annee: number, _mois: number, id: number, patch: Partial<Devis>) => {
      void tqDevis.updateDevis(id, patch as Parameters<typeof tqDevis.updateDevis>[1])
        .then(() => void logAction("UPDATE", "devis", id, null, patch))
        .catch(() => toast.error("Erreur lors de la mise à jour du devis"));
    },
    [tqDevis],
  );

  const convertirDevisEnFacture = useCallback(
    (annee: number, mois: number, devisId: number, numeroFacture: string): number | null => {
      const key = moisKey(annee, mois);
      const d = (tqDevis.devis[key] ?? []).find((x) => x.id === devisId);
      if (!d) return null;
      void tqFactures.createFacture(annee, mois, {
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
      })
        .then((facture) =>
          tqDevis.updateDevis(devisId, { statut: "converti", factureId: facture.id })
            .then(() =>
              void logAction("CONVERTIR_DEVIS", "devis", devisId, d, {
                ...d,
                statut: "converti",
                factureId: facture.id,
              })
            )
        )
        .catch(() => toast.error("Erreur lors de la conversion du devis en facture"));
      return null; // ID disponible après invalidation TQ
    },
    [tqDevis, tqFactures],
  );

  // ─── GRH : Primes → table relationnelle ──────────────────────────────────
  const addPrime = useCallback(
    (annee: number, mois: number, employeId: number, prime: Omit<Prime, "id">) => {
      void tqPrimes.addPrime(annee, mois, employeId, prime)
        .then((saved) => void logAction("INSERT", "primes", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de l'ajout de la prime"));
    },
    [tqPrimes],
  );

  const removePrime = useCallback(
    (_annee: number, _mois: number, _employeId: number, primeId: number) => {
      void tqPrimes.removePrime(primeId)
        .then(() => void logAction("DELETE", "primes", primeId, null, null))
        .catch(() => toast.error("Erreur lors de la suppression de la prime"));
    },
    [tqPrimes],
  );

  const validerPrime = useCallback(
    (_annee: number, _mois: number, _employeId: number, primeId: number) => {
      void tqPrimes.validerPrime(primeId)
        .then(() => void logAction("VALIDER_PRIME", "primes", primeId, null, { id: primeId }))
        .catch(() => toast.error("Erreur lors de la validation de la prime"));
    },
    [tqPrimes],
  );

  const rejeterPrime = useCallback(
    (_annee: number, _mois: number, _employeId: number, primeId: number, motif: string) => {
      void tqPrimes.rejeterPrime(primeId, motif)
        .then(() => void logAction("REJETER_PRIME", "primes", primeId, null, { id: primeId, motif }))
        .catch(() => toast.error("Erreur lors du rejet de la prime"));
    },
    [tqPrimes],
  );

  // ─── GRH : Absences → table relationnelle ────────────────────────────────
  const addAbsence = useCallback(
    (annee: number, mois: number, a: Omit<Absence, "id">) => {
      void tqAbsences.addAbsence(annee, mois, a)
        .then((saved) => void logAction("INSERT", "absences", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de l'ajout de l'absence"));
    },
    [tqAbsences],
  );

  const removeAbsence = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqAbsences.removeAbsence(id)
        .then(() => void logAction("DELETE", "absences", id, null, null))
        .catch(() => toast.error("Erreur lors de la suppression de l'absence"));
    },
    [tqAbsences],
  );

  const validerAbsence = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqAbsences.validerAbsence(id)
        .then(() => void logAction("VALIDER_ABSENCE", "absences", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation de l'absence"));
    },
    [tqAbsences],
  );

  const rejeterAbsence = useCallback(
    (_annee: number, _mois: number, id: number, motif: string) => {
      void tqAbsences.rejeterAbsence(id, motif)
        .then(() => void logAction("REJETER_ABSENCE", "absences", id, null, { id, motif }))
        .catch(() => toast.error("Erreur lors du rejet de l'absence"));
    },
    [tqAbsences],
  );

  // ─── GRH : Heures supplémentaires → table relationnelle ──────────────────
  const setHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number, hs: HeuresSup) => {
      void tqHeuresSup.setHeuresSup(annee, mois, employeId, hs)
        .catch(() => toast.error("Erreur lors de la mise à jour des heures sup"));
    },
    [tqHeuresSup],
  );

  const validerHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number) => {
      void tqHeuresSup.validerHeuresSup(annee, mois, employeId)
        .then(() => void logAction("VALIDER_HEURES_SUP", "heures_sup", employeId, null, { employeId }))
        .catch(() => toast.error("Erreur lors de la validation des heures sup"));
    },
    [tqHeuresSup],
  );

  const rejeterHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number, motif: string) => {
      void tqHeuresSup.rejeterHeuresSup(annee, mois, employeId, motif)
        .then(() => void logAction("REJETER_HEURES_SUP", "heures_sup", employeId, null, { employeId, motif }))
        .catch(() => toast.error("Erreur lors du rejet des heures sup"));
    },
    [tqHeuresSup],
  );

  // ─── GRH : Retenues → table relationnelle ────────────────────────────────
  const setRetenue = useCallback(
    (annee: number, mois: number, employeId: number, montant: number) => {
      void tqRetenues.setRetenue(annee, mois, employeId, montant)
        .catch(() => toast.error("Erreur lors de la mise à jour de la retenue"));
    },
    [tqRetenues],
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
      void tqFournisseurs.updateFournisseur(id, patch)
        .catch(() => toast.error("Erreur lors de la mise à jour du fournisseur"));
    },
    [tqFournisseurs],
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

  // ─── Stock : mouvements → table relationnelle ────────────────────────────
  const addMouvementStock = useCallback(
    (annee: number, mois: number, mvt: Omit<MouvementStock, "id">) => {
      void tqMouvements.createMouvement(annee, mois, mvt)
        .then(() => {
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
        })
        .catch(() => toast.error("Erreur lors de l'ajout du mouvement de stock"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqMouvements, articles, societeId, tqArticles],
  );

  const removeMouvementStock = useCallback(
    (annee: number, mois: number, id: number) => {
      const key = moisKey(annee, mois);
      const mvt = (tqMouvements.mouvementsStock[key] ?? []).find((x) => x.id === id);
      void tqMouvements.removeMouvement(id)
        .then(() => {
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
        })
        .catch(() => toast.error("Erreur lors de la suppression du mouvement de stock"));
    },
    [tqMouvements, articles, societeId, tqArticles],
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

  // ─── Import JSON (tauxHistorique uniquement — toutes entités en Supabase) ─
  const importerDonnees = useCallback(
    (data: {
      donneesMensuelles?: DonneesMensuelles;
      tauxHistorique?: TauxFiscaux[];
    }) => {
      const dataAny = data as { tauxHistorique?: TauxFiscaux[] };
      if (Array.isArray(dataAny.tauxHistorique) && dataAny.tauxHistorique.length)
        setTauxHistorique(dataAny.tauxHistorique);

      toast.info(
        "Import partiel : seul tauxHistorique est importé. " +
        "Toutes les entités métier (factures, devis, stock, employés…) " +
        "sont stockées dans Supabase et doivent être importées via leur module respectif.",
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
