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
import { moisKey, genererMatricule, messageErreur, tauxPourMois, todayISO, formatMontant, formatSolde } from "@/lib/ebene-utils";
import { contrePassation, ecrituresFacturePayee, estContrePassation } from "@/lib/ecrituresFacture";
import { depassementConges, messageDepassementConges } from "@/lib/conges";
import { manquesStock, messageManques, retoursFacture, sortiesFacture } from "@/lib/venteStock";
import { transactionAchatStock, type AchatStock } from "@/lib/achatStock";
import {
  ecritureAcquisitionImmo, ecrituresDeTransaction, estEcritureDeTransaction, pieceImmobilisation, soldeCaisse, avecCaisseAnnexe,
  type ReglementImmo,
} from "@/lib/ecrituresTresorerie";
import { backupToDrive, type EbeneStoreLike } from "@/lib/googleDrive";
import { amortissementsAnnee } from "@/lib/amortissements";
import {
  appliquerMouvement,
  annulerMouvement,
  ecartAjustement,
  libelleEcart,
  ErreurStock,
} from "@/lib/stock";
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
import { transactionsReversement } from "@/lib/reversement";
import type { DettesPaie } from "@/lib/alertes";
import { ecrituresVariationStock, pieceInventaire } from "@/lib/variationStock";
import { mouvementsTransfert } from "@/lib/achatStock";
import { useActivites } from "@/hooks/data/useActivites";

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
}

