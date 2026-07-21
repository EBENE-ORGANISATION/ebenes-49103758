import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { ActivitesManager } from "@/components/ebene/ActivitesManager";
import { applyTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Settings2, Upload, Image as ImgIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DEFAULT_FORMAT_FACTURE,
  DEFAULT_FORMAT_DEVIS,
  formaterNumero,
  resetCompteur,
} from "@/lib/numerotation";

const ColorField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    <div className="flex items-center gap-2">
      <Input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-16 p-1 cursor-pointer"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-xs"
      />
    </div>
  </div>
);

const ParametresSociete = () => {
  const { t } = useTranslation();
  const { isAdmin, isSuperAdmin } = useAuth();
  const { currentSociete, societeConfig, societes, setCurrentSocieteId, isLoading, refresh } = useTenant();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState({
    logo_url: "" as string | null,
    couleur_primaire: "#1F3864",
    couleur_secondaire: "#2E75B6",
    couleur_accent: "#C55A11",
    adresse: "",
    telephone: "",
    email: "",
    site_web: "",
    nif: "",
    rccm: "",
    mention_facture: "",
    mention_contrat: "",
    format_facture: DEFAULT_FORMAT_FACTURE,
    format_devis: DEFAULT_FORMAT_DEVIS,
  });
  const [resetting, setResetting] = useState<null | "facture" | "devis">(null);

  useEffect(() => {
    if (!societeConfig) return;
    setDraft({
      logo_url: societeConfig.logo_url ?? null,
      couleur_primaire: societeConfig.couleur_primaire ?? "#1F3864",
      couleur_secondaire: societeConfig.couleur_secondaire ?? "#2E75B6",
      couleur_accent: societeConfig.couleur_accent ?? "#C55A11",
      adresse: societeConfig.adresse ?? "",
      telephone: societeConfig.telephone ?? "",
      email: societeConfig.email ?? "",
      site_web: societeConfig.site_web ?? "",
      nif: societeConfig.nif ?? "",
      rccm: societeConfig.rccm ?? "",
      mention_facture: societeConfig.mention_facture ?? "",
      mention_contrat: societeConfig.mention_contrat ?? "",
      format_facture: societeConfig.format_facture ?? DEFAULT_FORMAT_FACTURE,
      format_devis: societeConfig.format_devis ?? DEFAULT_FORMAT_DEVIS,
    });
  }, [societeConfig]);

  // Aperçu en direct des couleurs
  useEffect(() => {
    applyTheme(draft);
  }, [draft.couleur_primaire, draft.couleur_secondaire, draft.couleur_accent]);

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="p-6 max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold">{t("params.access_denied")}</h1>
          <p className="text-sm text-muted-foreground">{t("params.access_denied_desc")}</p>
          <Button asChild variant="outline"><Link to="/">{t("params.back")}</Link></Button>
        </Card>
      </div>
    );
  }

  const onUploadLogo = async (file: File) => {
    if (!currentSociete) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${currentSociete.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("logos-societes")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("logos-societes").getPublicUrl(path);
      setDraft((d) => ({ ...d, logo_url: pub.publicUrl }));
      toast.success(t("params.logo_uploaded"));
    } catch (e) {
      toast.error(t("params.upload_failed", { msg: (e as Error).message }));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!currentSociete) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("societe_config")
        .update({
          logo_url: draft.logo_url,
          couleur_primaire: draft.couleur_primaire,
          couleur_secondaire: draft.couleur_secondaire,
          couleur_accent: draft.couleur_accent,
          adresse: draft.adresse,
          telephone: draft.telephone,
          email: draft.email,
          site_web: draft.site_web,
          nif: draft.nif,
          rccm: draft.rccm,
          mention_facture: draft.mention_facture,
          mention_contrat: draft.mention_contrat,
          format_facture: draft.format_facture || DEFAULT_FORMAT_FACTURE,
          format_devis: draft.format_devis || DEFAULT_FORMAT_DEVIS,
        })
        .eq("societe_id", currentSociete.id);
      if (error) throw error;
      await refresh();
      toast.success(t("params.save_done"));
    } catch (e) {
      toast.error(t("params.save_failed", { msg: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (type: "facture" | "devis") => {
    if (!currentSociete) return;
    setResetting(type);
    try {
      await resetCompteur(currentSociete.id, type, 1);
      await refresh();
      toast.success(type === "facture" ? t("params.reset_done_invoice") : t("params.reset_done_quote"));
    } catch (e) {
      toast.error(t("params.save_failed", { msg: (e as Error).message }));
    } finally {
      setResetting(null);
    }
  };

  const annee = new Date().getFullYear();
  const previewFacture = formaterNumero(
    draft.format_facture || DEFAULT_FORMAT_FACTURE,
    annee,
    Number(societeConfig?.compteur_facture ?? 1),
  );
  const previewDevis = formaterNumero(
    draft.format_devis || DEFAULT_FORMAT_DEVIS,
    annee,
    Number(societeConfig?.compteur_devis ?? 1),
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><ArrowLeft className="size-4" /> {t("params.back")}</Link>
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings2 className="size-6 text-primary" /> {t("params.title")}
            </h1>
          </div>

          {societes.length > 1 && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t("params.company_label")}</Label>
              <Select
                value={currentSociete?.id ?? ""}
                onValueChange={(v) => setCurrentSocieteId(v)}
              >
                <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {societes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {isLoading || !currentSociete ? (
          <div className="p-12 flex justify-center"><Loader2 className="size-6 animate-spin" /></div>
        ) : (
          <>
            <Card className="p-5 space-y-4">
              <h2 className="font-bold flex items-center gap-2"><ImgIcon className="size-4" /> {t("params.section_logo")}</h2>
              <div className="flex items-center gap-4">
                <div className="size-24 rounded border bg-muted/30 grid place-items-center overflow-hidden">
                  {draft.logo_url ? (
                    <img src={draft.logo_url} alt="logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImgIcon className="size-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    id="logo-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadLogo(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("logo-input")?.click()}
                    disabled={uploading}
                    className="gap-1.5"
                  >
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    {t("params.upload_logo")}
                  </Button>
                  {draft.logo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft((d) => ({ ...d, logo_url: null }))}
                    >
                      {t("params.remove_logo")}
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <h2 className="font-bold">{t("params.section_colors")}</h2>
              <p className="text-xs text-muted-foreground">{t("params.colors_hint")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ColorField
                  label={t("params.color_primary")}
                  value={draft.couleur_primaire}
                  onChange={(v) => setDraft((d) => ({ ...d, couleur_primaire: v }))}
                />
                <ColorField
                  label={t("params.color_secondary")}
                  value={draft.couleur_secondaire}
                  onChange={(v) => setDraft((d) => ({ ...d, couleur_secondaire: v }))}
                />
                <ColorField
                  label={t("params.color_accent")}
                  value={draft.couleur_accent}
                  onChange={(v) => setDraft((d) => ({ ...d, couleur_accent: v }))}
                />
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <h2 className="font-bold">{t("params.section_legal")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t("params.address")}</Label>
                  <Input value={draft.adresse} onChange={(e) => setDraft((d) => ({ ...d, adresse: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("params.phone")}</Label>
                  <Input value={draft.telephone} onChange={(e) => setDraft((d) => ({ ...d, telephone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("params.email")}</Label>
                  <Input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("params.website")}</Label>
                  <Input value={draft.site_web} onChange={(e) => setDraft((d) => ({ ...d, site_web: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("params.nif")}</Label>
                  <Input value={draft.nif} onChange={(e) => setDraft((d) => ({ ...d, nif: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t("params.rccm")}</Label>
                  <Input value={draft.rccm} onChange={(e) => setDraft((d) => ({ ...d, rccm: e.target.value }))} />
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <h2 className="font-bold">{t("params.section_mentions")}</h2>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("params.mention_invoice")}</Label>
                  <Textarea
                    rows={2}
                    value={draft.mention_facture}
                    onChange={(e) => setDraft((d) => ({ ...d, mention_facture: e.target.value }))}
                    placeholder={t("params.mention_invoice_ph")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("params.mention_contract")}</Label>
                  <Textarea
                    rows={2}
                    value={draft.mention_contrat}
                    onChange={(e) => setDraft((d) => ({ ...d, mention_contrat: e.target.value }))}
                    placeholder={t("params.mention_contract_ph")}
                  />
                </div>
              </div>
            </Card>

            <ActivitesManager societeId={currentSociete.id} />

            <Card className="p-5 space-y-4">
              <h2 className="font-bold">{t("params.section_numbering")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("params.numbering_tokens")} <span className="font-mono">{"{YYYY}"}</span> {t("params.token_year")},&nbsp;
                <span className="font-mono">{"{YY}"}</span> {t("params.token_year_short")},&nbsp;
                <span className="font-mono">{"{MM}"}</span> {t("params.token_month")},&nbsp;
                <span className="font-mono">{"{NNN}"}</span> {t("params.token_counter3")},&nbsp;
                <span className="font-mono">{"{NNNN}"}</span> {t("params.token_counter4")},&nbsp;
                <span className="font-mono">{"{N}"}</span> {t("params.token_raw")}.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("params.format_invoice")}</Label>
                  <Input
                    value={draft.format_facture}
                    onChange={(e) => setDraft((d) => ({ ...d, format_facture: e.target.value }))}
                    className="font-mono"
                    placeholder={DEFAULT_FORMAT_FACTURE}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("params.preview")} <span className="font-mono font-semibold">{previewFacture}</span>
                    <span className="ml-2 text-muted-foreground">
                      {t("params.current_counter", { n: Number(societeConfig?.compteur_facture ?? 1) })}
                    </span>
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1"
                        disabled={resetting !== null}
                      >
                        {t("params.reset_counter")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("params.reset_invoice_title")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("params.reset_invoice_desc")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleReset("facture")}>
                          {t("common.confirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("params.format_quote")}</Label>
                  <Input
                    value={draft.format_devis}
                    onChange={(e) => setDraft((d) => ({ ...d, format_devis: e.target.value }))}
                    className="font-mono"
                    placeholder={DEFAULT_FORMAT_DEVIS}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("params.preview")} <span className="font-mono font-semibold">{previewDevis}</span>
                    <span className="ml-2 text-muted-foreground">
                      {t("params.current_counter", { n: Number(societeConfig?.compteur_devis ?? 1) })}
                    </span>
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1"
                        disabled={resetting !== null}
                      >
                        {t("params.reset_counter")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("params.reset_quote_title")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("params.reset_quote_desc")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleReset("devis")}>
                          {t("common.confirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>

            <div className="sticky bottom-4 z-10 flex justify-end">
              <Button onClick={save} disabled={busy} size="lg" className="shadow-lg">
                {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                {t("params.save")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ParametresSociete;
