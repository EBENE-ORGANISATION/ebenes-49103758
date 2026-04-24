import { useMemo, useState } from "react";
import {
  Article, CategorieArticle, Fournisseur, MoisData, MouvementStock,
  TypeMouvementStock,
} from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Pencil, X } from "lucide-react";
import { StatCard } from "./StatCard";
import { formatMontant, todayISO } from "@/lib/ebene-utils";
import { toast } from "sonner";

interface Props {
  data: MoisData;
  annee: number;
  mois: number;
  articles: Article[];
  fournisseurs: Fournisseur[];
  categories: CategorieArticle[];
  onAddArticle: (a: Omit<Article, "id">) => void;
  onUpdateArticle: (id: number, patch: Partial<Article>) => void;
  onRemoveArticle: (id: number) => void;
  onAddFournisseur: (f: Omit<Fournisseur, "id">) => void;
  onRemoveFournisseur: (id: number) => void;
  onAddCategorie: (nom: string) => void;
  onRemoveCategorie: (id: number) => void;
  onAddMouvement: (annee: number, mois: number, m: Omit<MouvementStock, "id">) => number;
  onRemoveMouvement: (annee: number, mois: number, id: number) => void;
}

const TYPE_MVT_LABEL: Record<TypeMouvementStock, string> = {
  entree: "Entrée",
  sortie: "Sortie",
  ajustement: "Ajustement / Inventaire",
};

