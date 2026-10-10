import { describe, expect, it } from "vitest";
import { avecConfort, lireConfort } from "./confort";

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

describe("avecConfort", () => {
  it("ajoute le confort sans perdre les autres clés", () => {
    expect(avecConfort({ autre: 1 }, "terrain")).toEqual({ autre: 1, confort: "terrain" });
  });

  it("retire la clé quand on revient à normal", () => {
    expect(avecConfort({ autre: 1, confort: "terrain" }, "normal")).toEqual({ autre: 1 });
  });

  it("part d'un objet vide si theme_custom est invalide", () => {
    expect(avecConfort(null, "terrain")).toEqual({ confort: "terrain" });
  });
});
