/**
 * MfaRecoveryCodesDialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Modale affichant les 10 codes de récupération générés via la fonction
 * `mfa-recovery-generate`. Les codes ne sont visibles qu'une seule fois —
 * l'utilisateur doit les copier/télécharger/imprimer avant de fermer.
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Download, Printer, ShieldAlert, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  codes: string[];
  onClose: () => void;
}

export const MfaRecoveryCodesDialog = ({ open, codes, onClose }: Props) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    toast.success("Codes copiés dans le presse-papier");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = [
      "Codes de récupération 2FA — EBENE SERVICES",
      `Générés le : ${new Date().toLocaleString("fr-FR")}`,
      "",
      "⚠️ Chaque code ne peut être utilisé qu'une seule fois.",
      "Conservez ce fichier dans un endroit sûr.",
      "",
      ...codes,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codes-recuperation-2fa-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Codes de récupération 2FA</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 2rem; }
        h1 { font-size: 1.25rem; }
        ul { font-family: monospace; font-size: 1.1rem; line-height: 2; list-style: none; padding: 0; }
        li { border-bottom: 1px dashed #ccc; padding: 0.25rem 0; }
      </style></head><body>
        <h1>Codes de récupération 2FA — EBENE SERVICES</h1>
        <p>Généré le ${new Date().toLocaleString("fr-FR")}</p>
        <p><strong>⚠️ Chaque code ne peut être utilisé qu'une seule fois.</strong></p>
        <ul>${codes.map((c) => `<li>${c}</li>`).join("")}</ul>
      </body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleClose = () => {
    if (!acknowledged) return;
    setAcknowledged(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-warning" />
            Codes de récupération 2FA
          </DialogTitle>
          <DialogDescription>
            Ces codes vous permettent de récupérer l'accès à votre compte si vous
            perdez votre application d'authentification.{" "}
            <strong>Ils ne seront plus jamais affichés.</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
          {codes.map((c) => (
            <div key={c} className="bg-background rounded px-2 py-1.5 text-center select-all">
              {c}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1">
            {copied ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
            Copier
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="flex-1">
            <Download className="size-3.5 mr-1.5" />
            Télécharger
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="flex-1">
            <Printer className="size-3.5 mr-1.5" />
            Imprimer
          </Button>
        </div>

        <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg text-sm">
          <Checkbox
            id="ack"
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
            className="mt-0.5"
          />
          <label htmlFor="ack" className="cursor-pointer">
            J'ai sauvegardé ces codes dans un endroit sûr. Je comprends qu'ils
            ne seront plus affichés et que les anciens codes (s'il y en avait)
            sont désormais invalidés.
          </label>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} disabled={!acknowledged}>
            J'ai sauvegardé mes codes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};