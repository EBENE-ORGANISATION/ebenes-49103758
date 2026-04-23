export const formatMontant = (n: number): string => {
  const abs = Math.abs(Math.round(n));
  return abs.toLocaleString("fr-FR") + " F";
};

export const formatMontantSigne = (n: number): string => {
  const sign = n >= 0 ? "+" : "-";
  return sign + " " + formatMontant(n);
};

export const moisKey = (annee: number, mois: number) => `${annee}-${mois}`;

export const todayISO = () => new Date().toISOString().split("T")[0];

export const escapeHtml = (str: string): string =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const newId = () => Date.now() + Math.floor(Math.random() * 1000);