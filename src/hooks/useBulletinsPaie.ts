import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { calculerPaie } from "@/components/ebene/grh/BulletinPaie";
import type { BulletinPaieRecord, Employe, EcritureComptable, MoisData, Transaction } from "@/types/ebene";

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
      // Vérifie si un bulletin existe déjà pour cet employé/période
      // (évite de dépendre d'une contrainte UNIQUE côté DB pour le upsert)
      const { data: existing } = await supabase
        .from("bulletins_paie")
        .select("id, statut")
        .eq("employe_id", employe.id)
        .eq("societe_id", societeId)
        .eq("mois", mois)
        .eq("annee", annee)
        .maybeSingle();

      let error;
      if (existing?.id) {
        // Ne régénère pas un bulletin déjà validé ou payé
        if (existing.statut !== "brouillon") return true;
        ({ error } = await supabase
          .from("bulletins_paie")
          .update(row)
          .eq("id", existing.id)
          .eq("societe_id", societeId));
      } else {
        ({ error } = await supabase
          .from("bulletins_paie")
          .insert(row));
      }

      if (error) {
        console.error("[genererBulletin] Supabase error:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          existingId: existing?.id ?? null,
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
      addTransaction: (annee: number, mois: number, t: Omit<Transaction, "id">) => void,
      addEcriture?: (annee: number, mois: number, e: Omit<EcritureComptable, "id">) => void
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

      // Intégration comptable : transaction simple (trésorerie)
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

      // Écriture SYSCOHADA en partie double — Journal OD
      if (addEcriture) {
        const cnssTotal = bulletin.cnss_sal + bulletin.cnss_pat;
        const amuTotal  = bulletin.amu_sal  + bulletin.amu_pat;

        const lignes = [
          // ── DÉBITS ─────────────────────────────────────────────────────
          {
            id: 1,
            compte: "661",
            intitule: "Rémunérations du personnel",
            debit: Math.round(bulletin.brut),
            credit: 0,
            tiers: bulletin.employe_nom,
          },
          {
            id: 2,
            compte: "6311",
            intitule: "Cotisations CNSS patronales",
            debit: Math.round(bulletin.cnss_pat),
            credit: 0,
          },
          {
            id: 3,
            compte: "6312",
            intitule: "Cotisations AMU patronales",
            debit: Math.round(bulletin.amu_pat),
            credit: 0,
          },
          // ── CRÉDITS ────────────────────────────────────────────────────
          {
            id: 4,
            compte: "4221",
            intitule: "Personnel — salaires nets à payer",
            debit: 0,
            credit: Math.round(bulletin.net_a_payer),
            tiers: bulletin.employe_nom,
          },
          {
            id: 5,
            compte: "4311",
            intitule: "CNSS à reverser",
            debit: 0,
            credit: Math.round(cnssTotal),
          },
          {
            id: 6,
            compte: "4471",
            intitule: "AMU à reverser",
            debit: 0,
            credit: Math.round(amuTotal),
          },
          ...(bulletin.irpp > 0
            ? [{
                id: 7,
                compte: "4421",
                intitule: "IRPP à reverser à l'État",
                debit: 0,
                credit: Math.round(bulletin.irpp),
              }]
            : []),
          ...(bulletin.retenues_diverses > 0
            ? [{
                id: 8,
                compte: "4228",
                intitule: "Autres retenues sur salaires",
                debit: 0,
                credit: Math.round(bulletin.retenues_diverses),
              }]
            : []),
        ];

        const numeroPiece = `OD-SAL-${bulletin.annee}${String(bulletin.mois).padStart(2, "0")}-${bulletin.employe_id}`;

        addEcriture(bulletin.annee, bulletin.mois, {
          journal: "OD",
          numeroPiece,
          libelle: `Paie ${bulletin.employe_nom} — ${bulletin.mois}/${bulletin.annee}`,
          lignes,
          statut: "valide",
          bulletinId: id,
          annee: bulletin.annee,
          mois: bulletin.mois,
        });
      }

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

  // ─── Édition manuelle ──────────────────────────────────────────────────────
  // Recalcule automatiquement brut, total_retenues, net_a_payer et coût employeur
  // à partir des champs éditables. Charges patronales recalculées sur les
  // bases (base + sursalaire + ancienneté + HS).
  const updateBulletin = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          BulletinPaieRecord,
          | "salaire_base"
          | "sursalaire"
          | "prime_anciennete"
          | "hs_montant"
          | "primes_diverses"
          | "indemnites"
          | "cnss_sal"
          | "amu_sal"
          | "irpp"
          | "retenues_diverses"
        >
      >
    ): Promise<boolean> => {
      if (!societeId) return false;
      const current = bulletins.find((b) => b.id === id);
      if (!current) return false;
      if (current.statut !== "brouillon") return false;

      const next = { ...current, ...patch };
      const brut =
        next.salaire_base +
        next.sursalaire +
        next.prime_anciennete +
        next.hs_montant +
        next.primes_diverses +
        next.indemnites;
      const total_retenues =
        next.cnss_sal + next.amu_sal + next.irpp + next.retenues_diverses;
      const net_a_payer = brut - total_retenues;
      const baseCotisable =
        next.salaire_base + next.sursalaire + next.prime_anciennete + next.hs_montant;
      const baseAmu = next.salaire_base + next.sursalaire;
      const cnss_pat = Math.round(baseCotisable * 0.175);
      const amu_pat = Math.round(baseAmu * 0.05);
      const cout_employeur = Math.round(brut + cnss_pat + amu_pat);

      const updated = {
        salaire_base: Math.round(next.salaire_base),
        sursalaire: Math.round(next.sursalaire),
        prime_anciennete: Math.round(next.prime_anciennete),
        hs_montant: Math.round(next.hs_montant),
        primes_diverses: Math.round(next.primes_diverses),
        indemnites: Math.round(next.indemnites),
        cnss_sal: Math.round(next.cnss_sal),
        amu_sal: Math.round(next.amu_sal),
        irpp: Math.round(next.irpp),
        retenues_diverses: Math.round(next.retenues_diverses),
        brut: Math.round(brut),
        total_retenues: Math.round(total_retenues),
        net_a_payer: Math.round(net_a_payer),
        cnss_pat,
        amu_pat,
        cout_employeur,
      };

      const { error } = await supabase
        .from("bulletins_paie")
        .update(updated)
        .eq("id", id)
        .eq("societe_id", societeId);
      if (error) return false;
      setBulletins((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)));
      return true;
    },
    [bulletins, societeId]
  );

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
    updateBulletin,
  };
};

export default useBulletinsPaie;
