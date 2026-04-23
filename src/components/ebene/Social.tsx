import { useMemo, useState } from "react";
import { Employe, MoisData, Prime } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, X } from "lucide-react";
import { StatCard } from "./StatCard";
import { formatMontant } from "@/lib/ebene-utils";

interface Props {
  employes: Employe[];
  data: MoisData;
  onAddEmploye: (e: Omit<Employe, "id">) => void;
  onRemoveEmploye: (id: number) => void;
  onAddPrime: (employeId: number, p: Omit<Prime, "id">) => void;
  onRemovePrime: (employeId: number, primeId: number) => void;
}

export const Social = ({
  employes,
  data,
  onAddEmploye,
  onRemoveEmploye,
  onAddPrime,
  onRemovePrime,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [nom, setNom] = useState("");
  const [poste, setPoste] = useState("");
  const [salaire, setSalaire] = useState("");
  const [situation, setSituation] = useState<"celibataire" | "marie">("celibataire");
  const [enfants, setEnfants] = useState("0");

  const [primeOpen, setPrimeOpen] = useState<number | null>(null);
  const [primeLib, setPrimeLib] = useState("");
  const [primeMnt, setPrimeMnt] = useState("");

  const masseTotale = useMemo(() => {
    let total = 0;
    employes.forEach((e) => {
      total += e.salaire + 5000;
      const primes = data.primes[e.id] || [];
      primes.forEach((p) => (total += p.montant || 0));
    });
    return total;
  }, [employes, data]);

  const submitEmploye = () => {
    if (!nom.trim()) return alert("Nom obligatoire.");
    if (!poste.trim()) return alert("Poste obligatoire.");
    const s = parseFloat(salaire);
    if (isNaN(s) || s <= 0) return alert("Salaire invalide.");
    onAddEmploye({
      nom: nom.trim(),
      poste: poste.trim(),
      salaire: s,
      situation,
      enfants: parseInt(enfants, 10) || 0,
    });
    setNom("");
    setPoste("");
    setSalaire("");
    setEnfants("0");
    setSituation("celibataire");
    setOpen(false);
  };

  const submitPrime = (employeId: number) => {
    if (!primeLib.trim()) return alert("Libellé obligatoire.");
    const m = parseFloat(primeMnt);
    if (isNaN(m) || m <= 0) return alert("Montant invalide.");
    onAddPrime(employeId, { libelle: primeLib.trim(), montant: m });
    setPrimeLib("");
    setPrimeMnt("");
    setPrimeOpen(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Masse Salariale" value={formatMontant(masseTotale)} tone="purple" />
        <StatCard label="Employés" value={String(employes.length)} tone="info" />
      </div>

      {!open ? (
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> Ajouter Employé
        </Button>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-lg">Nouvel Employé</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Nom complet *</Label>
              <Input value={nom} onChange={(e) => setNom(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Poste *</Label>
              <Input value={poste} onChange={(e) => setPoste(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Salaire (FCFA) *</Label>
              <Input
                type="number"
                value={salaire}
                onChange={(e) => setSalaire(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Situation</Label>
              <Select value={situation} onValueChange={(v) => setSituation(v as "celibataire" | "marie")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="celibataire">Célibataire</SelectItem>
                  <SelectItem value="marie">Marié(e)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Enfants</Label>
              <Input
                type="number"
                value={enfants}
                onChange={(e) => setEnfants(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={submitEmploye} className="bg-success text-success-foreground hover:bg-success/90">
              ✓ Enregistrer
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} className="gap-1.5">
              <X className="size-4" /> Annuler
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {employes.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 italic">Aucun employé enregistré</p>
        ) : (
          employes.map((e) => {
            const primes = data.primes[e.id] || [];
            const totalPrimes = primes.reduce((a, p) => a + p.montant, 0);
            const totalEmp = e.salaire + 5000 + totalPrimes;
            return (
              <div key={e.id} className="list-item border-l-4 border-l-purple">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{e.nom}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.poste} • {e.situation === "marie" ? "Marié(e)" : "Célibataire"} •{" "}
                      {e.enfants} enfant{e.enfants > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Salaire base : <span className="amount">{formatMontant(e.salaire)}</span> +
                      Salissure 5 000 F
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="amount text-base text-purple">{formatMontant(totalEmp)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(`Supprimer ${e.nom} ?`)) onRemoveEmploye(e.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase">
                      Primes du mois ({primes.length})
                    </p>
                    {primeOpen !== e.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 h-7 text-xs"
                        onClick={() => setPrimeOpen(e.id)}
                      >
                        <Plus className="size-3" /> Prime
                      </Button>
                    )}
                  </div>
                  {primeOpen === e.id && (
                    <div className="flex gap-2 mb-2">
                      <Input
                        placeholder="Libellé"
                        value={primeLib}
                        onChange={(ev) => setPrimeLib(ev.target.value)}
                        className="flex-1 h-9"
                      />
                      <Input
                        type="number"
                        placeholder="Montant"
                        value={primeMnt}
                        onChange={(ev) => setPrimeMnt(ev.target.value)}
                        className="w-28 h-9"
                      />
                      <Button size="sm" onClick={() => submitPrime(e.id)}>
                        ✓
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPrimeOpen(null)}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  )}
                  {primes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Aucune prime</p>
                  ) : (
                    <div className="space-y-1">
                      {primes.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs bg-muted/50 px-2 py-1 rounded">
                          <span>{p.libelle}</span>
                          <div className="flex items-center gap-2">
                            <span className="amount">{formatMontant(p.montant)}</span>
                            <button
                              className="text-destructive hover:underline"
                              onClick={() => onRemovePrime(e.id, p.id)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};