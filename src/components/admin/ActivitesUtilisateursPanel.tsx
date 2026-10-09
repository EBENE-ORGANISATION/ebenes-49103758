// Activités autorisées par utilisateur (ex. le gérant de l'hôtel ne voit que
// l'hôtel). Restriction appliquée par la base ; aucune case cochée : toutes.
import { useEffect, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useTenant } from "@/hooks/useTenant";
import { useActivites } from "@/hooks/data/useActivites";
import { userActivitesRepo } from "@/data/userActivites.repo";

interface Props {
  users: { user_id: string; email: string; nom: string | null }[];
}

export const ActivitesUtilisateursPanel = ({ users }: Props) => {
  const { currentSociete } = useTenant();
  const sid = currentSociete?.id ?? null;
  const { activitesActives } = useActivites(sid);
  const [droits, setDroits] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    if (!sid) return;
    setLoading(true);
    userActivitesRepo.listParSociete(sid)
      .then(setDroits)
      .catch(() => toast.error("Impossible de charger les activités autorisées"))
      .finally(() => setLoading(false));
  }, [sid]);

  if (!sid || activitesActives.length < 2) return null;

  const basculer = async (userId: string, activiteId: string, coche: boolean) => {
    const actuelles = droits[userId] ?? [];
    const nouvelles = coche ? [...actuelles, activiteId] : actuelles.filter((a) => a !== activiteId);
    setEnCours(userId);
    try {
      await userActivitesRepo.definir(userId, sid, nouvelles);
      setDroits({ ...droits, [userId]: nouvelles });
    } catch {
      toast.error("Erreur lors de l'enregistrement des activités autorisées");
    } finally {
      setEnCours(null);
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-primary" />
        <h2 className="font-bold">Activités autorisées — {currentSociete?.nom}</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Limitez un utilisateur à une ou plusieurs activités : il ne verra et ne modifiera que leurs
        données (opérations, factures, stock, employés et paie). Aucune case cochée : toutes les
        activités. Les administrateurs ne sont jamais limités.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Chargement…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium py-1.5 pr-3">Utilisateur</th>
                {activitesActives.map((a) => (
                  <th key={a.id} className="text-center font-medium py-1.5 px-2">{a.nom}</th>
                ))}
                <th className="text-left font-medium py-1.5 pl-3">Accès</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const autorisees = droits[u.user_id] ?? [];
                return (
                  <tr key={u.user_id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className="block truncate">{u.nom || u.email}</span>
                      {u.nom && <span className="block text-[11px] text-muted-foreground truncate">{u.email}</span>}
                    </td>
                    {activitesActives.map((a) => (
                      <td key={a.id} className="text-center py-2 px-2">
                        <Checkbox
                          disabled={enCours === u.user_id}
                          checked={autorisees.includes(a.id)}
                          onCheckedChange={(v) => basculer(u.user_id, a.id, v === true)}
                          aria-label={`${u.email} — ${a.nom}`}
                        />
                      </td>
                    ))}
                    <td className="py-2 pl-3 text-xs text-muted-foreground">
                      {autorisees.length === 0 ? "Toutes" : "Limité"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
