import { describe, it, expect } from "vitest";
import { reversementEnAttente, transactionsReversement } from "./reversement";
import { ecrituresDeTransaction } from "./ecrituresTresorerie";

describe("transactionsReversement", () => {
  it("une dépense par organisme dû, au débit de 431 / 433 / 447", () => {
    const t = transactionsReversement({ cnss: 364448, amu: 0, irpp: 72192 }, "521", "2026-10-14");
    expect(t.map((x) => [x.compte, x.m, x.desc])).toEqual([
      ["431", -364448, "Reversement CNSS"],
      ["447", -72192, "Reversement IRPP retenu à la source"],
    ]);
    const [e] = ecrituresDeTransaction(t[0], 1, 0.18, 2026, 10);
    expect(e.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["431", 364448, 0], ["521", 0, 364448]]);
  });

  it("repère un reversement en attente de validation", () => {
    expect(reversementEnAttente([{ type: "d", compte: "431", statut: "en_validation" }])).toBe(true);
    expect(reversementEnAttente([{ type: "d", compte: "431", statut: "valide" }])).toBe(false);
    expect(reversementEnAttente([{ type: "d", compte: "6222", statut: "en_validation" }])).toBe(false);
  });
});
