import { describe, it, expect } from "vitest";
import { partActivite, repartitionValide, resultatParActivite } from "./resultatActivites";

const e = (activiteId: string | null, numeroPiece: string, lignes: [string, number, number][]) => ({
  statut: "valide" as const,
  activiteId,
  numeroPiece,
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});

describe("partActivite", () => {
  it("employé rattaché à une activité, partagé, ou vue consolidée", () => {
    expect(partActivite({ activiteId: "hotel" }, "hotel")).toBe(1);
    expect(partActivite({ activiteId: "hotel" }, "info")).toBe(0);
    const partage = { activiteId: "info", repartition: [{ activiteId: "info", part: 60 }, { activiteId: "hotel", part: 40 }] };
    expect(partActivite(partage, "hotel")).toBe(0.4);
    expect(partActivite(partage, null)).toBe(1);
  });

  it("une répartition doit totaliser 100 %", () => {
    expect(repartitionValide([{ activiteId: "a", part: 60 }, { activiteId: "b", part: 40 }])).toBe(true);
    expect(repartitionValide([{ activiteId: "a", part: 60 }, { activiteId: "b", part: 30 }])).toBe(false);
    expect(repartitionValide([])).toBe(true);
  });
});

describe("resultatParActivite", () => {
  const ecritures = [
    e("hotel", "VE-1", [["4111", 300000, 0], ["706", 0, 300000]]),
    e("info", "VE-2", [["4111", 700000, 0], ["701", 0, 700000]]),
    e("hotel", "TR-1", [["6056", 100000, 0], ["521", 0, 100000]]),
    e(null, "TR-2", [["6222", 200000, 0], ["521", 0, 200000]]), // loyer du siège : commun
    // Comptable partagée 50 / 50, paie passée sur « info »
    e("info", "OD-SAL-202610-7", [["661", 400000, 0], ["422", 0, 400000]]),
  ];
  const employes = [{ id: 7, activiteId: "info", repartition: [{ activiteId: "info", part: 50 }, { activiteId: "hotel", part: 50 }] }];

  it("charges communes au prorata du CA, salaires partagés selon les parts", () => {
    const { lignes, communCharges } = resultatParActivite(ecritures, ["hotel", "info"], employes);
    expect(communCharges).toBe(200000);
    const hotel = lignes.find((l) => l.activiteId === "hotel")!;
    const info = lignes.find((l) => l.activiteId === "info")!;
    expect(hotel).toEqual({ activiteId: "hotel", ca: 300000, produits: 300000, charges: 300000, communs: 60000, resultat: -60000 });
    expect(info).toEqual({ activiteId: "info", ca: 700000, produits: 700000, charges: 200000, communs: 140000, resultat: 360000 });
    // La somme égale le résultat comptable : 1 000 000 − 100 000 − 200 000 − 400 000
    expect(hotel.resultat + info.resultat).toBe(300000);
  });

  it("sans chiffre d'affaires, le commun est réparti à parts égales", () => {
    const { lignes } = resultatParActivite([e(null, "TR-2", [["6222", 200000, 0], ["521", 0, 200000]])], ["a", "b"]);
    expect(lignes.map((l) => l.communs)).toEqual([100000, 100000]);
  });
});
