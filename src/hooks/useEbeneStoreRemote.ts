import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  Article,
  Fournisseur,
  CategorieArticle,
  MouvementStock,
  Sanction,
  Devis,
  Immobilisation,
  COMPTES_IMMO_DEFAUT,
  StatutValidation,
  EcritureComptable,
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
import { useEcritures } from "@/hooks/data/useEcritures";
import { useTauxHistorique } from "@/hooks/data/useTauxHistorique";

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

// Clés localStorage à purger au changement de société (entités migrées en Supabase)
const LEGACY_KEYS = [
  "tauxHistorique",
  "employes",
  "paramsAnnuels",
  "articles",
  "fournisseurs",
  "categoriesStock",
  "sanctions",
  "immobilisations",
  "donneesMensuelles",
] as const;

// ─── Helpers localStorage (purge des anciennes clés uniquement) ──────────────
const LS_PREFIX = "ebene-remote:";
const lsKey = (k: string, sid: string | null) =>
  sid ? `${LS_PREFIX}s:${sid}:${k}` : `${LS_PREFIX}${k}`;

// ─── Filtrage par compartiment d'activité ────────────────────────────────────
// Filtre un Record<moisKey, T[]> pour ne garder que les lignes de l'activité
// donnée. Si `activiteId` est null (« Toutes les activités »), renvoie la map
// inchangée (vue consolidée). Les entités GRH ne sont jamais filtrées.
const filterMoisMap = <T extends { activiteId?: string | null }>(
  m: Record<string, T[]>,
  activiteId: string | null,
): Record<string, T[]> => {
  if (!activiteId) return m;
  const out: Record<string, T[]> = {};
  for (const [k, v] of Object.entries(m)) {
    out[k] = v.filter((r) => r.activiteId === activiteId);
  }
  return out;
};

export interface EbeneStoreOptions {
  /** Compartiment d'activité filtré. null = « Toutes les activités » (consolidé). */
  activiteId?: string | null;
  /**
   * Activité par défaut (« Général ») pour estampiller les nouvelles saisies
   * lorsque la vue consolidée est active. Sert de repli quand `activiteId` null.
   */
  defaultActiviteId?: string | null;
}

