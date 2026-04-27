import { useEffect, useMemo, useState } from "react";
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

type Plan = "starter" | "pro" | "enterprise";
type AdminMethod = "invite" | "password";

export const CreerSocieteModal = ({ open, onOpenChange, onCreated }: Props) => {
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

  // Step 2
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [couleur, setCouleur] = useState("#1F3864");
  const [adresse, setAdresse] = useState("");
  const [nif, setNif] = useState("");
  const [rccm, setRccm] = useState("");

  // Step 3
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

      // 2. Upload logo (optionnel) — rattaché à la société créée
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
      toast.success("Société créée avec succès");
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
          <DialogTitle>Créer une nouvelle société</DialogTitle>
          <DialogDescription>
            {createdUrl ? "Société créée." : `Étape ${step} / 3`}
          </DialogDescription>
        </DialogHeader>

        {createdUrl ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium mb-1">URL d'accès de la société :</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-xs">{createdUrl}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(createdUrl);
                    toast.success("URL copiée");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            {createdInfo?.already_existed ? (
              <p className="text-xs text-muted-foreground">
                Le compte <strong>{createdInfo.email}</strong> existait déjà — il a simplement été
                rattaché à cette société avec le rôle admin.
              </p>
            ) : createdInfo?.method === "password" ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
                <p className="font-medium">Identifiants de connexion de l'administrateur</p>
                <div className="grid grid-cols-[80px_1fr_auto] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Email</span>
                  <code className="break-all">{createdInfo.email}</code>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(createdInfo.email!); toast.success("Email copié"); }}>
                    <Copy className="size-3" />
                  </Button>
                  <span className="text-muted-foreground">Mot de passe</span>
                  <code className="break-all">{createdInfo.password}</code>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(createdInfo.password!); toast.success("Mot de passe copié"); }}>
                    <Copy className="size-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ⚠️ Notez ces informations — elles ne seront plus affichées. Transmettez-les à
                  l'administrateur de la société.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Un email d'invitation a été envoyé à <strong>{createdInfo?.email ?? adminEmail}</strong>{" "}
                pour qu'il définisse son mot de passe.
              </p>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fermer</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nom de la société *</Label>
                  <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: ACME SARL" />
                </div>
                <div className="space-y-1.5">
                  <Label>Slug (URL) *</Label>
                  <Input
                    value={slug}
                    onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
                    placeholder="acme-sarl"
                  />
                  <p className="text-xs text-muted-foreground">URL : {previewUrl}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Plan *</Label>
                  <Select value={plan} onValueChange={(v) => setPlan(v as Plan)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Email de l'administrateur *</Label>
                  <Input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@societe.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nom de l'administrateur</Label>
                  <Input
                    value={adminNom}
                    onChange={(e) => setAdminNom(e.target.value)}
                    placeholder="Ex: Jean Dupont"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Méthode d'accès *</Label>
                  <Select value={adminMethod} onValueChange={(v) => setAdminMethod(v as AdminMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invite">Envoyer une invitation par email</SelectItem>
                      <SelectItem value="password">Définir un mot de passe maintenant</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {adminMethod === "invite"
                      ? "L'administrateur recevra un email pour définir son mot de passe."
                      : "Le compte sera créé immédiatement avec le mot de passe ci-dessous."}
                  </p>
                </div>
                {adminMethod === "password" && (
                  <div className="space-y-1.5">
                    <Label>Mot de passe initial * (min 8 caractères)</Label>
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
                        Générer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Logo</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Couleur primaire</Label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} className="w-20 h-10 p-1" />
                    <Input value={couleur} onChange={(e) => setCouleur(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>NIF</Label>
                    <Input value={nif} onChange={(e) => setNif(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>RCCM</Label>
                    <Input value={rccm} onChange={(e) => setRccm(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Adresse</Label>
                  <Input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Tous les champs sont facultatifs — l'administrateur de la société pourra les compléter plus tard.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Modules activés par défaut selon le plan <strong>{plan}</strong> — ajustables.
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
                  <p className="font-medium mb-1">Aperçu — Onglets visibles pour l'admin de société :</p>
                  <p>
                    {[
                      modules.module_stock && "Stock",
                      modules.module_grh && "GRH",
                      modules.module_fiscalite && "Fiscalité",
                      modules.module_immobilisations && "Immobilisations",
                      modules.module_ia && "Assistant IA",
                    ].filter(Boolean).join(" • ") || "Aucun module activé"}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                  <ChevronLeft className="size-4 mr-1" /> Précédent
                </Button>
              )}
              {step < 3 && (
                <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !canNext1}>
                  Suivant <ChevronRight className="size-4 ml-1" />
                </Button>
              )}
              {step === 3 && (
                <Button onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Check className="size-4 mr-2" />}
                  Créer la société
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};