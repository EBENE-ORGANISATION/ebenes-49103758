import { describe, expect, it } from "vitest";
import { evaluatePassword } from "./passwordUtils";

describe("evaluatePassword", () => {
  it("refuse les mots de passe sans symbole Supabase", () => {
    for (const password of ["Abcdefg1é", "Abcdefg1 ", "Abcdefgh"]) {
      expect(evaluatePassword(password).isValid).toBe(false);
    }
  });

  it("accepte chaque symbole Supabase, antislash compris", () => {
    for (const password of ["Abcdef1!", "Abcdef1\\", "Abcdef1`"]) {
      expect(evaluatePassword(password).isValid).toBe(true);
    }
    for (const symbol of "!@#$%^&*()_+-=[]{};':\"|<>?,./`~\\") {
      expect(evaluatePassword("Abcdef1" + symbol).isValid).toBe(true);
    }
  });

  it("accepte un mot de passe qui respecte les 5 règles", () => {
    const r = evaluatePassword("Ebene2026!");
    expect(r.isValid).toBe(true);
    expect(r.label).toBe("excellent");
  });

  it("refuse un mot de passe sans minuscule (règle exigée par Supabase)", () => {
    const r = evaluatePassword("ABCDEF1!");
    expect(r.rules.hasLower).toBe(false);
    expect(r.isValid).toBe(false);
    expect(r.label).toBe("strong");
  });

  it("refuse un mot de passe trop court même complet", () => {
    const r = evaluatePassword("Ab1!");
    expect(r.rules.minLength).toBe(false);
    expect(r.isValid).toBe(false);
  });

  it("classe faible un mot de passe simple", () => {
    expect(evaluatePassword("azerty12").label).toBe("fair");
    expect(evaluatePassword("azerty").label).toBe("weak");
    expect(evaluatePassword("").label).toBe("empty");
  });
});
