/**
 * Espace cabinet : opérations (plan, tâche 5).
 *
 * Enveloppes typées des fonctions SQL cabinet_* (supabase.rpc) et de la
 * fonction Edge cabinet-ops (supabase.functions.invoke). La base contrôle
 * l'appelant ; un refus lève une Error dont le message garde le texte de la
 * base (« CABINET_<CODE>: … ») : messageErreur (ebene-utils) l'affiche.
 *
 * Les fonctions de la migration 20261027124000 ne figurent pas encore dans les
 * types générés (src/integrations/supabase/types.ts, régénérés en tâche 6) :
 * les appels passent par un client typé ici, au plus juste.
 */
import { supabase } from "@/integrations/supabase/client";

export type MissionCabinet = "tenue_complete" | "compta_fiscalite" | "paie_social" | "declarations" | "lecture";
export type RoleCabinet = "responsable" | "collaborateur" | "stagiaire";
export type EtatDossierCabinet = "invitation" | "actif" | "depart_demande" | "termine";

/** Ligne de mes_dossiers_cabinet(). */
export interface DossierCabinet {
  societe_id: string;
  societe_nom: string;
  cabinet_nom: string;
  mission: MissionCabinet;
  etat: EtatDossierCabinet;
  mon_role: RoleCabinet;
}

/** Ligne de cabinet_collaborateurs_dossier(). */
export interface CollaborateurDossier {
  user_id: string;
  nom: string;
  role: RoleCabinet;
  mission: MissionCabinet;
}

/** Réponse de cabinet-ops. */
export interface ResultatInvitation {
  ok: true;
  user_id: string;
  /** Rendu au super-administrateur seulement. */
  already_existed?: boolean;
  /** Faux si le compte est créé mais l'e-mail n'a pas pu partir. */
  email_envoye: boolean;
}

/** Formes juridiques de l'écran Identification (FormeJuridique). */
export type FormeJuridiqueDossier =
  | "SA_PUBLIQUE" | "SA" | "SARL" | "SCS" | "SNC" | "SP" | "GIE" | "ASSOCIATION" | "SAS" | "EI" | "AUTRE";

/** Identification minimale, facultative, d'un dossier créé par le cabinet. */
export interface IdentificationDossier {
  nif?: string | null;
  rccm?: string | null;
  formeJuridique?: FormeJuridiqueDossier | null;
  /** Date ISO (AAAA-MM-JJ) ; donne la première année d'exercice. */
  debutExercice?: string | null;
}

interface ErreurSupabase {
  message?: string;
  code?: string;
}

/** Ce que les enveloppes utilisent du client Supabase (remplaçable en test). */
export interface ClientCabinet {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: ErreurSupabase | null }>;
  functions: {
    invoke: (nom: string, options: { body: unknown }) => Promise<{ data: unknown; error: unknown }>;
  };
}

const appeler = async <T>(client: ClientCabinet, fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message ?? fn), { code: error.code });
  return data as T;
};

/**
 * Message d'une erreur de fonction Edge : supabase-js rend une erreur
 * générique pour un statut non 2xx ; le texte utile est dans le corps
 * ({ error }), accessible par error.context (la Response).
 */
const messageEdge = async (erreur: unknown): Promise<string> => {
  const contexte = (erreur as { context?: unknown })?.context;
  if (contexte && typeof (contexte as Response).json === "function") {
    try {
      const corps = (await (contexte as Response).clone().json()) as { error?: unknown };
      if (corps?.error) return String(corps.error);
    } catch {
      /* corps illisible : message générique */
    }
  }
  return String((erreur as { message?: string })?.message ?? "Erreur de la fonction cabinet-ops");
};

const invoquer = async (client: ClientCabinet, body: Record<string, unknown>): Promise<ResultatInvitation> => {
  const { data, error } = await client.functions.invoke("cabinet-ops", { body });
  if (error) throw new Error(await messageEdge(error));
  const corps = data as { error?: unknown } | null;
  if (corps && typeof corps === "object" && corps.error) throw new Error(String(corps.error));
  return data as ResultatInvitation;
};

