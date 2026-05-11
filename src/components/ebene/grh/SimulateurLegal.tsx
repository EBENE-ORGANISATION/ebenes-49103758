import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── Section A — Période d'essai ─────────────────────────────────────────────

type CategorieEssai = "heure" | "ouvrier" | "maitrise" | "cadre";

interface BaremeEssai {
  label: string;
  dureeInitialeMois: number;
  dureeInitialeJours?: number; // pour "payé à l'heure"
  renouvelable: boolean;
  dureeMaxMois: number;
  dureeMaxJours?: number;
}

const BAREME_ESSAI: Record<CategorieEssai, BaremeEssai> = {
  heure:     { label: "Payé à l'heure",                dureeInitialeMois: 0, dureeInitialeJours: 8,  renouvelable: true,  dureeMaxMois: 0, dureeMaxJours: 16 },
  ouvrier:   { label: "Ouvrier / Employé",              dureeInitialeMois: 1, renouvelable: true,  dureeMaxMois: 2 },
  maitrise:  { label: "Agent de maîtrise / Technicien", dureeInitialeMois: 3, renouvelable: true,  dureeMaxMois: 6 },
  cadre:     { label: "Cadre",                          dureeInitialeMois: 6, renouvelable: false, dureeMaxMois: 6 },
};

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  d.setDate(d.getDate() - 1); // dernier jour inclus
  return d;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("fr-TG", { day: "2-digit", month: "long", year: "numeric" });
}

