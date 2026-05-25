import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { type DonneesMensuelles } from "@/types/ebene";
import { getCompte } from "@/lib/planComptable";
import { Scale, Printer, CheckCircle2, AlertTriangle } from "lucide-react";

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
      const solde      = debit - credit;
      result.push({
        code, intitule, classe,
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

  const equilibree =
    Math.abs(totaux.mouvD - totaux.mouvC) < 0.01 &&
    Math.abs(totaux.solD  - totaux.solC)  < 0.01;

  const parClasse = useMemo(() => {
    const groups = new Map<number, LigneBalance[]>();
    for (const l of displayed) {
      const arr = groups.get(l.classe) ?? [];
      arr.push(l);
      groups.set(l.classe, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [displayed]);

  // T4 — Empty state illustré
  if (lignes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Scale className="size-8 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-base">Balance vide</p>
          <p className="text-sm text-muted-foreground mt-1">
            Aucune écriture validée pour l'exercice {annee}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Contrôles + badge équilibre + imprimer */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={filtre === "mouvements" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setFiltre("mouvements")}
          >
            Avec mouvements
          </Button>
          <Button
            size="sm"
            variant={filtre === "tous" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setFiltre("tous")}
          >
            Tous les comptes
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* T4 — Badge équilibre plus visible */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
            equilibree
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200"
              : "bg-destructive/15 text-destructive border-destructive/30"
          }`}>
            {equilibree ? (
              <><CheckCircle2 className="size-3.5" /> Balance équilibrée</>
            ) : (
              <><AlertTriangle className="size-3.5" /> Écart : {Math.abs(totaux.mouvD - totaux.mouvC).toLocaleString("fr-FR")} FCFA</>
            )}
          </div>
          {/* T7 — Imprimer */}
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Imprimer
          </Button>
        </div>
      </div>

      {/* T4 — Tableau avec colonnes alignées monospace */}
      <div className="border rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="bg-muted border-b-2 border-border">
                <th className="text-left px-3 py-2.5 font-bold w-20">Compte</th>
                <th className="text-left px-2 py-2.5 font-bold">Intitulé</th>
                <th className="text-right px-3 py-2.5 font-bold w-28 text-blue-700 dark:text-blue-400">Mvt Débit</th>
                <th className="text-right px-3 py-2.5 font-bold w-28 text-emerald-700 dark:text-emerald-400">Mvt Crédit</th>
                <th className="text-right px-3 py-2.5 font-bold w-28 text-blue-700 dark:text-blue-400">Solde D</th>
                <th className="text-right px-3 py-2.5 font-bold w-28 text-emerald-700 dark:text-emerald-400">Solde C</th>
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
                    <tr key={`classe-${classe}`} className="bg-primary/5 border-t-2 border-primary/15">
                      <td colSpan={6} className="px-3 py-1.5 text-xs font-bold text-primary">
                        {CLASSE_LABELS[classe] ?? `Classe ${classe}`}
                      </td>
                    </tr>

                    {/* T1 — Lignes avec alternance */}
                    {lignesClasse.map((l, i) => (
                      <tr
                        key={l.code}
                        className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${
                          i % 2 === 0 ? "bg-background" : "bg-muted/10"
                        }`}
                      >
                        <td className="px-3 py-1.5 font-mono font-bold text-primary">{l.code}</td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[180px]">{l.intitule}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400">
                          {l.mouvementsDebit > 0 ? l.mouvementsDebit.toLocaleString("fr-FR") : ""}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400">
                          {l.mouvementsCredit > 0 ? l.mouvementsCredit.toLocaleString("fr-FR") : ""}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400">
                          {l.soldeDebit > 0 ? l.soldeDebit.toLocaleString("fr-FR") : ""}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400">
                          {l.soldeCredit > 0 ? l.soldeCredit.toLocaleString("fr-FR") : ""}
                        </td>
                      </tr>
                    ))}

                    {/* Sous-total classe */}
                    <tr key={`total-${classe}`} className="bg-muted/40 border-t border-border font-semibold">
                      <td colSpan={2} className="px-3 py-1.5 text-[11px] italic text-muted-foreground">
                        Sous-total Classe {classe}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400">
                        {classeTotal.mouvD.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400">
                        {classeTotal.mouvC.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400">
                        {classeTotal.solD.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400">
                        {classeTotal.solC.toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  </>
                );
              })}

              {/* T4 — Totaux généraux avec séparation forte */}
              <tr className="bg-muted font-bold border-t-4 border-foreground/20">
                <td colSpan={2} className="px-3 py-2.5 text-sm uppercase tracking-wide">
                  TOTAUX GÉNÉRAUX
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400 text-sm">
                  {totaux.mouvD.toLocaleString("fr-FR")}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                  {totaux.mouvC.toLocaleString("fr-FR")}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400 text-sm">
                  {totaux.solD.toLocaleString("fr-FR")}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                  {totaux.solC.toLocaleString("fr-FR")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        Balance de vérification — Exercice {annee} — Écritures validées uniquement.
        {!equilibree && (
          <span className="text-destructive ml-2 font-medium">
            ⚠ Vérifiez les écritures dans le Journal.
          </span>
        )}
      </p>
    </div>
  );
};
