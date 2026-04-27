import { useMemo, useState } from "react";
import {
  Absence,
  Employe,
  HeuresSup,
  MoisData,
  Prime,
  Sanction,
  CATEGORIES_LABELS,
} from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Pencil,
  FileText,
  Receipt,
  Clock,
  X,
  Check,
  XCircle,
  KeyRound,
} from "lucide-react";
import { StatCard } from "./StatCard";
import { formatMontant, calculerAnciennete, tauxAnciennete } from "@/lib/ebene-utils";
import { EmployeForm } from "./grh/EmployeForm";
import { BulletinPaie, calculerPaie } from "./grh/BulletinPaie";
import { ContratGenerator } from "./grh/ContratGenerator";
import { AbsencesPanel } from "./grh/AbsencesPanel";
import { HeuresSupPanel } from "./grh/HeuresSupPanel";
import { DisciplinePanel } from "./grh/DisciplinePanel";
import { IndemnitesCalculator } from "./grh/IndemnitesCalculator";
import { StatutValidationBadge } from "./grh/StatutValidationBadge";
import { ImportEmployesExcel } from "./grh/ImportEmployesExcel";
import { generateBulletin } from "@/lib/bulletinPDF";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  employes: Employe[];
  data: MoisData;
  annee: number;
  mois: number;
  sanctions: Sanction[];
  isChefGrh: boolean;
  onAddEmploye: (e: Omit<Employe, "id">) => void;
  onUpdateEmploye: (id: number, patch: Partial<Employe>) => void;
  onRemoveEmploye: (id: number) => void;
  onValiderEmploye: (id: number) => void;
  onRejeterEmploye: (id: number, motif: string) => void;
  onAddPrime: (employeId: number, p: Omit<Prime, "id">) => void;
  onRemovePrime: (employeId: number, primeId: number) => void;
  onAddAbsence: (a: Omit<Absence, "id">) => void;
  onRemoveAbsence: (id: number) => void;
  onSetHeuresSup: (employeId: number, hs: HeuresSup) => void;
  onSetRetenue: (employeId: number, montant: number) => void;
  onAddSanction: (s: Omit<Sanction, "id">) => void;
  onRemoveSanction: (id: number) => void;
  onValiderPrime: (employeId: number, primeId: number) => void;
  onRejeterPrime: (employeId: number, primeId: number, motif: string) => void;
  onValiderAbsence: (id: number) => void;
  onRejeterAbsence: (id: number, motif: string) => void;
  onValiderHeuresSup: (employeId: number) => void;
  onRejeterHeuresSup: (employeId: number, motif: string) => void;
  onValiderSanction: (id: number) => void;
  onRejeterSanction: (id: number, motif: string) => void;
}

