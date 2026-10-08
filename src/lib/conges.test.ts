import { describe, it, expect } from "vitest";
import { debutDecompte, depassementConges, moisComplets, soldeConges } from "./conges";

const ref = new Date(2026, 9, 8); // 8 octobre 2026

const conge = (dateDebut: string, jours: number, statutValidation?: "valide" | "en_validation" | "rejete") => ({
  employeId: 1, type: "conges_payes" as const, dateDebut, jours, statutValidation,
});

describe("moisComplets", () => {
  it("compte les mois entiers seulement", () => {
    expect(moisComplets(new Date(2026, 2, 15), new Date(2026, 3, 14))).toBe(0);
    expect(moisComplets(new Date(2026, 2, 15), new Date(2026, 3, 15))).toBe(1);
    expect(moisComplets(new Date(2026, 0, 1), ref)).toBe(9);
  });
});

describe("soldeConges — reprise + 2,5 j/mois − congés validés", () => {
  it("employé ancien créé en 2026 : décompte depuis le 1er janvier, reprise ajoutée", () => {
    const e = { id: 1, dateEmbauche: "2000-03-01", createdAt: "2026-10-08T17:20:00Z", soldeConges: 12 };
    const s = soldeConges(e, [conge("2026-10-12", 5)], ref);
    expect(s.depuis).toBe("2026-01-01");
    expect(s.acquis).toBe(22.5); // 9 mois × 2,5
    expect(s.restants).toBe(12 + 22.5 - 5);
    expect(s.prisAnnee).toBe(5);
  });

  it("embauché après le 1er janvier : décompte depuis l'embauche", () => {
    const e = { id: 1, dateEmbauche: "2026-04-01", createdAt: "2026-03-20T10:00:00Z" };
    expect(debutDecompte(e).getMonth()).toBe(3);
    expect(soldeConges(e, [], ref).acquis).toBe(15); // avril → octobre : 6 mois
  });

  it("cumulé d'une année sur l'autre (pas de remise à zéro)", () => {
    const e = { id: 1, dateEmbauche: "2020-01-01", createdAt: "2025-02-10T08:00:00Z" };
    const s = soldeConges(e, [conge("2025-08-04", 20)], ref);
    expect(s.moisComplets).toBe(21); // janvier 2025 → octobre 2026
    expect(s.restants).toBe(21 * 2.5 - 20);
    expect(s.prisAnnee).toBe(0);
  });

  it("ignore les congés non validés, d'un autre employé, d'un autre type ou antérieurs à la reprise", () => {
    const e = { id: 1, dateEmbauche: "2020-01-01", createdAt: "2026-01-05T08:00:00Z" };
    const s = soldeConges(e, [
      conge("2026-05-04", 3, "en_validation"),
      conge("2026-05-11", 4, "rejete"),
      { ...conge("2026-06-01", 2), employeId: 2 },
      { ...conge("2026-06-08", 6), type: "maladie" as const },
      conge("2025-12-22", 5),
    ], ref);
    expect(s.pris).toBe(0);
  });

  it("solde négatif possible (congés pris par anticipation)", () => {
    const e = { id: 1, dateEmbauche: "2026-09-01", createdAt: "2026-09-01T08:00:00Z" };
    expect(soldeConges(e, [conge("2026-09-21", 5)], ref).restants).toBe(2.5 - 5);
  });
});

describe("depassementConges — une demande ne dépasse pas le solde", () => {
  // Embauché le 1er janvier 2026, sans reprise : 22,5 j acquis au 8 octobre
  const e = { id: 1, dateEmbauche: "2026-01-01", createdAt: "2026-01-01T08:00:00Z", soldeConges: 0 };
  const avec = (id: number, a: ReturnType<typeof conge>) => ({ ...a, id });

  it("demande dans le solde : aucun dépassement", () => {
    expect(depassementConges(e, [], { dateDebut: "2026-10-08", jours: 20 }, { enAttente: true })).toBe(0);
  });

  it("solde à 0 : toute la demande dépasse", () => {
    const sansDroit = { ...e, dateEmbauche: "2026-10-01", createdAt: "2026-10-01T08:00:00Z" };
    expect(depassementConges(sansDroit, [], { dateDebut: "2026-10-08", jours: 3 }, { enAttente: true })).toBe(3);
  });

  it("à la saisie, les demandes en attente réservent le solde", () => {
    const absences = [avec(1, conge("2026-09-01", 10, "valide")), avec(2, conge("2026-11-01", 10, "en_validation"))];
    // 22,5 − 10 validés − 10 en attente = 2,5 disponibles
    expect(depassementConges(e, absences, { dateDebut: "2026-10-08", jours: 5 }, { enAttente: true })).toBe(2.5);
  });

  it("à la validation, la demande elle-même et les autres demandes en attente ne comptent pas", () => {
    const absences = [avec(1, conge("2026-10-08", 20, "en_validation")), avec(2, conge("2026-11-01", 10, "en_validation"))];
    expect(depassementConges(e, absences, { dateDebut: "2026-10-08", jours: 20 }, { enAttente: false, ignorerId: 1 })).toBe(0);
    expect(depassementConges(e, absences, { dateDebut: "2026-10-08", jours: 25 }, { enAttente: false, ignorerId: 1 })).toBe(2.5);
  });

  it("une demande rejetée ne réserve rien", () => {
    const absences = [avec(1, conge("2026-11-01", 20, "rejete"))];
    expect(depassementConges(e, absences, { dateDebut: "2026-10-08", jours: 20 }, { enAttente: true })).toBe(0);
  });
});
