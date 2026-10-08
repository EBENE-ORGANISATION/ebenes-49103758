// Montant en toutes lettres (orthographe traditionnelle), pour la mention
// « Arrêtée la présente facture à la somme de … » — module pur.

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99. */
const moinsDeCent = (n: number): string => {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    // soixante-dix… / quatre-vingt-dix…
    const base = d === 7 ? "soixante" : "quatre-vingt";
    const reste = 10 + u;
    return base + (d === 7 && u === 1 ? " et " : "-") + UNITES[reste];
  }
  if (d === 8) return u === 0 ? "quatre-vingts" : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  if (u === 1) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
};

/** 0 à 999 ; `final` : le groupe termine le nombre (accord de « cent » et « vingt »). */
const moinsDeMille = (n: number, final: boolean): string => {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let texte = "";
  if (c > 0) {
    texte = c === 1 ? "cent" : `${UNITES[c]} cent${r === 0 && final ? "s" : ""}`;
  }
  if (r > 0) {
    let fin = moinsDeCent(r);
    if (!final && fin === "quatre-vingts") fin = "quatre-vingt";
    texte = texte ? `${texte} ${fin}` : fin;
  }
  return texte;
};

/** Nombre entier positif en lettres : 118000 → « cent dix-huit mille ». */
export const nombreEnLettres = (valeur: number): string => {
  let n = Math.floor(Math.abs(valeur));
  if (n === 0) return "zéro";
  const parties: string[] = [];
  const echelles: [number, string, string][] = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ];
  for (const [taille, singulier, pluriel] of echelles) {
    const q = Math.floor(n / taille);
    if (q > 0) {
      parties.push(`${moinsDeMille(q, true)} ${q > 1 ? pluriel : singulier}`);
      n %= taille;
    }
  }
  const milliers = Math.floor(n / 1000);
  if (milliers > 0) {
    parties.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`);
    n %= 1000;
  }
  if (n > 0) parties.push(moinsDeMille(n, true));
  return parties.join(" ");
};

/** « Cent dix-huit mille francs CFA » (arrondi au franc). */
export const montantEnLettres = (montant: number): string => {
  const texte = nombreEnLettres(Math.round(montant));
  return `${texte.charAt(0).toUpperCase()}${texte.slice(1)} franc${Math.round(Math.abs(montant)) > 1 ? "s" : ""} CFA`;
};
