import { useMemo } from "react";
import { DonneesMensuelles } from "@/types/ebene";
import { Badge } from "@/components/ui/badge";

interface Props {
  donneesMensuelles: DonneesMensuelles;
  annee: number;
}

/** Agrège les soldes de tous les comptes SYSCOHADA depuis les écritures validées. */
function buildSoldes(donneesMensuelles: DonneesMensuelles, annee: number): Map<string, number> {
  const soldes = new Map<string, number>();
  Object.entries(donneesMensuelles).forEach(([key, moisData]) => {
    const [a] = key.split("-");
    if (parseInt(a) !== annee) return;
    (moisData.ecritures || [])
      .filter((e) => e.statut !== "brouillon")
      .forEach((ecriture) => {
        ecriture.lignes.forEach((ligne) => {
          const current = soldes.get(ligne.compte) || 0;
          soldes.set(ligne.compte, current + ligne.debit - ligne.credit);
        });
      });
  });
  return soldes;
}

/** Somme les soldes de tous les comptes commençant par les préfixes donnés. */
function sumComptes(soldes: Map<string, number>, prefixes: string[]): number {
  let total = 0;
  soldes.forEach((val, code) => {
    if (prefixes.some((p) => code.startsWith(p))) {
      total += val;
    }
  });
  return total;
}

const fmt = (n: number) => Math.abs(Math.round(n)).toLocaleString("fr-FR");
const fmtN = (n: number) => n === 0 ? "" : (n < 0 ? `(${fmt(n)})` : fmt(n));

interface LigneBilan {
  ref: string;
  libelle: string;
  note?: number | string;
  isTotal?: boolean;
  isSubTotal?: boolean;
  isSeparator?: boolean;
  comptesPrefixes?: string[];
  comptesAmort?: string[];
}

