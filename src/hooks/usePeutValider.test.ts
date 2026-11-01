import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePeutValider } from "./usePeutValider";
const contexte = vi.hoisted(() => ({ user: { id: "auteur" }, isAdmin: true, isSuperAdmin: false, estCabinet: true, can: vi.fn() }));
vi.mock("./useAuth", () => ({ useAuth: () => contexte }));
describe("validation selon le module de la mission", () => {
  it("consulte le module demandé et impose les quatre yeux même à un admin global", () => {
    contexte.can.mockImplementation((module: string) => module === "grh");
    const { result } = renderHook(() => usePeutValider("grh"));
    expect(result.current("tiers")).toBe(true);
    expect(result.current("auteur")).toBe(false);
    const compta = renderHook(() => usePeutValider("compta"));
    expect(compta.result.current("tiers")).toBe(false);
  });
});
