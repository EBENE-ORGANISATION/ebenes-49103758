/**
 * Restauration depuis la corbeille d'une opération de trésorerie ou d'une
 * facture payée : leurs écritures, supprimées avec elles, sont recréées à
 * l'identique (comptes enregistrés avec l'opération / la facture ; valeurs par
 * défaut pour les saisies antérieures : 706 / 6057, Banque 521).
 */
import { supabase } from "@/integrations/supabase/client";
import { transactions as transactionsRepo, toTransaction } from "@/data/transactions.repo";
import { toFacture } from "@/data/factures.repo";
import { ecritures as ecrituresRepo } from "@/data/ecritures.repo";
import { tauxHistorique as tauxRepo } from "@/data/tauxHistorique.repo";
import { ecrituresDeTransaction, pieceAchat, pieceTresorerie } from "@/lib/ecrituresTresorerie";
import { ecrituresFacturePayee } from "@/lib/ecrituresFacture";
import { tauxPourMois } from "@/lib/ebene-utils";
import { softRestore } from "@/lib/softDelete";
import type { Tables } from "@/integrations/supabase/types";

/** Refus de restauration, avec un message destiné à l'utilisateur. */
export class RestaurationRefusee extends Error {}

const lire = async <T,>(table: "transactions" | "factures", id: number, societeId: string): Promise<T> => {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).eq("societe_id", societeId).single();
  if (error) throw error;
  return data as T;
};

/** Pièces comptables déjà présentes (écritures non supprimées lors d'une ancienne suppression). */
const piecesExistantes = async (societeId: string, pieces: string[]): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from("ecritures_comptables")
    .select("numero_piece")
    .eq("societe_id", societeId)
    .in("numero_piece", pieces);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.numero_piece));
};

const restaurerTransaction = async (id: number, societeId: string): Promise<void> => {
  const t = toTransaction(await lire<Tables<"transactions">>("transactions", id, societeId));
  if (t.source === "facture") {
    const { data: f } = t.factureId
      ? await supabase.from("factures").select("numero, statut").eq("id", t.factureId).eq("societe_id", societeId).maybeSingle()
      : { data: null };
    throw new RestaurationRefusee(f?.statut === "annulee"
      ? `La facture ${f.numero} a été annulée : sa recette ne peut pas être restaurée.`
      : "Cette recette vient d'une facture : restaurez la facture, sa recette sera restaurée avec elle.");
  }
  if (t.source === "salaires") {
    throw new RestaurationRefusee("Ce paiement de salaires vient de la paie : il se régénère depuis le bulletin, pas depuis la corbeille.");
  }
  await softRestore("transactions", id, societeId);

  const annee = t.annee ?? Number(t.date.slice(0, 4));
  const mois = t.mois ?? Number(t.date.slice(5, 7));
  const existantes = await piecesExistantes(societeId, [pieceTresorerie(id), pieceAchat(id)]);
  const taux = tauxPourMois(await tauxRepo.listAll(societeId), annee, mois).tva;
  // Une opération validée retrouve des écritures validées ; sinon, brouillon
  const statut = t.statut === "valide" ? "valide" as const : "brouillon" as const;
  const aCreer = ecrituresDeTransaction(t, id, taux, annee, mois)
    .filter((e) => !existantes.has(e.numeroPiece))
    .map((e) => ({ ...e, statut }));
  for (const e of aCreer) await ecrituresRepo.create(e, annee, mois, societeId);
};

const restaurerFacture = async (id: number, societeId: string): Promise<void> => {
  const f = toFacture(await lire<Tables<"factures">>("factures", id, societeId));
  await softRestore("factures", id, societeId);
  if (f.statut !== "payee") return;

  const annee = f.annee ?? Number(f.date.slice(0, 4));
  const mois = f.mois ?? Number(f.date.slice(5, 7));
  const compte = f.compteTresorerie ?? "521";

  // Recette : on restaure celle de la facture, ou on la recrée si elle a été purgée
  const { data: recette } = f.transactionId
    ? await supabase.from("transactions").select("id").eq("id", f.transactionId).eq("societe_id", societeId).maybeSingle()
    : { data: null };
  if (recette) {
    await transactionsRepo.restore(recette.id, societeId);
  } else {
    const t = await transactionsRepo.create({
      date: f.date,
      desc: `Facture ${f.numero} — ${f.client}`,
      type: "r",
      m: f.totalTtc,
      source: "facture",
      factureId: f.id,
      activite: f.activite,
      activiteId: f.activiteId,
      tresorerie: compte,
    }, annee, mois, societeId);
    const { error } = await supabase.from("factures").update({ transaction_id: t.id }).eq("id", id).eq("societe_id", societeId);
    if (error) throw error;
  }

  const { count, error } = await supabase
    .from("ecritures_comptables")
    .select("id", { count: "exact", head: true })
    .eq("societe_id", societeId)
    .eq("facture_id", id);
  if (error) throw error;
  if (count) return; // écritures encore présentes (ancienne suppression)
  for (const e of ecrituresFacturePayee(f, compte, annee, mois, f.activiteId ?? null)) {
    await ecrituresRepo.create(e, annee, mois, societeId);
  }
};

/** Restaure un élément de la corbeille ; recrée les écritures quand il en a. */
export const restaurerDepuisCorbeille = async (table: string, id: number | string, societeId: string): Promise<void> => {
  if (table === "transactions") return restaurerTransaction(Number(id), societeId);
  if (table === "factures") return restaurerFacture(Number(id), societeId);
  return softRestore(table, id, societeId);
};