export const useEbeneStoreRemote = (
  societeId: string | null = null,
  options?: EbeneStoreOptions,
) => {
  const qc = useQueryClient();
  const activiteId = options?.activiteId ?? null;
  // Activité estampillée à la création : l'activité sélectionnée, sinon
  // l'activité « Général » (repli), sinon rien (sociétés sans activités).
  const stampActiviteId = activiteId ?? options?.defaultActiviteId ?? null;

  // ─── Purge du cache React Query lors d'un changement de société ────────────
  // Évite que les données d'une société précédente restent visibles pendant
  // le chargement des données de la nouvelle société.
  const prevSocieteIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSocieteIdRef.current;
    if (prev !== null && prev !== societeId) {
      // Supprime toutes les entrées de cache qui appartiennent à l'ancienne société
      qc.removeQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[1] === prev;
        },
      });
    }
    prevSocieteIdRef.current = societeId;
  }, [societeId, qc]);

  const [lastSaved, setLastSaved] = useState<Date>(new Date());

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
  const tqEcritures  = useEcritures(societeId);
  const tqTaux       = useTauxHistorique(societeId);

  // ─── Taux fiscaux (depuis table relationnelle) ───────────────────────────
  const tauxHistorique = tqTaux.tauxHistorique;

  // ─── Audit avec societe_id automatique ──────────────────────────────────────
  // Wrapper sur logAction qui injecte le societeId courant comme dernier argument.
  const log = useCallback(
    (
      action: string,
      table: string,
      id: number | string | null,
      before: unknown = null,
      after: unknown = null,
    ) => logAction(action as never, table, id, before, after, societeId),
    [societeId],
  );

  // Raccourcis lisibles (même noms que l'ancien useState)
  const employes = tqEmployes.employes;
  const articles = tqArticles.articles; // liste brute (usage interne : recalcul stock)
  const fournisseurs = tqFournisseurs.fournisseurs;
  const categoriesStock = tqCategories.categoriesStock;
  const immobilisationsRaw = tqImmobilisations.immobilisations; // brute (usage interne)
  const paramsAnnuels = tqParams.paramsAnnuels;
  const sanctions = tqSanctions.sanctions;

  // ─── Vues filtrées par activité (exposées aux composants) ─────────────────
  const articlesVisibles = useMemo(
    () => (activiteId ? articles.filter((a) => a.activiteId === activiteId) : articles),
    [articles, activiteId],
  );
  const immobilisations = useMemo(
    () =>
      activiteId
        ? immobilisationsRaw.filter((i) => i.activiteId === activiteId)
        : immobilisationsRaw,
    [immobilisationsRaw, activiteId],
  );
  const fTransactions = useMemo(
    () => filterMoisMap(tqTransactions.transactions, activiteId),
    [tqTransactions.transactions, activiteId],
  );
  const fFactures = useMemo(
    () => filterMoisMap(tqFactures.factures, activiteId),
    [tqFactures.factures, activiteId],
  );
  const fDevis = useMemo(
    () => filterMoisMap(tqDevis.devis, activiteId),
    [tqDevis.devis, activiteId],
  );
  const fEcritures = useMemo(
    () => filterMoisMap(tqEcritures.ecritures, activiteId),
    [tqEcritures.ecritures, activiteId],
  );
  const fMouvements = useMemo(
    () => filterMoisMap(tqMouvements.mouvementsStock, activiteId),
    [tqMouvements.mouvementsStock, activiteId],
  );

  // ─── donneesMensuelles : calculé depuis tous les hooks TQ ─────────────────
  // Remplace complètement l'ancien useState. Toutes les entités mensuelles
  // proviennent des tables relationnelles Supabase via TanStack Query.
  const donneesMensuelles = useMemo<DonneesMensuelles>(() => {
    const allKeys = new Set<string>([
      ...Object.keys(fTransactions),
      ...Object.keys(fFactures),
      ...Object.keys(tqAbsences.absences),
      ...Object.keys(tqPrimes.primes),
      ...Object.keys(tqHeuresSup.heuresSup),
      ...Object.keys(tqRetenues.retenues),
      ...Object.keys(fMouvements),
      ...Object.keys(fDevis),
      ...Object.keys(fEcritures),
    ]);
    const result: DonneesMensuelles = {};
    for (const key of allKeys) {
      result[key] = {
        transactions: fTransactions[key] ?? [],
        factures: fFactures[key] ?? [],
        absences: tqAbsences.absences[key] ?? [],
        primes: tqPrimes.primes[key] ?? {},
        heuresSup: tqHeuresSup.heuresSup[key] ?? {},
        retenues: tqRetenues.retenues[key] ?? {},
        mouvementsStock: fMouvements[key] ?? [],
        devis: fDevis[key] ?? [],
        ecritures: fEcritures[key] ?? [],
      };
    }
    return result;
  }, [
    fTransactions,
    fFactures,
    tqAbsences.absences,
    tqPrimes.primes,
    tqHeuresSup.heuresSup,
    tqRetenues.retenues,
    fMouvements,
    fDevis,
    fEcritures,
  ]);

  // ─── Statut Google Drive ───────────────────────────────────────────────────
  const [driveStatus, setDriveStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [driveLastBackup, setDriveLastBackup] = useState<Date | null>(null);
  const [driveLastError, setDriveLastError] = useState<string | null>(null);
  const driveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const significantWritesRef = useRef<number>(0);

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

  // ─── Purge localStorage des entités migrées au changement de société ────────
  // Les hooks TQ se réinitialisent automatiquement quand societeId change.
  useEffect(() => {
    if (!societeId) return;
    try {
      LEGACY_KEYS.forEach((k) => {
        localStorage.removeItem(lsKey(k, societeId));
        localStorage.removeItem(lsKey(k, null));
      });
    } catch { /* ignore */ }
  }, [societeId]);

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
        transactions: fTransactions[key] ?? [],
        factures: fFactures[key] ?? [],
        absences: tqAbsences.absences[key] ?? [],
        primes: tqPrimes.primes[key] ?? {},
        heuresSup: tqHeuresSup.heuresSup[key] ?? {},
        retenues: tqRetenues.retenues[key] ?? {},
        mouvementsStock: fMouvements[key] ?? [],
        devis: fDevis[key] ?? [],
        ecritures: fEcritures[key] ?? [],
      };
    },
    [
      fTransactions,
      fFactures,
      tqAbsences.absences,
      tqPrimes.primes,
      tqHeuresSup.heuresSup,
      tqRetenues.retenues,
      fMouvements,
      fDevis,
      fEcritures,
    ],
  );

  // ─── Transactions → table relationnelle ──────────────────────────────────
  const addTransaction = useCallback(
    (annee: number, mois: number, t: Omit<Transaction, "id">) => {
      const aid = t.activiteId ?? stampActiviteId;
      void tqTransactions.addTransaction(annee, mois, { ...t, activiteId: aid })
        .then((saved) => {
          log("INSERT", "transactions", saved.id, null, saved);
          markSignificantWrite();

          // Auto-générer une écriture AC si c'est une dépense fournisseur
          if (t.type === "d" && t.source === "fournisseur" && t.fournisseur) {
            const montantTTC = Math.round(Math.abs(t.m));
            const montantHT  = Math.round(montantTTC / 1.18);
            const montantTVA = montantTTC - montantHT;

            void tqEcritures.addEcriture(annee, mois, {
              journal: "AC",
              numeroPiece: `AC-${saved.id}`,
              libelle: t.desc || `Achat — ${t.fournisseur}`,
              lignes: [
                { id: 1, compte: "6057", intitule: "Achats de services et prestations", debit: montantHT,  credit: 0,          tiers: t.fournisseur },
                { id: 2, compte: "4452", intitule: "TVA récupérable sur achats",        debit: montantTVA, credit: 0 },
                { id: 3, compte: "4011", intitule: "Fournisseurs",                      debit: 0,          credit: montantTTC, tiers: t.fournisseur },
              ],
              statut: "brouillon", // nécessite validation chef compta
              activiteId: aid,
              annee,
              mois,
            }).catch(() => {
              console.warn("[EBENE] Écriture AC auto non créée pour transaction", saved.id);
            });
          }
        })
        .catch(() => toast.error("Erreur lors de l'ajout de la transaction"));
    },
    [tqTransactions, tqEcritures, markSignificantWrite, log, stampActiviteId],
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
          log("DELETE", "transactions", id, trans ?? null, null);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la suppression de la transaction"));
    },
    [tqTransactions, tqFactures, markSignificantWrite],
  );

  const validerTransaction = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqTransactions.validerTransaction(id)
        .then(() => log("VALIDER_TRANSACTION", "transactions", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation de la transaction"));
    },
    [tqTransactions],
  );

  const rejeterTransaction = useCallback(
    (_annee: number, _mois: number, id: number, motif: string) => {
      void tqTransactions.rejeterTransaction(id, motif)
        .then(() => log("REJETER_TRANSACTION", "transactions", id, null, { id, motif }))
        .catch(() => toast.error("Erreur lors du rejet de la transaction"));
    },
    [tqTransactions],
  );

  // ─── Factures → table relationnelle ──────────────────────────────────────
  const addFacture = useCallback(
    (annee: number, mois: number, f: Omit<Facture, "id">) => {
      void tqFactures.createFacture(annee, mois, { ...f, activiteId: f.activiteId ?? stampActiviteId })
        .then((saved) => {
          log("INSERT", "factures", saved.id, null, saved);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la création de la facture"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqFactures, markSignificantWrite, stampActiviteId],
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
          log("DELETE", "factures", id, f ?? null, null);
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

      // Compte produit selon activité
      const compteVente  = f.activite === "commerce" ? "701" : "706";
      const libelleVente = f.activite === "commerce"
        ? "Ventes de marchandises"
        : "Services vendus";

      // Lignes SYSCOHADA journal VE
      const lignesEcriture = f.avecTva
        ? [
            { id: 1, compte: "4111",       intitule: "Clients",                  debit: Math.round(f.totalTtc), credit: 0,                       tiers: f.client },
            { id: 2, compte: compteVente,  intitule: libelleVente,               debit: 0,                      credit: Math.round(f.totalHT),   tiers: f.client },
            { id: 3, compte: "4431",       intitule: "TVA facturée sur ventes",  debit: 0,                      credit: Math.round(f.totalTva) },
          ]
        : [
            { id: 1, compte: "4111",       intitule: "Clients",                  debit: Math.round(f.totalHT),  credit: 0,                       tiers: f.client },
            { id: 2, compte: compteVente,  intitule: libelleVente,               debit: 0,                      credit: Math.round(f.totalHT),   tiers: f.client },
          ];

      const aid = f.activiteId ?? stampActiviteId;
      void tqTransactions.addTransaction(annee, mois, {
        date: f.date,
        desc: `Facture ${f.numero} — ${f.client}`,
        type: "r",
        m: f.totalTtc,
        source: "facture",
        factureId: f.id,
        activite: f.activite,
        activiteId: aid,
      })
        .then((trans) =>
          Promise.all([
            // Mettre à jour statut facture
            tqFactures.updateFacture(factureId, {
              statut: "payee",
              transactionId: trans.id,
            }),
            // Créer l'écriture SYSCOHADA dans journal VE (auto-validée)
            tqEcritures.addEcriture(annee, mois, {
              journal: "VE",
              numeroPiece: `VE-${f.numero}`,
              libelle: `Facture ${f.numero} — ${f.client}`,
              lignes: lignesEcriture,
              statut: "valide",
              factureId: f.id,
              activiteId: aid,
              annee,
              mois,
            }),
          ])
        )
        .then(() => {
          log("MARQUER_PAYEE", "factures", factureId, null, {
            factureId,
            ecriture: "VE générée automatiquement",
          });
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors du marquage comme payée"));
    },
    [tqFactures, tqTransactions, tqEcritures, markSignificantWrite, log, stampActiviteId],
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
        .then(() => log("VALIDER_FACTURE", "factures", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation de la facture"));
    },
    [tqFactures],
  );

  const rejeterFacture = useCallback(
    (_annee: number, _mois: number, id: number, motif: string) => {
      void tqFactures.rejeterFacture(id, motif)
        .then(() => log("REJETER_FACTURE", "factures", id, null, { id, motif }))
        .catch(() => toast.error("Erreur lors du rejet de la facture"));
    },
    [tqFactures],
  );

  // ─── Devis → table relationnelle ─────────────────────────────────────────
  const addDevis = useCallback(
    (annee: number, mois: number, d: Omit<Devis, "id">) => {
      void tqDevis.createDevis(annee, mois, {
        ...d,
        statut: d.statut || "envoye",
        activiteId: d.activiteId ?? stampActiviteId,
      })
        .then((saved) => log("INSERT", "devis", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de la création du devis"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqDevis, stampActiviteId],
  );

  const removeDevis = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqDevis.removeDevis(id)
        .then(() => log("DELETE", "devis", id, null, null))
        .catch(() => toast.error("Erreur lors de la suppression du devis"));
    },
    [tqDevis],
  );

  const updateDevis = useCallback(
    (_annee: number, _mois: number, id: number, patch: Partial<Devis>) => {
      void tqDevis.updateDevis(id, patch as Parameters<typeof tqDevis.updateDevis>[1])
        .then(() => log("UPDATE", "devis", id, null, patch))
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
        activiteId: d.activiteId ?? stampActiviteId,
      })
        .then((facture) =>
          tqDevis.updateDevis(devisId, { statut: "converti", factureId: facture.id })
            .then(() =>
              log("CONVERTIR_DEVIS", "devis", devisId, d, {
                ...d,
                statut: "converti",
                factureId: facture.id,
              })
            )
        )
        .catch(() => toast.error("Erreur lors de la conversion du devis en facture"));
      return null; // ID disponible après invalidation TQ
    },
    [tqDevis, tqFactures, stampActiviteId],
  );

  // ─── GRH : Primes → table relationnelle ──────────────────────────────────
  const addPrime = useCallback(
    (annee: number, mois: number, employeId: number, prime: Omit<Prime, "id">) => {
      void tqPrimes.addPrime(annee, mois, employeId, prime)
        .then((saved) => log("INSERT", "primes", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de l'ajout de la prime"));
    },
    [tqPrimes],
  );

  const removePrime = useCallback(
    (_annee: number, _mois: number, _employeId: number, primeId: number) => {
      void tqPrimes.removePrime(primeId)
        .then(() => log("DELETE", "primes", primeId, null, null))
        .catch(() => toast.error("Erreur lors de la suppression de la prime"));
    },
    [tqPrimes],
  );

  const validerPrime = useCallback(
    (_annee: number, _mois: number, _employeId: number, primeId: number) => {
      void tqPrimes.validerPrime(primeId)
        .then(() => log("VALIDER_PRIME", "primes", primeId, null, { id: primeId }))
        .catch(() => toast.error("Erreur lors de la validation de la prime"));
    },
    [tqPrimes],
  );

  const rejeterPrime = useCallback(
    (_annee: number, _mois: number, _employeId: number, primeId: number, motif: string) => {
      void tqPrimes.rejeterPrime(primeId, motif)
        .then(() => log("REJETER_PRIME", "primes", primeId, null, { id: primeId, motif }))
        .catch(() => toast.error("Erreur lors du rejet de la prime"));
    },
    [tqPrimes],
  );

  // ─── GRH : Absences → table relationnelle ────────────────────────────────
  const addAbsence = useCallback(
    (annee: number, mois: number, a: Omit<Absence, "id">) => {
      void tqAbsences.addAbsence(annee, mois, a)
        .then((saved) => log("INSERT", "absences", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de l'ajout de l'absence"));
    },
    [tqAbsences],
  );

  const removeAbsence = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqAbsences.removeAbsence(id)
        .then(() => log("DELETE", "absences", id, null, null))
        .catch(() => toast.error("Erreur lors de la suppression de l'absence"));
    },
    [tqAbsences],
  );

  const validerAbsence = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqAbsences.validerAbsence(id)
        .then(() => log("VALIDER_ABSENCE", "absences", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation de l'absence"));
    },
    [tqAbsences],
  );

  const rejeterAbsence = useCallback(
    (_annee: number, _mois: number, id: number, motif: string) => {
      void tqAbsences.rejeterAbsence(id, motif)
        .then(() => log("REJETER_ABSENCE", "absences", id, null, { id, motif }))
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
        .then(() => log("VALIDER_HEURES_SUP", "heures_sup", employeId, null, { employeId }))
        .catch(() => toast.error("Erreur lors de la validation des heures sup"));
    },
    [tqHeuresSup],
  );

  const rejeterHeuresSup = useCallback(
    (annee: number, mois: number, employeId: number, motif: string) => {
      void tqHeuresSup.rejeterHeuresSup(annee, mois, employeId, motif)
        .then(() => log("REJETER_HEURES_SUP", "heures_sup", employeId, null, { employeId, motif }))
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

  // ─── Taux fiscaux (table relationnelle taux_historique) ──────────────────
  const ajouterTaux = useCallback(
    (t: TauxFiscaux) => {
      void tqTaux.upsertTaux(t)
        .catch(() => toast.error("Erreur lors de la sauvegarde du taux fiscal"));
    },
    [tqTaux],
  );

  const supprimerTaux = useCallback(
    (dateEffet: string) => {
      void tqTaux.removeTaux(dateEffet)
        .catch(() => toast.error("Erreur lors de la suppression du taux fiscal"));
    },
    [tqTaux],
  );

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
        .then(() => {
          log("DELETE", "employes", id, null, null);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la suppression de l'employé"));
    },
    [societeId, tqEmployes, markSignificantWrite],
  );

  const restoreEmploye = useCallback(
    (id: number) => {
      if (!societeId) return;
      void tqEmployes.restoreEmploye(id)
        .then(() => toast.success("Employé restauré"))
        .catch(() => toast.error("Erreur lors de la restauration"));
    },
    [societeId, tqEmployes],
  );

  const purgeEmploye = useCallback(
    (id: number) => {
      if (!societeId) return;
      void tqEmployes.purgeEmploye(id)
        .then(() => toast.success("Supprimé définitivement"))
        .catch(() => toast.error("Erreur lors de la suppression définitive"));
    },
    [societeId, tqEmployes],
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
        .then(() => log("VALIDER_EMPLOYE", "employes", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation"));
    },
    [tqEmployes],
  );

  const rejeterEmploye = useCallback(
    (id: number, motif: string) => {
      void tqEmployes.rejeterEmploye(id, motif)
        .then(() => log("REJETER_EMPLOYE", "employes", id, null, { id, motif }))
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
      void tqArticles.addArticle({ ...a, activiteId: a.activiteId ?? stampActiviteId })
        .catch(() => toast.error("Erreur lors de l'ajout de l'article"));
    },
    [tqArticles, stampActiviteId],
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
      // Estampille le mouvement avec l'activité de l'article, sinon l'activité courante.
      const articleAid = articles.find((a) => a.id === mvt.articleId)?.activiteId;
      void tqMouvements.createMouvement(annee, mois, {
        ...mvt,
        activiteId: mvt.activiteId ?? articleAid ?? stampActiviteId,
      })
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
    [tqMouvements, articles, societeId, tqArticles, stampActiviteId],
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
        .then((saved) => log("INSERT", "sanctions", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de l'ajout de la sanction"));
    },
    [tqSanctions],
  );

  const removeSanction = useCallback(
    (id: number) => {
      void tqSanctions.removeSanction(id)
        .then(() => log("DELETE", "sanctions", id, null, null))
        .catch(() => toast.error("Erreur lors de la suppression de la sanction"));
    },
    [tqSanctions],
  );

  const validerSanction = useCallback(
    (id: number) => {
      void tqSanctions.validerSanction(id)
        .then(() => log("VALIDER_SANCTION", "sanctions", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation"));
    },
    [tqSanctions],
  );

  const rejeterSanction = useCallback(
    (id: number, motif: string) => {
      void tqSanctions.rejeterSanction(id, motif)
        .then(() => log("REJETER_SANCTION", "sanctions", id, null, { id, motif }))
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
      void tqImmobilisations.addImmobilisation({
        ...i,
        comptesSYSCOHADA: comptes,
        activiteId: i.activiteId ?? stampActiviteId,
      })
        .then((saved) => {
          log("INSERT", "immobilisations", saved.id, null, saved);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de l'ajout de l'immobilisation"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqImmobilisations, markSignificantWrite, stampActiviteId],
  );

  const removeImmobilisation = useCallback(
    (id: number) => {
      void tqImmobilisations.removeImmobilisation(id)
        .then(() => log("DELETE", "immobilisations", id, null, null))
        .catch(() => toast.error("Erreur lors de la suppression de l'immobilisation"));
    },
    [tqImmobilisations],
  );

  const updateImmobilisation = useCallback(
    (id: number, patch: Partial<Immobilisation>) => {
      void tqImmobilisations.updateImmobilisation(id, patch)
        .then(() => log("UPDATE", "immobilisations", id, null, patch))
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
      if (Array.isArray(dataAny.tauxHistorique) && dataAny.tauxHistorique.length) {
        void tqTaux.upsertBatch(dataAny.tauxHistorique)
          .catch(() => toast.error("Erreur lors de l'import des taux fiscaux"));
      }

      toast.info(
        "Import partiel : seul tauxHistorique est importé. " +
        "Toutes les entités métier (factures, devis, stock, employés…) " +
        "sont stockées dans Supabase et doivent être importées via leur module respectif.",
      );
    },
    [tqTaux],
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

  // ─── Écritures comptables SYSCOHADA → table relationnelle ────────────────
  const addEcriture = useCallback(
    (annee: number, mois: number, e: Omit<EcritureComptable, "id">) => {
      void tqEcritures.addEcriture(annee, mois, { ...e, activiteId: e.activiteId ?? stampActiviteId })
        .then((saved) => {
          log("INSERT", "ecritures_comptables", saved.id, null, saved);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de l'ajout de l'écriture"));
    },
    [tqEcritures, markSignificantWrite, log, stampActiviteId],
  );

  const updateEcriture = useCallback(
    (_annee: number, _mois: number, id: number, patch: Partial<EcritureComptable>) => {
      void tqEcritures.updateEcriture(id, patch)
        .catch(() => toast.error("Erreur lors de la mise à jour de l'écriture"));
    },
    [tqEcritures],
  );

  const removeEcriture = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqEcritures.removeEcriture(id)
        .then(() => {
          log("DELETE", "ecritures_comptables", id, null, null);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la suppression de l'écriture"));
    },
    [tqEcritures, markSignificantWrite, log],
  );

  const validerEcriture = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqEcritures.validerEcriture(id)
        .then(() => log("VALIDER_ECRITURE", "ecritures_comptables", id, null, { id }))
        .catch(() => toast.error("Erreur lors de la validation de l'écriture"));
    },
    [tqEcritures, log],
  );

  const rejeterEcriture = useCallback(
    (_annee: number, _mois: number, id: number, motif: string) => {
      void tqEcritures.rejeterEcriture(id, motif)
        .then(() => log("REJETER_ECRITURE", "ecritures_comptables", id, null, { id, motif }))
        .catch(() => toast.error("Erreur lors du rejet de l'écriture"));
    },
    [tqEcritures, log],
  );

  // ─── Interface publique (identique à l'ancienne version) ─────────────────
  return {
    donneesMensuelles,
    employes,
    paramsAnnuels,
    tauxHistorique,
    articles: articlesVisibles,
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
    restoreEmploye,
    purgeEmploye,
    employesCorbeille: tqEmployes.employesCorbeille,
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
    // ─── Écritures SYSCOHADA ───
    addEcriture,
    updateEcriture,
    removeEcriture,
    validerEcriture,
    rejeterEcriture,
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
