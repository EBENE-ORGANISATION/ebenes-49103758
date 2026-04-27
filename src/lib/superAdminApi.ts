import { supabase } from "@/integrations/supabase/client";

/**
 * Wrapper unique pour appeler l'Edge Function `super-admin-ops`.
 * La fonction côté serveur valide que l'appelant a bien le rôle admin_general.
 */
export async function callSuperAdmin<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("super-admin-ops", {
    body: { action, payload },
  });
  if (error) throw new Error(error.message || "Erreur appel super-admin-ops");
  if (data && typeof data === "object" && "error" in data && (data as any).error) {
    throw new Error(String((data as any).error));
  }
  return data as T;
}

/** Génère un slug compatible URL à partir d'un nom de société. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface ModuleFlags {
  module_stock: boolean;
  module_grh: boolean;
  module_fiscalite: boolean;
  module_immobilisations: boolean;
  module_ia: boolean;
  module_multi_societes: boolean;
}

export const DEFAULT_MODULES_BY_PLAN: Record<string, ModuleFlags> = {
  starter: {
    module_stock: true,
    module_grh: true,
    module_fiscalite: true,
    module_immobilisations: false,
    module_ia: false,
    module_multi_societes: false,
  },
  pro: {
    module_stock: true,
    module_grh: true,
    module_fiscalite: true,
    module_immobilisations: true,
    module_ia: true,
    module_multi_societes: false,
  },
  enterprise: {
    module_stock: true,
    module_grh: true,
    module_fiscalite: true,
    module_immobilisations: true,
    module_ia: true,
    module_multi_societes: true,
  },
};

export const MODULE_LABELS: Record<keyof ModuleFlags, string> = {
  module_stock: "Stock",
  module_grh: "GRH",
  module_fiscalite: "Fiscalité",
  module_immobilisations: "Immobilisations",
  module_ia: "Assistant IA",
  module_multi_societes: "Multi-sociétés",
};