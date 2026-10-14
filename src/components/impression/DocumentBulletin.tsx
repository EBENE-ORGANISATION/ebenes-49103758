/**
 * Bulletin de paie au modèle D, avec les tableaux du modèle A : identité du
 * salarié, puis rubriques (base, taux, gain, retenue). Sans charges patronales.
 * Le même document sert à l'aperçu, à l'impression et au PDF (generateBulletin).
 */
import type { CSSProperties } from "react";
import { Employe, MOIS_NOMS } from "@/types/ebene";
import { formatMontant } from "@/lib/ebene-utils";
import { montantEnLettres } from "@/lib/montantEnLettres";
import type { ContenuBulletin, LigneBulletin } from "@/lib/paie";
import {
  Bande, EnTete, Pied, Signature, couleurDocument, page, lbl, num, SERIF, ENCRE, type SocieteDocument,
} from "./styleDocument";

export interface DocumentBulletinProps {
  employe: Employe;
  contenu: ContenuBulletin;
  annee: number;
  mois: number;
  /** Ancienneté en années (décimales), à la fin du mois payé. */
  anciennete: number;
  societe: SocieteDocument;
  cnssEmployeur?: string | null;
  id?: string;
}

const cellule: CSSProperties = { border: `1px solid ${ENCRE}`, padding: "6px 9px", textAlign: "left", verticalAlign: "top" };
const entete: CSSProperties = { ...cellule, background: "#f3eeea", fontWeight: 600, fontSize: "12px" };
const total: CSSProperties = { ...cellule, background: "#f3eeea", fontWeight: 700 };

const dureeLisible = (ans: number) => {
  const a = Math.floor(ans);
  const m = Math.floor((ans - a) * 12 + 1e-6);
  return [a > 0 && `${a} an${a > 1 ? "s" : ""}`, m > 0 && `${m} mois`].filter(Boolean).join(" ") || "moins d'un mois";
};

const dateCourte = (iso?: string | null) => {
  if (!iso) return "—";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return j && m && a ? `${j}/${m}/${a}` : iso;
};

/** Libellé sans le taux entre parenthèses, quand le taux a sa propre colonne. */
const libelle = (l: LigneBulletin) => (l.taux ? l.libelle.replace(/\s*\([\d.,\s]+%\)\s*$/, "") : l.libelle);

const Ligne = ({ l, sens }: { l: LigneBulletin; sens: "gain" | "retenue" }) => (
  <tr>
    <td style={cellule}>{libelle(l)}</td>
    <td style={{ ...cellule, ...num }}>{l.base !== undefined ? formatMontant(l.base).replace(/\s?F(\s?CFA)?$/, "") : ""}</td>
    <td style={{ ...cellule, ...num }}>{l.taux ? `${l.taux} %` : ""}</td>
    <td style={{ ...cellule, ...num }}>{sens === "gain" ? formatMontant(l.montant).replace(/\s?F(\s?CFA)?$/, "") : ""}</td>
    <td style={{ ...cellule, ...num }}>{sens === "retenue" ? formatMontant(l.montant).replace(/\s?F(\s?CFA)?$/, "") : ""}</td>
  </tr>
);

export const DocumentBulletin = ({ employe: e, contenu: b, annee, mois, anciennete, societe, cnssEmployeur, id }: DocumentBulletinProps) => {
  const c = couleurDocument(societe.couleur);
  const dernierJour = new Date(annee, mois, 0).getDate();
  const mm = String(mois).padStart(2, "0");
  const situation = `${e.situation === "marie" ? "Marié(e)" : "Célibataire"}${e.enfants ? `, ${e.enfants} enfant${e.enfants > 1 ? "s" : ""}` : ""}`;
  const montant = (n: number) => formatMontant(n).replace(/\s?F(\s?CFA)?$/, "");

  return (
    <div id={id} data-page-a4="" style={page()}>
      <Bande couleur={c} />
      <EnTete
        societe={{ ...societe, email: null }}
        titre="Bulletin de paie"
        tailleTitre={28}
        sousTitre={`${MOIS_NOMS[mois - 1]} ${annee} · du 01/${mm} au ${dernierJour}/${mm}/${annee}`}
        lignes={cnssEmployeur ? [`N° employeur CNSS ${cnssEmployeur}`] : undefined}
      />

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "18px" }}>
        <tbody>
          <tr>
            <td style={{ ...cellule, ...lbl, width: "17%" }}>Salarié</td>
            <td style={{ ...cellule, fontFamily: SERIF, fontWeight: 700 }}>{e.nom}</td>
            <td style={{ ...cellule, ...lbl, width: "17%" }}>Matricule</td>
            <td style={cellule}>{e.matricule || "—"}</td>
          </tr>
          <tr>
            <td style={{ ...cellule, ...lbl }}>Emploi</td>
            <td style={cellule}>{e.poste || "—"}</td>
            <td style={{ ...cellule, ...lbl }}>Catégorie</td>
            <td style={cellule}>{e.categorie || "—"} — échelon {e.echelon || 1}</td>
          </tr>
          <tr>
            <td style={{ ...cellule, ...lbl }}>Date d'embauche</td>
            <td style={cellule}>{dateCourte(e.dateEmbauche)}</td>
            <td style={{ ...cellule, ...lbl }}>Ancienneté</td>
            <td style={cellule}>{dureeLisible(anciennete)}</td>
          </tr>
          <tr>
            <td style={{ ...cellule, ...lbl }}>N° CNSS</td>
            <td style={cellule}>{e.numCnss || "—"}</td>
            <td style={{ ...cellule, ...lbl }}>Situation</td>
            <td style={cellule}>{situation}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
        <thead>
          <tr>
            <th style={{ ...entete, width: "40%" }}>Rubrique</th>
            <th style={{ ...entete, ...num }}>Base</th>
            <th style={{ ...entete, ...num }}>Taux</th>
            <th style={{ ...entete, ...num }}>Gain</th>
            <th style={{ ...entete, ...num }}>Retenue</th>
          </tr>
        </thead>
        <tbody>
          {b.gains.map((l, i) => <Ligne key={`g${i}`} l={l} sens="gain" />)}
          <tr>
            <td style={total}>Salaire brut</td><td style={total} /><td style={total} />
            <td style={{ ...total, ...num }}>{montant(b.brut)}</td><td style={total} />
          </tr>
          {b.retenues.map((l, i) => <Ligne key={`r${i}`} l={l} sens="retenue" />)}
          <tr>
            <td style={total}>Total des retenues</td><td style={total} /><td style={total} /><td style={total} />
            <td style={{ ...total, ...num }}>{montant(b.totalRetenues)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: "18px", background: c, color: "#fff", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 600 }}>Net à payer</span>
          <span style={{ fontFamily: SERIF, fontSize: "13px", opacity: 0.9 }}>{montantEnLettres(b.net)}</span>
        </div>
        <span style={{ ...num, fontFamily: SERIF, fontSize: "30px", fontWeight: 700 }}>{formatMontant(b.net)}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "40px", marginTop: "34px" }}>
        <Signature titre="L'employeur" precision="Signature et cachet" hauteur={80} />
        <Signature titre="Le salarié" precision="Pour acquit" hauteur={80} />
      </div>

      <Pied
        gauche="Établi selon le Code du travail togolais et la Convention collective interprofessionnelle. À conserver sans limitation de durée."
        droite={`Édité le ${new Date().toLocaleDateString("fr-FR")}`}
      />
    </div>
  );
};
