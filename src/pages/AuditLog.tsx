import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, History, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTenant } from "@/hooks/useTenant";
import { ACTION_LABELS, TABLE_LABELS, describeAuditEntry } from "@/lib/audit";

interface AuditEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  description?: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  societe_id?: string | null;
  cabinet_id?: string | null;
}

interface NomAudit {
  cabinet_id: string;
  cabinet_nom: string;
  user_id: string | null;
  auteur_nom: string | null;
}

const actionVariant = (a: string): "default" | "secondary" | "destructive" | "outline" => {
  if (a === "INSERT") return "default";
  if (a === "DELETE") return "destructive";
  if (a.startsWith("REJETER")) return "destructive";
  if (a.startsWith("VALIDER")) return "secondary";
  return "outline";
};

const AuditLog = () => {
  const { t, i18n } = useTranslation();
  const { currentSociete } = useTenant();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noms, definirNoms] = useState<NomAudit[]>([]);
  const [cabinet, definirCabinet] = useState("");
  const numeroLecture = useRef(0);
  const [societeLue, definirSocieteLue] = useState<string | null>(null);
  const annulerLecture = useCallback(() => { numeroLecture.current++; }, []);

  const load = useCallback(async () => {
    const lecture = ++numeroLecture.current;
    setLoading(true);
    setEntries([]);
    definirNoms([]);
    setExpanded(null);
    try {
      // Pas de société sélectionnée → rien à afficher (cloisonnement strict).
      if (!currentSociete?.id) {
        setEntries([]);
        return;
      }
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("societe_id", currentSociete.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (lecture !== numeroLecture.current) return;
      if (error) {
        toast.error(error.message);
        setEntries([]);
      } else {
        setEntries((data || []) as unknown as AuditEntry[]);
        definirSocieteLue(currentSociete.id);
        if (data?.some((ligne) => (ligne as unknown as AuditEntry).cabinet_id)) {
          const { data: nomsLus, error: erreurNoms } = await supabase.rpc("audit_noms_cabinet", { _societe: currentSociete.id });
          if (lecture !== numeroLecture.current) return;
          if (erreurNoms) toast.error(erreurNoms.message);
          else definirNoms(nomsLus ?? []);
        }
      }
    } catch (erreur) {
      if (lecture === numeroLecture.current) toast.error(erreur instanceof Error ? erreur.message : "Lecture de l’audit impossible.");
    } finally {
      if (lecture === numeroLecture.current) setLoading(false);
    }
  }, [currentSociete?.id]);

  useEffect(() => {
    definirCabinet("");
    void load();
    return annulerLecture;
  }, [load, annulerLecture]);

  const nomCabinet = (identifiant: string) => noms.find((nom) => nom.cabinet_id === identifiant)?.cabinet_nom ?? `Cabinet ${identifiant}`;
  const auteur = (ligne: AuditEntry) => {
    if (!ligne.cabinet_id) return ligne.user_email || "—";
    const nom = noms.find((nom) => nom.cabinet_id === ligne.cabinet_id && nom.user_id === ligne.user_id);
    return `${nomCabinet(ligne.cabinet_id)} — ${nom?.auteur_nom || ligne.user_email || ligne.user_id || "Auteur inconnu"}`;
  };
  // Masquer immédiatement les données de la société précédente, avant l’effet.
  const lignesVisibles = societeLue === currentSociete?.id ? entries : [];
  const cabinets = [...new Set(lignesVisibles.flatMap((ligne) => ligne.cabinet_id ? [ligne.cabinet_id] : []))];

  const filtered = lignesVisibles.filter((e) => {
    if (cabinet && e.cabinet_id !== cabinet) return false;
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    const desc = e.description ?? describeAuditEntry(e.action, e.table_name, e.new_data, e.old_data);
    return (
      (TABLE_LABELS[e.table_name] ?? e.table_name).toLowerCase().includes(f) ||
      (ACTION_LABELS[e.action] ?? e.action).toLowerCase().includes(f) ||
      (e.user_email || "").toLowerCase().includes(f) ||
      auteur(e).toLowerCase().includes(f) ||
      desc.toLowerCase().includes(f)
    );
  });

  const getDescription = (e: AuditEntry) =>
    e.description ?? describeAuditEntry(e.action, e.table_name, e.new_data, e.old_data);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* En-tête */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to={currentSociete ? `/?sid=${currentSociete.id}` : "/"}>
                <ArrowLeft className="size-4" /> {t("audit_log.back")}
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <History className="size-6 text-primary" /> {t("audit_log.title")}
              </h1>
              {currentSociete && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Société : <strong>{currentSociete.nom}</strong>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm">
              Cabinet
              <select aria-label="Cabinet" className="h-10 rounded-md border bg-background px-3" value={cabinet} onChange={(evenement) => definirCabinet(evenement.target.value)}>
                <option value="">Tous les cabinets et accès directs</option>
                {cabinets.map((identifiant) => <option key={identifiant} value={identifiant}>{nomCabinet(identifiant)}</option>)}
              </select>
            </label>
            <Input
              placeholder={t("audit_log.filter_placeholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" onClick={load}><RefreshCw className="size-4" /></Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="size-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("audit_log.th_date")}</TableHead>
                  <TableHead>{t("audit_log.th_user")}</TableHead>
                  <TableHead>Cabinet</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <Fragment key={e.id}>
                    <TableRow
                      key={e.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    >
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {new Date(e.created_at).toLocaleString(
                          i18n.language === "en" ? "en-GB" : "fr-FR",
                          { dateStyle: "short", timeStyle: "short" }
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {auteur(e)}
                      </TableCell>
                      <TableCell className="text-sm">{e.cabinet_id ? nomCabinet(e.cabinet_id) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(e.action)} className="text-xs">
                          {ACTION_LABELS[e.action] ?? e.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {getDescription(e)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {expanded === e.id ? "▲ masquer" : "▼ voir"}
                      </TableCell>
                    </TableRow>
                    {expanded === e.id && (
                      <TableRow key={e.id + "-d"}>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <pre className="text-xs whitespace-pre-wrap break-all max-h-96 overflow-auto p-4">
                            {JSON.stringify(
                              e.action === "UPDATE"
                                ? e.changes ?? { avant: e.old_data, après: e.new_data }
                                : e.action === "DELETE"
                                ? e.old_data
                                : e.new_data,
                              null,
                              2
                            )}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {filtered.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t("audit_log.no_entries")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AuditLog;
