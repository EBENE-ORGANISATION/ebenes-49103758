// Lignes d'une facture ou d'un devis : prestation libre, ou article du stock
// (quantité × prix unitaire, montant calculé).
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Article } from "@/types/ebene";
import { LIGNE_VIDE, type LigneSaisie } from "@/lib/lignesVente";

interface Props {
  lignes: LigneSaisie[];
  onChange: (lignes: LigneSaisie[]) => void;
  articles: Article[];
  placeholderDescription?: string;
  placeholderMontant?: string;
  libelleAjout?: string;
  /** Message sous une ligne dont la quantité dépasse le stock. */
  messageStock?: (article: Article) => string;
}

export const LignesVente = ({
  lignes, onChange, articles,
  placeholderDescription = "Description",
  placeholderMontant = "Montant",
  libelleAjout = "Ajouter ligne",
  messageStock = (a) => `Stock disponible : ${a.stock} ${a.unite}.`,
}: Props) => {
  const maj = (idx: number, patch: Partial<LigneSaisie>) =>
    onChange(lignes.map((l, i) => {
      if (i !== idx) return l;
      const n = { ...l, ...patch };
      // Ligne d'article : montant = quantité × prix unitaire
      if (n.articleId) n.montant = String((parseFloat(n.quantite || "0") || 0) * (parseFloat(n.prixUnitaire || "0") || 0));
      return n;
    }));
  const choisirArticle = (idx: number, articleId: number | null) => {
    const a = articles.find((x) => x.id === articleId);
    if (!a) return maj(idx, { articleId: null, quantite: undefined, prixUnitaire: undefined });
    maj(idx, { articleId: a.id, description: a.designation, quantite: lignes[idx]?.quantite || "1", prixUnitaire: String(a.prixVente || 0) });
  };

  return (
    <>
      <div className="space-y-2">
        {lignes.map((l, idx) => {
          const article = articles.find((a) => a.id === l.articleId);
          const manque = !!article && (parseFloat(l.quantite || "0") || 0) > article.stock;
          return (
            <div key={idx} className="space-y-1.5">
              {articles.length > 0 && (
                <select
                  aria-label="Article du stock"
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={l.articleId ?? ""}
                  onChange={(e) => choisirArticle(idx, e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Prestation (hors stock)</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.reference} — {a.designation} (stock : {a.stock} {a.unite})
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <Input
                  placeholder={placeholderDescription}
                  value={l.description}
                  onChange={(e) => maj(idx, { description: e.target.value })}
                  className="flex-1 min-w-[10rem]"
                />
                {l.articleId && (
                  <>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Quantité"
                      placeholder="Qté"
                      value={l.quantite ?? ""}
                      onChange={(e) => maj(idx, { quantite: e.target.value })}
                      className={`w-20 ${manque ? "border-destructive" : ""}`}
                    />
                    <Input
                      type="number"
                      min="0"
                      aria-label="Prix unitaire"
                      placeholder="P.U."
                      value={l.prixUnitaire ?? ""}
                      onChange={(e) => maj(idx, { prixUnitaire: e.target.value })}
                      className="w-28"
                    />
                  </>
                )}
                <Input
                  type="number"
                  placeholder={placeholderMontant}
                  value={l.montant}
                  readOnly={!!l.articleId}
                  onChange={(e) => maj(idx, { montant: e.target.value })}
                  className={`w-32 ${l.articleId ? "bg-muted" : ""}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive shrink-0"
                  onClick={() => onChange(lignes.filter((_, i) => i !== idx))}
                  disabled={lignes.length === 1}
                >
                  <X className="size-4" />
                </Button>
              </div>
              {manque && article && <p className="text-xs text-destructive">{messageStock(article)}</p>}
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => onChange([...lignes, { ...LIGNE_VIDE }])}>
        <Plus className="size-3.5" /> {libelleAjout}
      </Button>
    </>
  );
};
