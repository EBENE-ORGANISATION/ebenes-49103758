/**
 * Confort d'affichage d'une société, choisi par le super-administrateur.
 *
 * « terrain » : texte et contrôles agrandis, contraste renforcé, pour les agents
 * qui utilisent l'application sur téléphone, dehors. Stocké dans
 * societe_config.theme_custom sous la clé `confort`.
 */

export type Confort = "normal" | "terrain";

/** Lit le confort depuis theme_custom ; toute valeur inconnue vaut « normal ». */
export const lireConfort = (themeCustom: unknown): Confort => {
  if (themeCustom && typeof themeCustom === "object" && !Array.isArray(themeCustom)) {
    const v = (themeCustom as Record<string, unknown>).confort;
    if (v === "terrain") return "terrain";
  }
  return "normal";
};

/** Renvoie theme_custom avec le confort demandé, sans perdre les autres clés. */
export const avecConfort = (themeCustom: unknown, confort: Confort): Record<string, unknown> => {
  const base =
    themeCustom && typeof themeCustom === "object" && !Array.isArray(themeCustom)
      ? { ...(themeCustom as Record<string, unknown>) }
      : {};
  if (confort === "normal") delete base.confort;
  else base.confort = confort;
  return base;
};
