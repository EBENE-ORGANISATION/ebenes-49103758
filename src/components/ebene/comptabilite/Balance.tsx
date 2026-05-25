import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type DonneesMensuelles } from "@/types/ebene";
import { getCompte, getComptesByClasse } from "@/lib/planComptable";

interface Props {
  donneesMensuelles: DonneesMensuelles;
  annee: number;
}

interface LigneBalance {
  code: string;
  intitule: string;
  classe: number;
  mouvementsDebit: number;
  mouvementsCredit: number;
  soldeDebit: number;
  soldeCredit: number;
}

const CLASSE_LABELS: Record<number, string> = {
  1: "Classe 1 — Ressources durables",
  2: "Classe 2 — Immobilisations",
  3: "Classe 3 — Stocks",
  4: "Classe 4 — Tiers",
  5: "Classe 5 — Trésorerie",
  6: "Classe 6 — Charges",
  7: "Classe 7 — Produits",
  8: "Classe 8 — Hors Activité Ordinaire",
};

export const Balance = ({ donneesMensuelles, annee }: Props) => {
  const [filtre, setFiltre] = useState<"tous" | "mouvements">("mouvements");

  const lignes = useMemo<LigneBalance[]>(() => {
    const map = new Map<string, { debit: number; credit: number }>();

    for (const [key, mois] of Object.entries(donneesMensuelles)) {
      const [anneeKey] = key.split("-");
      if (parseInt(anneeKey, 10) !== annee) continue;

      for (const ecriture of (mois.ecritures ?? [])) {
        if (ecriture.statut === "brouillon") continue;

        for (const ligne of (Array.isArray(ecriture.lignes) ? ecriture.lignes : [])) {
          const existing = map.get(ligne.compte) ?? { debit: 0, credit: 0 };
          map.set(ligne.compte, {
            debit:  existing.debit  + ligne.debit,
            credit: existing.credit + ligne.credit,
          });
        }
      }
    }

    const result: LigneBalance[] = [];

    for (const [code, { debit, credit }] of map.entries()) {
      const planCompte = getCompte(code);
      const classe     = planCompte?.classe ?? (parseInt(code.charAt(0), 10) || 9);
      const intitule   = planCompte?.intitule ?? code;

      const solde = debit - credit;
      result.push({
        code,
        intitule,
        classe,
        mouvementsDebit:  debit,
        mouvementsCredit: credit,
        soldeDebit:  solde >= 0 ? solde : 0,
        soldeCredit: solde <  0 ? -solde : 0,
      });
    }

    return result.sort((a, b) => a.code.localeCompare(b.code));
  }, [donneesMensuelles, annee]);

  const displayed = useMemo(
    () =>
      filtre === "mouvements"
        ? lignes.filter((l) => l.mouvementsDebit > 0 || l.mouvementsCredit > 0)
        : lignes,
    [lignes, filtre],
  );

  // Totaux généraux
  const totaux = useMemo(
    () =>
      displayed.reduce(
        (acc, l) => ({
          mouvD: acc.mouvD + l.mouvementsDebit,
          mouvC: acc.mouvC + l.mouvementsCredit,
          solD:  acc.solD  + l.soldeDebit,
          solC:  acc.solC  + l.soldeCredit,
        }),
        { mouvD: 0, mouvC: 0, solD: 0, solC: 0 },
      ),
    [displayed],
  );

  const equilibree = Math.abs(totaux.mouvD - totaux.mouvC) < 0.01
                  && Math.abs(totaux.solD  - totaux.solC)  < 0.01;

  // Grouper par classe
  const parClasse = useMemo(() => {
    const groups = new Map<number, LigneBalance[]>();
    for (const l of displayed) {
      const arr = groups.get(l.classe) ?? [];
      arr.push(l);
      groups.set(l.classe, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [displayed]);

  if (lignes.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-10 italic">
        Aucune écriture validée pour l'année {annee}.
        <br />
        <span className="text-sm">Validez des écritures depuis l'onglet "📋 Journal".</span>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Contrôles */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={filtre === "mouvements" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setFiltre("mouvements")}
          >
            Avec mouvements
          </Button>
          <Button
            size="sm"
            variant={filtre === "tous" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setFiltre("tous")}
          >
            Tous les comptes
          </Button>
        </div>
        <Badge
          variant={equilibree ? "default" : "destructive"}
          className="text-xs"
        >
          {equilibree
            ? "✅ Balance équilibrée"
            : `⚠️ Écart détecté : ${Math.abs(totaux.mouvD - totaux.mouvC).toLocaleString("fr-FR")} FCFA`}
        </Badge>
      </div>

      {/* Tableau */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2 font-semibold w-20">Compte</th>
                <th className="text-left p-2 font-semibold">Intitulé</th>
                <th className="text-right p-2 font-semibold w-28">Mvt Débit</th>
                <th className="text-right p-2 font-semibold w-28">Mvt Crédit</th>
                <th className="text-right p-2 font-semibold w-28">Solde D</th>
                <th className="text-right p-2 font-semibold w-28">Solde C</th>
              </tr>
            </thead>
            <tbody>
              {parClasse.map(([classe, lignesClasse]) => {
                const classeTotal = lignesClasse.reduce(
                  (acc, l) => ({
                    mouvD: acc.mouvD + l.mouvementsDebit,
                    mouvC: acc.mouvC + l.mouvementsCredit,
                    solD:  acc.solD  + l.soldeDebit,
                    solC:  acc.solC  + l.soldeCredit,
                  }),
                  { mouvD: 0, mouvC: 0, solD: 0, solC: 0 },
                );

                return (
                  <>
                    {/* Séparateur de classe */}
                    <tr key={`classe-${classe}`} className="bg-primary/8 border-t-2 border-primary/20">
                      <td colSpan={6} className="p-1.5 pl-2 text-xs font-bold text-primary">
                        {CLASSE_LABELS[classe] ?? `Classe ${classe}`}
                      </td>
                    </tr>

                    {/* Lignes de comptes */}
                    {lignesClasse.map((l) => (
                      <tr key={l.code} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="p-2 font-mono font-bold text-primary">{l.code}</td>
                        <td className="p-2 text-muted-foreground truncate max-w-[200px]">{l.intitule}</td>
                        <td className="p-2 text-right tabular-nums">
                          {l.mouvementsDebit > 0 ? l.mouvementsDebit.toLocaleString("fr-FR") : ""}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {l.mouvementsCredit > 0 ? l.mouvementsCredit.toLocaleString("fr-FR") : ""}
                        </td>
                        <td className="p-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {l.soldeDebit > 0 ? l.soldeDebit.toLocaleString("fr-FR") : ""}
                        </td>
                        <td className="p-2 text-right tabular-nums text-rose-600">
                          {l.soldeCredit > 0 ? l.soldeCredit.toLocaleString("fr-FR") : ""}
                        </td>
                      </tr>
                    ))}

                    {/* Sous-total classe */}
                    <tr key={`total-${classe}`} className="bg-muted/40 font-semibold border-t">
                      <td colSpan={2} className="p-1.5 pl-2 text-xs italic text-muted-foreground">
                        Total Classe {classe}
                      </td>
                      <td className="p-1.5 text-right tabular-nums text-xs">
                        {classeTotal.mouvD.toLocaleString("fr-FR")}
                      </td>
                      <td className="p-1.5 text-right tabular-nums text-xs">
                        {classeTotal.mouvC.toLocaleString("fr-FR")}
                      </td>
                      <td className="p-1.5 text-right tabular-nums text-xs text-emerald-700 dark:text-emerald-400">
                        {classeTotal.solD.toLocaleString("fr-FR")}
                      </td>
                      <td className="p-1.5 text-right tabular-nums text-xs text-rose-600">
                        {classeTotal.solC.toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  </>
                );
              })}

              {/* Ligne TOTAUX GÉNÉRAUX */}
              <tr className="bg-muted font-bold border-t-2 border-border">
                <td colSpan={2} className="p-2">TOTAUX GÉNÉRAUX</td>
                <td className="p-2 text-right tabular-nums">{totaux.mouvD.toLocaleString("fr-FR")}</td>
                <td className="p-2 text-right tabular-nums">{totaux.mouvC.toLocaleString("fr-FR")}</td>
                <td className="p-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                  {totaux.solD.toLocaleString("fr-FR")}
                </td>
                <td className="p-2 text-right tabular-nums text-rose-600">
                  {totaux.solC.toLocaleString("fr-FR")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Note de bas de page */}
      <p className="text-xs text-muted-foreground italic">
        Balance de vérification — Exercice {annee} — Écritures validées uniquement.
        {!equilibree && (
          <span className="text-destructive ml-2 font-medium">
            ⚠️ La balance est déséquilibrée. Vérifiez les écritures dans le Journal.
          </span>
        )}
      </p>
    </div>
  );
};
