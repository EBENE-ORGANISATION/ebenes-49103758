import { describe, expect, it } from "vitest";
import { nomPrenoms } from "./nomAgent";

describe("nomPrenoms", () => {
  it("place le nom en majuscules devant les prénoms", () => {
    expect(nomPrenoms("Piham BELEI")).toBe("BELEI Piham");
    expect(nomPrenoms("Kossi Ama MENSAH")).toBe("MENSAH Kossi Ama");
  });

  it("garde l'ordre quand le nom est déjà en tête", () => {
    expect(nomPrenoms("BELEI Piham")).toBe("BELEI Piham");
  });

  it("gère les noms composés et accentués", () => {
    expect(nomPrenoms("Élodie AGBÉ-KOFFI")).toBe("AGBÉ-KOFFI Élodie");
  });

  it("rend tel quel un nom sans majuscules ou tout en majuscules", () => {
    expect(nomPrenoms("Administrateur")).toBe("Administrateur");
    expect(nomPrenoms("  piham  belei ")).toBe("piham belei");
    expect(nomPrenoms("PIHAM BELEI")).toBe("PIHAM BELEI");
  });
});
