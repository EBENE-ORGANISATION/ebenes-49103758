import { describe, it, expect } from "vitest";
import { genererLignesEcriture, isEcritureEquilibree, prochainNumeroPiece } from "./planComptable";

const net = (lignes: ReturnType<typeof genererLignesEcriture>) =>
  Object.fromEntries(lignes.map((l) => [l.compte, l.debit - l.credit]));

describe("saisie guidée — règlement de la TVA", () => {
  it("TVA nette payée par la banque", () => {
    const l = genererLignesEcriture("tva_a_decaisser", { montantHT: 100_000, tvaDeductible: 30_000, compteBank: "521" });
    expect(net(l)).toEqual({ "4431": 100_000, "4452": -30_000, "521": -70_000 });
    expect(isEcritureEquilibree(l)).toBe(true);
  });
  it("crédit de TVA quand la déductible dépasse la collectée", () => {
    const l = genererLignesEcriture("tva_a_decaisser", { montantHT: 20_000, tvaDeductible: 50_000, compteBank: "521" });
    expect(net(l)).toEqual({ "4431": 20_000, "4452": -50_000, "4449": 30_000 });
    expect(isEcritureEquilibree(l)).toBe(true);
  });
});

describe("saisie guidée — vente de marchandises", () => {
  it("client TTC, vente HT, TVA collectée", () => {
    const l = genererLignesEcriture("vente_marchandises", { montantHT: 100_000, tva: 0.18 });
    expect(net(l)).toEqual({ "4111": 118_000, "701": -100_000, "4431": -18_000 });
  });
});

describe("prochainNumeroPiece", () => {
  it("suit le plus grand numéro du journal dans l'année, quel que soit le mois", () => {
    expect(prochainNumeroPiece("OD", 2026, ["OD-2026-0004", "OD-2026-0011", "OD-2025-0099", "BQ-2026-0050", "OD-AMO-2026-0002"])).toBe("OD-2026-0012");
    expect(prochainNumeroPiece("VE", 2027, [])).toBe("VE-2027-0001");
  });
});
