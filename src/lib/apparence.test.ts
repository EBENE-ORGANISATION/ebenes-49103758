import { describe, expect, it } from "vitest";
import { avecConfort, avecTheme, lireConfort, lireTheme } from "./apparence";

describe("lireConfort", () => {
  it("reconnaît le confort terrain", () => {
    expect(lireConfort({ confort: "terrain" })).toBe("terrain");
  });

  it("vaut normal pour une config vide, absente ou invalide", () => {
    expect(lireConfort({})).toBe("normal");
    expect(lireConfort(null)).toBe("normal");
    expect(lireConfort(undefined)).toBe("normal");
    expect(lireConfort("terrain")).toBe("normal");
    expect(lireConfort(["terrain"])).toBe("normal");
    expect(lireConfort({ confort: "géant" })).toBe("normal");
  });
});

describe("lireTheme", () => {
  it("reconnaît Ébène bordeaux", () => {
    expect(lireTheme({ theme: "ebene-bordeaux" })).toBe("ebene-bordeaux");
  });

  it("garde l'apparence actuelle par défaut", () => {
    expect(lireTheme({})).toBe("actuel");
    expect(lireTheme(null)).toBe("actuel");
    expect(lireTheme({ theme: "kente" })).toBe("actuel");
  });
});

describe("avecConfort / avecTheme", () => {
  it("ajoute un réglage sans perdre les autres clés", () => {
    expect(avecConfort({ autre: 1 }, "terrain")).toEqual({ autre: 1, confort: "terrain" });
    expect(avecTheme({ confort: "terrain" }, "ebene-bordeaux")).toEqual({ confort: "terrain", theme: "ebene-bordeaux" });
  });

  it("retire la clé quand on revient à la valeur par défaut", () => {
    expect(avecConfort({ autre: 1, confort: "terrain" }, "normal")).toEqual({ autre: 1 });
    expect(avecTheme({ theme: "ebene-bordeaux" }, "actuel")).toEqual({});
  });

  it("part d'un objet vide si theme_custom est invalide", () => {
    expect(avecConfort(null, "terrain")).toEqual({ confort: "terrain" });
    expect(avecTheme("x", "ebene-bordeaux")).toEqual({ theme: "ebene-bordeaux" });
  });
});
