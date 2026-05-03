import { useEffect, useState } from "react";
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

interface AuditEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string;
  record_id: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

const actionColor = (a: string) =>
  a === "INSERT" ? "default" : a === "UPDATE" ? "secondary" : "destructive";

const AuditLog = () => {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    else setEntries((data || []) as unknown as AuditEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = entries.filter((e) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return (
      e.table_name.toLowerCase().includes(f) ||
      (e.user_email || "").toLowerCase().includes(f) ||
      e.action.toLowerCase().includes(f)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><ArrowLeft className="size-4" /> {t("audit_log.back")}</Link>
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="size-6 text-primary" /> {t("audit_log.title")}
            </h1>
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
                  <TableHead>{t("audit_log.th_action")}</TableHead>
                  <TableHead>{t("audit_log.th_table")}</TableHead>
                  <TableHead>{t("audit_log.th_details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <>
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString(i18n.language === "en" ? "en-GB" : "fr-FR")}
                      </TableCell>
                      <TableCell className="text-sm">{e.user_email || "—"}</TableCell>
                      <TableCell><Badge variant={actionColor(e.action)}>{e.action}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{e.table_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {e.action === "UPDATE" && e.changes
                          ? t("audit_log.fields_changed", { count: Object.keys(e.changes).length })
                          : e.action === "DELETE"
                          ? t("audit_log.see_old")
                          : t("audit_log.see_new")}
                      </TableCell>
                    </TableRow>
                    {expanded === e.id && (
                      <TableRow key={e.id + "-d"}>
                        <TableCell colSpan={5} className="bg-muted/30">
                          <pre className="text-xs whitespace-pre-wrap break-all max-h-96 overflow-auto">
                            {JSON.stringify(
                              e.action === "UPDATE" ? e.changes : e.action === "DELETE" ? e.old_data : e.new_data,
                              null,
                              2
                            )}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
                {filtered.length === 0 && (
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