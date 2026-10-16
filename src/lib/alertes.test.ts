import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { dettesPaie } from "./alertes";

const ecriture = (date: string, lignes: [string, number, number][]) => ({
  id: 1, journal: "OD", numeroPiece: "x", libelle: "", statut: "valide", date,
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});

describe("dettesPaie — cotisations et IRPP à reverser", () => {
  const donnees = {
    "2026-9": { ecritures: [ecriture("2026-09-30", [["431", 0, 50000], ["433", 0, 10000], ["447", 0, 8000]])] },
    "2026-10": {
      ecritures: [
        ecriture("2026-10-12", [["431", 50000, 0], ["521", 0, 50000]]), // CNSS de septembre reversée
        ecriture("2026-10-31", [["431", 0, 52000], ["447", 0, 9000]]),
      ],
    },
  } as never;

  it("solde créditeur des comptes 431, 433 et 447", () => {
    expect(dettesPaie(donnees)).toEqual({ cnss: 52000, amu: 10000, irpp: 17000 });
  });

  it("avant une date : seules les retenues antérieures, tous les reversements déduits", () => {
    expect(dettesPaie(donnees, "2026-10-01")).toEqual({ cnss: 0, amu: 10000, irpp: 8000 });
  });

  it("les dettes reprises en à-nouveaux ne sont pas comptées deux fois", () => {
    const an = { ...ecriture("2026-01-01", [["431", 0, 30000], ["101", 30000, 0]]), journal: "AN", numeroPiece: "AN-2026" };
    const avecClôture = {
      "2025-12": { ecritures: [ecriture("2025-12-31", [["431", 0, 30000]])] },
      "2026-1": { ecritures: [an] },
    } as never;
    expect(dettesPaie(avecClôture).cnss).toBe(30000);
  });
});
