interface ClientSuppression {
  from(table: string): {
    select(colonnes: string): {
      eq(colonne: string, valeur: string): {
        limit(nombre: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
    delete(): {
      eq(colonne: string, valeur: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export async function supprimerSociete(client: ClientSuppression, id: string): Promise<{ statut: number; erreur?: string }> {
  // Tous les états, y compris terminé : l’historique interdit la suppression.
  const { data: dossiers, error } = await client.from("cabinet_dossiers")
    .select("id").eq("societe_id", id).limit(1);
  if (error) return { statut: 400, erreur: error.message };
  if (dossiers?.length) return {
    statut: 409,
    erreur: "Cette société a été suivie par un cabinet : son historique empêche la suppression.",
  };
  for (const table of ["user_societes", "societe_config", "societes"]) {
    const { error: erreur } = await client.from(table).delete().eq(table === "societes" ? "id" : "societe_id", id);
    if (erreur) return { statut: 400, erreur: erreur.message };
  }
  return { statut: 200 };
}