export const Stock = (props: Props) => {
  const {
    data, annee, mois, articles, fournisseurs, categories,
    onAddArticle, onUpdateArticle, onRemoveArticle,
    onAddFournisseur, onRemoveFournisseur,
    onAddCategorie, onRemoveCategorie,
    onAddMouvement, onRemoveMouvement,
  } = props;

  const stats = useMemo(() => {
    const valeur = articles.reduce((a, art) => a + art.stock * art.prixAchat, 0);
    const enAlerte = articles.filter((a) => a.stock <= a.seuilAlerte).length;
    return { nb: articles.length, valeur, enAlerte };
  }, [articles]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Articles" value={String(stats.nb)} tone="info" />
        <StatCard label="Valeur stock (PMP)" value={formatMontant(stats.valeur)} tone="success" />
        <StatCard label="En alerte (≤ seuil)" value={String(stats.enAlerte)} tone={stats.enAlerte > 0 ? "warning" : "info"} />
      </div>

      <Tabs defaultValue="articles" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full mb-5">
          <TabsTrigger value="articles">📦 Articles</TabsTrigger>
          <TabsTrigger value="mouvements">🔁 Mouvements</TabsTrigger>
          <TabsTrigger value="fournisseurs">🚚 Fournisseurs</TabsTrigger>
          <TabsTrigger value="categories">🏷️ Catégories</TabsTrigger>
        </TabsList>

        <TabsContent value="articles">
          <ArticlesPanel
            articles={articles} fournisseurs={fournisseurs} categories={categories}
            onAdd={onAddArticle} onUpdate={onUpdateArticle} onRemove={onRemoveArticle}
          />
        </TabsContent>

        <TabsContent value="mouvements">
          <MouvementsPanel
            annee={annee} mois={mois}
            mouvements={data.mouvementsStock || []}
            articles={articles}
            onAdd={onAddMouvement}
            onRemove={onRemoveMouvement}
          />
        </TabsContent>

        <TabsContent value="fournisseurs">
          <FournisseursPanel fournisseurs={fournisseurs} onAdd={onAddFournisseur} onRemove={onRemoveFournisseur} />
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesPanel categories={categories} onAdd={onAddCategorie} onRemove={onRemoveCategorie} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Articles ──────────────────────────────────────────────────────────────
const ArticlesPanel = ({
  articles, fournisseurs, categories, onAdd, onUpdate, onRemove,
}: {
  articles: Article[]; fournisseurs: Fournisseur[]; categories: CategorieArticle[];
  onAdd: (a: Omit<Article, "id">) => void; onUpdate: (id: number, p: Partial<Article>) => void; onRemove: (id: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const empty: Omit<Article, "id"> = {
    reference: "", designation: "", unite: "pièce",
    prixAchat: 0, prixVente: 0, stock: 0, seuilAlerte: 0,
    categorieId: null, fournisseurId: null,
  };
  const [form, setForm] = useState<Omit<Article, "id">>(empty);

  const startEdit = (a: Article) => {
    const { id: _id, ...rest } = a;
    setForm(rest);
    setEditing(a);
    setOpen(true);
  };

  const submit = () => {
    if (!form.reference.trim()) return toast.error("Référence obligatoire");
    if (!form.designation.trim()) return toast.error("Désignation obligatoire");
    if (editing) onUpdate(editing.id, form); else onAdd(form);
    setForm(empty);
    setEditing(null);
    setOpen(false);
    toast.success(editing ? "Article modifié" : "Article créé");
  };

  return (
    <div className="space-y-3">
      {!open ? (
        <Button onClick={() => { setForm(empty); setEditing(null); setOpen(true); }} className="gap-1.5">
          <Plus className="size-4" /> Nouvel article
        </Button>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-3">
          <h3 className="font-bold">{editing ? "Modifier" : "Nouvel"} article</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Lab label="Référence *"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Lab>
            <Lab label="Désignation *" full><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Lab>
            <Lab label="Unité"><Input value={form.unite} onChange={(e) => setForm({ ...form, unite: e.target.value })} /></Lab>
            <Lab label="Catégorie">
              <Select value={form.categorieId ? String(form.categorieId) : "none"} onValueChange={(v) => setForm({ ...form, categorieId: v === "none" ? null : parseInt(v, 10) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucune —</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </Lab>
            <Lab label="Fournisseur principal">
              <Select value={form.fournisseurId ? String(form.fournisseurId) : "none"} onValueChange={(v) => setForm({ ...form, fournisseurId: v === "none" ? null : parseInt(v, 10) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucun —</SelectItem>
                  {fournisseurs.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </Lab>
            <Lab label="Prix achat (PMP)"><Input type="number" value={form.prixAchat} onChange={(e) => setForm({ ...form, prixAchat: parseFloat(e.target.value) || 0 })} /></Lab>
            <Lab label="Prix vente"><Input type="number" value={form.prixVente} onChange={(e) => setForm({ ...form, prixVente: parseFloat(e.target.value) || 0 })} /></Lab>
            <Lab label="Stock initial"><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })} disabled={!!editing} /></Lab>
            <Lab label="Seuil alerte"><Input type="number" value={form.seuilAlerte} onChange={(e) => setForm({ ...form, seuilAlerte: parseFloat(e.target.value) || 0 })} /></Lab>
            <Lab label="Emplacement"><Input value={form.emplacement || ""} onChange={(e) => setForm({ ...form, emplacement: e.target.value })} /></Lab>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">✓ Enregistrer</Button>
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }} className="gap-1.5"><X className="size-4" /> Annuler</Button>
          </div>
        </div>
      )}

      {articles.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 italic">Aucun article. Créez votre premier article.</p>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => {
            const cat = categories.find((c) => c.id === a.categorieId);
            const fo = fournisseurs.find((f) => f.id === a.fournisseurId);
            const enAlerte = a.stock <= a.seuilAlerte;
            return (
              <div key={a.id} className={`list-item ${enAlerte ? "border-l-4 border-l-warning" : ""}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold">{a.designation}</p>
                      <span className="badge-soft bg-muted text-foreground">{a.reference}</span>
                      {enAlerte && (
                        <span className="badge-soft bg-warning/15 text-warning flex items-center gap-1">
                          <AlertTriangle className="size-3" /> Sous seuil
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cat ? `${cat.nom} • ` : ""}{fo ? `${fo.nom} • ` : ""}Unité : {a.unite}
                      {a.emplacement ? ` • ${a.emplacement}` : ""}
                    </p>
                    <p className="text-xs mt-1">
                      Stock : <strong>{a.stock} {a.unite}</strong> • Seuil : {a.seuilAlerte} • PMP : <span className="amount">{formatMontant(a.prixAchat)}</span> • Vente : <span className="amount">{formatMontant(a.prixVente)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => startEdit(a)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm(`Supprimer ${a.designation} ?`)) onRemove(a.id); }}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Mouvements ────────────────────────────────────────────────────────────
const MouvementsPanel = ({
  annee, mois, mouvements, articles, onAdd, onRemove,
}: {
  annee: number; mois: number; mouvements: MouvementStock[]; articles: Article[];
  onAdd: (annee: number, mois: number, m: Omit<MouvementStock, "id">) => number;
  onRemove: (annee: number, mois: number, id: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<TypeMouvementStock>("entree");
  const [articleId, setArticleId] = useState<string>("");
  const [quantite, setQuantite] = useState("");
  const [pu, setPu] = useState("");
  const [motif, setMotif] = useState("");
  const [reference, setReference] = useState("");

  const submit = () => {
    const aId = parseInt(articleId, 10);
    const q = parseFloat(quantite);
    if (!aId) return toast.error("Article obligatoire");
    if (isNaN(q) || q < 0) return toast.error("Quantité invalide");
    if (type !== "ajustement" && q <= 0) return toast.error("Quantité doit être > 0");
    onAdd(annee, mois, {
      date, articleId: aId, type, quantite: q,
      prixUnitaire: type === "entree" ? parseFloat(pu) || 0 : undefined,
      motif: motif.trim() || undefined,
      reference: reference.trim() || undefined,
    });
    setArticleId(""); setQuantite(""); setPu(""); setMotif(""); setReference("");
    setOpen(false);
    toast.success("Mouvement enregistré");
  };

  const sorted = [...mouvements].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="space-y-3">
      {!open ? (
        <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="size-4" /> Nouveau mouvement</Button>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-3">
          <h3 className="font-bold">Nouveau mouvement</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Lab label="Date *"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Lab>
            <Lab label="Type *">
              <Select value={type} onValueChange={(v) => setType(v as TypeMouvementStock)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entree">📥 Entrée (achat)</SelectItem>
                  <SelectItem value="sortie">📤 Sortie (vente / consommation)</SelectItem>
                  <SelectItem value="ajustement">⚖️ Ajustement / inventaire</SelectItem>
                </SelectContent>
              </Select>
            </Lab>
            <Lab label="Article *">
              <Select value={articleId} onValueChange={setArticleId}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {articles.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.designation} ({a.reference})</SelectItem>)}
                </SelectContent>
              </Select>
            </Lab>
            <Lab label={type === "ajustement" ? "Stock final *" : "Quantité *"}>
              <Input type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
            </Lab>
            {type === "entree" && (
              <Lab label="Prix unitaire (recalcule PMP)">
                <Input type="number" value={pu} onChange={(e) => setPu(e.target.value)} />
              </Lab>
            )}
            <Lab label="Référence (BL, facture...)"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Lab>
            <Lab label="Motif" full><Input value={motif} onChange={(e) => setMotif(e.target.value)} /></Lab>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">✓ Enregistrer</Button>
            <Button variant="outline" onClick={() => setOpen(false)} className="gap-1.5"><X className="size-4" /> Annuler</Button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 italic">Aucun mouvement ce mois</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((m) => {
            const a = articles.find((x) => x.id === m.articleId);
            const isEntry = m.type === "entree";
            const isAdj = m.type === "ajustement";
            return (
              <div key={m.id} className={`list-item flex items-center justify-between gap-2 border-l-4 ${isEntry ? "border-l-success" : isAdj ? "border-l-info" : "border-l-destructive"}`}>
                <div className="min-w-0 flex items-center gap-3">
                  {isEntry ? <ArrowDownToLine className="size-4 text-success shrink-0" /> : isAdj ? <span className="text-info">⚖️</span> : <ArrowUpFromLine className="size-4 text-destructive shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{a?.designation || "Article supprimé"} <span className="text-xs text-muted-foreground">({a?.reference || "-"})</span></p>
                    <p className="text-xs text-muted-foreground">
                      {m.date} • {TYPE_MVT_LABEL[m.type]} • Qté : <strong>{m.quantite}</strong>
                      {m.prixUnitaire ? ` • PU : ${formatMontant(m.prixUnitaire)}` : ""}
                      {m.reference ? ` • Réf : ${m.reference}` : ""}
                    </p>
                    {m.motif && <p className="text-xs italic text-muted-foreground">{m.motif}</p>}
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm("Supprimer ce mouvement ? (le stock sera ajusté en sens inverse)")) onRemove(annee, mois, m.id); }}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Fournisseurs ──────────────────────────────────────────────────────────
const FournisseursPanel = ({ fournisseurs, onAdd, onRemove }: {
  fournisseurs: Fournisseur[]; onAdd: (f: Omit<Fournisseur, "id">) => void; onRemove: (id: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const empty: Omit<Fournisseur, "id"> = { nom: "", contact: "", telephone: "", email: "", adresse: "" };
  const [form, setForm] = useState(empty);
  const submit = () => {
    if (!form.nom.trim()) return toast.error("Nom obligatoire");
    onAdd(form); setForm(empty); setOpen(false); toast.success("Fournisseur créé");
  };
  return (
    <div className="space-y-3">
      {!open ? (
        <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="size-4" /> Nouveau fournisseur</Button>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-3">
          <h3 className="font-bold">Nouveau fournisseur</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Lab label="Nom *"><Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></Lab>
            <Lab label="Contact"><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Lab>
            <Lab label="Téléphone"><Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></Lab>
            <Lab label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Lab>
            <Lab label="Adresse" full><Input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} /></Lab>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">✓ Enregistrer</Button>
            <Button variant="outline" onClick={() => setOpen(false)} className="gap-1.5"><X className="size-4" /> Annuler</Button>
          </div>
        </div>
      )}
      {fournisseurs.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 italic">Aucun fournisseur</p>
      ) : (
        <div className="space-y-2">
          {fournisseurs.map((f) => (
            <div key={f.id} className="list-item flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{f.nom}</p>
                <p className="text-xs text-muted-foreground">{[f.contact, f.telephone, f.email, f.adresse].filter(Boolean).join(" • ")}</p>
              </div>
              <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm(`Supprimer ${f.nom} ?`)) onRemove(f.id); }}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Catégories ────────────────────────────────────────────────────────────
const CategoriesPanel = ({ categories, onAdd, onRemove }: {
  categories: CategorieArticle[]; onAdd: (nom: string) => void; onRemove: (id: number) => void;
}) => {
  const [nom, setNom] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouvelle catégorie..." />
        <Button onClick={() => { if (!nom.trim()) return; onAdd(nom.trim()); setNom(""); }} className="gap-1.5"><Plus className="size-4" /> Ajouter</Button>
      </div>
      {categories.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 italic">Aucune catégorie</p>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="list-item flex items-center justify-between gap-2">
              <p className="font-medium">{c.nom}</p>
              <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm(`Supprimer ${c.nom} ?`)) onRemove(c.id); }}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Lab = ({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) => (
  <div className={full ? "sm:col-span-2" : ""}>
    <Label className="text-xs font-bold uppercase text-muted-foreground">{label}</Label>
    <div className="mt-1">{children}</div>
  </div>
);
