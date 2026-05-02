import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

export interface OCRDraft {
  fournisseur: string | null;
  date: string | null;
  montantHT: number | null;
  tva: number | null;
  montantTTC: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé avec les valeurs extraites (ou un draft vide si l'extraction échoue). */
  onExtracted: (draft: OCRDraft | null) => void;
}

const fileToBase64 = (file: File) =>
  new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ data: String(r.result || ""), mimeType: file.type });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export const OCRFacture = ({ open, onOpenChange, onExtracted }: Props) => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setPreview(null);
    setLoading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("ocr.err_image_only"));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t("ocr.err_too_big"));
      return;
    }
    try {
      setLoading(true);
      const { data: dataUrl, mimeType } = await fileToBase64(file);
      setPreview(dataUrl);

      const { data, error } = await supabase.functions.invoke("ocr-facture", {
        body: { imageBase64: dataUrl, mimeType },
      });

      if (error) {
        console.error(error);
        toast.error(t("ocr.err_extract"));
        onExtracted(null);
        onOpenChange(false);
        reset();
        return;
      }

      const draft = (data?.data || null) as OCRDraft | null;
      if (!draft) {
        toast.warning(t("ocr.warn_no_data"));
        onExtracted(null);
      } else {
        toast.success(t("ocr.success"));
        onExtracted(draft);
      }
      onOpenChange(false);
      reset();
    } catch (e) {
      console.error(e);
      toast.error(t("ocr.err_generic"));
      onExtracted(null);
      onOpenChange(false);
      reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-5" /> {t("ocr.title")}
          </DialogTitle>
          <DialogDescription>{t("ocr.description")}</DialogDescription>
        </DialogHeader>

        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center space-y-3">
          {preview ? (
            <img src={preview} alt={t("ocr.preview_alt")} className="max-h-48 mx-auto rounded" />
          ) : (
            <div className="text-sm text-muted-foreground">{t("ocr.constraints")}</div>
          )}

          <Button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t("ocr.analyzing")}
              </>
            ) : (
              <>
                <Upload className="size-4" /> {t("ocr.choose")}
              </>
            )}
          </Button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
