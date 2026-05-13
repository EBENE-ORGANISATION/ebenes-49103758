import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      // Filtre par société si la colonne societe_id existe (migration appliquée)
      // et qu'une société est sélectionnée.
      if (currentSociete?.id) {
        // On tente d'abord avec le filtre — si la colonne n'existe pas, on tombe
        // dans le catch et on recharge sans filtre.
        query = query.eq("societe_id" as never, currentSociete.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries((data || []) as unknown as AuditEntry[]);
    } catch {
      // Fallback : colonne societe_id absente → charger sans filtre
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) toast.error(error.message);
      else setEntries((data || []) as unknown as AuditEntry[]);
    } finally {
      setLoading(false);
    }
  }, [currentSociete?.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = entries.filter((e) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    const desc = e.description ?? describeAuditEntry(e.action, e.table_name, e.new_data, e.old_data);
    return (
      (TABLE_LABELS[e.table_name] ?? e.table_name).toLowerCase().includes(f) ||
      (ACTION_LABELS[e.action] ?? e.action).toLowerCase().includes(f) ||
      (e.user_email || "").toLowerCase().includes(f) ||
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
          <div className="flex gap-2">
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
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <>
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
                        {e.user_email ? (
                          <span className="font-mono text-xs">{e.user_email}</span>
                        ) : "—"}
                      </TableCell>
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
                        <TableCell colSpan={5} className="bg-muted/30 p-0">
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
                  </>
                ))}
                {filtered.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
