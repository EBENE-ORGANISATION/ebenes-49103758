import { describe, it, expect } from "vitest";
import { montantEnLettres, nombreEnLettres } from "./montantEnLettres";

describe("nombreEnLettres", () => {
  it.each([
    [0, "zéro"],
    [1, "un"],
    [16, "seize"],
    [21, "vingt et un"],
    [71, "soixante et onze"],
    [72, "soixante-douze"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [91, "quatre-vingt-onze"],
    [99, "quatre-vingt-dix-neuf"],
    [100, "cent"],
    [200, "deux cents"],
    [201, "deux cent un"],
    [1000, "mille"],
    [1080, "mille quatre-vingts"],
    [80_000, "quatre-vingt mille"],
    [200_000, "deux cent mille"],
    [118_000, "cent dix-huit mille"],
    [1_000_000, "un million"],
    [2_500_000, "deux millions cinq cent mille"],
    [3_200_000_000, "trois milliards deux cents millions"],
    [1_770_000, "un million sept cent soixante-dix mille"],
  ])("%i → %s", (n, texte) => {
    expect(nombreEnLettres(n)).toBe(texte);
  });
});

describe("montantEnLettres", () => {
  it("majuscule initiale, francs CFA, arrondi au franc", () => {
    expect(montantEnLettres(118_000)).toBe("Cent dix-huit mille francs CFA");
    expect(montantEnLettres(1)).toBe("Un franc CFA");
    expect(montantEnLettres(200_600.4)).toBe("Deux cent mille six cents francs CFA");
  });
});