export const useEbeneStoreRemote = (
  societeId: string | null = null,
  options?: EbeneStoreOptions,
) => {
  const qc = useQueryClient();
  const activiteId = options?.activiteId ?? null;
  // Activité d'une nouvelle saisie : celle choisie dans le formulaire (null =
  // « Sans activité »), sinon l'activité affichée. En vue consolidée, rien
  // n'est rattaché d'office à une activité.
  const activiteSaisie = useCallback(
    (choisie: string | null | undefined): string | null => (choisie !== undefined ? choisie : activiteId),
    [activiteId],
  );

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
  const tqActivites = useActivites(societeId);
  const tqActivitesNoms = useMemo(
    () => new Map(tqActivites.activites.map((a) => [a.id, a.nom])),
    [tqActivites.activites],
  );
  // Caisse de chaque activité : sous-compte de l'annexe, sinon caisse principale 571
  const caisses = useMemo(() => {
    const parActivite = new Map(tqActivites.activites.filter((a) => a.compteCaisse).map((a) => [a.id, a]));
    const compteDe = (activiteId: string | null | undefined) => parActivite.get(activiteId ?? "")?.compteCaisse ?? "571";
    return {
      compteDe,
      nomDe: (activiteId: string | null | undefined) => parActivite.get(activiteId ?? "")?.nom,
      annexes: [...new Set([...parActivite.values()].map((a) => a.compteCaisse!))],
      solde: (donnees: DonneesMensuelles, activiteId: string | null | undefined) =>
        soldeCaisse(donnees, undefined, { compte: compteDe(activiteId), compteDe, comptesAnnexes: [...parActivite.values()].map((a) => a.compteCaisse!) }),
    };
  }, [tqActivites.activites]);
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
    () => filterMoisMap<Transaction>(tqTransactions.transactions, activiteId),
    [tqTransactions.transactions, activiteId],
  );
  const fFactures = useMemo(
    () => filterMoisMap<Facture>(tqFactures.factures, activiteId),
    [tqFactures.factures, activiteId],
  );
  const fDevis = useMemo(
    () => filterMoisMap<Devis>(tqDevis.devis, activiteId),
    [tqDevis.devis, activiteId],
  );
  const fEcritures = useMemo(
    () => filterMoisMap<EcritureComptable>(tqEcritures.ecritures, activiteId),
    [tqEcritures.ecritures, activiteId],
  );
  const fMouvements = useMemo(
    () => filterMoisMap<MouvementStock>(tqMouvements.mouvementsStock, activiteId),
    [tqMouvements.mouvementsStock, activiteId],
  );

  // ─── donneesMensuelles : calculé depuis tous les hooks TQ ─────────────────
  // Remplace complètement l'ancien useState. Toutes les entités mensuelles
  // proviennent des tables relationnelles Supabase via TanStack Query.
  const assembler = useCallback(
    (
      transactions: Record<string, Transaction[]>,
      factures: Record<string, Facture[]>,
      mouvements: Record<string, MouvementStock[]>,
      devis: Record<string, Devis[]>,
      ecritures: Record<string, EcritureComptable[]>,
    ): DonneesMensuelles => {
      const allKeys = new Set<string>([
        ...Object.keys(transactions),
        ...Object.keys(factures),
        ...Object.keys(tqAbsences.absences),
        ...Object.keys(tqPrimes.primes),
        ...Object.keys(tqHeuresSup.heuresSup),
        ...Object.keys(tqRetenues.retenues),
        ...Object.keys(mouvements),
        ...Object.keys(devis),
        ...Object.keys(ecritures),
      ]);
      const result: DonneesMensuelles = {};
      for (const key of allKeys) {
        result[key] = {
          transactions: transactions[key] ?? [],
          factures: factures[key] ?? [],
          absences: tqAbsences.absences[key] ?? [],
          primes: tqPrimes.primes[key] ?? {},
          heuresSup: tqHeuresSup.heuresSup[key] ?? {},
          retenues: tqRetenues.retenues[key] ?? {},
          mouvementsStock: mouvements[key] ?? [],
          devis: devis[key] ?? [],
          ecritures: ecritures[key] ?? [],
        };
      }
      return result;
    },
    [tqAbsences.absences, tqPrimes.primes, tqHeuresSup.heuresSup, tqRetenues.retenues],
  );

  // Données de l'activité affichée (toutes en vue consolidée)
  const donneesMensuelles = useMemo<DonneesMensuelles>(
    () => assembler(fTransactions, fFactures, fMouvements, fDevis, fEcritures),
    [assembler, fTransactions, fFactures, fMouvements, fDevis, fEcritures],
  );

  // Données de toute la société, quelle que soit l'activité affichée : la
  // caisse, les alertes et la fiscalité (déclarations) sont communes.
  const donneesConsolidees = useMemo<DonneesMensuelles>(
    () =>
      activiteId
        ? assembler(
            tqTransactions.transactions,
            tqFactures.factures,
            tqMouvements.mouvementsStock,
            tqDevis.devis,
            tqEcritures.ecritures,
          )
        : donneesMensuelles,
    [activiteId, assembler, donneesMensuelles, tqTransactions.transactions, tqFactures.factures,
      tqMouvements.mouvementsStock, tqDevis.devis, tqEcritures.ecritures],
  );

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
      immobilisations,
      importerDonnees: () => { /* placeholder */ },
    };
  }, [donneesMensuelles, employes, paramsAnnuels, tauxHistorique, articles, fournisseurs, categoriesStock, sanctions, immobilisations]);

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
      const aid = activiteSaisie(t.activiteId);
      // Une caisse ne peut pas être négative : on prévient dès la saisie
      if (t.tresorerie === "571" && t.m < 0) {
        const apres = caisses.solde(donneesConsolidees, aid) + t.m;
        if (apres < 0) {
          toast.warning(`Caisse insuffisante : après cette dépense, la caisse sera à ${formatSolde(apres)}. Vérifiez le mode de règlement (Banque ?) ou enregistrez d'abord l'approvisionnement de la caisse.`);
        }
      }
      void tqTransactions.addTransaction(annee, mois, { ...t, activiteId: aid })
        .then((saved) => {
          log("INSERT", "transactions", saved.id, null, saved);
          markSignificantWrite();

          // Écritures de la recette / dépense (achat AC + règlement TR pour un
          // fournisseur), en brouillon : validées en même temps que la transaction.
          const tauxTva = tauxPourMois(tauxHistorique, annee, mois).tva;
          ecrituresDeTransaction({ ...t, activiteId: aid }, saved.id, tauxTva, annee, mois).forEach((e) => {
            void tqEcritures.addEcriture(annee, mois, avecCaisseAnnexe(e, caisses.compteDe(aid), caisses.nomDe(aid))).catch(() => {
              console.warn("[EBENE] Écriture auto non créée pour transaction", saved.id, e.numeroPiece);
            });
          });
        })
        .catch(() => toast.error("Erreur lors de l'ajout de la transaction"));
    },
    [tqTransactions, tqEcritures, markSignificantWrite, log, activiteSaisie, tauxHistorique, donneesConsolidees, caisses],
  );

  /** Reversement des cotisations et de l'IRPP dus : une dépense par organisme. */
  const reverserCotisations = useCallback(
    (dues: DettesPaie, tresorerie: "521" | "571") => {
      const date = todayISO();
      const [a, m] = date.split("-").map(Number);
      const lignes = transactionsReversement(dues, tresorerie, date);
      lignes.forEach((t) => addTransaction(a, m, t));
      if (lignes.length) toast.success("Reversement saisi : à valider par le chef comptable.");
    },
    [addTransaction],
  );

  /**
   * Supprime les écritures générées automatiquement pour une pièce (facture
   * payée, achat fournisseur) quand la pièce elle-même est supprimée : évite
   * les écritures orphelines et les doublons si la facture est re-réglée.
   */
  const supprimerEcrituresLiees = useCallback(
    async (correspond: (e: EcritureComptable) => boolean) => {
      const liees = (Object.values(tqEcritures.ecritures) as EcritureComptable[][])
        .flat()
        .filter(correspond);
      await Promise.all(
        liees.map((e) =>
          tqEcritures.removeEcriture(e.id)
            .then(() => log("DELETE", "ecritures_comptables", e.id, e, null))
            .catch(() => toast.error(`Écriture ${e.numeroPiece} non supprimée`)),
        ),
      );
    },
    [tqEcritures, log],
  );

  const removeTransaction = useCallback(
    (annee: number, mois: number, id: number) => {
      const key = moisKey(annee, mois);
      const trans = (tqTransactions.transactions[key] ?? []).find((t) => t.id === id);
      void tqTransactions.removeTransaction(id)
        .then(async () => {
          if (trans?.source === "facture" && trans.factureId) {
            const factureId = trans.factureId;
            await tqFactures.updateFacture(factureId, {
              statut: "en_attente",
              transactionId: null,
            }).catch(() => undefined);
            // Vente + encaissement de cette facture : regénérés au prochain règlement
            await supprimerEcrituresLiees((e) => e.factureId === factureId);
          } else {
            await supprimerEcrituresLiees((e) => estEcritureDeTransaction(e, id));
          }
          log("DELETE", "transactions", id, trans ?? null, null);
          markSignificantWrite();
        })
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de la transaction")));
    },
    [tqTransactions, tqFactures, markSignificantWrite, supprimerEcrituresLiees, log],
  );

  /** Écritures générées depuis une transaction (achat AC-n, trésorerie TR-n). */
  const ecrituresDe = useCallback(
    (id: number) =>
      (Object.values(tqEcritures.ecritures) as EcritureComptable[][])
        .flat()
        .filter((e) => estEcritureDeTransaction(e, id)),
    [tqEcritures.ecritures],
  );

  const validerTransaction = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqTransactions.validerTransaction(id)
        .then(async () => {
          log("VALIDER_TRANSACTION", "transactions", id, null, { id });
          await Promise.all(
            ecrituresDe(id)
              .filter((e) => e.statut === "brouillon")
              .map((e) => tqEcritures.validerEcriture(e.id).catch(() => toast.error(`Écriture ${e.numeroPiece} non validée`))),
          );
        })
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la validation de la transaction")));
    },
    [tqTransactions, tqEcritures, ecrituresDe, log],
  );

  const rejeterTransaction = useCallback(
    (_annee: number, _mois: number, id: number, motif: string) => {
      void tqTransactions.rejeterTransaction(id, motif)
        .then(async () => {
          log("REJETER_TRANSACTION", "transactions", id, null, { id, motif });
          // Une transaction rejetée ne compte plus : ses écritures repassent en brouillon
          await Promise.all(
            ecrituresDe(id)
              .filter((e) => e.statut !== "brouillon")
              .map((e) => tqEcritures.rejeterEcriture(e.id, motif).catch(() => undefined)),
          );
        })
        .catch(() => toast.error("Erreur lors du rejet de la transaction"));
    },
    [tqTransactions, tqEcritures, ecrituresDe, log],
  );

  // ─── Factures → table relationnelle ──────────────────────────────────────
  const addFacture = useCallback(
    (annee: number, mois: number, f: Omit<Facture, "id">) => {
      void tqFactures.createFacture(annee, mois, { ...f, activiteId: activiteSaisie(f.activiteId) })
        .then((saved) => {
          log("INSERT", "factures", saved.id, null, saved);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de la création de la facture"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqFactures, markSignificantWrite, activiteSaisie],
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
          await supprimerEcrituresLiees((e) => e.factureId === id);
          log("DELETE", "factures", id, f ?? null, null);
          markSignificantWrite();
        })
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de la facture")));
    },
    [tqFactures, tqTransactions, markSignificantWrite, supprimerEcrituresLiees, log],
  );

  /**
   * Marque une facture comme payée :
   *  - transaction de recette (TTC) ;
   *  - écriture VE de constatation de la vente (Client 4111 / Produit / TVA 4431) ;
   *  - écriture d'encaissement (Banque 521 ou Caisse 571 / Client 4111), qui
   *    solde le compte client. `compteTresorerie` est choisi par l'utilisateur.
   */
  const marquerPayee = useCallback(
    (annee: number, mois: number, factureId: number, compteTresorerie: "521" | "571" = "521") => {
      const key = moisKey(annee, mois);
      const f = (tqFactures.factures[key] ?? []).find((x) => x.id === factureId);
      if (!f || f.statut === "payee" || f.statut === "proforma" || f.statut === "annulee") return;
      if (f.statutValidation !== undefined && f.statutValidation !== "valide") {
        toast.error("La facture doit d'abord être validée par le chef comptable avant d'être encaissée.");
        return;
      }

      const aid = f.activiteId ?? null; // l'activité de la facture
      void tqTransactions.addTransaction(annee, mois, {
        date: f.date,
        desc: `Facture ${f.numero} — ${f.client}`,
        type: "r",
        m: f.totalTtc,
        source: "facture",
        factureId: f.id,
        activite: f.activite,
        activiteId: aid,
        tresorerie: compteTresorerie,
      })
        .then(async (trans) => {
          // La base refuse l'encaissement d'une facture non validée : la recette
          // créée est alors retirée.
          await tqFactures.updateFacture(factureId, {
            statut: "payee",
            transactionId: trans.id,
            compteTresorerie,
          }).catch(async (e) => {
            await tqTransactions.removeTransaction(trans.id).catch(() => undefined);
            throw e;
          });
          // VE (constatation de la vente) et BQ/CA (encaissement), liées à la
          // facture : le tableau de bord ne les recompte pas (la recette est
          // déjà la transaction).
          await Promise.all(
            ecrituresFacturePayee(f, compteTresorerie, annee, mois, aid)
              .map((e) => tqEcritures.addEcriture(annee, mois, avecCaisseAnnexe(e, caisses.compteDe(aid), caisses.nomDe(aid)))),
          );
        })
        .then(() => {
          log("MARQUER_PAYEE", "factures", factureId, null, {
            factureId,
            ecriture: "VE générée automatiquement",
          });
          markSignificantWrite();
        })
        .catch((e) => toast.error(messageErreur(e, "Erreur lors du marquage comme payée")));
    },
    [tqFactures, tqTransactions, tqEcritures, markSignificantWrite, log, activiteSaisie, caisses],
  );

  /**
   * Annule une facture validée ou payée : elle reste dans la liste, avec son
   * numéro, au statut « annulée ». Ses écritures sont contre-passées à la date
   * du jour et sa recette est retirée de la trésorerie.
   */
  /**
   * Enregistre un mouvement de stock. Le stock de l'article est d'abord mis à
   * jour en base de façon sûre (valeur relue, écriture conditionnelle) : une
   * sortie supérieure au stock est refusée et rien n'est enregistré. Le
   * mouvement n'est créé qu'ensuite ; s'il échoue, le stock est rétabli.
   */
  const enregistrerMouvement = useCallback(
    async (annee: number, mois: number, mvt: Omit<MouvementStock, "id">) => {
      // Estampille le mouvement avec l'activité de l'article, sinon l'activité courante.
      const articleAid = articles.find((a) => a.id === mvt.articleId)?.activiteId;
      let mvtFinal: Omit<MouvementStock, "id"> = {
        ...mvt,
        activiteId: activiteSaisie(mvt.activiteId ?? articleAid),
      };
      await tqArticles.ajusterStock(mvt.articleId, (actuel) => {
        // Ajustement : on inscrit l'écart dans le motif pour pouvoir l'annuler
        if (mvt.type === "ajustement" && ecartAjustement(mvt.motif) === null) {
          const ecart = libelleEcart(mvt.quantite - actuel.stock);
          mvtFinal = { ...mvtFinal, motif: mvt.motif ? `${mvt.motif} ${ecart}` : `Ajustement ${ecart}` };
        }
        return appliquerMouvement(actuel, mvt);
      });
      await tqMouvements.createMouvement(annee, mois, mvtFinal).catch(async (err) => {
        // Mouvement non enregistré : on remet le stock comme avant
        await tqArticles.ajusterStock(mvt.articleId, (a) => annulerMouvement(a, mvtFinal))
          .catch(() => undefined);
        throw err;
      });
    },
    [tqMouvements, articles, tqArticles, activiteSaisie],
  );

  /**
   * Mouvements de stock d'une facture (sorties à la validation, retours à
   * l'annulation), enregistrés un par un ; renvoie les erreurs rencontrées.
   */
  const mouvementsFacture = useCallback(
    async (mvts: Omit<MouvementStock, "id">[]): Promise<string[]> => {
      const erreurs: string[] = [];
      for (const m of mvts) {
        const [a, mo] = m.date.split("-").map(Number);
        await enregistrerMouvement(a, mo, m).catch((err) => {
          erreurs.push(err instanceof Error ? err.message : String(err));
        });
      }
      return erreurs;
    },
    [enregistrerMouvement],
  );

  /**
   * Entrée en stock achetée : le mouvement et la dépense d'achat (au nom du
   * fournisseur, en attente de validation) sont enregistrés ensemble, puis
   * les écritures de la dépense (achat AC + règlement TR). Si le mouvement
   * échoue, la dépense est retirée.
   */
  const addEntreeStockAchat = useCallback(
    (annee: number, mois: number, mvt: Omit<MouvementStock, "id">, achat: AchatStock) => {
      const article = articles.find((a) => a.id === mvt.articleId);
      if (!article) return;
      const tauxTva = tauxPourMois(tauxHistorique, annee, mois).tva;
      const t = transactionAchatStock(mvt, article, achat, tauxTva);
      if (t.tresorerie === "571" && caisses.solde(donneesConsolidees, t.activiteId) + t.m < 0) {
        toast.warning(`Caisse insuffisante : après cet achat, la caisse sera à ${formatSolde(caisses.solde(donneesConsolidees, t.activiteId) + t.m)}.`);
      }
      void (async () => {
        const trans = await tqTransactions.addTransaction(annee, mois, t);
        await enregistrerMouvement(annee, mois, { ...mvt, transactionId: trans.id }).catch(async (err) => {
          await tqTransactions.removeTransaction(trans.id).catch(() => undefined);
          throw err;
        });
        log("INSERT", "transactions", trans.id, null, trans);
        markSignificantWrite();
        await Promise.all(
          ecrituresDeTransaction(t, trans.id, tauxTva, annee, mois).map((e) =>
            tqEcritures.addEcriture(annee, mois, avecCaisseAnnexe(e, caisses.compteDe(t.activiteId), caisses.nomDe(t.activiteId))).catch(() => undefined),
          ),
        );
      })()
        .then(() => toast.success("Entrée en stock et dépense d'achat enregistrées (dépense à valider par le chef comptable)."))
        .catch((err) =>
          toast.error(err instanceof ErreurStock || (err instanceof Error && /simultan/.test(err.message))
            ? err.message
            : "Erreur lors de l'enregistrement de l'entrée en stock"),
        );
    },
    [articles, tauxHistorique, donneesConsolidees, tqTransactions, enregistrerMouvement, tqEcritures, log, markSignificantWrite, caisses],
  );

  /**
   * Stock au bilan : écritures de fin de mois (31-33 / 603x), une par
   * activité, recalculées si elles existent déjà pour ce mois.
   */
  const constaterStock = useCallback(
    (annee: number, mois: number) => {
      const piece = pieceInventaire(annee, mois);
      const toutes = (Object.values(tqEcritures.ecritures) as EcritureComptable[][]).flat();
      const nouvelles = ecrituresVariationStock(
        articles,
        (Object.values(tqMouvements.mouvementsStock) as MouvementStock[][]).flat(),
        toutes,
        annee,
        mois,
      );
      void (async () => {
        await supprimerEcrituresLiees((e) => e.numeroPiece === piece);
        await Promise.all(nouvelles.map((e) => tqEcritures.addEcriture(annee, mois, e)));
        log("CONSTATER_STOCK", "ecritures_comptables", piece, null, { piece, ecritures: nouvelles.length });
        markSignificantWrite();
      })()
        .then(() => toast.success(nouvelles.length
          ? `Stock constaté en comptabilité (${piece}).`
          : "Le stock est déjà à jour en comptabilité pour ce mois."))
        .catch(() => toast.error("Erreur lors de la constatation du stock"));
    },
    [articles, tqEcritures, tqMouvements.mouvementsStock, supprimerEcrituresLiees, log, markSignificantWrite],
  );

  /**
   * Transfert de stock vers une autre activité : l'article de même référence
   * y est créé s'il n'existe pas, puis sortie (origine) et entrée
   * (destination) au coût moyen d'origine. Si l'entrée échoue, la sortie est
   * annulée par une entrée de retour.
   */
  const transfererStock = useCallback(
    (annee: number, mois: number, t: { articleId: number; quantite: number; activiteDestination: string; date: string; reference?: string }) => {
      const source = articles.find((a) => a.id === t.articleId);
      if (!source) return;
      const nomActivite = (id: string | null | undefined) => tqActivitesNoms.get(id ?? "") ?? "Sans activité";
      void (async () => {
        let destination = articles.find((a) => a.activiteId === t.activiteDestination && a.reference === source.reference);
        if (!destination) {
          const { id: _id, ...copie } = source;
          destination = await tqArticles.addArticle({ ...copie, stock: 0, activiteId: t.activiteDestination });
        }
        const [sortie, entree] = mouvementsTransfert(source, destination, t.quantite, t.date, {
          origine: nomActivite(source.activiteId), destination: nomActivite(t.activiteDestination),
        }, t.reference);
        await enregistrerMouvement(annee, mois, sortie);
        await enregistrerMouvement(annee, mois, entree).catch(async (err) => {
          await enregistrerMouvement(annee, mois, { ...sortie, type: "entree", prixUnitaire: source.prixAchat, motif: "Annulation du transfert" })
            .catch(() => undefined);
          throw err;
        });
      })()
        .then(() => toast.success(`Transfert vers ${nomActivite(t.activiteDestination)} enregistré.`))
        .catch((err) =>
          toast.error(err instanceof ErreurStock || (err instanceof Error && /simultan/.test(err.message))
            ? err.message
            : "Erreur lors du transfert de stock"),
        );
    },
    [articles, tqArticles, enregistrerMouvement, tqActivitesNoms],
  );

  const annulerFacture = useCallback(
    (annee: number, mois: number, factureId: number) => {
      const f = (tqFactures.factures[moisKey(annee, mois)] ?? []).find((x) => x.id === factureId);
      if (!f || f.statut === "annulee") return;
      const date = todayISO();
      const [aa, mm] = date.split("-").map(Number);
      const aContrePasser = (Object.values(tqEcritures.ecritures) as EcritureComptable[][]).flat()
        .filter((e) => e.factureId === factureId && e.statut !== "brouillon" && !estContrePassation(e));
      void tqFactures.updateFacture(factureId, { statut: "annulee", transactionId: null })
        .then(async () => {
          await Promise.all(aContrePasser.map((e) => tqEcritures.addEcriture(aa, mm, contrePassation(e, date, aa, mm))));
          if (f.transactionId) await tqTransactions.removeTransaction(f.transactionId);
          // Articles vendus remis en stock
          const mouvements = (Object.values(tqMouvements.mouvementsStock) as MouvementStock[][]).flat();
          const erreursStock = await mouvementsFacture(retoursFacture(f, mouvements, articles, date));
          if (erreursStock.length) toast.error(`Retour en stock incomplet : ${erreursStock.join(" ; ")}`);
          log("ANNULER_FACTURE", "factures", factureId, f, { statut: "annulee", contrePassations: aContrePasser.length });
          markSignificantWrite();
          toast.success(`Facture ${f.numero} annulée`);
        })
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de l'annulation de la facture")));
    },
    [tqFactures, tqEcritures, tqTransactions, tqMouvements, articles, mouvementsFacture, markSignificantWrite, log],
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
    (annee: number, mois: number, id: number) => {
      const f = (tqFactures.factures[moisKey(annee, mois)] ?? []).find((x) => x.id === id);
      // Articles vendus : la facture n'est validée que si le stock les couvre
      const manques = f ? manquesStock(f.lignes, articles) : [];
      if (manques.length) {
        toast.error(messageManques(manques));
        return;
      }
      void tqFactures.validerFacture(id)
        .then(async () => {
          log("VALIDER_FACTURE", "factures", id, null, { id });
          if (!f) return;
          const erreursStock = await mouvementsFacture(sortiesFacture(f, f.date));
          if (erreursStock.length) toast.error(`Sortie de stock incomplète : ${erreursStock.join(" ; ")}`);
        })
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la validation de la facture")));
    },
    [tqFactures, articles, mouvementsFacture, log],
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
        activiteId: activiteSaisie(d.activiteId),
      })
        .then((saved) => log("INSERT", "devis", saved.id, null, saved))
        .catch(() => toast.error("Erreur lors de la création du devis"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqDevis, activiteSaisie],
  );

  const removeDevis = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqDevis.removeDevis(id)
        .then(() => log("DELETE", "devis", id, null, null))
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression du devis")));
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
      // Garde-fou : un devis refusé ou déjà converti ne génère pas de facture
      if (d.statut === "refuse" || d.statut === "converti") {
        toast.error(d.statut === "refuse"
          ? "Ce devis a été refusé : il ne peut pas être converti en facture."
          : "Ce devis a déjà été converti en facture.");
        return null;
      }
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
        activiteId: d.activiteId ?? null,
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
    [tqDevis, tqFactures, activiteSaisie],
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de la prime")));
    },
    [tqPrimes],
  );

  const validerPrime = useCallback(
    (_annee: number, _mois: number, _employeId: number, primeId: number) => {
      void tqPrimes.validerPrime(primeId)
        .then(() => log("VALIDER_PRIME", "primes", primeId, null, { id: primeId }))
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la validation de la prime")));
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de l'absence")));
    },
    [tqAbsences],
  );

  const validerAbsence = useCallback(
    (_annee: number, _mois: number, id: number) => {
      // Congé payé : refusé s'il dépasse le solde (congés validés seulement)
      const toutes = (Object.values(tqAbsences.absences) as Absence[][]).flat();
      const a = toutes.find((x) => x.id === id);
      const emp = a && employes.find((e) => e.id === a.employeId);
      if (a?.type === "conges_payes" && emp) {
        const depassement = depassementConges(emp, toutes, a, { enAttente: false, ignorerId: id });
        if (depassement > 0) {
          toast.error(messageDepassementConges(depassement, a.jours));
          return;
        }
      }
      void tqAbsences.validerAbsence(id)
        .then(() => log("VALIDER_ABSENCE", "absences", id, null, { id }))
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la validation de l'absence")));
    },
    [tqAbsences, employes],
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la validation des heures sup")));
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression du taux fiscal")));
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de l'employé")));
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression définitive")));
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la validation")));
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de la catégorie")));
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression du fournisseur")));
    },
    [tqFournisseurs],
  );

  // ─── Stock : articles → table relationnelle ───────────────────────────────
  const addArticle = useCallback(
    (a: Omit<Article, "id">) => {
      void tqArticles.addArticle({ ...a, activiteId: activiteSaisie(a.activiteId) })
        .catch(() => toast.error("Erreur lors de l'ajout de l'article"));
    },
    [tqArticles, activiteSaisie],
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de l'article")));
    },
    [tqArticles],
  );

  // ─── Stock : mouvements → table relationnelle ────────────────────────────
  /**
   * Enregistre un mouvement de stock (voir enregistrerMouvement) ; les
   * erreurs sont affichées.
   */
  const addMouvementStock = useCallback(
    (annee: number, mois: number, mvt: Omit<MouvementStock, "id">) => {
      if (!societeId) return 0;
      void enregistrerMouvement(annee, mois, mvt).catch((err) =>
        toast.error(err instanceof ErreurStock || (err instanceof Error && /simultan/.test(err.message))
          ? err.message
          : "Erreur lors de l'ajout du mouvement de stock"),
      );
      return 0; // ID définitif disponible après invalidation TQ
    },
    [enregistrerMouvement, societeId],
  );

  /**
   * Supprime un mouvement et retire son effet du stock actuel (voir
   * annulerMouvement). Si l'annulation est impossible (entrée déjà consommée,
   * ajustement sans écart connu), rien n'est supprimé.
   */
  const removeMouvementStock = useCallback(
    (annee: number, mois: number, id: number) => {
      const key = moisKey(annee, mois);
      const mvt = (tqMouvements.mouvementsStock[key] ?? []).find((x) => x.id === id);
      if (!mvt || !societeId) return;

      void tqArticles.ajusterStock(mvt.articleId, (actuel) => annulerMouvement(actuel, mvt))
        .then(() =>
          tqMouvements.removeMouvement(id).catch(async (err) => {
            // Suppression échouée : on réapplique le mouvement
            await tqArticles.ajusterStock(mvt.articleId, (a) => appliquerMouvement(a, mvt))
              .catch(() => undefined);
            throw err;
          }),
        )
        .then(() => {
          // Entrée achetée : sa dépense d'achat (et ses écritures) est retirée aussi
          if (!mvt.transactionId) return;
          const cle = Object.keys(tqTransactions.transactions)
            .find((k) => (tqTransactions.transactions[k] ?? []).some((t) => t.id === mvt.transactionId));
          if (cle) {
            const [a, m] = cle.split("-").map(Number);
            removeTransaction(a, m, mvt.transactionId);
          }
        })
        .catch((err) =>
          toast.error(err instanceof ErreurStock || (err instanceof Error && /simultan/.test(err.message))
            ? err.message
            : "Erreur lors de la suppression du mouvement de stock"),
        );
    },
    [tqMouvements, societeId, tqArticles, tqTransactions.transactions, removeTransaction],
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de la sanction")));
    },
    [tqSanctions],
  );

  const validerSanction = useCallback(
    (id: number) => {
      void tqSanctions.validerSanction(id)
        .then(() => log("VALIDER_SANCTION", "sanctions", id, null, { id }))
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la validation")));
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
    (i: Omit<Immobilisation, "id">, reglement: ReglementImmo = "521") => {
      const comptes =
        i.comptesSYSCOHADA?.actif
          ? i.comptesSYSCOHADA
          : i.categorie
            ? COMPTES_IMMO_DEFAUT[i.categorie]
            : { actif: "24", amortissementCumule: "284", dotation: "6813" };
      void tqImmobilisations.addImmobilisation({
        ...i,
        comptesSYSCOHADA: comptes,
        activiteId: activiteSaisie(i.activiteId),
      })
        .then((saved) => {
          log("INSERT", "immobilisations", saved.id, null, saved);
          markSignificantWrite();
          // Écriture d'acquisition (sans elle, l'immobilisation n'apparaît pas au bilan)
          const e = ecritureAcquisitionImmo(
            { ...i, compteActif: comptes.actif, activiteId: activiteSaisie(i.activiteId) },
            saved.id,
            reglement,
          );
          void tqEcritures.addEcriture(e.annee!, e.mois!, e).catch(() =>
            toast.error("Écriture d'acquisition non créée — à saisir dans le journal"),
          );
        })
        .catch(() => toast.error("Erreur lors de l'ajout de l'immobilisation"));
      return 0; // ID définitif disponible après invalidation TQ
    },
    [tqImmobilisations, markSignificantWrite, activiteSaisie, tqEcritures],
  );

  const removeImmobilisation = useCallback(
    (id: number) => {
      void tqImmobilisations.removeImmobilisation(id)
        .then(async () => {
          log("DELETE", "immobilisations", id, null, null);
          await supprimerEcrituresLiees((e) => e.numeroPiece === pieceImmobilisation(id));
        })
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de l'immobilisation")));
    },
    [tqImmobilisations, supprimerEcrituresLiees, log],
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

      toast.warning(
        "Restauration partielle : seuls les taux fiscaux ont été importés. " +
        "Les factures, devis, employés, stock et immobilisations n'ont pas été modifiés : " +
        "ils restent ceux de la base actuelle.",
        { duration: 10_000 },
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
      void tqEcritures.addEcriture(annee, mois, { ...e, activiteId: activiteSaisie(e.activiteId) })
        .then((saved) => {
          log("INSERT", "ecritures_comptables", saved.id, null, saved);
          markSignificantWrite();
        })
        .catch(() => toast.error("Erreur lors de l'ajout de l'écriture"));
    },
    [tqEcritures, markSignificantWrite, log, activiteSaisie],
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
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la suppression de l'écriture")));
    },
    [tqEcritures, markSignificantWrite, log],
  );

  const validerEcriture = useCallback(
    (_annee: number, _mois: number, id: number) => {
      void tqEcritures.validerEcriture(id)
        .then(() => log("VALIDER_ECRITURE", "ecritures_comptables", id, null, { id }))
        .catch((e) => toast.error(messageErreur(e, "Erreur lors de la validation de l'écriture")));
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
    donneesConsolidees,
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
    annulerFacture,
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
    transfererStock,
    constaterStock,
    reverserCotisations,
    addEntreeStockAchat,
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
