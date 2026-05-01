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
import { Trans, useTranslation } from "react-i18next";

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

const parseRows = (
  rawRows: Record<string, unknown>[],
  msgs: { name: string; job: string; salaryMissing: string; salaryInvalid: string }
): Candidat[] => {
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
    if (!nom) errors.push(msgs.name);

    const posteStr = String(poste ?? "").trim();
    if (!posteStr) errors.push(msgs.job);

    let salaire = 0;
    if (salaireBrut === undefined) {
      errors.push(msgs.salaryMissing);
    } else {
      salaire =
        typeof salaireBrut === "number"
          ? salaireBrut
          : parseFloat(String(salaireBrut).replace(/[^\d.,-]/g, "").replace(",", "."));
      if (!Number.isFinite(salaire) || salaire <= 0) {
        errors.push(msgs.salaryInvalid);
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
  const { t } = useTranslation();
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
      if (!ws) throw new Error(t("grh_import.err_sheet"));
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: true,
      });
      if (!rows.length) {
        toast.error(t("grh_import.err_empty"));
        return;
      }
      const parsed = parseRows(rows, {
        name: t("grh_import.err_name"),
        job: t("grh_import.err_job"),
        salaryMissing: t("grh_import.err_salary_missing"),
        salaryInvalid: t("grh_import.err_salary_invalid"),
      });
      setCandidats(parsed);
      setFilename(file.name);
      setOpen(true);
    } catch (e) {
      console.error(e);
      toast.error(t("grh_import.err_invalid"));
    }
  };

  const valides = candidats.filter((c) => c.errors.length === 0);
  const invalides = candidats.length - valides.length;

  const confirmer = () => {
    if (!valides.length) {
      toast.error(t("grh_import.err_no_valid"));
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
      invalides
        ? t("grh_import.success_with_ignored", { n: valides.length, ignored: invalides })
        : t("grh_import.success", { n: valides.length })
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
        <Upload className="size-4" /> {t("grh_import.btn")}
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
              <FileSpreadsheet className="size-5" /> {t("grh_import.title")}
            </DialogTitle>
            <DialogDescription>
              <Trans
                i18nKey="grh_import.description"
                values={{ file: filename, count: candidats.length }}
                components={[<span key="0" />, <strong key="1" />, <span key="2" />, <code key="3" />, <span key="4" />, <code key="5" />, <span key="6" />, <code key="7" />, <span key="8" />, <code key="9" />, <span key="10" />, <code key="11" />]}
              />
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="badge-soft bg-success/15 text-success">
              {t("grh_import.valid_count", { n: valides.length })}
            </span>
            {invalides > 0 && (
              <span className="badge-soft bg-destructive/15 text-destructive">
                {t("grh_import.error_count", { n: invalides })}
              </span>
            )}
          </div>

          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">{t("grh_import.th_line")}</th>
                  <th className="text-left p-2">{t("grh_import.th_name")}</th>
                  <th className="text-left p-2">{t("grh_import.th_job")}</th>
                  <th className="text-right p-2">{t("grh_import.th_salary")}</th>
                  <th className="text-left p-2">{t("grh_import.th_hire")}</th>
                  <th className="text-left p-2">{t("grh_import.th_status")}</th>
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
                            <Check className="size-3" /> {t("grh_import.ok")}
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
              <X className="size-4" /> {t("grh_import.cancel")}
            </Button>
            <Button
              onClick={confirmer}
              disabled={!valides.length}
              className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
            >
              <Check className="size-4" /> {t("grh_import.confirm", { n: valides.length })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};