/**
 * Affiche un nom d'agent sous la forme « NOM Prénoms ».
 * Le profil ne contient qu'un champ libre (souvent « Prénoms NOM ») : les mots
 * entièrement en majuscules sont pris pour le nom de famille et placés en tête.
 * Sans mot en majuscules, le nom est rendu tel que saisi.
 */
const estNomDeFamille = (mot: string) =>
  /\p{L}{2,}/u.test(mot) && mot === mot.toLocaleUpperCase("fr-FR") && mot !== mot.toLocaleLowerCase("fr-FR");

export const nomPrenoms = (nomComplet: string): string => {
  const mots = nomComplet.trim().split(/\s+/).filter(Boolean);
  const nom = mots.filter(estNomDeFamille);
  if (nom.length === 0 || nom.length === mots.length) return mots.join(" ");
  return [...nom, ...mots.filter((m) => !estNomDeFamille(m))].join(" ");
};
