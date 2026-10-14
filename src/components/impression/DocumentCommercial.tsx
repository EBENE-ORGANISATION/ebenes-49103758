/**
 * Devis, facture et proforma au modèle D : en-tête, chiffres-clés, client,
 * lignes regroupées par activité avec sous-totaux, totaux, montant en lettres,
 * conditions ou coordonnées bancaires, signatures, pied de page légal.
 */
import { Fragment, type CSSProperties } from "react";
import type { LignePrestation } from "@/types/ebene";
import { formatMontant, dateFr } from "@/lib/ebene-utils";
import { montantEnLettres } from "@/lib/montantEnLettres";
import {
  Bande, ChiffresCles, EnTete, Pied, Signature, couleurDocument, mentionsSociete, page, lbl, num,
  SERIF, ENCRE, GRIS, FILET, type SocieteDocument,
} from "./styleDocument";

export type TypeDocumentCommercial = "devis" | "facture" | "proforma";

export interface LigneDocument extends LignePrestation {
  /** Activité de la ligne ; à défaut, celle du document. */
  activiteId?: string | null;
}

export interface DocumentCommercialProps {
  type: TypeDocumentCommercial;
  numero: string;
  date: string;
  /** Devis : date limite de validité. */
  dateValidite?: string;
  client: string;
  lignes: LigneDocument[];
  reduction: number;
  avecTva: boolean;
  totalHT: number;
  totalTva: number;
  totalTtc: number;
  taxeSejour?: number;
  /** Activité du document (dimension « activités »). */
  activiteId?: string | null;
  activites: { id: string; nom: string; adresse?: string | null; telephone?: string | null }[];
  societe: SocieteDocument;
  /** Facture réglée. */
  payee?: boolean;
  banques?: { banque: string; compte?: string }[];
  /** Mention libre des paramètres société (pied de facture). */
  mention?: string;
  /** Id de l'élément imprimable (impression, PDF, Word). */
  id?: string;
}

const TITRES: Record<TypeDocumentCommercial, string> = { devis: "Devis", facture: "Facture", proforma: "Facture proforma" };

const th: CSSProperties = { fontSize: "12px", fontWeight: 600, textAlign: "left", padding: "7px 8px" };
const td: CSSProperties = { padding: "7px 8px", borderBottom: `1px solid ${FILET}`, verticalAlign: "top" };

/** Quantité et prix unitaire d'une ligne : ceux de l'article du stock, sinon 1 × montant. */
const qtePu = (l: LignePrestation) => {
  const q = l.quantite && l.quantite > 0 ? l.quantite : 1;
  return { q, pu: l.prixUnitaire ?? l.montant / q };
};

