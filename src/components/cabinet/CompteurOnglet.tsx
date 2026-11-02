import { Badge } from "@/components/ui/badge";

/** Pastille d'un onglet qui contient des actions en attente ; rien quand il n'y en a pas. */
export function CompteurOnglet({ nombre, libelle }: { nombre: number; libelle: string }) {
  if (nombre <= 0) return null;
  return <Badge variant="destructive" className="ml-2 px-1.5 py-0 text-xs" title={libelle}>
    <span aria-hidden="true">{nombre}</span><span className="sr-only">{libelle}</span>
  </Badge>;
}
