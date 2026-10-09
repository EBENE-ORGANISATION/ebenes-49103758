// Identification complète de la société pour les états financiers :
// fiches d'identification, dirigeants, associés, capital, banques.
import { useEffect, useState } from "react";
import { FileBadge, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIdentification } from "@/hooks/data/useIdentification";
import type { Associe, Banque, Dirigeant, IdentificationSociete as Ident } from "@/data/identification.repo";

const FORMES: [NonNullable<Ident["formeJuridique"]>, string][] = [
  ["SARL", "SARL"], ["SA", "SA"], ["SA_PUBLIQUE", "SA à participation publique"], ["SAS", "SAS"],
  ["SNC", "SNC"], ["SCS", "SCS"], ["SP", "Société en participation"], ["GIE", "GIE"],
  ["ASSOCIATION", "Association"], ["EI", "Entreprise individuelle"], ["AUTRE", "Autre"],
];

const Champ = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

/** Liste éditable (dirigeants, associés, banques). */
function Liste<T extends object>({ titre, lignes, colonnes, vide, onChange }: {
  titre: string;
  lignes: T[];
  colonnes: { cle: keyof T; label: string; type?: "number"; largeur?: string }[];
  vide: T;
  onChange: (l: T[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{titre}</p>
      {lignes.map((l, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-end">
          {colonnes.map((c) => (
            <Input
              key={String(c.cle)}
              placeholder={c.label}
              aria-label={c.label}
              type={c.type ?? "text"}
              className={`h-8 text-xs ${c.largeur ?? "w-36"}`}
              value={(l[c.cle] as string | number | undefined) ?? ""}
              onChange={(e) => onChange(lignes.map((x, j) => (j === i
                ? { ...x, [c.cle]: c.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value }
                : x)))}
            />
          ))}
          <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => onChange(lignes.filter((_, j) => j !== i))}>
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => onChange([...lignes, { ...vide }])}>
        <Plus className="size-3.5" /> Ajouter
      </Button>
    </div>
  );
}

export const IdentificationSociete = ({ societeId }: { societeId: string }) => {
  const { identification, isLoading, enregistrer, enregistrement } = useIdentification(societeId);
  const [d, setD] = useState<Ident>({});
  useEffect(() => { setD(identification); }, [identification]);
  const maj = (patch: Partial<Ident>) => setD((x) => ({ ...x, ...patch }));
  const texte = (cle: keyof Ident) => ({
    value: (d[cle] as string | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => maj({ [cle]: e.target.value } as Partial<Ident>),
  });
  const nombre = (cle: keyof Ident) => ({
    type: "number",
    value: (d[cle] as number | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => maj({ [cle]: e.target.value === "" ? undefined : Number(e.target.value) } as Partial<Ident>),
  });

  const sauver = async () => {
    try {
      await enregistrer(d);
      toast.success("Identification enregistrée");
    } catch {
      toast.error("Erreur lors de l'enregistrement de l'identification");
    }
  };

  if (isLoading) return <Card className="p-5"><Loader2 className="size-4 animate-spin" /></Card>;

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <FileBadge className="size-4 text-primary" />
        <h2 className="font-bold">Identification pour les états financiers</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Reprises dans les fiches d'identification, la fiche des dirigeants et les notes sur le capital
        de la liasse. Le nom, le NIF, le RCCM, l'adresse et le représentant viennent des informations
        ci-dessus.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Champ label="Sigle usuel"><Input className="h-9" {...texte("sigle")} /></Champ>
        <Champ label="Forme juridique">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={d.formeJuridique ?? ""}
            onChange={(e) => maj({ formeJuridique: (e.target.value || undefined) as Ident["formeJuridique"] })}
          >
            <option value="">—</option>
            {FORMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Champ>
        <Champ label="Contrôle de l'entité">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={d.controle ?? ""}
            onChange={(e) => maj({ controle: (e.target.value || undefined) as Ident["controle"] })}
          >
            <option value="">—</option>
            <option value="prive_national">Privé national</option>
            <option value="prive_etranger">Privé étranger</option>
            <option value="public">Public</option>
          </select>
        </Champ>
        <Champ label="Capital social (FCFA)"><Input className="h-9" {...nombre("capitalSocial")} /></Champ>
        <Champ label="Valeur nominale d'une part"><Input className="h-9" {...nombre("valeurNominale")} /></Champ>
        <Champ label="Nombre de parts / actions"><Input className="h-9" {...nombre("nombreParts")} /></Champ>
        <Champ label="Date de création"><Input className="h-9" type="date" {...texte("dateCreation")} /></Champ>
        <Champ label="Première année d'exercice au Togo"><Input className="h-9" {...nombre("premiereAnnee")} /></Champ>
        <Champ label="N° CNSS employeur"><Input className="h-9" {...texte("cnssEmployeur")} /></Champ>
        <Champ label="Code activité principale (NAEMA)"><Input className="h-9" {...texte("codeActivite")} /></Champ>
        <Champ label="Greffe"><Input className="h-9" {...texte("greffe")} /></Champ>
        <Champ label="N° répertoire des entités"><Input className="h-9" {...texte("repertoireEntites")} /></Champ>
        <Champ label="N° code importateur"><Input className="h-9" {...texte("codeImportateur")} /></Champ>
        <Champ label="Centre des impôts de dépôt"><Input className="h-9" {...texte("centreImpots")} /></Champ>
        <Champ label="Boîte postale"><Input className="h-9" {...texte("boitePostale")} /></Champ>
        <Champ label="Ville"><Input className="h-9" {...texte("ville")} /></Champ>
        <Champ label="Établissements au Togo"><Input className="h-9" {...nombre("nbEtablissements")} /></Champ>
        <Champ label="Établissements hors du Togo"><Input className="h-9" {...nombre("nbEtablissementsHors")} /></Champ>
        <Champ label="Personne à contacter (nom, adresse, qualité)"><Input className="h-9" {...texte("contact")} /></Champ>
        <Champ label="Expert-comptable / cabinet"><Input className="h-9" {...texte("expertComptable")} /></Champ>
        <Champ label="Commissaire(s) aux comptes"><Input className="h-9" {...texte("commissaireComptes")} /></Champ>
        <Champ label="Signataire des états financiers"><Input className="h-9" {...texte("signataire")} /></Champ>
        <Champ label="Qualité du signataire"><Input className="h-9" {...texte("qualiteSignataire")} /></Champ>
      </div>

      <Liste<Banque>
        titre="Domiciliations bancaires"
        lignes={d.banques ?? []}
        vide={{ banque: "" }}
        colonnes={[{ cle: "banque", label: "Banque", largeur: "w-48" }, { cle: "compte", label: "Numéro de compte", largeur: "w-56" }]}
        onChange={(banques) => maj({ banques })}
      />
      <Liste<Dirigeant>
        titre="Dirigeants"
        lignes={d.dirigeants ?? []}
        vide={{ nom: "" }}
        colonnes={[
          { cle: "nom", label: "Nom" }, { cle: "prenoms", label: "Prénoms" }, { cle: "qualite", label: "Qualité (gérant, DG…)" },
          { cle: "nif", label: "NIF", largeur: "w-28" }, { cle: "telephone", label: "Téléphone", largeur: "w-32" }, { cle: "adresse", label: "Adresse", largeur: "w-48" },
        ]}
        onChange={(dirigeants) => maj({ dirigeants })}
      />
      <Liste<Associe>
        titre="Associés / actionnaires principaux"
        lignes={d.associes ?? []}
        vide={{ nom: "" }}
        colonnes={[
          { cle: "nom", label: "Nom ou dénomination" }, { cle: "prenoms", label: "Prénoms" }, { cle: "nationalite", label: "Nationalité" },
          { cle: "nif", label: "NIF", largeur: "w-28" }, { cle: "nombreParts", label: "Nombre de parts", type: "number", largeur: "w-28" },
          { cle: "montant", label: "Montant du capital", type: "number", largeur: "w-32" },
        ]}
        onChange={(associes) => maj({ associes })}
      />

      <Button onClick={sauver} disabled={enregistrement} className="gap-1.5">
        {enregistrement && <Loader2 className="size-4 animate-spin" />} Enregistrer l'identification
      </Button>
    </Card>
  );
};
