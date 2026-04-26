import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, AlertTriangle, X, Check } from "lucide-react";
import { Employe } from "@/types/ebene";
import { toast } from "sonner";

interface Props {
  onImport: (employe: Omit<Employe, "id">) => void;
}

/** Une ligne candidate à l'import, validée ou non. */
interface Candidat {
  index: number;
  nom: string;
  poste: string;
  salaire: number;
  dateEmbauche?: string;
  errors: string[];
}

/** Normalise un nom de colonne Excel (accents, espaces, casse). */
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");

/** Tente de retrouver une valeur dans une ligne quel que soit l'alias de colonne. */
const pick = (row: Record<string, unknown>, aliases: string[]): unknown => {
  for (const a of aliases) {
    if (row[a] !== undefined && row[a] !== null && row[a] !== "") return row[a];
  }
  return undefined;
};

/** Convertit une date Excel (numéro série ou string) en ISO YYYY-MM-DD. */
const toISODate = (v: unknown): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number") {
    // Excel date serial : 1 = 1900-01-01 (avec le bug du 1900-02-29)
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return undefined;
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${d.y}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  // déjà ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // jj/mm/aaaa
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yyyy] = m;
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return undefined;
};

const parseRows = (rawRows: Record<string, unknown>[]): Candidat[] => {
  return rawRows.map((rawRow, i) => {
    // Re-clé chaque ligne par nom normalisé pour gérer accents/casse.
    const row: Record<string, unknown> = {};
    Object.entries(rawRow).forEach(([k, v]) => {
      row[norm(k)] = v;
    });

    const nomBrut = pick(row, ["nom", "name", "lastname"]);
    const prenom = pick(row, ["prenom", "prénom", "firstname", "first_name"]);
    const poste = pick(row, ["poste", "fonction", "job", "role"]);
    const salaireBrut = pick(row, [
      "salaire_brut",
      "salaire",
      "salary",
      "brut",
      "salairebrut",
    ]);
    const dateEmbauche = pick(row, [
      "date_embauche",
      "dateembauche",
      "embauche",
      "hire_date",
      "hiredate",
    ]);

    const errors: string[] = [];
    const nom =
      [nomBrut, prenom]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .join(" ") || "";
    if (!nom) errors.push("nom manquant");

    const posteStr = String(poste ?? "").trim();
    if (!posteStr) errors.push("poste manquant");

    let salaire = 0;
    if (salaireBrut === undefined) {
      errors.push("salaire manquant");
    } else {
      salaire =
        typeof salaireBrut === "number"
          ? salaireBrut
          : parseFloat(String(salaireBrut).replace(/[^\d.,-]/g, "").replace(",", "."));
      if (!Number.isFinite(salaire) || salaire <= 0) {
        errors.push("salaire invalide");
        salaire = 0;
      }
    }

    const dateISO = toISODate(dateEmbauche);

    return {
      index: i + 2, // ligne Excel (header = 1)
      nom,
      poste: posteStr,
      salaire,
      dateEmbauche: dateISO,
      errors,
    };
  });
};

export const ImportEmployesExcel = ({ onImport }: Props) => {
  const [open, setOpen] = useState(false);
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [filename, setFilename] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCandidats([]);
    setFilename("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Feuille introuvable");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: true,
      });
      if (!rows.length) {
        toast.error("Le fichier ne contient aucune ligne");
        return;
      }
      const parsed = parseRows(rows);
      setCandidats(parsed);
      setFilename(file.name);
      setOpen(true);
    } catch (e) {
      console.error(e);
      toast.error("Fichier Excel invalide");
    }
  };

  const valides = candidats.filter((c) => c.errors.length === 0);
  const invalides = candidats.length - valides.length;

  const confirmer = () => {
    if (!valides.length) {
      toast.error("Aucune ligne valide à importer");
      return;
    }
    valides.forEach((c) => {
      onImport({
        nom: c.nom,
        poste: c.poste,
        salaire: c.salaire,
        situation: "celibataire",
        enfants: 0,
        dateEmbauche: c.dateEmbauche,
        typeContrat: "cdi",
      });
    });
    toast.success(
      `${valides.length} employé(s) importé(s)${invalides ? ` — ${invalides} ligne(s) ignorée(s)` : ""}`
    );
    setOpen(false);
    reset();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Button
        variant="outline"
        className="gap-1.5"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" /> Importer depuis Excel
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5" /> Aperçu de l'import
            </DialogTitle>
            <DialogDescription>
              Fichier <strong>{filename}</strong> — {candidats.length} ligne(s) détectée(s).
              Colonnes attendues : <code>nom</code>, <code>prenom</code>,{" "}
              <code>poste</code>, <code>salaire_brut</code>, <code>date_embauche</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="badge-soft bg-success/15 text-success">
              ✓ {valides.length} valide(s)
            </span>
            {invalides > 0 && (
              <span className="badge-soft bg-destructive/15 text-destructive">
                ✗ {invalides} en erreur
              </span>
            )}
          </div>

          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Ligne</th>
                  <th className="text-left p-2">Nom complet</th>
                  <th className="text-left p-2">Poste</th>
                  <th className="text-right p-2">Salaire brut</th>
                  <th className="text-left p-2">Embauche</th>
                  <th className="text-left p-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {candidats.map((c) => {
                  const ok = c.errors.length === 0;
                  return (
                    <tr
                      key={c.index}
                      className={`border-t border-border ${
                        ok ? "" : "bg-destructive/5"
                      }`}
                    >
                      <td className="p-2 font-mono">{c.index}</td>
                      <td className="p-2">{c.nom || <em>—</em>}</td>
                      <td className="p-2">{c.poste || <em>—</em>}</td>
                      <td className="p-2 text-right amount">
                        {c.salaire ? c.salaire.toLocaleString("fr-FR") : "—"}
                      </td>
                      <td className="p-2">{c.dateEmbauche || <em>—</em>}</td>
                      <td className="p-2">
                        {ok ? (
                          <span className="text-success flex items-center gap-1">
                            <Check className="size-3" /> OK
                          </span>
                        ) : (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertTriangle className="size-3" />
                            {c.errors.join(", ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>
              <X className="size-4" /> Annuler
            </Button>
            <Button
              onClick={confirmer}
              disabled={!valides.length}
              className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
            >
              <Check className="size-4" /> Importer {valides.length} employé(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};