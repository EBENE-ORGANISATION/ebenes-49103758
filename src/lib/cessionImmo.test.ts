import { describe, it, expect } from "vitest";
import { cumulADate, ecrituresComptablesCession, vncADate } from "./cessionImmo";
import { cumulAFin } from "./amortissements";
import { soldesExercice } from "./etatsFinanciers";

const vehicule = {
  id: 4, libelle: "Véhicule", dateAcquisition: "2024-01-01", valeurOrigine: 1_000_000, dureeAmortissement: 5,
  methode: "lineaire", comptesSYSCOHADA: { actif: "245", amortissementCumule: "2845", dotation: "6813" }, activiteId: null,
} as never;
const equilibre = (l: { debit: number; credit: number }[]) => l.reduce((s, x) => s + x.debit - x.credit, 0) === 0;

describe("écritures de cession", () => {
  it("dotation jusqu'à la cession, sortie de l'actif et prix encaissé en banque", () => {
    const es = ecrituresComptablesCession(vehicule, "2026-07-01", 700_000, "521");
    expect(es.map((e) => [e.journal, e.numeroPiece])).toEqual([["OD", "DOT-CES-4"], ["OD", "CES-4"], ["BQ", "CES-PRIX-4"]]);
    const cumul = Math.round(cumulADate(vehicule, "2026-07-01"));
    const anterieurs = Math.round(cumulAFin(vehicule, 2025));
    expect(es[0].lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["6813", cumul - anterieurs, 0], ["2845", 0, cumul - anterieurs]]);
    expect(es[1].lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["2845", cumul, 0], ["812", 1_000_000 - cumul, 0], ["245", 0, 1_000_000]]);
    expect(es[2].lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["521", 700_000, 0], ["822", 0, 700_000]]);
    for (const e of es) expect(equilibre(e.lignes)).toBe(true);
    expect(es.every((e) => e.date === "2026-07-01" && e.annee === 2026 && e.mois === 7 && e.statut === "valide")).toBe(true);

    // Avec les dotations antérieures : immobilisation et amortissements soldés, résultat = prix − VNC
    const dot = (a: number) => ({ id: 0, journal: "OD", numeroPiece: `DOT-${a}`, libelle: "", statut: "valide", annee: a, mois: 12,
      lignes: [{ id: 1, compte: "6813", intitule: "", debit: Math.round(cumulAFin(vehicule, a) - cumulAFin(vehicule, a - 1)), credit: 0 },
        { id: 2, compte: "2845", intitule: "", debit: 0, credit: Math.round(cumulAFin(vehicule, a) - cumulAFin(vehicule, a - 1)) }] });
    const achat = { id: 0, journal: "BQ", numeroPiece: "IM-4", libelle: "", statut: "valide", annee: 2024, mois: 1,
      lignes: [{ id: 1, compte: "245", intitule: "", debit: 1_000_000, credit: 0 }, { id: 2, compte: "521", intitule: "", debit: 0, credit: 1_000_000 }] };
    const donnees = { "2024-1": { ecritures: [achat, dot(2024)] }, "2025-12": { ecritures: [dot(2025)] }, "2026-7": { ecritures: es } } as never;
    const cumules = new Map<string, number>();
    for (const a of [2024, 2025, 2026]) soldesExercice(donnees, a).forEach((v, c) => cumules.set(c, (cumules.get(c) ?? 0) + v));
    expect(Math.round(cumules.get("245") ?? 0)).toBe(0);
    expect(Math.round(cumules.get("2845") ?? 0)).toBe(0);
    const s26 = soldesExercice(donnees, 2026);
    expect(Math.round(-(s26.get("822") ?? 0) - (s26.get("812") ?? 0))).toBe(700_000 - (1_000_000 - cumul));
  });

  it("prix restant dû : créance 485, journal OD ; sans prix : pas d'écriture de prix", () => {
    expect(ecrituresComptablesCession(vehicule, "2026-07-01", 300_000, "485")[2]).toMatchObject({ journal: "OD", lignes: [{ compte: "485" }, { compte: "822" }] });
    expect(ecrituresComptablesCession(vehicule, "2026-07-01", 0, "521").map((e) => e.numeroPiece)).toEqual(["DOT-CES-4", "CES-4"]);
  });

  it("terrain non amortissable : ni dotation ni amortissements, VNC = valeur d'origine", () => {
    const terrain = { ...(vehicule as object), comptesSYSCOHADA: { actif: "22", amortissementCumule: "", dotation: "" } } as never;
    const es = ecrituresComptablesCession(terrain, "2026-07-01", 1_200_000, "521");
    expect(es[0].lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["812", 1_000_000, 0], ["22", 0, 1_000_000]]);
  });

  it("immobilisation totalement amortie : VNC nulle (et non sa valeur d'origine)", () => {
    const ancien = { ...(vehicule as object), dateAcquisition: "2018-01-01" } as never;
    expect(Math.round(vncADate(ancien, "2026-03-01"))).toBe(0);
    expect(Math.round(cumulADate(ancien, "2026-03-01"))).toBe(1_000_000);
  });
});
