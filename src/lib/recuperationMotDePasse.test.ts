import { describe, expect, it } from "vitest";
import { adresseRetourRecuperation, lireRetourRecuperation, ADRESSE_WEB } from "./recuperationMotDePasse";

describe("adresseRetourRecuperation", () => {
  it("web : revient sur l'adresse courante", () => {
    expect(adresseRetourRecuperation("https://ebnservicess.com")).toBe("https://ebnservicess.com/");
    expect(adresseRetourRecuperation("http://localhost:8080")).toBe("http://localhost:8080/");
  });
  it("APK et .exe : revient sur le site web", () => {
    expect(adresseRetourRecuperation("capacitor://localhost")).toBe(`${ADRESSE_WEB}/`);
    expect(adresseRetourRecuperation("file://")).toBe(`${ADRESSE_WEB}/`);
  });
});

describe("lireRetourRecuperation", () => {
  it("lien token_hash de type recovery", () => {
    expect(lireRetourRecuperation("?token_hash=abc&type=recovery", "")).toEqual({ tokenHash: "abc" });
  });
  it("ignore un token_hash d'un autre type", () => {
    expect(lireRetourRecuperation("?token_hash=abc&type=signup", "")).toBeNull();
  });
  it("lien expiré renvoyé dans le #", () => {
    expect(lireRetourRecuperation("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toEqual({ erreur: "expire" });
  });
  it("erreur renvoyée dans la query (PKCE)", () => {
    expect(lireRetourRecuperation("?error=invalid_request&error_description=bad", "")).toEqual({ erreur: "bad" });
  });
  it("ne touche ni au code PKCE ni aux routes du HashRouter", () => {
    expect(lireRetourRecuperation("?code=xyz", "")).toBeNull();
    expect(lireRetourRecuperation("", "#/auth?awaiting_confirmation=1")).toBeNull();
    expect(lireRetourRecuperation("", "")).toBeNull();
  });
});