export const DocumentCommercial = (p: DocumentCommercialProps) => {
  const c = couleurDocument(p.societe.couleur);
  const nomActivite = (id?: string | null) => p.activites.find((a) => a.id === id)?.nom ?? null;

  // Lignes regroupées par activité (ordre de première apparition)
  const groupes: { activite: string | null; lignes: LigneDocument[] }[] = [];
  for (const l of p.lignes) {
    const a = nomActivite(l.activiteId ?? p.activiteId);
    let g = groupes.find((x) => x.activite === a);
    if (!g) groupes.push((g = { activite: a, lignes: [] }));
    g.lignes.push(l);
  }
  const plusieurs = groupes.length > 1;

  const annexe = p.activites.find((a) => a.id === p.activiteId);
  const enLettres = `${montantEnLettres(p.totalTtc)} ${p.avecTva ? "toutes taxes comprises" : "hors taxes"}.`;
  const intro = p.type === "devis" ? "Arrêté le présent devis à la somme de" : p.type === "proforma" ? "Arrêtée la présente proforma à la somme de" : "Arrêtée la présente facture à la somme de";

  const cles =
    p.type === "devis"
      ? [
          { label: "Date", valeur: dateFr(p.date) },
          ...(p.dateValidite ? [{ label: "Valable jusqu'au", valeur: dateFr(p.dateValidite) }] : []),
          { label: "Montant TTC", valeur: <span style={{ color: c }}>{formatMontant(p.totalTtc)}</span>, accent: true },
        ]
      : [
          { label: "Date", valeur: dateFr(p.date) },
          ...(p.type === "facture"
            ? [{ label: "Statut", valeur: <span style={{ color: p.payee ? "#1e5b2b" : ENCRE }}>{p.payee ? "Acquittée" : "À régler"}</span> }]
            : [{ label: "Nature", valeur: "Document sans valeur comptable" }]),
          {
            label: p.type === "facture" && !p.payee ? "Reste à payer" : "Montant TTC",
            valeur: <span style={{ color: c }}>{formatMontant(p.totalTtc)}</span>,
            accent: true,
          },
        ];

  return (
    <div id={p.id} data-page-a4="" style={page()}>
      <Bande couleur={c} />
      <EnTete societe={p.societe} titre={TITRES[p.type]} sousTitre={p.numero} />
      <ChiffresCles items={cles} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "32px", marginTop: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          <span style={lbl}>{p.type === "devis" ? "Client" : "Facturé à"}</span>
          <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "15px" }}>{p.client}</span>
        </div>
        {annexe && (annexe.adresse || annexe.telephone) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            <span style={lbl}>Établissement</span>
            <span style={{ fontWeight: 600 }}>{annexe.nom}</span>
            <span>{[annexe.adresse, annexe.telephone].filter(Boolean).join(" · ")}</span>
          </div>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "55%", color: c, borderBottom: `2px solid ${c}` }}>Désignation</th>
            <th style={{ ...th, ...num, color: c, borderBottom: `2px solid ${c}` }}>Qté</th>
            <th style={{ ...th, ...num, color: c, borderBottom: `2px solid ${c}` }}>P.U. HT</th>
            <th style={{ ...th, ...num, color: c, borderBottom: `2px solid ${c}` }}>Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {groupes.map((g, gi) => (
            <Fragment key={gi}>
              {g.activite && (
                <tr>
                  <td colSpan={4} style={{ ...td, fontFamily: SERIF, fontWeight: 700, color: c, paddingTop: "12px", borderBottom: 0 }}>{g.activite}</td>
                </tr>
              )}
              {g.lignes.map((l, i) => {
                const { q, pu } = qtePu(l);
                return (
                  <tr key={i}>
                    <td style={td}>{l.description}</td>
                    <td style={{ ...td, ...num }}>{q.toLocaleString("fr-FR")}</td>
                    <td style={{ ...td, ...num }}>{formatMontant(pu)}</td>
                    <td style={{ ...td, ...num }}>{formatMontant(l.montant)}</td>
                  </tr>
                );
              })}
              {plusieurs && (
                <tr>
                  <td colSpan={3} style={{ ...td, fontSize: "12px", color: GRIS, borderBottom: `1px solid ${ENCRE}` }}>Sous-total {g.activite ?? "autres prestations"}</td>
                  <td style={{ ...td, ...num, fontSize: "12px", color: GRIS, borderBottom: `1px solid ${ENCRE}` }}>{formatMontant(g.lignes.reduce((s, l) => s + l.montant, 0))}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "28px", marginTop: "14px", alignItems: "flex-start" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3px", paddingTop: "2px" }}>
          <span style={lbl}>{intro}</span>
          <span style={{ fontFamily: SERIF, fontSize: "14px", fontWeight: 500 }}>{enLettres}</span>
        </div>
        <div style={{ width: "290px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {p.reduction > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={lbl}>Réduction</span><span style={num}>− {formatMontant(p.reduction)}</span></div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={lbl}>Total HT</span><span style={num}>{formatMontant(p.totalHT)}</span></div>
          {p.avecTva && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={lbl}>TVA 18 %</span><span style={num}>{formatMontant(p.totalTva)}</span></div>
          )}
          {(p.taxeSejour ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={lbl}>Taxe de séjour (hors TVA)</span><span style={num}>{formatMontant(p.taxeSejour ?? 0)}</span></div>
          )}
          <div style={{ background: c, color: "#fff", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "4px" }}>
            <span style={{ fontWeight: 600 }}>{p.avecTva ? "Total TTC" : "Total"}</span>
            <span style={{ ...num, fontFamily: SERIF, fontSize: "19px", fontWeight: 700 }}>{formatMontant(p.totalTtc)}</span>
          </div>
        </div>
      </div>

      {p.type === "devis" && (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontWeight: 600 }}>Conditions</span>
          <span>
            {p.dateValidite ? `Offre valable jusqu'au ${dateFr(p.dateValidite)}.` : "Offre valable 30 jours."} Prix en francs CFA.
          </span>
        </div>
      )}

      {p.type !== "devis" && ((p.banques?.length ?? 0) > 0 || p.mention) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "32px", marginTop: "16px", borderTop: `1px solid ${FILET}`, paddingTop: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {(p.banques?.length ?? 0) > 0 && (
              <>
                <span style={{ fontWeight: 600 }}>Règlement</span>
                {p.banques!.map((b, i) => <span key={i}>{[b.banque, b.compte].filter(Boolean).join(" · ")}</span>)}
              </>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {p.mention && (
              <>
                <span style={{ fontWeight: 600 }}>Mentions</span>
                <span style={{ whiteSpace: "pre-line" }}>{p.mention}</span>
              </>
            )}
          </div>
        </div>
      )}
      {p.type === "devis" && p.mention && <div style={{ marginTop: "10px", whiteSpace: "pre-line", ...lbl }}>{p.mention}</div>}

      {p.type === "devis" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "40px", marginTop: "22px" }}>
          <Signature titre="Bon pour accord du client" precision="Date, signature et cachet, mention « Lu et approuvé »" />
          <Signature titre={`Pour ${p.societe.nom}`} precision="La Direction" />
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "22px" }}>
          <div style={{ width: "300px" }}>
            <Signature titre={`Pour ${p.societe.nom}`} precision="La Direction, signature et cachet" hauteur={70} />
          </div>
        </div>
      )}

      <Pied gauche={mentionsSociete(p.societe)} />
    </div>
  );
};
