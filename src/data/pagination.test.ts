import { describe, it, expect } from "vitest";
import { TAILLE_PAGE, toutesLesPages } from "./pagination";

const table = Array.from({ length: 2 * TAILLE_PAGE + 37 }, (_, i) => ({ id: i + 1 }));
const lire = (de: number, a: number) => Promise.resolve({ data: table.slice(de, a + 1), error: null });

describe("toutesLesPages", () => {
  it("lit au-delà de 1 000 lignes, page après page, sans perte ni doublon", async () => {
    const pages: [number, number][] = [];
    const { data, error } = await toutesLesPages((de, a) => { pages.push([de, a]); return lire(de, a); });
    expect(error).toBeNull();
    expect(data).toHaveLength(table.length);
    expect(new Set(data.map((l) => l.id)).size).toBe(table.length);
    expect(pages).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("s'arrête à la première page incomplète ; renvoie l'erreur telle quelle", async () => {
    expect((await toutesLesPages(() => Promise.resolve({ data: [{ id: 1 }], error: null }))).data).toHaveLength(1);
    const erreur = { code: "42703", message: "colonne absente" };
    const r = await toutesLesPages(() => Promise.resolve({ data: null, error: erreur }));
    expect(r.error).toBe(erreur);
  });
});
