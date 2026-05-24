import { useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, Check, Copy, Eye, EyeOff } from "lucide-react";
import {
  callSuperAdmin,
  slugify,
  DEFAULT_MODULES_BY_PLAN,
  MODULE_LABELS,
  type ModuleFlags,
} from "@/lib/superAdminApi";
import { supabase } from "@/integrations/supabase/client";
import {
  type RegimeFiscal,
  type SecteurActivite,
  REGIME_LABELS,
  REGIME_DESCRIPTIONS,
  SECTEUR_LABELS,
  SEUIL_TVA_TOGO,
} from "@/types/fiscal";
import { generateSetImpots, regimeRecommande, calcAssujetti } from "@/utils/fiscalAutoSet";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

type Plan = "starter" | "pro" | "enterprise";
type AdminMethod = "invite" | "password";

export const CreerSocieteModal = ({ open, onOpenChange, onCreated }: Props) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [plan, setPlan] = useState<Plan>("starter");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminNom, setAdminNom] = useState("");
  const [adminMethod, setAdminMethod] = useState<AdminMethod>("invite");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 — Régime fiscal
  const [regime,    setRegime]    = useState<RegimeFiscal>("IS");
  const [secteur,   setSecteur]   = useState<SecteurActivite>("SE");
  const [caInput,   setCaInput]   = useState("");
  const [assujettiTva, setAssujettiTva] = useState(false);

  // Step 3 — Branding
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [couleur, setCouleur] = useState("#1F3864");
  const [adresse, setAdresse] = useState("");
  const [nif, setNif] = useState("");
  const [rccm, setRccm] = useState("");

  // Step 4 — Modules
  const [modules, setModules] = useState<ModuleFlags>(DEFAULT_MODULES_BY_PLAN.starter);

  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{
    email?: string;
    password?: string;
    method?: AdminMethod;
    already_existed?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(nom));
  }, [nom, slugTouched]);

  useEffect(() => {
    setModules(DEFAULT_MODULES_BY_PLAN[plan]);
  }, [plan]);

  const reset = () => {
    setStep(1); setBusy(false);
    setNom(""); setSlug(""); setSlugTouched(false); setPlan("starter");
    setAdminEmail(""); setAdminNom(""); setAdminMethod("invite"); setAdminPassword(""); setShowPassword(false);
    setRegime("IS"); setSecteur("SE"); setCaInput(""); setAssujettiTva(false);
    setLogoFile(null); setCouleur("#1F3864"); setAdresse(""); setNif(""); setRccm("");
    setModules(DEFAULT_MODULES_BY_PLAN.starter);
    setCreatedUrl(null); setCreatedInfo(null);
  };

  useEffect(() => { if (!open) reset(); }, [open]);

  const canNext1 =
    !!nom.trim() &&
    !!slug.trim() &&
    !!plan &&
    !!adminEmail.trim() &&
    /\S+@\S+\.\S+/.test(adminEmail.trim()) &&
    (adminMethod === "invite" || (adminMethod === "password" && adminPassword.length >= 8));
  const previewUrl = useMemo(() => `${window.location.origin}/?s=${slug}`, [slug]);

  const submit = async () => {
    if (!nom || !slug) return;
    setBusy(true);
    try {
      const config: Record<string, any> = {
        couleur_primaire: couleur,
        adresse: adresse || null,
        nif: nif || null,
        rccm: rccm || null,
      };

      // 1. Création société + config + invitation
      const res = await callSuperAdmin<{
        societe: { id: string; slug: string };
        invited: { email: string | null; method: AdminMethod; password?: string; already_existed?: boolean };
      }>("create_societe", {
        nom, slug, plan,
        admin_email: adminEmail.trim(),
        admin_nom: adminNom.trim() || undefined,
        admin_method: adminMethod,
        admin_password: adminMethod === "password" ? adminPassword : undefined,
        config,
        modules,
      });

      // 2. Données fiscales — mise à jour directe de la société créée
      if (res.societe?.id) {
        const ca = parseFloat(caInput.replace(/\s/g, "")) || 0;
        const setImpots = generateSetImpots({
          regime, secteur, caAnnuel: ca, assujetti_tva: assujettiTva,
        });
        await supabase
          .from("societes")
          .update({
            regime_fiscal:    regime,
            secteur_activite: secteur,
            assujetti_tva:    assujettiTva,
            ca_annuel_estime: ca,
            set_impots:       setImpots as unknown as any,
          })
          .eq("id", res.societe.id);
      }

      // 3. Upload logo (optionnel) — rattaché à la société créée
      if (logoFile && res.societe?.id) {
        const ext = logoFile.name.split(".").pop() || "png";
        const path = `${res.societe.id}/logo.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("logos-societes")
          .upload(path, logoFile, { upsert: true });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("logos-societes").getPublicUrl(path);
          await callSuperAdmin("update_societe_config", {
            societe_id: res.societe.id,
            patch: { logo_url: pub.publicUrl },
          });
        }
      }

      setCreatedUrl(`${window.location.origin}/?s=${res.societe?.slug ?? slug}`);
      setCreatedInfo({
        email: res.invited?.email ?? adminEmail,
        password: res.invited?.password,
        method: res.invited?.method ?? adminMethod,
        already_existed: res.invited?.already_existed,
      });
      toast.success(t("creer.created_toast"));
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("creer.title")}</DialogTitle>
          <DialogDescription>
            {createdUrl ? t("creer.created") : t("creer.step_of", { n: step })}
          </DialogDescription>
        </DialogHeader>

        {createdUrl ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium mb-1">{t("creer.access_url")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-xs">{createdUrl}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(createdUrl);
                    toast.success(t("creer.url_copied"));
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            {createdInfo?.already_existed ? (
              <p className="text-xs text-muted-foreground">
                <Trans
                  i18nKey="creer.already_existed"
                  values={{ email: createdInfo.email ?? "" }}
                  components={[<strong key="0" />]}
                />
              </p>
            ) : createdInfo?.method === "password" ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
                <p className="font-medium">{t("creer.admin_credentials")}</p>
                <div className="grid grid-cols-[80px_1fr_auto] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t("creer.label_email")}</span>
                  <code className="break-all">{createdInfo.email}</code>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(createdInfo.email!); toast.success(t("creer.email_copied")); }}>
                    <Copy className="size-3" />
                  </Button>
                  <span className="text-muted-foreground">{t("creer.label_password")}</span>
                  <code className="break-all">{createdInfo.password}</code>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(createdInfo.password!); toast.success(t("creer.pwd_copied")); }}>
                    <Copy className="size-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("creer.notice_save_creds")}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                <Trans
                  i18nKey="creer.invite_sent"
                  values={{ email: createdInfo?.email ?? adminEmail }}
                  components={[<strong key="0" />]}
                />
              </p>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t("creer.close")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t("creer.society_name")}</Label>
                  <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t("creer.society_name_ph")} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("creer.slug_label")}</Label>
                  <Input
                    value={slug}
                    onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
                    placeholder={t("creer.slug_ph")}
                  />
                  <p className="text-xs text-muted-foreground">{t("creer.url_label", { url: previewUrl })}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("creer.plan_label")}</Label>
                  <Select value={plan} onValueChange={(v) => setPlan(v as Plan)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">{t("superadmin.plan_starter")}</SelectItem>
                      <SelectItem value="pro">{t("superadmin.plan_pro")}</SelectItem>
                      <SelectItem value="enterprise">{t("superadmin.plan_enterprise")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("creer.admin_email_label")}</Label>
                  <Input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder={t("creer.admin_email_ph")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("creer.admin_name_label")}</Label>
                  <Input
                    value={adminNom}
                    onChange={(e) => setAdminNom(e.target.value)}
                    placeholder={t("creer.admin_name_ph")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("creer.access_method")}</Label>
                  <Select value={adminMethod} onValueChange={(v) => setAdminMethod(v as AdminMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invite">{t("creer.method_invite")}</SelectItem>
                      <SelectItem value="password">{t("creer.method_password")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {adminMethod === "invite"
                      ? t("creer.method_invite_hint")
                      : t("creer.method_password_hint")}
                  </p>
                </div>
                {adminMethod === "password" && (
                  <div className="space-y-1.5">
                    <Label>{t("creer.initial_pwd")}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <Button type="button" size="icon" variant="outline" onClick={() => setShowPassword((v) => !v)}>
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const pwd =
                            Math.random().toString(36).slice(-8) +
                            Math.random().toString(36).slice(-4).toUpperCase() +
                            "!";
                          setAdminPassword(pwd);
                          setShowPassword(true);
                        }}
                      >
                        {t("creer.generate")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (() => {
              const ca = parseFloat(caInput.replace(/\s/g, "")) || 0;
              const tvaAutoCalc = calcAssujetti(ca, regime, secteur);
              const preview = generateSetImpots({ regime, secteur, caAnnuel: ca, assujetti_tva: assujettiTva });
              return (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Ces paramètres déterminent les impôts applicables (CGI Togo 2025).
                  Modifiables à tout moment dans les paramètres.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("creer.regime_fiscal") ?? "Régime fiscal"} *</Label>
                    <Select value={regime} onValueChange={(v) => setRegime(v as RegimeFiscal)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(REGIME_LABELS) as [RegimeFiscal, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground italic">{REGIME_DESCRIPTIONS[regime]}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("creer.secteur_activite") ?? "Secteur d'activité"} *</Label>
                    <Select value={secteur} onValueChange={(v) => setSecteur(v as SecteurActivite)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(SECTEUR_LABELS) as [SecteurActivite, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("creer.ca_estime") ?? "CA annuel estimé (FCFA)"}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={caInput}
                      onChange={(e) => {
                        setCaInput(e.target.value);
                        const newCa = parseFloat(e.target.value) || 0;
                        setAssujettiTva(calcAssujetti(newCa, regime, secteur));
                        setRegime(regimeRecommande(newCa, secteur));
                      }}
                      placeholder="Ex : 80000000"
                    />
                    {ca > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {ca > SEUIL_TVA_TOGO ? "⚠ Seuil TVA dépassé (> 60 M)" : "Sous le seuil TVA (< 60 M)"}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("creer.assujetti_tva") ?? "Assujetti TVA 18%"}</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Switch checked={assujettiTva} onCheckedChange={setAssujettiTva} />
                      <span className="text-sm">{assujettiTva ? "Oui" : "Non"}</span>
                    </div>
                    {ca > 0 && tvaAutoCalc !== assujettiTva && (
                      <p className="text-xs text-amber-600">
                        Recommandé : {tvaAutoCalc ? "Assujetti" : "Non assujetti"} (CA {tvaAutoCalc ? ">" : "<"} 60 M)
                      </p>
                    )}
                  </div>
                </div>
                {preview.length > 0 && (
                  <div className="bg-muted/30 rounded-lg border p-3">
                    <p className="text-xs font-semibold mb-2">
                      Aperçu des taxes applicables ({preview.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {preview.map((imp) => (
                        <span key={imp.code} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {imp.code} {(imp.taux * 100).toFixed(imp.taux < 0.01 ? 2 : 0)}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t("creer.logo")}</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("creer.primary_color")}</Label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} className="w-20 h-10 p-1" />
                    <Input value={couleur} onChange={(e) => setCouleur(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("creer.nif")}</Label>
                    <Input value={nif} onChange={(e) => setNif(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("creer.rccm")}</Label>
                    <Input value={rccm} onChange={(e) => setRccm(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("creer.address")}</Label>
                  <Input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">{t("creer.optional_hint")}</p>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  <Trans
                    i18nKey="creer.modules_default"
                    values={{ plan }}
                    components={[<strong key="0" />]}
                  />
                </p>
                <div className="rounded-md border divide-y">
                  {(Object.keys(MODULE_LABELS) as Array<keyof ModuleFlags>).map((k) => (
                    <div key={k} className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm font-medium">{MODULE_LABELS[k]}</span>
                      <Switch
                        checked={modules[k]}
                        onCheckedChange={(v) => setModules((m) => ({ ...m, [k]: v }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="rounded-md border bg-muted/40 p-3 text-xs">
                  <p className="font-medium mb-1">{t("creer.preview_tabs")}</p>
                  <p>
                    {[
                      modules.module_stock && "Stock",
                      modules.module_grh && "GRH",
                      modules.module_fiscalite && "Fiscalité",
                      modules.module_immobilisations && "Immobilisations",
                      modules.module_ia && "Assistant IA",
                    ].filter(Boolean).join(" • ") || t("creer.no_module")}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                  <ChevronLeft className="size-4 mr-1" /> {t("creer.previous")}
                </Button>
              )}
              {step < 4 && (
                <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !canNext1}>
                  {t("creer.next")} <ChevronRight className="size-4 ml-1" />
                </Button>
              )}
              {step === 4 && (
                <Button onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Check className="size-4 mr-2" />}
                  {t("creer.create_btn")}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};