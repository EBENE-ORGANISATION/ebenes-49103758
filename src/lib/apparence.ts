/**
 * Apparence d'une société, choisie par le super-administrateur.
 * Stockée dans societe_config.theme_custom :
 *
 * - `theme`   : « actuel » (couleurs de la société, Poppins) ou « ebene-bordeaux »
 *               (cadre ébène, pages claires, bordeaux pour l'action, Source Serif 4 + Source Sans 3) ;
 * - `confort` : « normal » ou « terrain » (texte et contrôles agrandis, contraste renforcé,
 *               pour les agents qui utilisent l'application sur téléphone, dehors).
 *
 * Une clé absente vaut la première valeur (« actuel », « normal ») : les sociétés
 * existantes gardent leur apparence tant que rien n'est choisi.
 */

export type Confort = "normal" | "terrain";
export type ThemeApparence = "actuel" | "ebene-bordeaux";

export const THEMES: ThemeApparence[] = ["actuel", "ebene-bordeaux"];

const enObjet = (themeCustom: unknown): Record<string, unknown> =>
  themeCustom && typeof themeCustom === "object" && !Array.isArray(themeCustom)
    ? (themeCustom as Record<string, unknown>)
    : {};

/** Lit le confort depuis theme_custom ; toute valeur inconnue vaut « normal ». */
export const lireConfort = (themeCustom: unknown): Confort =>
  enObjet(themeCustom).confort === "terrain" ? "terrain" : "normal";

/** Lit le thème depuis theme_custom ; toute valeur inconnue vaut « actuel ». */
export const lireTheme = (themeCustom: unknown): ThemeApparence =>
  enObjet(themeCustom).theme === "ebene-bordeaux" ? "ebene-bordeaux" : "actuel";

/** Renvoie theme_custom avec une clé modifiée, sans perdre les autres ; la valeur par défaut retire la clé. */
const avecReglage = (themeCustom: unknown, cle: string, valeur: string, parDefaut: string) => {
  const base = { ...enObjet(themeCustom) };
  if (valeur === parDefaut) delete base[cle];
  else base[cle] = valeur;
  return base;
};

export const avecConfort = (themeCustom: unknown, confort: Confort): Record<string, unknown> =>
  avecReglage(themeCustom, "confort", confort, "normal");

export const avecTheme = (themeCustom: unknown, theme: ThemeApparence): Record<string, unknown> =>
  avecReglage(themeCustom, "theme", theme, "actuel");
