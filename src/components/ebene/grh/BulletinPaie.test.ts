import { describe, it, expect } from "vitest";
import type { Employe, MoisData } from "@/types/ebene";
import { calculerPaie } from "./BulletinPaie";

const moisVide: MoisData = {
  transactions: [],
  factures: [],
  absences: [],
  primes: {},
  heuresSup: {},
  retenues: {},
  mouvementsStock: [],
  devis: [],
  ecritures: [],
};

const employe = {
  id: 1,
  nom: "Test",
  salaire: 200_000,
  sursalaire: 0,
  situation: "celibataire",
  enfants: 0,
  dateEmbauche: "2020-01-01",
} as Employe;

describe("calculerPaie — ancienneté au mois du bulletin", () => {
  it("utilise l'ancienneté à la fin du mois payé, pas celle d'aujourd'hui", () => {
    // Fin janvier 2021 : 1 an et 1 mois de présence → pas de prime
    const janv2021 = calculerPaie(employe, moisVide, 2021, 1);
    expect(janv2021.anciennete).toBeLessThan(2);
    expect(janv2021.primeAnciennete).toBe(0);

    // Fin décembre 2023 : ~4 ans → prime d'ancienneté
    const dec2023 = calculerPaie(employe, moisVide, 2023, 12);
    expect(dec2023.anciennete).toBeGreaterThan(3.9);
    expect(dec2023.anciennete).toBeLessThan(4.1);
    expect(dec2023.primeAnciennete).toBeGreaterThan(0);
  });

  it("le même mois donne toujours le même bulletin", () => {
    const a = calculerPaie(employe, moisVide, 2022, 6);
    const b = calculerPaie(employe, moisVide, 2022, 6);
    expect(a.net).toBe(b.net);
  });
});