export const BilanSYSCOHADA = ({ donneesMensuelles, annee }: Props) => {
  const soldes = useMemo(() => buildSoldes(donneesMensuelles, annee), [donneesMensuelles, annee]);

  // ─── ACTIF ────────────────────────────────────────────────────────────────

  const actifLines: LigneBilan[] = [
    { ref: "AD", libelle: "IMMOBILISATIONS INCORPORELLES", note: 3, isSubTotal: true },
    { ref: "AE", libelle: "Frais de développement et de prospection", comptesPrefixes: ["211"], comptesAmort: ["2811"] },
    { ref: "AF", libelle: "Brevets, licences, logiciels et droits similaires", comptesPrefixes: ["212", "213", "214"], comptesAmort: ["2812", "2813", "2814"] },
    { ref: "AG", libelle: "Fonds commercial et droit au bail", comptesPrefixes: ["215", "216"], comptesAmort: ["2815", "2816"] },
    { ref: "AH", libelle: "Autres immobilisations incorporelles", comptesPrefixes: ["217", "218"], comptesAmort: ["2817", "2818"] },
    { ref: "AI", libelle: "IMMOBILISATIONS CORPORELLES", note: 3, isSubTotal: true },
    { ref: "AJ", libelle: "Terrains", comptesPrefixes: ["22"], comptesAmort: ["282"] },
    { ref: "AK", libelle: "Bâtiments", comptesPrefixes: ["231", "232"], comptesAmort: ["2831", "2832"] },
    { ref: "AL", libelle: "Aménagements, agencements et installations", comptesPrefixes: ["234", "235", "238"], comptesAmort: ["2834", "2835", "2838"] },
    { ref: "AM", libelle: "Matériel, mobiliers et actifs biologiques", comptesPrefixes: ["241", "244", "246", "247"], comptesAmort: ["2841", "2844", "2846", "2847"] },
    { ref: "AN", libelle: "Matériel de transport", comptesPrefixes: ["245"], comptesAmort: ["2845"] },
    { ref: "AP", libelle: "AVANCES ET ACOMPTES VERSÉS SUR IMMOBILISATIONS", note: 3, isSubTotal: true, comptesPrefixes: ["25"] },
    { ref: "AQ", libelle: "IMMOBILISATIONS FINANCIÈRES", note: 4, isSubTotal: true },
    { ref: "AR", libelle: "Titres de participation", comptesPrefixes: ["26"], comptesAmort: ["296"] },
    { ref: "AS", libelle: "Autres immobilisations financières", comptesPrefixes: ["27"], comptesAmort: ["297"] },
    { ref: "AZ", libelle: "TOTAL ACTIF IMMOBILISÉ", isTotal: true },
    { ref: "BA", libelle: "ACTIF CIRCULANT HAO", note: 5, comptesPrefixes: ["485", "488"] },
    { ref: "BB", libelle: "STOCKS ET EN-COURS", note: 6, comptesPrefixes: ["31", "32", "33", "34", "35", "36", "37", "38"], comptesAmort: ["39"] },
    { ref: "BG", libelle: "CRÉANCES ET EMPLOIS ASSIMILÉS", isSubTotal: true },
    { ref: "BH", libelle: "Fournisseurs avances versées", note: 17, comptesPrefixes: ["4091", "4092"] },
    { ref: "BI", libelle: "Clients", note: 7, comptesPrefixes: ["411", "412", "416", "418"], comptesAmort: ["491"] },
    { ref: "BJ", libelle: "Autres créances", note: 8, comptesPrefixes: ["42", "44", "45", "46", "47", "476"] },
    { ref: "BK", libelle: "TOTAL ACTIF CIRCULANT", isTotal: true },
    { ref: "BQ", libelle: "Titres de placement", note: 9, comptesPrefixes: ["50"] },
    { ref: "BR", libelle: "Valeurs à encaisser", note: 10, comptesPrefixes: ["51"] },
    { ref: "BS", libelle: "Banques, chèques postaux, caisse et assimilés", note: 11, comptesPrefixes: ["52", "53", "57"] },
    { ref: "BT", libelle: "TOTAL TRÉSORERIE ACTIF", isTotal: true },
    { ref: "BU", libelle: "Écart de conversion - Actif", note: 12, comptesPrefixes: ["478"] },
    { ref: "BZ", libelle: "TOTAL GÉNÉRAL ACTIF", isTotal: true },
  ];

  const actifData = useMemo(() => {
    const data: Record<string, { brut: number; amort: number; net: number }> = {};

    actifLines.forEach((l) => {
      if (l.isTotal || l.isSubTotal || !l.comptesPrefixes) return;
      const brut  = sumComptes(soldes, l.comptesPrefixes);
      const amort = l.comptesAmort ? Math.abs(sumComptes(soldes, l.comptesAmort)) : 0;
      data[l.ref] = { brut: Math.max(0, brut), amort, net: Math.max(0, brut) - amort };
    });

    // Sous-totaux immo incorporelles
    data["AD"] = {
      brut:  ["AE", "AF", "AG", "AH"].reduce((s, r) => s + (data[r]?.brut  || 0), 0),
      amort: ["AE", "AF", "AG", "AH"].reduce((s, r) => s + (data[r]?.amort || 0), 0),
      net:   ["AE", "AF", "AG", "AH"].reduce((s, r) => s + (data[r]?.net   || 0), 0),
    };
    data["AI"] = {
      brut:  ["AJ", "AK", "AL", "AM", "AN"].reduce((s, r) => s + (data[r]?.brut  || 0), 0),
      amort: ["AJ", "AK", "AL", "AM", "AN"].reduce((s, r) => s + (data[r]?.amort || 0), 0),
      net:   ["AJ", "AK", "AL", "AM", "AN"].reduce((s, r) => s + (data[r]?.net   || 0), 0),
    };
    data["AQ"] = {
      brut:  ["AR", "AS"].reduce((s, r) => s + (data[r]?.brut  || 0), 0),
      amort: ["AR", "AS"].reduce((s, r) => s + (data[r]?.amort || 0), 0),
      net:   ["AR", "AS"].reduce((s, r) => s + (data[r]?.net   || 0), 0),
    };
    // AP n'a pas d'amort
    if (!data["AP"]) {
      const brut = actifLines.find((l) => l.ref === "AP")?.comptesPrefixes
        ? sumComptes(soldes, ["25"]) : 0;
      data["AP"] = { brut: Math.max(0, brut), amort: 0, net: Math.max(0, brut) };
    }
    // Total actif immobilisé
    data["AZ"] = {
      brut:  ["AD", "AI", "AP", "AQ"].reduce((s, r) => s + (data[r]?.brut  || 0), 0),
      amort: ["AD", "AI", "AP", "AQ"].reduce((s, r) => s + (data[r]?.amort || 0), 0),
      net:   ["AD", "AI", "AP", "AQ"].reduce((s, r) => s + (data[r]?.net   || 0), 0),
    };
    data["BG"] = {
      brut:  ["BH", "BI", "BJ"].reduce((s, r) => s + (data[r]?.brut  || 0), 0),
      amort: ["BH", "BI", "BJ"].reduce((s, r) => s + (data[r]?.amort || 0), 0),
      net:   ["BH", "BI", "BJ"].reduce((s, r) => s + (data[r]?.net   || 0), 0),
    };
    data["BK"] = {
      brut:  ["BA", "BB", "BG"].reduce((s, r) => s + (data[r]?.brut  || 0), 0),
      amort: ["BA", "BB", "BG"].reduce((s, r) => s + (data[r]?.amort || 0), 0),
      net:   ["BA", "BB", "BG"].reduce((s, r) => s + (data[r]?.net   || 0), 0),
    };
    data["BT"] = {
      brut:  ["BQ", "BR", "BS"].reduce((s, r) => s + (data[r]?.brut || 0), 0),
      amort: 0,
      net:   ["BQ", "BR", "BS"].reduce((s, r) => s + (data[r]?.net  || 0), 0),
    };
    data["BZ"] = {
      brut:  (data["AZ"]?.brut  || 0) + (data["BK"]?.brut  || 0) + (data["BT"]?.brut  || 0) + (data["BU"]?.brut  || 0),
      amort: (data["AZ"]?.amort || 0) + (data["BK"]?.amort || 0),
      net:   (data["AZ"]?.net   || 0) + (data["BK"]?.net   || 0) + (data["BT"]?.net   || 0) + (data["BU"]?.net   || 0),
    };
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soldes]);

  // ─── PASSIF ───────────────────────────────────────────────────────────────

  const passifLines: LigneBilan[] = [
    { ref: "CA", libelle: "Capital", note: 13, comptesPrefixes: ["10"] },
    { ref: "CB", libelle: "Apporteurs capital non appelé (-)", note: 13, comptesPrefixes: ["109"] },
    { ref: "CD", libelle: "Primes liées au capital social", note: 14, comptesPrefixes: ["105"] },
    { ref: "CE", libelle: "Écarts de réévaluation", comptesPrefixes: ["106"] },
    { ref: "CF", libelle: "Réserves indisponibles", note: 14, comptesPrefixes: ["111", "112", "113"] },
    { ref: "CG", libelle: "Réserves libres", note: 14, comptesPrefixes: ["118"] },
    { ref: "CH", libelle: "Report à nouveau (+ ou -)", note: 14, comptesPrefixes: ["12"] },
    { ref: "CJ", libelle: "Résultat net de l'exercice (bénéfice + ou perte -)", comptesPrefixes: ["13"] },
    { ref: "CL", libelle: "Subventions d'investissement", note: 15, comptesPrefixes: ["14"] },
    { ref: "CM", libelle: "Provisions réglementées", note: 15, comptesPrefixes: ["15"] },
    { ref: "CP", libelle: "TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES", isTotal: true },
    { ref: "DA", libelle: "Emprunts et dettes financières diverses", note: 16, comptesPrefixes: ["16", "17"] },
    { ref: "DB", libelle: "Dettes de location acquisition", note: 16, comptesPrefixes: ["173"] },
    { ref: "DC", libelle: "Provisions pour risques et charges", note: 16, comptesPrefixes: ["19"] },
    { ref: "DD", libelle: "TOTAL DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES", isTotal: true },
    { ref: "DF", libelle: "TOTAL RESSOURCES STABLES", isTotal: true },
    { ref: "DH", libelle: "Dettes circulantes HAO", note: 5, comptesPrefixes: ["481", "484"] },
    { ref: "DI", libelle: "Clients, avances reçues", note: 7, comptesPrefixes: ["4191"] },
    { ref: "DJ", libelle: "Fournisseurs d'exploitation", note: 17, comptesPrefixes: ["401", "402", "408"] },
    { ref: "DK", libelle: "Dettes fiscales et sociales", note: 18, comptesPrefixes: ["43", "44", "447"] },
    { ref: "DM", libelle: "Autres dettes", note: 19, comptesPrefixes: ["42", "46", "47", "477"] },
    { ref: "DN", libelle: "Provisions pour risques à court terme", note: 19, comptesPrefixes: ["499"] },
    { ref: "DP", libelle: "TOTAL PASSIF CIRCULANT", isTotal: true },
    { ref: "DQ", libelle: "Banques, crédits d'escompte", note: 20, comptesPrefixes: ["561", "564", "565"] },
    { ref: "DR", libelle: "Banques, établissements financiers et crédits de trésorerie", note: 20, comptesPrefixes: ["56"] },
    { ref: "DT", libelle: "TOTAL TRÉSORERIE PASSIF", isTotal: true },
    { ref: "DV", libelle: "Écart de conversion - Passif", note: 12, comptesPrefixes: ["479"] },
    { ref: "DZ", libelle: "TOTAL GÉNÉRAL PASSIF", isTotal: true },
  ];

  const passifData = useMemo(() => {
    const data: Record<string, number> = {};
    passifLines.forEach((l) => {
      if (l.isTotal || !l.comptesPrefixes) return;
      // Passif : solde créditeur = positif (on inverse le signe car solde = debit - credit)
      data[l.ref] = -sumComptes(soldes, l.comptesPrefixes);
    });
    data["CP"] = ["CA", "CB", "CD", "CE", "CF", "CG", "CH", "CJ", "CL", "CM"]
      .reduce((s, r) => s + (data[r] || 0), 0);
    data["DD"] = ["DA", "DB", "DC"].reduce((s, r) => s + (data[r] || 0), 0);
    data["DF"] = (data["CP"] || 0) + (data["DD"] || 0);
    data["DP"] = ["DH", "DI", "DJ", "DK", "DM", "DN"].reduce((s, r) => s + (data[r] || 0), 0);
    data["DT"] = ["DQ", "DR"].reduce((s, r) => s + (data[r] || 0), 0);
    data["DZ"] = (data["DF"] || 0) + (data["DP"] || 0) + (data["DT"] || 0) + (data["DV"] || 0);
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soldes]);

  const totalActif  = actifData["BZ"]?.net || 0;
  const totalPassif = passifData["DZ"]  || 0;
  const equilibre   = Math.abs(totalActif - totalPassif) < 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-lg">Bilan SYSCOHADA — Exercice {annee}</h3>
        <Badge variant={equilibre ? "default" : "destructive"}>
          {equilibre
            ? "✅ Bilan équilibré"
            : `⚠️ Écart : ${fmt(Math.abs(totalActif - totalPassif))} FCFA`}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── ACTIF ───────────────────────────────────────────────────────── */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-2 font-bold text-sm">ACTIF</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2 w-10">Réf.</th>
                  <th className="text-left p-2">Désignation</th>
                  <th className="text-right p-2 w-24">Brut</th>
                  <th className="text-right p-2 w-24">Amort/Dép.</th>
                  <th className="text-right p-2 w-24">Net N</th>
                </tr>
              </thead>
              <tbody>
                {actifLines.map((l) => {
                  const d = actifData[l.ref] || { brut: 0, amort: 0, net: 0 };
                  return (
                    <tr
                      key={l.ref}
                      className={`border-t ${
                        l.isTotal
                          ? "bg-blue-50 dark:bg-blue-950/30 font-bold border-t-2"
                          : l.isSubTotal
                          ? "bg-muted/60 font-semibold"
                          : "hover:bg-muted/20"
                      }`}
                    >
                      <td className="p-2 font-mono text-primary text-xs">{l.ref}</td>
                      <td className={`p-2 ${l.isTotal || l.isSubTotal ? "uppercase text-xs" : ""}`}>
                        {l.libelle}
                        {l.note !== undefined && (
                          <span className="text-muted-foreground ml-1 text-[10px]">({l.note})</span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {d.brut > 0 ? fmt(d.brut) : ""}
                      </td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">
                        {d.amort > 0 ? fmt(d.amort) : ""}
                      </td>
                      <td className={`p-2 text-right tabular-nums ${l.isTotal ? "text-blue-700 dark:text-blue-400" : ""}`}>
                        {d.net !== 0 ? fmt(d.net) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── PASSIF ──────────────────────────────────────────────────────── */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-green-600 text-white px-4 py-2 font-bold text-sm">PASSIF</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2 w-10">Réf.</th>
                  <th className="text-left p-2">Désignation</th>
                  <th className="text-right p-2 w-28">Net N</th>
                </tr>
              </thead>
              <tbody>
                {passifLines.map((l) => {
                  const val = passifData[l.ref] || 0;
                  return (
                    <tr
                      key={l.ref}
                      className={`border-t ${
                        l.isTotal
                          ? "bg-green-50 dark:bg-green-950/30 font-bold border-t-2"
                          : l.isSubTotal
                          ? "bg-muted/60 font-semibold"
                          : "hover:bg-muted/20"
                      }`}
                    >
                      <td className="p-2 font-mono text-primary text-xs">{l.ref}</td>
                      <td className={`p-2 ${l.isTotal ? "uppercase text-xs" : ""}`}>
                        {l.libelle}
                        {l.note !== undefined && (
                          <span className="text-muted-foreground ml-1 text-[10px]">({l.note})</span>
                        )}
                      </td>
                      <td className={`p-2 text-right tabular-nums ${l.isTotal ? "text-green-700 dark:text-green-400 font-bold" : ""}`}>
                        {val !== 0 ? fmtN(val) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic text-center">
        Bilan établi selon le Système Comptable OHADA (SYSCOHADA Révisé) — Format Liasse Fiscale 2023
        {!equilibre && " — ⚠️ Vérifiez les écritures : le bilan n'est pas équilibré"}
      </p>
    </div>
  );
};
