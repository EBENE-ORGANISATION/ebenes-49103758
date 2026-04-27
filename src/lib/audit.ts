import { supabase } from "@/integrations/supabase/client";

/**
 * Action métier journalisée dans `audit_log`.
 * Convention :
 *  - VERBE_OBJET en majuscules (ex: "VALIDER_FACTURE", "REJETER_TRANSACTION")
 *  - "INSERT" / "UPDATE" / "DELETE" pour les CRUD basiques
 */
export type AuditAction = string;

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
 */
export async function logAction(
  action: AuditAction,
  table: string,
  recordId: number | string | null,
  before: unknown = null,
  after: unknown = null
): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    const userEmail = userData.user?.email ?? null;

    const { error } = await supabase.from("audit_log").insert({
      user_id: userId,
      user_email: userEmail,
      action,
      table_name: table,
      record_id: recordId !== null ? String(recordId) : null,
      value_before: (before ?? null) as never,
      value_after: (after ?? null) as never,
      // On garde aussi les anciens champs pour compat avec la page AuditLog
      old_data: (before ?? null) as never,
      new_data: (after ?? null) as never,
    });

    if (error) {
      console.warn("[audit] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[audit] unexpected error:", err);
  }
}
