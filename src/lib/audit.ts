import { supabase } from "@/integrations/supabase/client";

/**
 * Action métier journalisée dans `audit_log`.
 * Convention :
 *  - VERBE_OBJET en majuscules (ex: "VALIDER_FACTURE", "REJETER_TRANSACTION")
 *  - "INSERT" / "UPDATE" / "DELETE" pour les CRUD basiques
 */
export type AuditAction = string;

/**
 * Libellés lisibles pour les actions CRUD et métier.
 */
export const ACTION_LABELS: Record<string, string> = {
  INSERT:                  "Création",
  UPDATE:                  "Modification",
  DELETE:                  "Suppression",
  VALIDER_FACTURE:         "Facture validée",
  REJETER_FACTURE:         "Facture rejetée",
  VALIDER_TRANSACTION:     "Transaction validée",
  REJETER_TRANSACTION:     "Transaction rejetée",
  VALIDER_PRIME:           "Prime validée",
  REJETER_PRIME:           "Prime rejetée",
  VALIDER_ABSENCE:         "Absence validée",
  REJETER_ABSENCE:         "Absence rejetée",
  VALIDER_HEURES_SUP:      "Heures supp. validées",
  REJETER_HEURES_SUP:      "Heures supp. rejetées",
  VALIDER_EMPLOYE:         "Employé validé",
  REJETER_EMPLOYE:         "Employé rejeté",
  VALIDER_SANCTION:        "Sanction validée",
  REJETER_SANCTION:        "Sanction rejetée",
  CONVERTIR_DEVIS:         "Devis converti en facture",
  CONVERTIR_PROFORMA:      "Proforma convertie",
  MARQUER_PAYEE:           "Facture marquée payée",
};

/**
 * Libellés lisibles pour les tables (entités métier).
 */
export const TABLE_LABELS: Record<string, string> = {
  transactions:     "Comptabilité",
  factures:         "Factures",
  devis:            "Devis",
  employes:         "Employés",
  primes:           "Primes",
  absences:         "Congés / Absences",
  heuresSup:        "Heures supplémentaires",
  heures_sup:       "Heures supplémentaires",
  retenues:         "Retenues",
  sanctions:        "Discipline",
  immobilisations:  "Immobilisations",
  paramsAnnuels:    "Paramètres annuels",
  tauxHistorique:   "Historique des taux",
  categoriesStock:  "Catégories stock",
  fournisseurs:     "Fournisseurs",
  articles:         "Articles",
  mouvementsStock:  "Mouvements de stock",
};

/**
 * Construit une description lisible pour une entrée d'audit.
 */
export function describeAuditEntry(
  action: string,
  tableName: string,
  newData: Record<string, unknown> | null,
  oldData: Record<string, unknown> | null
): string {
  const actionLabel = ACTION_LABELS[action] ?? action;
  const tableLabel = TABLE_LABELS[tableName] ?? tableName;

  // Extraire un nom/libellé de l'enregistrement si disponible
  const record = newData ?? oldData;
  const nom =
    (record?.["nom"] as string) ||
    (record?.["libelle"] as string) ||
    (record?.["designation"] as string) ||
    (record?.["employe_nom"] as string) ||
    null;

  if (nom) {
    return `${actionLabel} — ${tableLabel} : « ${nom} »`;
  }
  return `${actionLabel} — ${tableLabel}`;
}

/**
 * Enregistre une action utilisateur dans la table `audit_log`.
 * Non bloquant : en cas d'erreur réseau ou d'auth on log en console
 * sans casser l'UX.
 *
 * @param action     Type d'action (ex: "INSERT", "VALIDER_FACTURE")
 * @param table      Nom logique de l'entité (ex: "transactions", "factures")
 * @param recordId   Identifiant de l'enregistrement concerné
 * @param before     Valeur avant modification (ou null pour INSERT)
 * @param after      Valeur après modification (ou null pour DELETE)
 * @param societeId  ID de la société concernée (pour filtrage par société)
 */
export async function logAction(
  action: AuditAction,
  table: string,
  recordId: number | string | null,
  before: unknown = null,
  after: unknown = null,
  societeId: string | null = null
): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    const userEmail = userData.user?.email ?? null;

    const description = describeAuditEntry(
      action,
      table,
      (after ?? null) as Record<string, unknown> | null,
      (before ?? null) as Record<string, unknown> | null,
    );

    const { error } = await supabase.from("audit_log").insert({
      user_id: userId,
      user_email: userEmail,
      action,
      table_name: table,
      record_id: recordId !== null ? String(recordId) : null,
      value_before: (before ?? null) as never,
      value_after: (after ?? null) as never,
      // Champs compat. avec l'ancienne page AuditLog
      old_data: (before ?? null) as never,
      new_data: (after ?? null) as never,
      // Société : colonne ajoutée par migration 20260513000000_audit_log_societe.sql
      // Si la colonne n'existe pas encore, Supabase ignorera silencieusement le champ
      // grâce au cast `as never` — pas d'erreur de type.
      ...(societeId ? { societe_id: societeId, description } : { description }),
    } as never);

    if (error) {
      console.warn("[audit] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[audit] unexpected error:", err);
  }
}
