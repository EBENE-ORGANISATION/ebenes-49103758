import { describe, expect, it } from "vitest";
import { periodeParDefaut } from "./tableauCabinet";

describe("Période du tableau du cabinet", () => {
  it("affiche le mois précédent", () => {
    expect(periodeParDefaut(new Date(2026, 10, 2))).toEqual({ annee: 2026, mois: 10 });
  });
  it("revient à décembre de l’année précédente en janvier", () => {
    expect(periodeParDefaut(new Date(2027, 0, 5))).toEqual({ annee: 2026, mois: 12 });
  });
});
