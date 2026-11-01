import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./useAuth";
import { usePeutValider } from "./usePeutValider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import type { DossierCabinet } from "@/lib/cabinetOps";

const simulation = vi.hoisted(() => ({ roles: ["admin"], directs: ["DIRECT"], dossiers: [] as DossierCabinet[], erreur: false }));
vi.mock("@/lib/cabinetOps", () => ({ cabinetOps: { mesDossiers: vi.fn(async () => {
  if (simulation.erreur) throw new Error("Réseau indisponible");
  return simulation.dossiers;
}) } }));
vi.mock("@/integrations/supabase/client", () => {
  const utilisateur = { id: "membre" };
  return { supabase: {
    from: (table: string) => {
      const resultat = { data: table === "user_roles" ? simulation.roles.map(role => ({ role })) : table === "user_societes" ? simulation.directs.map(societe_id => ({ societe_id })) : [], error: null };
      const chaine = { select: () => chaine, eq: () => chaine, gt: () => chaine, maybeSingle: async () => ({ data: null }), then: (resoudre: (v: unknown) => unknown) => Promise.resolve(resultat).then(resoudre) };
      return chaine;
    },
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: async () => ({ data: { session: { user: utilisateur } } }),
      getUser: async () => ({ data: { user: utilisateur } }),
      mfa: { listFactors: async () => ({ data: {} }), getAuthenticatorAssuranceLevel: async () => ({ data: {} }) },
    },
    functions: { invoke: async () => ({ data: null }) },
  } };
});

const dossier = (societe_id: string, mission: DossierCabinet["mission"], mon_role: DossierCabinet["mon_role"] = "collaborateur"): DossierCabinet => ({ societe_id, mission, mon_role, etat: "actif", societe_nom: societe_id, cabinet_nom: "Cabinet test" });
function Temoin() {
  const auth = useAuth();
  const naviguer = useNavigate();
  const valider = usePeutValider("compta");
  return <>
    <output data-testid="droits">{JSON.stringify({ ecrire: auth.can("compta", "write"), admin: auth.isAdmin, roleAdmin: auth.hasRole("admin"), chef: auth.isChefCompta, valider: valider("autre"), propre: valider("membre"), chargement: auth.loading })}</output>
    <button onClick={() => naviguer("/?sid=B")}>Dossier B</button>
    <button onClick={() => naviguer("/?sid=DIRECT")}>Accès direct</button>
    <ProtectedRoute requireRoles={["admin"]}><span>Administration autorisée</span></ProtectedRoute>
  </>;
}
function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/?sid=A"]}><AuthProvider><Temoin /></AuthProvider></MemoryRouter></QueryClientProvider>);
  return client;
}
const droits = () => JSON.parse(screen.getByTestId("droits").textContent!);
beforeEach(() => { simulation.roles = ["admin"]; simulation.directs = ["DIRECT"]; simulation.erreur = false; simulation.dossiers = [dossier("A", "tenue_complete"), dossier("B", "lecture")]; });
afterEach(cleanup);
describe("droits du dossier ouvert", () => {
  it("suit A puis B sans reprendre le rôle global administrateur", async () => {
    monter();
    await waitFor(() => expect(droits()).toMatchObject({ chargement: false, ecrire: true, admin: false, roleAdmin: false, chef: true, valider: true, propre: false }));
    expect(screen.queryByText("Administration autorisée")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Dossier B"));
    expect(droits()).toMatchObject({ ecrire: false, chef: false, valider: false });
    fireEvent.click(screen.getByText("Accès direct"));
    await waitFor(() => expect(droits()).toMatchObject({ admin: true, ecrire: true, propre: true }));
  });
  it("un collaborateur sans rôle global reçoit les droits de sa mission", async () => {
    simulation.roles = [];
    monter();
    await waitFor(() => expect(droits()).toMatchObject({ chargement: false, ecrire: true, valider: true, admin: false }));
  });
  it("l'accès direct conserve la priorité et les quatre yeux habituels", async () => {
    simulation.directs = ["A"];
    simulation.dossiers = [];
    monter();
    await waitFor(() => expect(droits()).toMatchObject({ chargement: false, admin: true, ecrire: true, propre: true }));
    expect(screen.getByText("Administration autorisée")).toBeInTheDocument();
  });
  it("le super-administrateur conserve ses droits", async () => {
    simulation.roles = ["admin_general"];
    simulation.dossiers = [];
    monter();
    await waitFor(() => expect(droits()).toMatchObject({ chargement: false, admin: true, ecrire: true, propre: true }));
  });
  it("un départ demandé retire l'écriture à la prochaine lecture", async () => {
    const client = monter();
    await waitFor(() => expect(droits().ecrire).toBe(true));
    simulation.dossiers = [{ ...simulation.dossiers[0], etat: "depart_demande" }];
    await client.invalidateQueries({ queryKey: ["dossiers_cabinet"] });
    await waitFor(() => expect(droits()).toMatchObject({ ecrire: false, valider: false, admin: false }));
  });
  it("un stagiaire saisit sans jamais valider", async () => {
    simulation.dossiers = [dossier("A", "tenue_complete", "stagiaire")];
    monter();
    await waitFor(() => expect(droits()).toMatchObject({ chargement: false, ecrire: true, valider: false, chef: false }));
  });
  it("un retrait ne réactive pas les droits administrateur", async () => {
    const client = monter();
    await waitFor(() => expect(droits().ecrire).toBe(true));
    simulation.dossiers = [];
    await client.invalidateQueries({ queryKey: ["dossiers_cabinet"] });
    await waitFor(() => expect(droits()).toMatchObject({ ecrire: false, admin: false, valider: false }));
  });
  it("une erreur de relecture retire les droits périmés", async () => {
    const client = monter();
    await waitFor(() => expect(droits().ecrire).toBe(true));
    simulation.erreur = true;
    await client.invalidateQueries({ queryKey: ["dossiers_cabinet"] });
    await waitFor(() => expect(droits()).toMatchObject({ ecrire: false, admin: false, valider: false }));
  });
});
