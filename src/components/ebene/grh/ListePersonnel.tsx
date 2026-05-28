/**
 * ListePersonnel — Liste complète du personnel avec retraçage de carrière
 * (totaux bulletins, absences, sanctions) et export Excel.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Eye, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMontant, calculerAnciennete } from "@/lib/ebene-utils";
import { FichePersonnel } from "./FichePersonnel";
import type { Employe } from "@/types/ebene";

interface Props {
  employes: Employe[];
  societeId: string;
}

type CarriereSummary = {
  nbBulletins: number;
  totalBrut: number;
  totalNet: number;
  totalCout: number;
  nbAbsences: number;
  totalJoursAbsence: number;
  nbSanctions: number;
};

export const ListePersonnel = ({ employes, societeId }: Props) => {
  const [carriere, setCarriere] = useState<Record<number, CarriereSummary>>({});
  const [filter, setFilter] = useState("");
  const [fiche, setFiche] = useState<Employe | null>(null);

  // Charge les agrégats carrière pour tous les employés
  useEffect(() => {
    (async () => {
      const [bulls, abs, sancs] = await Promise.all([
        supabase.from("bulletins_paie")
          .select("employe_id,brut,net_a_payer,cout_employeur")
          .eq("societe_id", societeId),
        supabase.from("absences")
          .select("employe_id,jours")
          .eq("societe_id", societeId),
        supabase.from("sanctions" as never)
          .select("employe_id")
          .eq("societe_id", societeId),
      ]);
      const acc: Record<number, CarriereSummary> = {};
      const get = (id: number) => (acc[id] ||= {
        nbBulletins: 0, totalBrut: 0, totalNet: 0, totalCout: 0,
        nbAbsences: 0, totalJoursAbsence: 0, nbSanctions: 0,
      });
      (bulls.data as Array<{ employe_id: number; brut: number; net_a_payer: number; cout_employeur: number }> | null)?.forEach((b) => {
        const c = get(b.employe_id);
        c.nbBulletins++;
        c.totalBrut += b.brut || 0;
        c.totalNet += b.net_a_payer || 0;
        c.totalCout += b.cout_employeur || 0;
      });
      (abs.data as Array<{ employe_id: number; jours: number }> | null)?.forEach((a) => {
        const c = get(a.employe_id);
        c.nbAbsences++;
        c.totalJoursAbsence += Number(a.jours) || 0;
      });
      (sancs.data as Array<{ employe_id: number }> | null)?.forEach((s) => {
        get(s.employe_id).nbSanctions++;
      });
      setCarriere(acc);
    })();
  }, [societeId, employes.length]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return employes;
    return employes.filter((e) =>
      [e.nom, e.matricule, e.poste, e.email, e.telephone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [employes, filter]);

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((e) => {
      const c = carriere[e.id] ?? {
        nbBulletins: 0, totalBrut: 0, totalNet: 0, totalCout: 0,
        nbAbsences: 0, totalJoursAbsence: 0, nbSanctions: 0,
      };
      return {
        "Matricule": e.matricule ?? "",
        "Nom complet": e.nom,
        "Sexe": e.sexe ?? "",
        "Date naissance": e.dateNaissance ?? "",
        "Lieu naissance": e.lieuNaissance ?? "",
        "Nationalité": e.nationalite ?? "",
        "CNI": e.cni ?? "",
        "N° CNSS": e.numCnss ?? "",
        "Adresse": e.adresse ?? "",
        "Téléphone": e.telephone ?? "",
        "Email": e.email ?? "",
        "Situation": e.situation,
        "Enfants": e.enfants,
        "Poste": e.poste,
        "Qualification": e.qualification ?? "",
        "Catégorie": e.categorie ?? "",
        "Échelon": e.echelon ?? "",
        "Type contrat": (e.typeContrat ?? "").toUpperCase(),
        "Date embauche": e.dateEmbauche ?? "",
        "Date fin contrat": e.dateFinContrat ?? "",
        "Ancienneté (ans)": calculerAnciennete(e.dateEmbauche).toFixed(1),
        "Salaire base": e.salaire,
        "Sursalaire": e.sursalaire ?? 0,
        "Ind. transport": e.indemniteTransport ?? 0,
        "Ind. logement": e.indemniteLogement ?? 0,
        "Ind. fonction": e.indemniteFonction ?? 0,
        "Solde congés (j)": e.soldeConges ?? 0,
        "Statut validation": e.statutValidation ?? "valide",
        "Bulletins (nb)": c.nbBulletins,
        "Total brut cumulé": c.totalBrut,
        "Total net cumulé": c.totalNet,
        "Coût employeur cumulé": c.totalCout,
        "Absences (nb)": c.nbAbsences,
        "Jours absence cumulés": c.totalJoursAbsence,
        "Sanctions (nb)": c.nbSanctions,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Liste personnel");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Liste_personnel_${stamp}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher (nom, matricule, poste, email…)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button onClick={exportExcel} className="gap-1.5" size="sm">
          <Download className="size-4" /> Exporter Excel
        </Button>
      </div>

      <div className="overflow-x-auto card-elevated">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-muted/60 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 border-b border-border">Matricule</th>
              <th className="text-left px-3 py-2 border-b border-border">Nom</th>
              <th className="text-left px-3 py-2 border-b border-border">Poste</th>
              <th className="text-left px-3 py-2 border-b border-border">Cat.</th>
              <th className="text-left px-3 py-2 border-b border-border">Contrat</th>
              <th className="text-left px-3 py-2 border-b border-border">Embauche</th>
              <th className="text-right px-3 py-2 border-b border-border">Anc.</th>
              <th className="text-right px-3 py-2 border-b border-border">Salaire</th>
              <th className="text-right px-3 py-2 border-b border-border">Bulletins</th>
              <th className="text-right px-3 py-2 border-b border-border">Net cumulé</th>
              <th className="text-right px-3 py-2 border-b border-border">Abs.</th>
              <th className="text-right px-3 py-2 border-b border-border">Sanct.</th>
              <th className="px-3 py-2 border-b border-border"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-6 text-muted-foreground">Aucun employé</td></tr>
            ) : filtered.map((e) => {
              const c = carriere[e.id];
              const anc = calculerAnciennete(e.dateEmbauche);
              return (
                <tr key={e.id} className="hover:bg-muted/30 border-b border-border/50">
                  <td className="px-3 py-2 font-mono">{e.matricule ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold">{e.nom}</td>
                  <td className="px-3 py-2">{e.poste}</td>
                  <td className="px-3 py-2">{e.categorie ?? "—"}{e.echelon ? `/${e.echelon}` : ""}</td>
                  <td className="px-3 py-2">{(e.typeContrat ?? "—").toUpperCase()}</td>
                  <td className="px-3 py-2">{e.dateEmbauche ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{anc.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right amount">{formatMontant(e.salaire)}</td>
                  <td className="px-3 py-2 text-right">{c?.nbBulletins ?? 0}</td>
                  <td className="px-3 py-2 text-right amount text-success">{formatMontant(c?.totalNet ?? 0)}</td>
                  <td className="px-3 py-2 text-right">{c?.nbAbsences ?? 0}</td>
                  <td className="px-3 py-2 text-right">{c?.nbSanctions ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setFiche(e)}>
                      <Eye className="size-3" /> Fiche
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {fiche && <FichePersonnel employe={fiche} societeId={societeId} onClose={() => setFiche(null)} />}
    </div>
  );
};