const PeriodeEssaiSection = () => {
  const [categorie, setCategorie] = useState<CategorieEssai>("ouvrier");
  const [debut, setDebut] = useState(new Date().toISOString().split("T")[0]);
  const [renouvele, setRenouvele] = useState(false);

  const b = BAREME_ESSAI[categorie];
  const debutDate = new Date(debut);

  let finInitiale: Date;
  let finMax: Date;

  if (b.dureeInitialeJours !== undefined) {
    finInitiale = addDays(debutDate, b.dureeInitialeJours - 1);
    finMax      = addDays(debutDate, (b.dureeMaxJours ?? b.dureeInitialeJours) - 1);
  } else {
    finInitiale = addMonths(debutDate, b.dureeInitialeMois);
    finMax      = addMonths(debutDate, b.dureeMaxMois);
  }

  const finAffichee = (b.renouvelable && renouvele) ? finMax : finInitiale;

  const dureeLabel = b.dureeInitialeJours !== undefined
    ? `${b.dureeInitialeJours} jours`
    : `${b.dureeInitialeMois} mois`;

  const dureeMaxLabel = b.dureeMaxJours !== undefined
    ? `${b.dureeMaxJours} jours`
    : `${b.dureeMaxMois} mois`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          📋 Section A — Période d'essai
          <Badge variant="outline" className="text-xs font-normal">CCIT Art. 9</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-bold uppercase">Catégorie professionnelle</Label>
            <Select value={categorie} onValueChange={(v) => { setCategorie(v as CategorieEssai); setRenouvele(false); }}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(BAREME_ESSAI) as [CategorieEssai, BaremeEssai][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-bold uppercase">Date de début</Label>
            <Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="mt-1" />
          </div>
        </div>

        {b.renouvelable && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="renouvele"
              checked={renouvele}
              onChange={(e) => setRenouvele(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="renouvele" className="text-sm cursor-pointer">
              Renouvellement (1 fois autorisé)
            </Label>
          </div>
        )}

        <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Durée initiale :</span>
            <span className="font-semibold">{dureeLabel}</span>
          </div>
          {b.renouvelable && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Durée maximale (avec renouvellement) :</span>
              <span className="font-semibold">{dureeMaxLabel}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base">
            <span className="font-bold">Fin de période d'essai :</span>
            <span className="font-bold text-primary">{isNaN(debutDate.getTime()) ? "—" : formatDate(finAffichee)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic border-l-2 border-muted-foreground/30 pl-3">
          Pendant la période d'essai, rupture sans préavis ni indemnité (sauf congés payés acquis).
          L'essai compte dans l'ancienneté. (CCIT Art. 9)
        </p>
      </CardContent>
    </Card>
  );
};

// ─── Section B — Indemnité maladie ───────────────────────────────────────────

interface BaremeMaladie {
  label: string;
  moisPleins: number;
  moisDemi: number;
}

function getBaremeMaladie(ancienneteMois: number): BaremeMaladie {
  if (ancienneteMois < 12) {
    return { label: "< 1 an de service", moisPleins: 1, moisDemi: 0 };
  } else if (ancienneteMois < 60) {
    return { label: "1 an à 5 ans", moisPleins: 1, moisDemi: 3 };
  } else if (ancienneteMois < 120) {
    return { label: "5 ans à 10 ans", moisPleins: 2, moisDemi: 4 };
  } else {
    return { label: "> 10 ans", moisPleins: 4, moisDemi: 2 };
  }
}

const IndemniteMaladieSection = () => {
  const [anciennete, setAnciennete] = useState("");
  const [salaireBrut, setSalaireBrut] = useState("");

  const ancMois = parseInt(anciennete, 10);
  const brut = parseFloat(salaireBrut);
  const valid = !isNaN(ancMois) && ancMois >= 0 && !isNaN(brut) && brut > 0;

  const bareme = valid ? getBaremeMaladie(ancMois) : null;
  const total = bareme ? Math.round(brut * bareme.moisPleins + (brut / 2) * bareme.moisDemi) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          🏥 Section B — Indemnité maladie
          <Badge variant="outline" className="text-xs font-normal">CCIT Art. 14</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-bold uppercase">Ancienneté (en mois)</Label>
            <Input
              type="number"
              min={0}
              placeholder="ex. 36"
              value={anciennete}
              onChange={(e) => setAnciennete(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase">Salaire mensuel brut (FCFA)</Label>
            <Input
              type="number"
              min={0}
              placeholder="ex. 150000"
              value={salaireBrut}
              onChange={(e) => setSalaireBrut(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {valid && bareme && total !== null ? (
          <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tranche d'ancienneté :</span>
              <Badge variant="secondary">{bareme.label}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mois à salaire plein :</span>
              <span className="font-semibold">{bareme.moisPleins} mois ({(brut * bareme.moisPleins).toLocaleString("fr-TG")} FCFA)</span>
            </div>
            {bareme.moisDemi > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mois à demi-salaire :</span>
                <span className="font-semibold">{bareme.moisDemi} mois ({Math.round((brut / 2) * bareme.moisDemi).toLocaleString("fr-TG")} FCFA)</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-base">
              <span className="font-bold">Total indemnité maladie :</span>
              <span className="font-bold text-primary">{total.toLocaleString("fr-TG")} FCFA</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic text-center py-2">
            Renseignez l'ancienneté et le salaire brut pour calculer l'indemnité.
          </p>
        )}

        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-xs font-semibold mb-1">Barème CCIT Art. 14 :</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-0.5">Ancienneté</th>
                <th className="text-center py-0.5">Mois pleins</th>
                <th className="text-center py-0.5">Mois demi</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "< 12 mois",    mp: 1, md: 0 },
                { label: "12 mois – 5 ans", mp: 1, md: 3 },
                { label: "5 ans – 10 ans",  mp: 2, md: 4 },
                { label: "> 10 ans",         mp: 4, md: 2 },
              ].map((row) => (
                <tr key={row.label} className="border-t border-border/40">
                  <td className="py-0.5">{row.label}</td>
                  <td className="text-center py-0.5">{row.mp}</td>
                  <td className="text-center py-0.5">{row.md}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground italic border-l-2 border-muted-foreground/30 pl-3">
          La maladie suspend le contrat jusqu'à 6 mois. Au-delà, rupture possible.
          (Code Art. 65 / CCIT Art. 13-14)
        </p>
      </CardContent>
    </Card>
  );
};

// ─── Section C — Cotisations sociales ────────────────────────────────────────

const CotisationsSocialesSection = () => {
  const [salaireBrut, setSalaireBrut] = useState("");

  const brut = parseFloat(salaireBrut);
  const valid = !isNaN(brut) && brut > 0;

  const cnssSal  = valid ? Math.round(brut * 0.04)   : null;
  const amuSal   = valid ? Math.round(brut * 0.05)   : null;
  const totalSal = valid ? Math.round(brut * 0.09)   : null;
  const cnssPat  = valid ? Math.round(brut * 0.175)  : null;
  const amuPat   = valid ? Math.round(brut * 0.05)   : null;
  const totalPat = valid ? Math.round(brut * 0.225)  : null;
  const netAvantIrpp = valid && totalSal !== null ? Math.round(brut - totalSal) : null;
  const coutTotal    = valid && totalPat !== null ? Math.round(brut + totalPat) : null;

  const fmt = (n: number | null) =>
    n !== null ? n.toLocaleString("fr-TG") + " FCFA" : "—";

  const rows: { label: string; value: number | null; accent?: boolean; separator?: boolean }[] = [
    { label: "CNSS salarié (4%)",        value: cnssSal },
    { label: "AMU salarié (5%)",          value: amuSal },
    { label: "Total retenu salarié (9%)", value: totalSal, accent: true },
    { label: "CNSS patronal (17,5%)",     value: cnssPat },
    { label: "AMU patronal (5%)",         value: amuPat },
    { label: "Total charges patronales (22,5%)", value: totalPat, accent: true },
    { label: "Salaire net estimé (avant IRPP)",  value: netAvantIrpp, accent: true },
    { label: "Coût total employeur",              value: coutTotal, accent: true },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          🧾 Section C — Cotisations sociales
          <Badge variant="outline" className="text-xs font-normal">CNSS / AMU</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm">
          <Label className="text-xs font-bold uppercase">Salaire brut mensuel (FCFA)</Label>
          <Input
            type="number"
            min={0}
            placeholder="ex. 200000"
            value={salaireBrut}
            onChange={(e) => setSalaireBrut(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="rounded-lg border border-border overflow-hidden text-sm">
          {rows.map((row, i) => (
            <div key={row.label}>
              {(i === 3 || i === 6 || i === 7) && <Separator />}
              <div className={`flex justify-between px-3 py-2 ${row.accent ? "bg-muted/40 font-semibold" : ""}`}>
                <span className={row.accent ? "" : "text-muted-foreground"}>{row.label}</span>
                <span className={row.accent ? "text-primary" : ""}>{fmt(row.value)}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground italic border-l-2 border-muted-foreground/30 pl-3">
          Taux en vigueur au Togo. IRPP non inclus (calculé séparément selon le barème progressif).
        </p>
      </CardContent>
    </Card>
  );
};

// ─── Composant principal ──────────────────────────────────────────────────────

export const SimulateurLegal = () => {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold">⚖️ Simulateur légal</h2>
        <Badge variant="secondary" className="text-xs">Code du Travail togolais + CCIT</Badge>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        Calculs de référence basés sur la Loi 15/06/2021 et la Convention Collective Interprofessionnelle du Togo.
      </p>
      <PeriodeEssaiSection />
      <IndemniteMaladieSection />
      <CotisationsSocialesSection />
    </div>
  );
};
