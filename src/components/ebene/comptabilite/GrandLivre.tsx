import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Search, Printer, BookMarked } from "lucide-react";
import { type DonneesMensuelles, type EcritureComptable } from "@/types/ebene";
import { getCompte } from "@/lib/planComptable";
import { formatMontant } from "@/lib/ebene-utils";
import { printElement } from "@/lib/print";

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
  const printRef = useRef<HTMLDivElement>(null);

  const comptes = useMemo<CompteGrandLivre[]>(() => {
    const map = new Map<string, {
      lignes: Array<{
        date: string;
        ecriture: EcritureComptable;
        debit: number;
        credit: number;
        tiers?: string;
      }>;
    }>();

    for (const [key, mois] of Object.entries(donneesMensuelles)) {
      const [anneeKey] = key.split("-");
      if (parseInt(anneeKey, 10) !== annee) continue;

      for (const ecriture of (mois.ecritures ?? [])) {
        if (ecriture.statut === "brouillon") continue;
        const lignesEcr = Array.isArray(ecriture.lignes) ? ecriture.lignes : [];
        const dateEcr   = ecriture.annee && ecriture.mois
          ? `${ecriture.annee}-${String(ecriture.mois).padStart(2, "0")}-01`
          : "";
        for (const ligne of lignesEcr) {
          if (!map.has(ligne.compte)) map.set(ligne.compte, { lignes: [] });
          map.get(ligne.compte)!.lignes.push({
            date: dateEcr, ecriture,
            debit: ligne.debit, credit: ligne.credit, tiers: ligne.tiers,
          });
        }
      }
    }

    const result: CompteGrandLivre[] = [];
    for (const [code, { lignes }] of map.entries()) {
      const planCompte = getCompte(code);
      const intitule   = planCompte?.intitule ?? code;
      const sorted     = [...lignes].sort((a, b) => a.date.localeCompare(b.date));
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

  // T3 — Empty state illustré
  if (comptes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BookMarked className="size-8 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-base">Grand-Livre vide</p>
          <p className="text-sm text-muted-foreground mt-1">
            Aucune écriture validée pour l'exercice {annee}.
            <br />Validez des écritures depuis l'onglet <strong>📋 Journal</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" ref={printRef}>
      {/* Barre de recherche + compteur + imprimer */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un compte (code ou libellé)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length} compte{filtered.length > 1 ? "s" : ""} — Exercice {annee}
        </span>
        {/* T7 — Imprimer */}
        <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs shrink-0 no-print" onClick={() => printElement(printRef.current, `Grand livre ${annee}`)}>
          <Printer className="size-3.5" /> Imprimer
        </Button>
      </div>

      {/* Liste des comptes */}
      <div className="space-y-1.5">
        {filtered.map((compte) => {
          const isOpen = expanded === compte.code;
          return (
            <div key={compte.code} className="border rounded-lg overflow-hidden shadow-sm">
              {/* En-tête compte */}
              <div
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(isOpen ? null : compte.code)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isOpen
                    ? <ChevronDown  className="size-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
                  <span className="font-mono font-bold text-primary text-sm shrink-0">{compte.code}</span>
                  <span className="text-sm truncate">{compte.intitule}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {compte.mouvements.length} mvt{compte.mouvements.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2 text-xs tabular-nums">
                  <span className="font-mono text-blue-700 dark:text-blue-400 hidden sm:inline">
                    D {formatMontant(compte.totalDebit)}
                  </span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 hidden sm:inline">
                    C {formatMontant(compte.totalCredit)}
                  </span>
                  <span className={`font-bold font-mono ${compte.solde < 0 ? "text-destructive" : "text-foreground"}`}>
                    {compte.solde >= 0 ? "+" : ""}{compte.solde.toLocaleString("fr-FR")} F
                  </span>
                </div>
              </div>

              {/* T3 — Détail mouvements */}
              {isOpen && (
                <div className="border-t bg-muted/5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left px-3 py-2 font-semibold">Date</th>
                          <th className="text-left px-2 py-2 font-semibold">Jnl</th>
                          <th className="text-left px-2 py-2 font-semibold">N° Pièce</th>
                          <th className="text-left px-2 py-2 font-semibold">Libellé</th>
                          <th className="text-left px-2 py-2 font-semibold hidden md:table-cell">Tiers</th>
                          <th className="text-right px-3 py-2 font-semibold text-blue-700 dark:text-blue-400">Débit</th>
                          <th className="text-right px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-400">Crédit</th>
                          {/* T3 — Solde progressif */}
                          <th className="text-right px-3 py-2 font-semibold">Solde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compte.mouvements.map((m, i) => (
                          <tr
                            key={i}
                            className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${
                              i % 2 === 0 ? "bg-background" : "bg-muted/10"
                            }`}
                          >
                            <td className="px-3 py-1.5 tabular-nums">{m.date}</td>
                            <td className="px-2 py-1.5">
                              <span className="text-[10px] font-mono font-bold text-muted-foreground">{m.journal}</span>
                            </td>
                            <td className="px-2 py-1.5 font-mono text-primary text-[11px]">{m.numeroPiece}</td>
                            <td className="px-2 py-1.5 text-muted-foreground max-w-[140px] truncate">{m.libelle}</td>
                            <td className="px-2 py-1.5 text-muted-foreground hidden md:table-cell">{m.tiers || "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-mono font-semibold text-blue-700 dark:text-blue-400">
                              {m.debit > 0 ? m.debit.toLocaleString("fr-FR") : ""}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                              {m.credit > 0 ? m.credit.toLocaleString("fr-FR") : ""}
                            </td>
                            {/* T3 — Solde progressif coloré si négatif */}
                            <td className={`px-3 py-1.5 text-right tabular-nums font-mono font-bold ${
                              m.solde < 0
                                ? "text-destructive bg-destructive/5"
                                : "text-foreground"
                            }`}>
                              {m.solde.toLocaleString("fr-FR")}
                            </td>
                          </tr>
                        ))}
                        {/* Totaux */}
                        <tr className="bg-muted/40 font-bold border-t-2 border-border">
                          <td colSpan={5} className="px-3 py-2 text-xs uppercase tracking-wide">Totaux</td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400">
                            {compte.totalDebit.toLocaleString("fr-FR")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400">
                            {compte.totalCredit.toLocaleString("fr-FR")}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-mono ${
                            compte.solde < 0 ? "text-destructive" : ""
                          }`}>
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
