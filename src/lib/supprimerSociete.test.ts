import { expect, it } from "vitest";
import { supprimerSociete } from "../../supabase/functions/super-admin-ops/supprimerSociete";

function simuler(etat: string | null, erreur: { message: string } | null = null) {
  const suppressions: string[] = [];
  const filtres: unknown[][] = [];
  const client = { from: (table: string) => ({
    select: () => ({ eq: (...args: unknown[]) => {
      filtres.push(args);
      return { limit: async () => ({ data: etat ? [{ id: "dossier", etat }] : [], error: erreur }) };
    } }),
    delete: () => ({ eq: async () => { suppressions.push(table); return { error: null }; } }),
  }) };
  return { client, suppressions, filtres };
}
it.each(["invitation", "actif", "depart_demande", "termine"])("refuse tout historique cabinet (%s) avant toute suppression", async (etat) => {
  const { client, suppressions, filtres } = simuler(etat);
  const resultat = await supprimerSociete(client, "societe");
  expect(resultat).toEqual({ statut: 409, erreur: "Cette société a été suivie par un cabinet : son historique empêche la suppression." });
  expect(suppressions).toEqual([]);
  expect(filtres).toEqual([["societe_id", "societe"]]);
});
it("refuse de supprimer si la vérification échoue", async () => {
  const { client, suppressions } = simuler(null, { message: "Lecture impossible" });
  expect(await supprimerSociete(client, "societe")).toEqual({ statut: 400, erreur: "Lecture impossible" });
  expect(suppressions).toEqual([]);
});
it("conserve la suppression d’une société sans cabinet", async () => {
  const { client, suppressions } = simuler(null);
  expect(await supprimerSociete(client, "societe")).toEqual({ statut: 200 });
  expect(suppressions).toEqual(["user_societes", "societe_config", "societes"]);
});
