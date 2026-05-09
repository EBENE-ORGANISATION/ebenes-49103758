import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { calculerPaie } from "@/components/ebene/grh/BulletinPaie";
import type { BulletinPaieRecord, Employe, MoisData, Transaction } from "@/types/ebene";

export { type BulletinPaieRecord };

export const useBulletinsPaie = (societeId: string | null) => {
  const [bulletins, setBulletins] = useState<BulletinPaieRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // ─── Chargement ────────────────────────────────────────────────────────────
  const loadBulletins = useCallback(
    async (annee: number, mois: number) => {
      if (!societeId) return;
      setLoading(true);
      try {
        const { data } = await supabase
          .from("bulletins_paie")
          .select("*")
          .eq("societe_id", societeId)
          .eq("annee", annee)
          .eq("mois", mois)
          .order("employe_nom", { ascending: true });
        setBulletins((data ?? []) as BulletinPaieRecord[]);
      } finally {
        setLoading(false);
      }
    },
    [societeId]
  );

  // Charge tous les bulletins d'un employé (portail)
  const loadBulletinsEmploye = useCallback(
    async (employeUserId: string): Promise<BulletinPaieRecord[]> => {
      if (!societeId) return [];
      const { data } = await supabase
        .from("bulletins_paie")
        .select("*")
        .eq("societe_id", societeId)
        .eq("employe_user_id", employeUserId)
        .order("annee", { ascending: false })
        .order("mois", { ascending: false });
      return (data ?? []) as BulletinPaieRecord[];
    },
    [societeId]
  );

  // ─── Génération ────────────────────────────────────────────────────────────
  const genererBulletin = useCallback(
    async (employe: Employe, moisData: MoisData, annee: number, mois: number): Promise<boolean> => {
      if (!societeId) return false;
      const c = calculerPaie(employe, moisData);
      const row = {
        employe_id:       employe.id,
        employe_nom:      employe.nom,
        employe_user_id:  employe.userId ?? null,
        societe_id:       societeId,
        mois,
        annee,
        salaire_base:     Math.round(c.base),
        sursalaire:       Math.round(c.sursalaire),
        prime_anciennete: Math.round(c.primeAnciennete),
        hs_montant:       Math.round(c.hsMontant),
        primes_diverses:  Math.round(c.primesDiverses),
        indemnites:       Math.round(c.indemnites),
        brut:             Math.round(c.brut),
        cnss_sal:         Math.round(c.cnssSal),
        amu_sal:          Math.round(c.amuSal),
        irpp:             Math.round(c.irpp),
        retenues_diverses:Math.round(c.retenuesDiverses),
        total_retenues:   Math.round(c.totalRetenues),
        net_a_payer:      Math.round(c.net),
        cnss_pat:         Math.round(c.cnssEmp),
        amu_pat:          Math.round(c.amuEmp),
        cout_employeur:   Math.round(c.coutEmployeur),
        statut:           "brouillon",
      };
      const { error } = await supabase
        .from("bulletins_paie")
        .upsert(row, { onConflict: "employe_id,societe_id,mois,annee" });
      if (error) {
        console.error("[genererBulletin] Supabase error:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          row,
        });
      }
      return !error;
    },
    [societeId]
  );

  const genererTousBulletins = useCallback(
    async (
      employes: Employe[],
      getMois: (a: number, m: number) => MoisData,
      annee: number,
      mois: number
    ): Promise<{ ok: number; err: number }> => {
      if (!societeId) return { ok: 0, err: 0 };
      const actifs = employes.filter(
        (e) => !e.statutValidation || e.statutValidation === "valide"
      );
      let ok = 0;
      let err = 0;
      for (const emp of actifs) {
        const moisData = getMois(annee, mois);
        const success = await genererBulletin(emp, moisData, annee, mois);
        if (success) ok++;
        else err++;
      }
      return { ok, err };
    },
    [societeId, genererBulletin]
  );

  // ─── Workflow ──────────────────────────────────────────────────────────────
  const validerBulletin = useCallback(
    async (id: string): Promise<boolean> => {
      if (!societeId) return false;
      const { error } = await supabase
        .from("bulletins_paie")
        .update({ statut: "valide" })
        .eq("id", id)
        .eq("societe_id", societeId);
      if (!error) {
        setBulletins((prev) =>
          prev.map((b) => (b.id === id ? { ...b, statut: "valide" } : b))
        );
      }
      return !error;
    },
    [societeId]
  );

  const payerBulletin = useCallback(
    async (
      id: string,
      addTransaction: (annee: number, mois: number, t: Omit<Transaction, "id">) => void
    ): Promise<boolean> => {
      if (!societeId) return false;
      const bulletin = bulletins.find((b) => b.id === id);
      if (!bulletin) return false;

      const paidAt = new Date().toISOString();
      const { error } = await supabase
        .from("bulletins_paie")
        .update({ statut: "paye", paid_at: paidAt })
        .eq("id", id)
        .eq("societe_id", societeId);
      if (error) return false;

      // Intégration comptable : écriture en charges salariales
      const dateStr = `${bulletin.annee}-${String(bulletin.mois).padStart(2, "0")}-01`;
      addTransaction(bulletin.annee, bulletin.mois, {
        date: dateStr,
        desc: `Charges salariales — ${bulletin.employe_nom} (${bulletin.mois}/${bulletin.annee})`,
        type: "d",
        m: -Math.abs(bulletin.cout_employeur),
        source: "salaires",
        auto: true,
        statut: "valide",
      });

      // Email via Edge Function (best-effort)
      supabase.functions
        .invoke("admin-users", {
          body: {
            action: "send_bulletin_email",
            bulletin_id: id,
          },
        })
        .catch(() => undefined);

      setBulletins((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, statut: "paye", paid_at: paidAt } : b
        )
      );
      return true;
    },
    [bulletins, societeId]
  );

  const supprimerBulletin = useCallback(async (id: string): Promise<boolean> => {
    if (!societeId) return false;
    const { error } = await supabase
      .from("bulletins_paie")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (!error) {
      setBulletins((prev) => prev.filter((b) => b.id !== id));
    }
    return !error;
  }, [societeId]);

  return {
    bulletins,
    loading,
    loadBulletins,
    loadBulletinsEmploye,
    genererBulletin,
    genererTousBulletins,
    validerBulletin,
    payerBulletin,
    supprimerBulletin,
  };
};

export default useBulletinsPaie;
