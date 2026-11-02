import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, resetTheme } from "./theme";

vi.mock("./polices-registre-bleu", () => ({}));
vi.mock("./polices-ebene-bordeaux", () => ({}));
afterEach(() => { resetTheme(); document.documentElement.classList.remove("dark"); });

describe("apparence par société", () => {
  it("applique Registre bleu et retire les variables de la société", () => {
    applyTheme({ couleur_primaire: "#ff0000", police: "Arial" });
    const racine = document.documentElement;
    racine.classList.add("dark");
    applyTheme({ theme_custom: { theme: "registre-bleu", confort: "terrain" }, nom: "Société bleue" });
    expect(racine.dataset.theme).toBe("registre-bleu");
    for (const variable of ["--primary", "--primary-foreground", "--primary-glow", "--ring", "--secondary", "--secondary-foreground", "--accent", "--accent-foreground", "--header-gradient", "--font-base"]) {
      expect(racine.style.getPropertyValue(variable)).toBe("");
    }
    expect(racine.style.getPropertyValue("--color-primary")).toBe("#174a93");
    expect(racine.dataset.confort).toBe("terrain");
    expect(racine.classList.contains("dark")).toBe(true);
    expect(document.title).toContain("Société bleue");
  });
  it("passe entre les trois thèmes et revient au thème actuel", () => {
    for (const theme of ["registre-bleu", "ebene-bordeaux", "registre-bleu"]) {
      applyTheme({ theme_custom: { theme } });
      expect(document.documentElement.dataset.theme).toBe(theme);
    }
    applyTheme({ couleur_primaire: "#123456", theme_custom: { theme: "inconnu" } });
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.confort).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#123456");
  });
});
