import { describe, it, expect } from "vitest";
import { contrePassation, ecrituresFacturePayee, estContrePassation } from "./ecrituresFacture";
import { soldesExercice } from "./etatsFinanciers";

const equilibre = (lignes: { debit: number; credit: number }[]) =>
  lignes.reduce((s, l) => s + l.debit, 0) === lignes.reduce((s, l) => s + l.credit, 0);

const facture = {
  id: 7,
  numero: "FAC-007",
  client: "Client A",
  date: "2026-10-03",
  activite: "service" as const,
  avecTva: true,
  totalHT: 100000,
  totalTva: 18000,
  totalTtc: 118000,
};

describe("ecrituresFacturePayee", () => {
  it("avec TVA, encaissée en banque : VE (4111 / 706 / 4431) puis BQ (521 / 4111)", () => {
    const [ve, bq] = ecrituresFacturePayee(facture, "521", 2026, 10, null);
    expect(ve.journal).toBe("VE");
    expect(ve.numeroPiece).toBe("VE-FAC-007");
    expect(ve.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([
      ["4111", 118000, 0],
      ["706", 0, 100000],
      ["4431", 0, 18000],
    ]);
    expect(bq.journal).toBe("BQ");
    expect(bq.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([
      ["521", 118000, 0],
      ["4111", 0, 118000],
    ]);
    for (const e of [ve, bq]) {
      expect(equilibre(e.lignes)).toBe(true);
      expect(e).toMatchObject({ statut: "valide", factureId: 7, date: "2026-10-03" });
    }
  });

  it("sans TVA, commerce, encaissée en caisse : 701 et journal CA", () => {
    const [ve, ca] = ecrituresFacturePayee(
      { ...facture, activite: "commerce", avecTva: false, totalTva: 0, totalTtc: 100000 },
      "571", 2026, 10, "act-1",
    );
    expect(ve.lignes.map((l) => l.compte)).toEqual(["4111", "701"]);
    expect(ca.journal).toBe("CA");
    expect(ca.numeroPiece).toBe("CA-FAC-007");
    expect(ca.lignes[0]).toMatchObject({ compte: "571", debit: 100000 });
    expect(ca.activiteId).toBe("act-1");
  });
});

describe("contrePassation", () => {
  it("inverse débit et crédit, à la date de l'annulation : les soldes reviennent à zéro", () => {
    const origine = ecrituresFacturePayee(facture, "521", 2026, 10, null);
    const annulation = origine.map((e) => contrePassation(e, "2026-10-20", 2026, 10));
    expect(annulation[0].numeroPiece).toBe("AN-VE-FAC-007");
    expect(annulation[0].libelle).toBe("Annulation — Facture FAC-007 — Client A");
    expect(annulation[0]).toMatchObject({ statut: "valide", factureId: 7, date: "2026-10-20" });
    expect(annulation[0].lignes[0]).toMatchObject({ compte: "4111", debit: 0, credit: 118000 });
    expect(annulation.every((e) => equilibre(e.lignes))).toBe(true);

    const toutes = [...origine, ...annulation].map((e, i) => ({ ...e, id: i + 1 }));
    const soldes = soldesExercice({ "2026-10": { ecritures: toutes } } as never, 2026);
    expect([...soldes.keys()].sort()).toEqual(["4111", "4431", "521", "706"]);
    for (const solde of soldes.values()) expect(solde).toBe(0);
  });

  it("reconnaît une contre-passation", () => {
    expect(estContrePassation({ numeroPiece: "AN-VE-FAC-007" })).toBe(true);
    expect(estContrePassation({ numeroPiece: "VE-FAC-007" })).toBe(false);
  });
});
