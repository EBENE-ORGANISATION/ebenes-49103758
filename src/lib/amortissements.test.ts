import { describe, it, expect } from "vitest";
import type { Immobilisation } from "@/types/ebene";
import { dotationAnnee, joursEcoules30360, joursRestants30360 } from "./amortissements";
import { vncADate } from "./cessionImmo";

const serveur = {
  id: 1,
  libelle: "Serveur",
  valeurOrigine: 1_200_000,
  valeurResiduelle: 0,
  dureeAmortissement: 3,
  methode: "lineaire",
  dateAcquisition: "2026-10-01",
} as unknown as Immobilisation;

describe("prorata 30/360", () => {
  it("jours restants et écoulés : mois de 30 jours", () => {
    expect(joursRestants30360(new Date(2026, 9, 1))).toBe(90);
    expect(joursRestants30360(new Date(2026, 0, 1))).toBe(360);
    expect(joursRestants30360(new Date(2026, 11, 31))).toBe(1);
    expect(joursRestants30360(new Date(2026, 1, 15))).toBe(316);
    expect(joursEcoules30360(new Date(2026, 2, 31))).toBe(90);
    expect(joursEcoules30360(new Date(2026, 11, 31))).toBe(360);
  });

  it("achat le 1er octobre, 3 ans : 100 000 F la première année, solde la dernière", () => {
    expect(dotationAnnee(serveur, 2026)).toBeCloseTo(100_000, 6);
    expect(dotationAnnee(serveur, 2027)).toBeCloseTo(400_000, 6);
    expect(dotationAnnee(serveur, 2029)).toBeCloseTo(300_000, 6);
  });

  it("cession : prorata 30/360 depuis le 1er janvier, ou depuis l'acquisition la première année", () => {
    // Fin 2026 : VNC 1 100 000 ; cession au 31 mars 2027 → 90/360 de 400 000
    expect(vncADate(serveur, "2027-03-31")).toBeCloseTo(1_000_000, 6);
    // Cession au 30 novembre 2026 : 2 mois sur 3 de la dotation 2026
    expect(vncADate(serveur, "2026-11-30")).toBeCloseTo(1_200_000 - 100_000 * 60 / 90, 6);
  });
});
