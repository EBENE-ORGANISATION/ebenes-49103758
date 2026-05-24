import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { type DonneesMensuelles, type EcritureComptable } from "@/types/ebene";
import { getCompte } from "@/lib/planComptable";

interface Props {
  donneesMensuelles: DonneesMensuelles;
  annee: number;
}

interface MouvementCompte {
  date: string;
  journal: string;
  numeroPiece: string;
  libelle: string;
  tiers?: string;
  debit: number;
  credit: number;
  solde: number;
}

interface CompteGrandLivre {
  code: string;
  intitule: string;
  mouvements: MouvementCompte[];
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

export const GrandLivre = ({ donneesMensuelles, annee }: Props) => {
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Collecte toutes les écritures validées de l'année
  const comptes = useMemo<CompteGrandLivre[]>(() => {
    const map = new Map<string, { lignes: Array<{ date: string; ecriture: EcritureComptable; debit: number; credit: number; tiers?: string }> }>();

    for (const [key, mois] of Object.entries(donneesMensuelles)) {
      const [anneeKey] = key.split("-");
      if (parseInt(anneeKey, 10) !== annee) continue;

      for (const ecriture of (mois.ecritures ?? [])) {
        if (ecriture.statut === "brouillon") continue; // exclure brouillons

        for (const ligne of ecriture.lignes) {
          if (!map.has(ligne.compte)) map.set(ligne.compte, { lignes: [] });
          map.get(ligne.compte)!.lignes.push({
            date: ecriture.date,
            ecriture,
            debit: ligne.debit,
            credit: ligne.credit,
            tiers: ligne.tiers,
          });
        }
      }
    }

    const result: CompteGrandLivre[] = [];

    for (const [code, { lignes }] of map.entries()) {
      const planCompte = getCompte(code);
      const intitule   = planCompte?.intitule ?? code;

      // Trier par date
      const sorted = [...lignes].sort((a, b) => a.date.localeCompare(b.date));

      let soldeProgressif = 0;
      const mouvements: MouvementCompte[] = sorted.map((l) => {
        soldeProgressif += l.debit - l.credit;
        return {
          date:        l.date,
          journal:     l.ecriture.journal,
          numeroPiece: l.ecriture.numeroPiece,
          libelle:     l.ecriture.libelle,
          tiers:       l.tiers,
          debit:       l.debit,
          credit:      l.credit,
          solde:       soldeProgressif,
        };
      });

      const totalDebit  = mouvements.reduce((s, m) => s + m.debit,  0);
      const totalCredit = mouvements.reduce((s, m) => s + m.credit, 0);

      result.push({ code, intitule, mouvements, totalDebit, totalCredit, solde: totalDebit - totalCredit });
    }

    return result.sort((a, b) => a.code.localeCompare(b.code));
  }, [donneesMensuelles, annee]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return comptes;
    return comptes.filter(
      (c) => c.code.startsWith(q) || c.intitule.toLowerCase().includes(q),
    );
  }, [comptes, search]);

  if (comptes.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-10 italic">
        Aucune écriture validée pour l'année {annee}.
        <br />
        <span className="text-sm">Validez des écritures depuis l'onglet "📋 Journal".</span>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un compte (code ou libellé)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} compte{filtered.length > 1 ? "s" : ""} — Exercice {annee} (écritures validées uniquement)
      </p>

      {/* Liste des comptes */}
      <div className="space-y-1.5">
        {filtered.map((compte) => {
          const isOpen = expanded === compte.code;
          return (
            <div key={compte.code} className="border rounded-lg overflow-hidden">
              {/* En-tête du compte */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setExpanded(isOpen ? null : compte.code)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen
                    ? <ChevronDown  className="size-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
                  <span className="font-mono font-bold text-primary text-sm">{compte.code}</span>
                  <span className="text-sm truncate">{compte.intitule}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {compte.mouvements.length} mvt{compte.mouvements.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-2 text-xs tabular-nums">
                  <span className="text-emerald-700 dark:text-emerald-400">
                    D {compte.totalDebit.toLocaleString("fr-FR")}
                  </span>
                  <span className="text-rose-600">
                    C {compte.totalCredit.toLocaleString("fr-FR")}
                  </span>
                  <span className={`font-bold ${compte.solde >= 0 ? "text-foreground" : "text-rose-600"}`}>
                    Solde {compte.solde.toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              </div>

              {/* Détail des mouvements */}
              {isOpen && (
                <div className="border-t px-3 pb-3 pt-2 bg-muted/10">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-2 font-semibold">Date</th>
                          <th className="text-left py-1 pr-2 font-semibold">Journal</th>
                          <th className="text-left py-1 pr-2 font-semibold">N° Pièce</th>
                          <th className="text-left py-1 pr-2 font-semibold">Libellé</th>
                          <th className="text-left py-1 pr-2 font-semibold">Tiers</th>
                          <th className="text-right py-1 pr-2 font-semibold">Débit</th>
                          <th className="text-right py-1 pr-2 font-semibold">Crédit</th>
                          <th className="text-right py-1 font-semibold">Solde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compte.mouvements.map((m, i) => (
                          <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                            <td className="py-1 pr-2">{m.date}</td>
                            <td className="py-1 pr-2">
                              <Badge variant="outline" className="text-xs py-0">{m.journal}</Badge>
                            </td>
                            <td className="py-1 pr-2 font-mono text-primary">{m.numeroPiece}</td>
                            <td className="py-1 pr-2 text-muted-foreground max-w-[160px] truncate">{m.libelle}</td>
                            <td className="py-1 pr-2 text-muted-foreground">{m.tiers || "—"}</td>
                            <td className="py-1 pr-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                              {m.debit > 0 ? m.debit.toLocaleString("fr-FR") : ""}
                            </td>
                            <td className="py-1 pr-2 text-right tabular-nums text-rose-600">
                              {m.credit > 0 ? m.credit.toLocaleString("fr-FR") : ""}
                            </td>
                            <td className={`py-1 text-right tabular-nums font-medium ${m.solde >= 0 ? "" : "text-rose-600"}`}>
                              {m.solde.toLocaleString("fr-FR")}
                            </td>
                          </tr>
                        ))}
                        <tr className="font-bold border-t bg-muted/30">
                          <td colSpan={5} className="py-1 pr-2">TOTAUX</td>
                          <td className="py-1 pr-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                            {compte.totalDebit.toLocaleString("fr-FR")}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums text-rose-600">
                            {compte.totalCredit.toLocaleString("fr-FR")}
                          </td>
                          <td className={`py-1 text-right tabular-nums ${compte.solde >= 0 ? "" : "text-rose-600"}`}>
                            {compte.solde.toLocaleString("fr-FR")}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
