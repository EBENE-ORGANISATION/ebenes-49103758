import type { AppRole, CrossServiceGrant } from "@/hooks/useAuth";

export type AppModule =
  | "dashboard"
  | "compta"
  | "factures"
  | "stock"
  | "immobilisations"
  | "fiscalite"
  | "parametres_sociaux"
  | "grh"
  | "outils_admin";

export type AccessLevel = "none" | "read" | "write" | "validate";

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: "📊 Dashboard",
  compta: "💰 Comptabilité",
  factures: "📄 Factures",
  stock: "📦 Stock",
  immobilisations: "🏢 Immobilisations",
  fiscalite: "🧮 Fiscalité",
  parametres_sociaux: "⚙️ Paramètres sociaux",
  grh: "👥 GRH",
  outils_admin: "🛠️ Outils admin (récap, archives, export/import)",
};

export const LEVEL_LABELS: Record<AccessLevel, string> = {
  none: "Aucun accès",
  read: "Lecture seule",
  write: "Lecture + saisie",
  validate: "Lecture + saisie + validation",
};

const LEVEL_RANK: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  validate: 3,
};

export const MODULES: AppModule[] = [
  "dashboard",
  "compta",
  "factures",
  "stock",
  "immobilisations",
  "fiscalite",
  "parametres_sociaux",
  "grh",
  "outils_admin",
];

export type PermissionMap = Record<AppModule, AccessLevel>;

export interface PermissionOverride {
  module: AppModule;
  level: AccessLevel;
}

const EMPTY: PermissionMap = {
  dashboard: "none",
  compta: "none",
  factures: "none",
  stock: "none",
  immobilisations: "none",
  fiscalite: "none",
  parametres_sociaux: "none",
  grh: "none",
  outils_admin: "none",
};

/** Niveau par défaut accordé pour chaque rôle. */
const ROLE_DEFAULTS: Record<AppRole, Partial<PermissionMap>> = {
  admin: {
    dashboard: "validate",
    compta: "validate",
    factures: "validate",
    stock: "validate",
    immobilisations: "validate",
    fiscalite: "validate",
    parametres_sociaux: "validate",
    grh: "validate",
    outils_admin: "validate",
  },
  admin_general: {
    dashboard: "validate",
    compta: "validate",
    factures: "validate",
    stock: "validate",
    immobilisations: "validate",
    fiscalite: "validate",
    parametres_sociaux: "validate",
    grh: "validate",
    outils_admin: "validate",
  },
  chef_compta: {
    dashboard: "validate",
    compta: "validate",
    factures: "validate",
    stock: "validate",
    immobilisations: "validate",
    fiscalite: "validate",
    parametres_sociaux: "read",
    grh: "read",
    outils_admin: "write",
  },
  membre_compta: {
    compta: "write",
    factures: "write",
    stock: "write",
    immobilisations: "read",
    fiscalite: "read",
  },
  chef_grh: {
    dashboard: "validate",
    grh: "validate",
    parametres_sociaux: "write",
    fiscalite: "read",
    compta: "read",
    factures: "read",
    stock: "read",
    immobilisations: "read",
    outils_admin: "write",
  },
  membre_grh: {
    grh: "write",
  },
  dashboard_viewer: {
    dashboard: "read",
  },
  employe: {},
  // Anciens rôles : compatibilité descendante
  rh: { grh: "write" },
  comptable: { compta: "write", factures: "write", stock: "write", immobilisations: "read", fiscalite: "read" },
  saisie: { compta: "write", factures: "write", stock: "write" },
};

const merge = (acc: PermissionMap, partial: Partial<PermissionMap>): PermissionMap => {
  const out = { ...acc };
  for (const k of MODULES) {
    const v = partial[k];
    if (v && LEVEL_RANK[v] > LEVEL_RANK[out[k]]) out[k] = v;
  }
  return out;
};

const grantToPartial = (g: CrossServiceGrant): Partial<PermissionMap> => {
  // Un grant "compta" niveau membre = write sur compta/factures/stock/immobilisations + read fiscalite.
  // Un grant "compta" niveau chef = validate sur ces mêmes modules + write sur fiscalite.
  // Un grant "grh"   niveau membre = write sur grh.
  // Un grant "grh"   niveau chef   = validate sur grh + write sur parametres_sociaux + read fiscalite.
  if (g.service === "compta") {
    return g.level === "chef"
      ? { compta: "validate", factures: "validate", stock: "validate", immobilisations: "validate", fiscalite: "validate", parametres_sociaux: "read" }
      : { compta: "write", factures: "write", stock: "write", immobilisations: "read", fiscalite: "read" };
  }
  if (g.service === "grh") {
    return g.level === "chef"
      ? { grh: "validate", parametres_sociaux: "write", fiscalite: "read", dashboard: "validate" }
      : { grh: "write" };
  }
  return {};
};

export function computePermissions(
  roles: AppRole[],
  grants: CrossServiceGrant[],
  overrides: PermissionOverride[],
): PermissionMap {
  let perms: PermissionMap = { ...EMPTY };
  for (const r of roles) {
    perms = merge(perms, ROLE_DEFAULTS[r] || {});
  }
  for (const g of grants) {
    perms = merge(perms, grantToPartial(g));
  }
  // Les overrides admin REMPLACENT (ils peuvent abaisser ou monter)
  for (const o of overrides) {
    perms[o.module] = o.level;
  }
  return perms;
}

/** True si le niveau effectif est >= au niveau requis. */
export function can(level: AccessLevel | undefined, required: AccessLevel): boolean {
  if (!level) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}
