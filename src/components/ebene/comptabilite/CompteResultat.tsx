import { useMemo } from "react";
import { DonneesMensuelles } from "@/types/ebene";
import { Badge } from "@/components/ui/badge";

interface Props {
  donneesMensuelles: DonneesMensuelles;
  annee: number;
}

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

function sumPrefixes(soldes: Map<string, number>, prefixes: string[]): number {
  let total = 0;
  soldes.forEach((val, code) => {
    if (prefixes.some((p) => code.startsWith(p))) total += val;
  });
  return total;
}

const fmt = (n: number) => Math.abs(Math.round(n)).toLocaleString("fr-FR");

interface LigneResultat {
  ref: string;
  libelle: string;
  note?: number | string;
  signe?: string;
  isTotal?: boolean;
  montant: number;
}

export const CompteResultat = ({ donneesMensuelles, annee }: Props) => {
  const soldes = useMemo(
    () => buildSoldes(donneesMensuelles, annee),
    [donneesMensuelles, annee],
  );

  const get = (prefixes: string[]) => sumPrefixes(soldes, prefixes);

  // ─── Calculs selon le format officiel ─────────────────────────────────────

  // Produits classe 7 : solde créditeur = négatif dans convention debit−credit → on inverse
  const ventesMarchandises         = -get(["701"]);
  const achatsMarchandises         = get(["601"]);
  const variationStockMarchandises = get(["6031"]);
  const margeCommerciale = ventesMarchandises - achatsMarchandises - variationStockMarchandises;

  const ventesProduitsServices = -get(["702", "703", "704", "705", "706", "707"]);
  const chiffreAffaires        = ventesMarchandises + ventesProduitsServices;

  const productionStockee      = -get(["734", "735", "736", "737"]);
  const productionImmobilisee  = -get(["72"]);
  const subventionExploitation = -get(["71"]);
  const autresProduits         = -get(["75"]);
  const transfertsCharges      = -get(["781"]);

  const achatsMatieres        = get(["602"]);
  const variationStockMatieres = get(["6032", "6033"]);
  const autresAchats          = get(["604", "605", "608"]);
  const transports            = get(["61"]);
  const servicesExterieurs    = get(["62", "63"]);
  const impotsTaxes           = get(["64"]);
  const autresCharges         = get(["65"]);

  const valeurAjoutee =
    margeCommerciale
    + productionStockee + productionImmobilisee + subventionExploitation
    + autresProduits    + transfertsCharges
    - achatsMatieres    - variationStockMatieres - autresAchats
    - transports        - servicesExterieurs     - impotsTaxes - autresCharges;

  const chargesPersonnel          = get(["66"]);
  const excedentBrutExploitation  = valeurAjoutee - chargesPersonnel;

  const reprisesAmortProv  = -get(["791", "797"]);
  const dotationsAmortProv =  get(["68", "69"]);
  const resultatExploitation = excedentBrutExploitation + reprisesAmortProv - dotationsAmortProv;

  const revenusFinanciers             = -get(["77"]);
  const reprisesProvFinancieres       = -get(["797"]);
  const transfertsChargesFinancieres  = -get(["787"]);
  const fraisFinanciers               =  get(["67"]);
  const dotationsProvFinancieres      =  get(["69"]);
  const resultatFinancier =
    revenusFinanciers + reprisesProvFinancieres + transfertsChargesFinancieres
    - fraisFinanciers - dotationsProvFinancieres;

  const resultatActivitesOrdinaires = resultatExploitation + resultatFinancier;

  const produitsHAO = -get(["82", "84"]);
  const chargesHAO  =  get(["81", "83"]);
  const resultatHAO = produitsHAO - chargesHAO;

  const participationTravailleurs = get(["87"]);
  const impotResultat             = get(["89"]);
  const resultatNet = resultatActivitesOrdinaires + resultatHAO - participationTravailleurs - impotResultat;

  const lignes: LigneResultat[] = [
    { ref: "TA", libelle: "Ventes de marchandises (A)",                              note: 21, signe: "+",   montant: ventesMarchandises },
    { ref: "RA", libelle: "Achats de marchandises",                                  note: 22, signe: "-",   montant: achatsMarchandises },
    { ref: "RB", libelle: "Variation de stocks de marchandises",                     note: 6,  signe: "-/+", montant: variationStockMarchandises },
    { ref: "XA", libelle: "MARGE COMMERCIALE",                                       isTotal: true,          montant: margeCommerciale },
    { ref: "TB", libelle: "Ventes de produits fabriqués (B)",                        note: 21, signe: "+",   montant: -get(["702"]) },
    { ref: "TC", libelle: "Travaux, services vendus (C)",                            note: 21, signe: "+",   montant: -get(["705", "706"]) },
    { ref: "TD", libelle: "Produits accessoires (D)",                                note: 21, signe: "+",   montant: -get(["707"]) },
    { ref: "XB", libelle: "CHIFFRE D'AFFAIRES (A+B+C+D)",                           isTotal: true,          montant: chiffreAffaires },
    { ref: "TE", libelle: "Production stockée (ou déstockage)",                                signe: "+/-", montant: productionStockee },
    { ref: "TF", libelle: "Production immobilisée",                                            signe: "+",   montant: productionImmobilisee },
    { ref: "TG", libelle: "Subvention d'exploitation",                                         signe: "+",   montant: subventionExploitation },
    { ref: "TH", libelle: "Autres produits",                                         note: 21, signe: "+",   montant: autresProduits },
    { ref: "TI", libelle: "Transferts de charges d'exploitation",                    note: 12, signe: "+",   montant: transfertsCharges },
    { ref: "RC", libelle: "Achats de matières et fournitures liées",                 note: 22, signe: "-",   montant: achatsMatieres },
    { ref: "RD", libelle: "Variation de stocks de matières premières",               note: 6,  signe: "-/+", montant: variationStockMatieres },
    { ref: "RE", libelle: "Autres achats",                                           note: 22, signe: "-",   montant: autresAchats },
    { ref: "RG", libelle: "Transports",                                              note: 23, signe: "-",   montant: transports },
    { ref: "RH", libelle: "Services extérieurs",                                     note: 24, signe: "-",   montant: servicesExterieurs },
    { ref: "RI", libelle: "Impôts et taxes",                                         note: 25, signe: "-",   montant: impotsTaxes },
    { ref: "RJ", libelle: "Autres charges",                                          note: 26, signe: "-",   montant: autresCharges },
    { ref: "XC", libelle: "VALEUR AJOUTÉE",                                          isTotal: true,          montant: valeurAjoutee },
    { ref: "RK", libelle: "Charges de personnel",                                    note: 27, signe: "-",   montant: chargesPersonnel },
    { ref: "XD", libelle: "EXCÉDENT BRUT D'EXPLOITATION",                            isTotal: true,          montant: excedentBrutExploitation },
    { ref: "TJ", libelle: "Reprises d'amortissements, provisions et dépréciations",  note: 28, signe: "+",   montant: reprisesAmortProv },
    { ref: "RL", libelle: "Dotations aux amortissements, provisions et dépréciations",         signe: "-",   montant: dotationsAmortProv },
    { ref: "XE", libelle: "RÉSULTAT D'EXPLOITATION",                                 isTotal: true,          montant: resultatExploitation },
    { ref: "TK", libelle: "Revenus financiers et assimilés",                         note: 29, signe: "+",   montant: revenusFinanciers },
    { ref: "RM", libelle: "Frais financiers et charges assimilés",                   note: 29, signe: "-",   montant: fraisFinanciers },
    { ref: "XF", libelle: "RÉSULTAT FINANCIER",                                      isTotal: true,          montant: resultatFinancier },
    { ref: "XG", libelle: "RÉSULTAT DES ACTIVITÉS ORDINAIRES",                       isTotal: true,          montant: resultatActivitesOrdinaires },
    { ref: "TN", libelle: "Produits des cessions d'immobilisations",                            signe: "+",   montant: -get(["82"]) },
    { ref: "TO", libelle: "Autres produits HAO",                                     note: 30, signe: "+",   montant: -get(["84"]) },
    { ref: "RO", libelle: "Valeur comptable des cessions d'immobilisations",                    signe: "-",   montant: get(["81"]) },
    { ref: "RP", libelle: "Autres charges HAO",                                      note: 30, signe: "-",   montant: get(["83"]) },
    { ref: "XH", libelle: "RÉSULTAT HORS ACTIVITÉS ORDINAIRES",                      isTotal: true,          montant: resultatHAO },
    { ref: "RQ", libelle: "Participation des travailleurs",                           note: 30, signe: "-",   montant: participationTravailleurs },
    { ref: "RS", libelle: "Impôts sur le résultat",                                            signe: "-",   montant: impotResultat },
    { ref: "XI", libelle: "RÉSULTAT NET",                                             isTotal: true,          montant: resultatNet },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-lg">Compte de Résultat — Exercice {annee}</h3>
        <Badge variant={resultatNet >= 0 ? "default" : "destructive"}>
          {resultatNet >= 0 ? "✅ Bénéfice" : "⚠️ Perte"} :{" "}
          {resultatNet < 0 ? "-" : ""}{fmt(resultatNet)} FCFA
        </Badge>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2 w-12 font-bold">Réf.</th>
                <th className="text-left p-2 font-bold">Libellés</th>
                <th className="text-center p-2 w-12 font-bold">Note</th>
                <th className="text-center p-2 w-12 font-bold">Signe</th>
                <th className="text-right p-2 w-36 font-bold">Exercice {annee}</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr
                  key={l.ref}
                  className={`border-t ${
                    l.isTotal
                      ? "bg-primary/5 font-bold border-t-2"
                      : "hover:bg-muted/20"
                  }`}
                >
                  <td className="p-2 font-mono text-primary text-xs">{l.ref}</td>
                  <td className={`p-2 ${l.isTotal ? "uppercase text-xs" : ""}`}>
                    {l.libelle}
                  </td>
                  <td className="p-2 text-center text-muted-foreground">
                    {l.note ?? ""}
                  </td>
                  <td className="p-2 text-center text-muted-foreground">
                    {l.signe ?? ""}
                  </td>
                  <td
                    className={`p-2 text-right tabular-nums font-semibold ${
                      l.ref === "XI"
                        ? l.montant >= 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-destructive"
                        : l.isTotal
                        ? "text-primary"
                        : l.montant < 0
                        ? "text-destructive"
                        : ""
                    }`}
                  >
                    {l.montant !== 0
                      ? `${l.montant < 0 ? "(" : ""}${fmt(l.montant)}${l.montant < 0 ? ")" : ""}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic text-center">
        Établi selon le Système Comptable OHADA (SYSCOHADA Révisé) — Format Liasse Fiscale 2023
      </p>
    </div>
  );
};
