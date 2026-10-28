import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { operationsCabinet, type ClientCabinet } from "./cabinetOps";
import { messageErreur } from "./ebene-utils";

const clientSimule = (
  reponseRpc: { data: unknown; error: { message?: string; code?: string } | null } = { data: null, error: null },
  reponseInvoke: { data: unknown; error: unknown } = { data: { ok: true }, error: null },
) => {
  const rpc = vi.fn(async () => reponseRpc);
  const invoke = vi.fn(async () => reponseInvoke);
  const client: ClientCabinet = { rpc, functions: { invoke } };
  return { client, rpc, invoke };
};

describe("cabinetOps : appels SQL", () => {
  it("construit chaque appel rpc avec les bons paramètres", async () => {
    const { client, rpc } = clientSimule({ data: "id-1", error: null });
    const ops = operationsCabinet(client);

    expect(await ops.creerCabinet("Cabinet A", "u-1")).toBe("id-1");
    await ops.definirMembre("k-1", "u-2", "stagiaire", false);
    await ops.detacherMembre("k-1", "u-3");
    await ops.creerDossier("k-1", "Client B");
    await ops.rattacher("k-1", "s-1", "lecture");
    await ops.attribuer("d-1", "u-2", "declarations");
    await ops.retirerAttribution("d-1", "u-2");
    await ops.changerMission("d-1", "paie_social");
    await ops.collaborateursDossier("s-1");

    expect(rpc.mock.calls).toEqual([
      ["cabinet_creer", { _nom: "Cabinet A", _responsable: "u-1", _max_dossiers: 10 }],
      ["cabinet_definir_membre", { _cabinet: "k-1", _user: "u-2", _role: "stagiaire", _actif: false }],
      ["cabinet_detacher_membre", { _cabinet: "k-1", _user: "u-3" }],
      ["cabinet_creer_dossier", {
        _cabinet: "k-1", _nom: "Client B", _nif: null, _rccm: null, _forme_juridique: null, _debut_exercice: null,
      }],
      ["cabinet_rattacher", { _cabinet: "k-1", _societe: "s-1", _mission: "lecture" }],
      ["cabinet_attribuer", { _dossier: "d-1", _user: "u-2", _mission: "declarations" }],
      ["cabinet_retirer_attribution", { _dossier: "d-1", _user: "u-2" }],
      ["cabinet_changer_mission", { _dossier: "d-1", _mission: "paie_social" }],
      ["cabinet_collaborateurs_dossier", { _societe: "s-1" }],
    ]);
  });

  it("creerDossier transmet l'identification", async () => {
    const { client, rpc } = clientSimule({ data: "s-9", error: null });
    await operationsCabinet(client).creerDossier("k-1", "Client C", {
      nif: "1000123456", rccm: "TG-LOM-2026-B-1", formeJuridique: "SARL", debutExercice: "2026-01-01",
    });
    expect(rpc).toHaveBeenCalledWith("cabinet_creer_dossier", {
      _cabinet: "k-1", _nom: "Client C", _nif: "1000123456", _rccm: "TG-LOM-2026-B-1",
      _forme_juridique: "SARL", _debut_exercice: "2026-01-01",
    });
  });

  it("mesDossiers rend une liste vide quand la base ne rend rien", async () => {
    const { client, rpc } = clientSimule({ data: null, error: null });
    expect(await operationsCabinet(client).mesDossiers()).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("mes_dossiers_cabinet", {});
  });

  it("lève l'erreur de la base, lisible par messageErreur", async () => {
    const { client } = clientSimule({
      data: null,
      error: { message: "CABINET_LIMITE: Limite de 10 dossiers atteinte pour ce cabinet.", code: "P0001" },
    });
    const erreur = await operationsCabinet(client).creerDossier("k-1", "Client 11").catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(Error);
    expect((erreur as { code?: string }).code).toBe("P0001");
    expect(messageErreur(erreur, "x")).toBe("Limite de 10 dossiers atteinte pour ce cabinet.");
  });
});

describe("cabinetOps : fonction Edge cabinet-ops", () => {
  it("ajouterMembre envoie l'action, le rôle par défaut et le cabinet s'il est donné", async () => {
    const reponse = { ok: true, user_id: "u-9", already_existed: false, email_envoye: true };
    const { client, invoke } = clientSimule(undefined, { data: reponse, error: null });
    const ops = operationsCabinet(client);

    expect(await ops.ajouterMembre({ email: "a@b.tg", nom: "Awa" })).toEqual(reponse);
    await ops.ajouterMembre({ email: "c@d.tg", role: "responsable", cabinetId: "k-1" });
    expect(invoke.mock.calls).toEqual([
      ["cabinet-ops", { body: { action: "ajouter_membre", email: "a@b.tg", nom: "Awa", role: "collaborateur" } }],
      ["cabinet-ops", { body: { action: "ajouter_membre", email: "c@d.tg", nom: undefined, role: "responsable", cabinet_id: "k-1" } }],
    ]);
  });

  it("inviterAdminClient envoie la société", async () => {
    const { client, invoke } = clientSimule();
    await operationsCabinet(client).inviterAdminClient({ societeId: "s-1", email: "x@y.tg", nom: "Kofi" });
    expect(invoke).toHaveBeenCalledWith("cabinet-ops", {
      body: { action: "inviter_admin_client", societe_id: "s-1", email: "x@y.tg", nom: "Kofi" },
    });
  });

  it("renvoyerInvitation envoie le compte visé", async () => {
    const { client, invoke } = clientSimule();
    await operationsCabinet(client).renvoyerInvitation("u-3");
    expect(invoke).toHaveBeenCalledWith("cabinet-ops", { body: { action: "renvoyer_invitation", user_id: "u-3" } });
  });

  it("lit le message d'erreur dans le corps de la réponse (statut non 2xx)", async () => {
    const corps = new Response(JSON.stringify({ error: "CABINET_SUPER_ADMIN: Un super-administrateur ne peut pas être membre d'un cabinet." }), {
      status: 400,
    });
    const { client } = clientSimule(undefined, {
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: corps }),
    });
    const erreur = await operationsCabinet(client).ajouterMembre({ email: "sa@b.tg" }).catch((e: unknown) => e);
    expect(messageErreur(erreur, "x")).toBe("Un super-administrateur ne peut pas être membre d'un cabinet.");
  });

  it("lève l'erreur rendue avec un statut 200", async () => {
    const { client } = clientSimule(undefined, { data: { error: "Cette société a déjà un administrateur." }, error: null });
    await expect(
      operationsCabinet(client).inviterAdminClient({ societeId: "s-1", email: "x@y.tg" }),
    ).rejects.toThrow("Cette société a déjà un administrateur.");
  });
});