export const GRH = ({
  employes,
  data,
  annee,
  mois,
  sanctions,
  isChefGrh,
  onAddEmploye,
  onUpdateEmploye,
  onRemoveEmploye,
  onValiderEmploye,
  onRejeterEmploye,
  onAddPrime,
  onRemovePrime,
  onAddAbsence,
  onRemoveAbsence,
  onSetHeuresSup,
  onSetRetenue,
  onAddSanction,
  onRemoveSanction,
  onValiderPrime,
  onRejeterPrime,
  onValiderAbsence,
  onRejeterAbsence,
  onValiderHeuresSup,
  onRejeterHeuresSup,
  onValiderSanction,
  onRejeterSanction,
}: Props) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employe | null>(null);
  const [bulletin, setBulletin] = useState<Employe | null>(null);
  const [contrat, setContrat] = useState<Employe | null>(null);
  const [hsOpen, setHsOpen] = useState<number | null>(null);
  const [primeOpen, setPrimeOpen] = useState<number | null>(null);
  const [primeLib, setPrimeLib] = useState("");
  const [primeMnt, setPrimeMnt] = useState("");

  const stats = useMemo(() => {
    let masseBrute = 0;
    let coutTotal = 0;
    let netTotal = 0;
    employes.forEach((e) => {
      // Exclure les employés non validés de la masse salariale
      if (e.statutValidation && e.statutValidation !== "valide") return;
      const c = calculerPaie(e, data);
      masseBrute += c.brut;
      coutTotal += c.coutEmployeur;
      netTotal += c.net;
    });
    return { masseBrute, coutTotal, netTotal };
  }, [employes, data]);

  const submitPrime = (employeId: number) => {
    if (!primeLib.trim()) return alert("Libellé requis");
    const m = parseFloat(primeMnt);
    if (isNaN(m) || m <= 0) return alert("Montant invalide");
    onAddPrime(employeId, { libelle: primeLib.trim(), montant: m });
    setPrimeLib("");
    setPrimeMnt("");
    setPrimeOpen(null);
  };

  // Crée (ou récupère) un compte portail employé via la fonction admin-users
  // puis lie son user_id à la fiche.
  const creerComptePortail = async (e: Employe) => {
    if (!e.email) {
      toast.error("Renseigne d'abord un email pour cet employé.");
      return;
    }
    if (e.userId) {
      toast.info("Cet employé a déjà un compte portail lié.");
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "create_employe_account",
          email: e.email,
          employe_nom: e.nom,
        },
      });
      if (error) throw error;
      const payload = data as {
        ok?: boolean;
        user_id?: string;
        temp_password?: string;
        already_existed?: boolean;
        error?: string;
      };
      if (payload?.error) {
        toast.error(payload.error);
        return;
      }
      if (!payload?.user_id) {
        toast.error("Réponse invalide du serveur.");
        return;
      }
      onUpdateEmploye(e.id, { userId: payload.user_id });
      if (payload.already_existed) {
        toast.success(
          `Compte existant trouvé pour ${e.email}. Lié à la fiche.`
        );
      } else {
        // Affiche le mot de passe temporaire dans une alerte (à transmettre à l'employé)
        window.alert(
          `✅ Compte portail créé pour ${e.nom}\n\n` +
            `Email : ${e.email}\n` +
            `Mot de passe temporaire : ${payload.temp_password}\n\n` +
            `⚠️ Transmets ce mot de passe à l'employé. Il pourra le changer après sa première connexion.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(`Échec création compte : ${msg}`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard label="Employés" value={String(employes.length)} tone="info" />
        <StatCard label="Masse brute" value={formatMontant(stats.masseBrute)} tone="purple" />
        <StatCard label="Net à payer" value={formatMontant(stats.netTotal)} tone="success" />
        <StatCard label="Coût employeur" value={formatMontant(stats.coutTotal)} tone="warning" />
      </div>

      <Tabs defaultValue="effectif" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full mb-5 h-auto">
          <TabsTrigger value="effectif">👥 Effectif & paie</TabsTrigger>
          <TabsTrigger value="absences">📅 Congés & absences</TabsTrigger>
          <TabsTrigger value="discipline">⚠️ Discipline</TabsTrigger>
          <TabsTrigger value="indemnites">🧮 Fin de contrat</TabsTrigger>
          <TabsTrigger value="config">⚙️ Référentiel</TabsTrigger>
        </TabsList>

        <TabsContent value="effectif" className="space-y-4">
          {showForm ? (
            <EmployeForm
              initial={editing || undefined}
              onSubmit={(d) => {
                if (editing) onUpdateEmploye(editing.id, d);
                else onAddEmploye(d);
                setShowForm(false);
                setEditing(null);
              }}
              onCancel={() => {
                setShowForm(false);
                setEditing(null);
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setShowForm(true)} className="gap-1.5">
                <Plus className="size-4" /> Ajouter un employé
              </Button>
              <ImportEmployesExcel onImport={onAddEmploye} />
            </div>
          )}

          {employes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 italic">Aucun employé enregistré</p>
          ) : (
            <div className="space-y-2">
              {employes.map((e) => {
                const c = calculerPaie(e, data);
                const anc = calculerAnciennete(e.dateEmbauche);
                const tx = tauxAnciennete(anc);
                const sv = e.statutValidation;
                const dim = sv && sv !== "valide" ? "opacity-60" : "";
                return (
                  <div key={e.id} className={`list-item border-l-4 border-l-purple ${dim}`}>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold flex items-center gap-2 flex-wrap">
                          <span>{e.nom} {e.matricule && <span className="text-xs text-muted-foreground">({e.matricule})</span>}</span>
                          {sv && <StatutValidationBadge statut={sv} motifRejet={e.motifRejet} />}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.poste} • Cat. {e.categorie || "-"} éch. {e.echelon || 1} • {(e.typeContrat || "cdi").toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ancienneté : <strong>{anc.toFixed(1)} ans</strong> (prime {(tx * 100).toFixed(0)}%) • {e.situation === "marie" ? "Marié(e)" : "Célibataire"} • {e.enfants} enf.
                        </p>
                        {sv === "rejete" && e.motifRejet && (
                          <p className="text-xs text-destructive mt-1 italic">
                            Motif du rejet : {e.motifRejet}
                          </p>
                        )}
                        {sv && sv !== "valide" && (
                          <p className="text-xs text-warning mt-1 italic">
                            ⚠️ Cet employé n'est pas pris en compte dans la paie tant qu'il n'est pas validé.
                          </p>
                        )}
                        <p className="text-xs mt-1">
                          Brut : <span className="amount text-purple">{formatMontant(c.brut)}</span> • Net : <span className="amount text-success">{formatMontant(c.net)}</span> • Coût : <span className="amount text-warning">{formatMontant(c.coutEmployeur)}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 shrink-0">
                        {isChefGrh && sv && sv !== "valide" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-8 text-xs text-success border-success/30 hover:bg-success/10"
                            onClick={() => onValiderEmploye(e.id)}
                            title="Valider cet employé"
                          >
                            <Check className="size-3" /> Valider
                          </Button>
                        )}
                        {isChefGrh && sv !== "rejete" && sv && sv !== "valide" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-8 text-xs text-warning border-warning/30 hover:bg-warning/10"
                            onClick={() => {
                              const motif = window.prompt("Motif du rejet :", "");
                              if (motif && motif.trim()) onRejeterEmploye(e.id, motif.trim());
                            }}
                            title="Rejeter cet employé"
                          >
                            <XCircle className="size-3" /> Rejeter
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => setBulletin(e)}>
                          <Receipt className="size-3" /> Bulletin
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-8 text-xs"
                          onClick={() => generateBulletin(e, data, annee, mois)}
                          title="Télécharger le bulletin PDF"
                        >
                          📄 PDF
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => setContrat(e)}>
                          <FileText className="size-3" /> Contrat
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => setHsOpen(hsOpen === e.id ? null : e.id)}>
                          <Clock className="size-3" /> HS
                        </Button>
                        {isChefGrh && (!e.userId || !e.email) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-8 text-xs"
                            onClick={() => creerComptePortail(e)}
                            title={
                              e.userId
                                ? "Compte portail déjà lié"
                                : !e.email
                                ? "Renseigne d'abord un email"
                                : "Créer un compte portail self-service"
                            }
                            disabled={!e.email || !!e.userId}
                          >
                            <KeyRound className="size-3" /> Portail
                          </Button>
                        )}
                        {isChefGrh && e.userId && (
                          <span
                            className="badge-soft bg-success/15 text-success text-[10px] flex items-center gap-1"
                            title={`Compte portail lié : ${e.userId}`}
                          >
                            <KeyRound className="size-2.5" /> Portail OK
                          </span>
                        )}
                        <Button size="icon" variant="ghost" className="size-8" onClick={() => { setEditing(e); setShowForm(true); }}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm(`Supprimer ${e.nom} ?`)) onRemoveEmploye(e.id); }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {hsOpen === e.id && (
                      <div className="mt-3">
                        <HeuresSupPanel
                          employe={e}
                          data={data}
                          onSave={(hs) => { onSetHeuresSup(e.id, hs); setHsOpen(null); }}
                        />
                      </div>
                    )}

                    {/* Statut validation des heures sup du mois */}
                    {(() => {
                      const hsCur = (data.heuresSup || {})[e.id];
                      if (!hsCur) return null;
                      const total =
                        (hsCur.jourSemaine || 0) +
                        (hsCur.jourSup || 0) +
                        (hsCur.dimancheFerie || 0) +
                        (hsCur.nuitSemaine || 0) +
                        (hsCur.nuitDimancheFerie || 0);
                      if (total <= 0) return null;
                      const statut = hsCur.statutValidation || "en_validation";
                      return (
                        <div className={`mt-2 flex items-center justify-between text-xs bg-muted/30 px-2 py-1.5 rounded ${statut === "brouillon" ? "opacity-50" : ""}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">HS du mois :</span>
                            <StatutValidationBadge statut={statut} motifRejet={hsCur.motifRejet} />
                            {statut === "rejete" && hsCur.motifRejet && (
                              <span className="italic text-destructive">— {hsCur.motifRejet}</span>
                            )}
                          </div>
                          {isChefGrh && (
                            <div className="flex items-center gap-1">
                              {statut !== "valide" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-success hover:text-success hover:bg-success/10"
                                  onClick={() => onValiderHeuresSup(e.id)}
                                  title="Valider"
                                >
                                  <Check className="size-3.5" />
                                </Button>
                              )}
                              {statut !== "rejete" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-warning hover:text-warning hover:bg-warning/10"
                                  onClick={() => {
                                    const motif = window.prompt("Motif du rejet :", "");
                                    if (motif && motif.trim()) onRejeterHeuresSup(e.id, motif.trim());
                                  }}
                                  title="Rejeter"
                                >
                                  <XCircle className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-muted-foreground uppercase">
                          Primes du mois ({((data.primes || {})[e.id] || []).length}) • Retenues
                        </p>
                        {primeOpen !== e.id && (
                          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setPrimeOpen(e.id)}>
                            <Plus className="size-3" /> Prime
                          </Button>
                        )}
                      </div>
                      {primeOpen === e.id && (
                        <div className="flex gap-2 mb-2">
                          <Input placeholder="Libellé" value={primeLib} onChange={(ev) => setPrimeLib(ev.target.value)} className="flex-1 h-9" />
                          <Input type="number" placeholder="Montant" value={primeMnt} onChange={(ev) => setPrimeMnt(ev.target.value)} className="w-28 h-9" />
                          <Button size="sm" onClick={() => submitPrime(e.id)}>✓</Button>
                          <Button size="sm" variant="ghost" onClick={() => setPrimeOpen(null)}><X className="size-3.5" /></Button>
                        </div>
                      )}
                      {((data.primes || {})[e.id] || []).map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between text-xs bg-muted/50 px-2 py-1 rounded mb-1 ${
                            p.statutValidation === "brouillon" ? "opacity-50" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{p.libelle}</span>
                            <StatutValidationBadge
                              statut={p.statutValidation}
                              motifRejet={p.motifRejet}
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="amount">{formatMontant(p.montant)}</span>
                            {isChefGrh && p.statutValidation !== "valide" && (
                              <button
                                className="text-success hover:underline"
                                title="Valider"
                                onClick={() => onValiderPrime(e.id, p.id)}
                              >
                                ✓
                              </button>
                            )}
                            {isChefGrh && p.statutValidation !== "rejete" && (
                              <button
                                className="text-warning hover:underline"
                                title="Rejeter"
                                onClick={() => {
                                  const motif = window.prompt("Motif du rejet :", "");
                                  if (motif && motif.trim()) onRejeterPrime(e.id, p.id, motif.trim());
                                }}
                              >
                                ⊘
                              </button>
                            )}
                            <button className="text-destructive hover:underline" onClick={() => onRemovePrime(e.id, p.id)}>×</button>
                          </div>
                          {p.statutValidation === "rejete" && p.motifRejet && (
                            <p className="text-xs italic text-destructive w-full mt-0.5">
                              Motif : {p.motifRejet}
                            </p>
                          )}
                        </div>
                      ))}
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Retenues diverses :</span>
                        <Input
                          type="number"
                          defaultValue={(data.retenues || {})[e.id] || 0}
                          onBlur={(ev) => onSetRetenue(e.id, parseFloat(ev.target.value) || 0)}
                          className="w-32 h-7 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="absences">
          <AbsencesPanel
            employes={employes}
            absences={data.absences || []}
            onAdd={onAddAbsence}
            onRemove={onRemoveAbsence}
            isChefGrh={isChefGrh}
            onValider={onValiderAbsence}
            onRejeter={onRejeterAbsence}
          />
        </TabsContent>

        <TabsContent value="discipline">
          <DisciplinePanel
            employes={employes}
            sanctions={sanctions}
            onAdd={onAddSanction}
            onRemove={onRemoveSanction}
            isChefGrh={isChefGrh}
            onValider={onValiderSanction}
            onRejeter={onRejeterSanction}
          />
        </TabsContent>

        <TabsContent value="indemnites">
          <IndemnitesCalculator employes={employes} />
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <div className="card-elevated p-5">
            <h3 className="font-bold mb-3">📚 Catégories professionnelles (Convention collective Togo)</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Agents d'exécution</p>
                {Object.entries(CATEGORIES_LABELS).filter(([k]) => k.startsWith("E")).map(([k, lbl]) => (
                  <div key={k} className="flex flex-col sm:flex-row sm:justify-between py-1 border-b border-border/50 gap-1">
                    <span className="font-semibold">{k}</span>
                    <span className="text-muted-foreground text-xs sm:text-right sm:max-w-[70%]">{lbl.split(" - ")[1]}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground mb-1 mt-2">Agents de maîtrise et assimilés</p>
                {Object.entries(CATEGORIES_LABELS).filter(([k]) => k.startsWith("M")).map(([k, lbl]) => (
                  <div key={k} className="flex flex-col sm:flex-row sm:justify-between py-1 border-b border-border/50 gap-1">
                    <span className="font-semibold">{k}</span>
                    <span className="text-muted-foreground text-xs sm:text-right sm:max-w-[70%]">{lbl.split(" - ")[1]}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground mb-1 mt-2">Cadres et assimilés</p>
                {Object.entries(CATEGORIES_LABELS).filter(([k]) => k.startsWith("C")).map(([k, lbl]) => (
                  <div key={k} className="flex flex-col sm:flex-row sm:justify-between py-1 border-b border-border/50 gap-1">
                    <span className="font-semibold">{k}</span>
                    <span className="text-muted-foreground text-xs sm:text-right sm:max-w-[70%]">{lbl.split(" - ")[1]}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs italic text-muted-foreground pt-2">
                Source : Annexe I — Convention Collective Interprofessionnelle du Togo (CCIT).
              </p>
            </div>
          </div>

          <div className="card-elevated p-5">
            <h3 className="font-bold mb-3">⚖️ Règles de paie appliquées</h3>
            <ul className="text-sm space-y-1.5 text-muted-foreground">
              <li>• <strong>Taux horaire</strong> = (Salaire base + sursalaire) / 173,33 (Art. 32)</li>
              <li>• <strong>Heures sup</strong> : 41-48h +20%, &gt;48h +40%, dim/fériés +65%, nuit +65%, nuit dim/fériés +100%</li>
              <li>• <strong>Prime d'ancienneté</strong> : 2% après 2 ans, +1%/an, plafond 30% (Art. 36)</li>
              <li>• <strong>Primes</strong> : ajoutées manuellement par mois (libellé + montant). Aucune prime n'est appliquée automatiquement.</li>
              <li>• <strong>CNSS</strong> : 4% salarié + 17,5% employeur</li>
              <li>• <strong>AMU</strong> : 5% salarié + 5% employeur</li>
              <li>• <strong>IRPP</strong> : barème progressif togolais avec parts familiales</li>
              <li>• <strong>Congés payés</strong> : 2,5 jours/mois (Art. 44)</li>
              <li>• <strong>Maternité</strong> : 14 semaines (98 jours)</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>

      {bulletin && (
        <BulletinPaie employe={bulletin} data={data} annee={annee} mois={mois} onClose={() => setBulletin(null)} />
      )}
      {contrat && <ContratGenerator employe={contrat} onClose={() => setContrat(null)} />}
    </div>
  );
};