/** Les opérations, sur un client donné. */
export const operationsCabinet = (client: ClientCabinet) => ({
  /** Super-admin (aal2) : crée le cabinet et son premier responsable ; rend l'id du cabinet. */
  creerCabinet: (nom: string, responsableId: string, maxDossiers = 10) =>
    appeler<string>(client, "cabinet_creer", { _nom: nom, _responsable: responsableId, _max_dossiers: maxDossiers }),

  /** Responsable ou super-admin : ajoute un membre (compte existant), change son rôle ou son état. */
  definirMembre: (cabinetId: string, userId: string, role: RoleCabinet, actif: boolean) =>
    appeler<void>(client, "cabinet_definir_membre", { _cabinet: cabinetId, _user: userId, _role: role, _actif: actif }),

  /** Responsable : crée la société cliente et le lien (tenue complète) ; rend l'id de la société. */
  creerDossier: (cabinetId: string, nom: string, identification: IdentificationDossier = {}) =>
    appeler<string>(client, "cabinet_creer_dossier", {
      _cabinet: cabinetId,
      _nom: nom,
      _nif: identification.nif ?? null,
      _rccm: identification.rccm ?? null,
      _forme_juridique: identification.formeJuridique ?? null,
      _debut_exercice: identification.debutExercice ?? null,
    }),

  /** Super-admin : rattache une société existante ; rend l'id du lien. */
  rattacher: (cabinetId: string, societeId: string, mission: MissionCabinet) =>
    appeler<string>(client, "cabinet_rattacher", { _cabinet: cabinetId, _societe: societeId, _mission: mission }),

  /** Responsable : attribue un dossier (lien) à un collaborateur ou un stagiaire actif. */
  attribuer: (dossierId: string, userId: string, mission: MissionCabinet) =>
    appeler<void>(client, "cabinet_attribuer", { _dossier: dossierId, _user: userId, _mission: mission }),

  /** Responsable : retire une attribution. */
  retirerAttribution: (dossierId: string, userId: string) =>
    appeler<void>(client, "cabinet_retirer_attribution", { _dossier: dossierId, _user: userId }),

  /** Administrateur du client ou super-admin : change la mission (plafond) du dossier. */
  changerMission: (dossierId: string, mission: MissionCabinet) =>
    appeler<void>(client, "cabinet_changer_mission", { _dossier: dossierId, _mission: mission }),

  /** Dossiers où l'utilisateur connecté agit comme cabinet. */
  mesDossiers: async () => (await appeler<DossierCabinet[] | null>(client, "mes_dossiers_cabinet", {})) ?? [],

  /** Administrateur du client ou super-admin : membres du cabinet qui ont accès à la société. */
  collaborateursDossier: async (societeId: string) =>
    (await appeler<CollaborateurDossier[] | null>(client, "cabinet_collaborateurs_dossier", { _societe: societeId })) ?? [],

  /** Responsable : ajoute un membre par e-mail (nouveau compte seulement). Super-admin (cabinetId) : compte existant possible. */
  ajouterMembre: (params: { email: string; nom?: string; role?: RoleCabinet; cabinetId?: string }) =>
    invoquer(client, {
      action: "ajouter_membre",
      email: params.email,
      nom: params.nom,
      role: params.role ?? "collaborateur",
      ...(params.cabinetId ? { cabinet_id: params.cabinetId } : {}),
    }),

  /** Super-admin : invite le premier administrateur d'un client suivi par un cabinet. */
  inviterAdminClient: (params: { societeId: string; email: string; nom?: string }) =>
    invoquer(client, {
      action: "inviter_admin_client",
      societe_id: params.societeId,
      email: params.email,
      nom: params.nom,
    }),

  /** Nouveau lien d'activation pour un compte jamais connecté (responsable : membre de son cabinet). */
  renvoyerInvitation: (userId: string) =>
    invoquer(client, { action: "renvoyer_invitation", user_id: userId }),
});

export type OperationsCabinet = ReturnType<typeof operationsCabinet>;

/** Les opérations sur le client de l'application. */
export const cabinetOps: OperationsCabinet = operationsCabinet(supabase as unknown as ClientCabinet);
