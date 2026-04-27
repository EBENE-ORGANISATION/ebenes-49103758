/**
 * Theme engine multi-société.
 *
 * Convertit les couleurs HEX (`#RRGGBB`) de societe_config en tokens HSL
 * et les injecte dans :root, surchargeant ainsi le design system existant
 * (--primary / --secondary / --accent et leurs *-foreground / *-glow).
 *
 * On ne touche PAS aux autres tokens (background, muted, destructive…).
 * On expose AUSSI des alias --color-primary / --color-secondary / --color-accent
 * pour les nouveaux composants qui voudraient utiliser les HEX bruts.
 */

const FALLBACK = {
  primaire: "#1F3864",
  secondaire: "#2E75B6",
  accent: "#C55A11",
};

interface ThemeInput {
  couleur_primaire?: string | null;
  couleur_secondaire?: string | null;
  couleur_accent?: string | null;
  /** Logo de la société (URL absolue ou data:). Utilisé comme favicon. */
  logo_url?: string | null;
  /** Nom de la société (utilisé pour <title>). */
  nom?: string | null;
}

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

const DEFAULT_TITLE = "Appli mère — Gestion d'Entreprise";
const DEFAULT_FAVICON = "/favicon.png";

/** Met à jour le <title> de l'onglet selon la société active. */
const applyDocumentTitle = (nom?: string | null): void => {
  if (typeof document === "undefined") return;
  const clean = (nom || "").trim();
  document.title = clean
    ? `${clean} — Gestion d'Entreprise`
    : DEFAULT_TITLE;

  // Met aussi à jour les meta OG/Twitter title si présents
  const setMeta = (selector: string, value: string) => {
    const el = document.head.querySelector<HTMLMetaElement>(selector);
    if (el) el.setAttribute("content", value);
  };
  setMeta('meta[property="og:title"]', document.title);
  setMeta('meta[name="twitter:title"]', document.title);
  setMeta('meta[name="apple-mobile-web-app-title"]', clean || "Appli mère");
};

/** Remplace le favicon par le logo de la société (ou le défaut). */
const applyFavicon = (logoUrl?: string | null): void => {
  if (typeof document === "undefined") return;
  const href = (logoUrl || "").trim() || DEFAULT_FAVICON;
  const selectors = [
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
  ];
  selectors.forEach((sel) => {
    let el = document.head.querySelector<HTMLLinkElement>(sel);
    if (!el) {
      el = document.createElement("link");
      el.rel = sel.includes("apple") ? "apple-touch-icon" : "icon";
      document.head.appendChild(el);
    }
    el.href = href;
    // Si on utilise une URL externe (logo société), on retire le type figé
    if (logoUrl) el.removeAttribute("type");
    else el.setAttribute("type", "image/png");
  });
};

/** Renvoie "h s% l%" prêt à être injecté dans une variable CSS HSL. */
const hexToHslTriple = (hex: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return "0 0% 0%";
  let [r, g, b] = rgb;
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

/** Calcule un foreground lisible (blanc ou quasi-noir) selon la luminance perçue. */
const foregroundFor = (hex: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return "0 0% 100%";
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? "0 0% 8%" : "0 0% 100%";
};

/** Variante "glow" légèrement plus claire de la couleur primaire. */
const glowFor = (hex: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hexToHslTriple(hex);
  // On augmente la luminosité de ~6 points
  const triple = hexToHslTriple(hex);
  const [hh, ss, ll] = triple.split(" ");
  const lNum = parseInt(ll, 10);
  const newL = Math.min(85, lNum + 6);
  return `${hh} ${ss} ${newL}%`;
};

export const applyTheme = (cfg: ThemeInput | null | undefined): void => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const primaire = cfg?.couleur_primaire || FALLBACK.primaire;
  const secondaire = cfg?.couleur_secondaire || FALLBACK.secondaire;
  const accent = cfg?.couleur_accent || FALLBACK.accent;

  // 1) Tokens HSL existants (override du design system)
  root.style.setProperty("--primary", hexToHslTriple(primaire));
  root.style.setProperty("--primary-foreground", foregroundFor(primaire));
  root.style.setProperty("--primary-glow", glowFor(primaire));
  root.style.setProperty("--ring", hexToHslTriple(primaire));

  root.style.setProperty("--secondary", hexToHslTriple(secondaire));
  root.style.setProperty("--secondary-foreground", foregroundFor(secondaire));

  root.style.setProperty("--accent", hexToHslTriple(accent));
  root.style.setProperty("--accent-foreground", foregroundFor(accent));

  // 2) Header gradient dynamique
  const pHsl = hexToHslTriple(primaire);
  const aHsl = hexToHslTriple(accent);
  root.style.setProperty(
    "--header-gradient",
    `linear-gradient(135deg, hsl(${pHsl} / 0.85) 0%, hsl(${pHsl}) 50%, hsl(${aHsl}) 100%)`
  );

  // 3) Alias HEX bruts pour usages directs (PDF, SVG inline, etc.)
  root.style.setProperty("--color-primary", primaire);
  root.style.setProperty("--color-secondary", secondaire);
  root.style.setProperty("--color-accent", accent);

  // 4) Identité visuelle de l'onglet (titre + favicon)
  applyDocumentTitle(cfg?.nom);
  applyFavicon(cfg?.logo_url);
};

export const resetTheme = (): void => {
  applyTheme({
    couleur_primaire: FALLBACK.primaire,
    couleur_secondaire: FALLBACK.secondaire,
    couleur_accent: FALLBACK.accent,
    nom: null,
    logo_url: null,
  });
};
