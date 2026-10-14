/**
 * Modèle de documents « D » (fusion Registre × Bandeau Ébène) : devis, facture,
 * proforma, bulletin de paie, contrat. Styles en ligne (px, page A4 de 794 px)
 * pour que l'aperçu, l'impression, l'export PDF (html2canvas) et l'export Word
 * donnent la même mise en page.
 */
/* eslint-disable react-refresh/only-export-components -- constantes et petits composants de mise en page partagés */
import type { CSSProperties, ReactNode } from "react";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import "@fontsource/source-serif-4/latin-500.css";
import "@fontsource/source-serif-4/latin-700.css";

export const SERIF = '"Source Serif 4", Georgia, "Times New Roman", serif';
export const SANS = '"Source Sans 3", "Segoe UI", Arial, sans-serif';
export const ENCRE = "#1d1715";
export const GRIS = "#6b5c56";
export const FILET = "#e6dcd7";
export const BORDEAUX_DEFAUT = "#3d0000";

/** Couleur principale de la société, à défaut le bordeaux Ébène (assez foncée pour du texte blanc). */
export const couleurDocument = (couleur?: string | null) =>
  couleur && /^#[0-9a-f]{6}$/i.test(couleur) ? couleur : BORDEAUX_DEFAUT;

/**
 * Page A4 : 794 × 1123 px à 96 ppp ; la hauteur grandit si le contenu déborde.
 * Un peu moins de 1123 px, pour que l'export PDF ne crée pas une 2ᵉ page vide.
 * L'élément racine porte `data-page-a4` (marges nulles à l'impression et en PDF).
 */
export const page = (extra?: CSSProperties): CSSProperties => ({
  width: "794px",
  minHeight: "1118px",
  boxSizing: "border-box",
  padding: "46px 56px 90px",
  position: "relative",
  background: "#fff",
  color: ENCRE,
  fontFamily: SANS,
  fontSize: "13px",
  lineHeight: 1.45,
  margin: "0 auto",
  ...extra,
});

export const lbl: CSSProperties = { fontSize: "12px", color: GRIS };
export const num: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

export interface SocieteDocument {
  nom: string;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
  nif?: string | null;
  rccm?: string | null;
  logoUrl?: string | null;
  couleur?: string | null;
}

/** Initiales de la société pour la pastille, quand elle n'a pas de logo. */
const initiales = (nom: string) =>
  nom
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join("") || "•";

/** Fin bandeau de couleur en haut de page. */
export const Bande = ({ couleur }: { couleur: string }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "10px", background: couleur }} />
);

/** Logo, ou pastille aux initiales si la société n'en a pas. */
export const Marque = ({ societe, taille = 54 }: { societe: SocieteDocument; taille?: number }) => {
  const c = couleurDocument(societe.couleur);
  if (societe.logoUrl)
    return <img src={societe.logoUrl} alt={societe.nom} crossOrigin="anonymous" style={{ height: `${taille}px`, maxWidth: "160px", objectFit: "contain" }} />;
  return (
    <div
      style={{
        width: `${taille}px`, height: `${taille}px`, borderRadius: "50%", background: c, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: SERIF, fontWeight: 700, fontSize: `${Math.round(taille * 0.36)}px`, flexShrink: 0,
      }}
    >
      {initiales(societe.nom)}
    </div>
  );
};

/** En-tête : marque et coordonnées à gauche, type et numéro du document à droite. */
export const EnTete = ({ societe, titre, sousTitre, lignes, tailleTitre = 34 }: { societe: SocieteDocument; titre: string; sousTitre?: ReactNode; lignes?: ReactNode[]; tailleTitre?: number }) => {
  const c = couleurDocument(societe.couleur);
  const coordonnees = [societe.adresse, societe.telephone, societe.email].filter(Boolean).join(" · ");
  const legal = [societe.nif && `NIF ${societe.nif}`, societe.rccm && `RCCM ${societe.rccm}`].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "24px" }}>
      <div style={{ display: "flex", gap: "14px", alignItems: "center", minWidth: 0 }}>
        <Marque societe={societe} />
        <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: "20px", fontWeight: 700 }}>{societe.nom}</div>
          {coordonnees && <div style={lbl}>{coordonnees}</div>}
          {legal && <div style={lbl}>{legal}</div>}
          {lignes?.map((l, i) => <div key={i} style={lbl}>{l}</div>)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: `${tailleTitre}px`, fontWeight: 700, color: c, lineHeight: 1.15 }}>{titre}</div>
        {sousTitre && <div style={{ fontWeight: 600 }}>{sousTitre}</div>}
      </div>
    </div>
  );
};

/** Bandeau de chiffres-clés sous l'en-tête (date, validité, montant…). */
export const ChiffresCles = ({ items }: { items: { label: string; valeur: ReactNode; accent?: boolean }[] }) => (
  <div
    style={{
      display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
      marginTop: "18px", borderTop: `1px solid ${ENCRE}`, borderBottom: `1px solid ${ENCRE}`,
    }}
  >
    {items.map((it, i) => (
      <div
        key={it.label}
        style={{ padding: "9px 0", display: "flex", flexDirection: "column", alignItems: i === items.length - 1 ? "flex-end" : "flex-start" }}
      >
        <span style={lbl}>{it.label}</span>
        <span style={{ fontWeight: it.accent ? 700 : 600 }}>{it.valeur}</span>
      </div>
    ))}
  </div>
);

/** Zone de signature : intitulé, précision, puis un trait. */
export const Signature = ({ titre, precision, hauteur = 74 }: { titre: string; precision?: string; hauteur?: number }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
    <span style={{ fontWeight: 600 }}>{titre}</span>
    {precision && <span style={lbl}>{precision}</span>}
    <div style={{ height: `${hauteur}px`, borderBottom: `1px solid ${ENCRE}` }} />
  </div>
);

/** Pied de page : mentions légales à gauche, texte libre à droite. */
export const Pied = ({ gauche, droite }: { gauche: ReactNode; droite?: ReactNode }) => (
  <div
    style={{
      position: "absolute", left: "56px", right: "56px", bottom: "30px", borderTop: `1px solid ${ENCRE}`,
      paddingTop: "8px", display: "flex", justifyContent: "space-between", gap: "16px", fontSize: "12px", color: GRIS,
    }}
  >
    <span>{gauche}</span>
    {droite && <span style={{ whiteSpace: "nowrap" }}>{droite}</span>}
  </div>
);

/** Mentions légales de la société sur une ligne (pied de page). */
export const mentionsSociete = (s: SocieteDocument) =>
  [s.nom, s.nif && `NIF ${s.nif}`, s.rccm && `RCCM ${s.rccm}`, s.adresse].filter(Boolean).join(" · ");
