// Remplissage d'un modèle Excel existant sans le réécrire : les valeurs sont
// inscrites directement dans le XML des feuilles concernées. Tout le reste du
// fichier (mise en forme, formes, liens, mise en page) est conservé tel quel ;
// Excel recalcule les formules à l'ouverture.
import JSZip from "jszip";

export type ValeurCellule = number | string | null;

export interface Saisie {
  feuille: string;
  /** Adresse de la cellule, ex. « E13 ». */
  cellule: string;
  valeur: ValeurCellule;
}

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** « AB12 » → { col: 28, ligne: 12 } */
const decoder = (adresse: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(adresse);
  if (!m) throw new Error(`Adresse de cellule invalide : ${adresse}`);
  const col = m[1].split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
  return { col, ligne: Number(m[2]) };
};

/** Cellule XML avec sa valeur, en gardant le style d'origine. */
const celluleXml = (adresse: string, valeur: ValeurCellule, style: string | null) => {
  const s = style ? ` s="${style}"` : "";
  if (valeur === null || valeur === "") return `<c r="${adresse}"${s}/>`;
  if (typeof valeur === "number") {
    return Number.isFinite(valeur) ? `<c r="${adresse}"${s}><v>${valeur}</v></c>` : `<c r="${adresse}"${s}/>`;
  }
  return `<c r="${adresse}"${s} t="inlineStr"><is><t xml:space="preserve">${echapper(valeur)}</t></is></c>`;
};

/** Inscrit les valeurs dans le XML d'une feuille. */
export const patcherFeuille = (xml: string, saisies: { cellule: string; valeur: ValeurCellule }[]): string => {
  let out = xml;
  for (const { cellule, valeur } of saisies) {
    const { col, ligne } = decoder(cellule);
    // Cellule existante (vide « <c .../> » ou avec contenu « <c ...>…</c> »)
    const reCellule = new RegExp(`<c r="${cellule}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
    const existante = reCellule.exec(out);
    if (existante) {
      const style = /\ss="(\d+)"/.exec(existante[1])?.[1] ?? null;
      out = out.replace(reCellule, celluleXml(cellule, valeur, style));
      continue;
    }
    const nouvelle = celluleXml(cellule, valeur, null);
    const reLigne = new RegExp(`<row r="${ligne}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
    const ligneXml = reLigne.exec(out);
    if (ligneXml) {
      if (ligneXml[2] === "/>") {
        out = out.replace(reLigne, `<row r="${ligne}"${ligneXml[1]}>${nouvelle}</row>`);
      } else {
        // Insertion à sa place dans l'ordre des colonnes
        const cellules = ligneXml[3];
        let insere = false;
        const contenu = cellules.replace(/<c r="([A-Z]+)\d+"/g, (m, lettres: string) => {
          if (!insere && decoder(`${lettres}1`).col > col) { insere = true; return nouvelle + m; }
          return m;
        });
        out = out.replace(reLigne, `<row r="${ligne}"${ligneXml[1]}>${insere ? contenu : cellules + nouvelle}</row>`);
      }
      continue;
    }
    // Ligne absente : créée à sa place
    const nouvelleLigne = `<row r="${ligne}">${nouvelle}</row>`;
    let place = false;
    out = out.replace(/<row r="(\d+)"/g, (m, n: string) => {
      if (!place && Number(n) > ligne) { place = true; return nouvelleLigne + m; }
      return m;
    });
    if (!place) out = out.replace("</sheetData>", `${nouvelleLigne}</sheetData>`).replace("<sheetData/>", `<sheetData>${nouvelleLigne}</sheetData>`);
  }
  return out;
};

/** Chemin XML de chaque feuille, par nom. */
const cheminsFeuilles = async (zip: JSZip): Promise<Map<string, string>> => {
  const workbook = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const cibles = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) cibles.set(m[1], m[2]);
  for (const m of rels.matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) cibles.set(m[2], m[1]);
  const out = new Map<string, string>();
  for (const m of workbook.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const nom = m[1].replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const cible = cibles.get(m[2]);
    if (cible) out.set(nom, cible.startsWith("/") ? cible.slice(1) : `xl/${cible}`);
  }
  return out;
};

/** Lit le texte (ou la valeur) d'une cellule — utile pour repérer les lignes par leur référence. */
export const lireFeuille = async (zip: JSZip, feuille: string): Promise<string> => {
  const chemin = (await cheminsFeuilles(zip)).get(feuille);
  if (!chemin) throw new Error(`Feuille introuvable : ${feuille}`);
  return zip.file(chemin)!.async("string");
};

/** Remplit le modèle et renvoie le nouveau fichier. */
export const remplirModele = async (modele: ArrayBuffer | Uint8Array, saisies: Saisie[]): Promise<Uint8Array> => {
  const zip = await JSZip.loadAsync(modele);
  const chemins = await cheminsFeuilles(zip);
  const parFeuille = new Map<string, Saisie[]>();
  for (const s of saisies) parFeuille.set(s.feuille, [...(parFeuille.get(s.feuille) ?? []), s]);
  for (const [feuille, liste] of parFeuille) {
    const chemin = chemins.get(feuille);
    if (!chemin) throw new Error(`Feuille introuvable dans le modèle : ${feuille}`);
    const xml = await zip.file(chemin)!.async("string");
    zip.file(chemin, patcherFeuille(xml, liste));
  }
  // Recalcul complet des formules à l'ouverture
  let workbook = await zip.file("xl/workbook.xml")!.async("string");
  workbook = /<calcPr[^>]*\/>/.test(workbook)
    ? workbook.replace(/<calcPr([^>]*?)\s*\/>/, (m, attrs: string) =>
        `<calcPr${attrs.replace(/\sfullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`)
    : workbook.replace("</workbook>", `<calcPr fullCalcOnLoad="1"/></workbook>`);
  zip.file("xl/workbook.xml", workbook);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
};
