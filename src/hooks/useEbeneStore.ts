import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DonneesMensuelles,
  Employe,
  Facture,
  MoisData,
  Prime,
  Transaction,
} from "@/types/ebene";
import { moisKey, newId } from "@/lib/ebene-utils";

const LS_DONNEES = "ebene_donneesMensuelles";
const LS_EMPLOYES = "ebene_employes";

const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const ensureMois = (d: MoisData | undefined): MoisData => ({
  transactions: Array.isArray(d?.transactions) ? d!.transactions : [],
  factures: Array.isArray(d?.factures) ? d!.factures : [],
  primes:
    d && typeof d.primes === "object" && !Array.isArray(d.primes)
      ? d.primes
      : {},
});

export const useEbeneStore = () => {
  const [donneesMensuelles, setDonneesMensuelles] = useState<DonneesMensuelles>(
    () => loadJSON<DonneesMensuelles>(LS_DONNEES, {})
  );
  const [employes, setEmployes] = useState<Employe[]>(() =>
    loadJSON<Employe[]>(LS_EMPLOYES, [])
  );

  useEffect(() => {
    try {
      localStorage.setItem(LS_DONNEES, JSON.stringify(donneesMensuelles));
    } catch {}
  }, [donneesMensuelles]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_EMPLOYES, JSON.stringify(employes));
    } catch {}
  }, [employes]);

  const getMois = useCallback(
    (annee: number, mois: number): MoisData => {
      return ensureMois(donneesMensuelles[moisKey(annee, mois)]);
    },
    [donneesMensuelles]
  );

  const updateMois = useCallback(
    (annee: number, mois: number, fn: (m: MoisData) => MoisData) => {
      setDonneesMensuelles((prev) => {
        const k = moisKey(annee, mois);
        const current = ensureMois(prev[k]);
        return { ...prev, [k]: fn(current) };
      });
    },
    []
  );

  const addTransaction = useCallback(
    (annee: number, mois: number, t: Omit<Transaction, "id">) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        transactions: [...m.transactions, { ...t, id: newId() }],
      }));
    },
    [updateMois]
  );

  const removeTransaction = useCallback(
    (annee: number, mois: number, id: number) => {
      updateMois(annee, mois, (m) => {
        const trans = m.transactions.find((t) => t.id === id);
        let factures = m.factures;
        if (trans?.source === "facture" && trans.factureId) {
          factures = factures.map((f) =>
            f.id === trans.factureId
              ? { ...f, statut: "en_attente", transactionId: null }
              : f
          );
        }
        return {
          ...m,
          transactions: m.transactions.filter((t) => t.id !== id),
          factures,
        };
      });
    },
    [updateMois]
  );

  const addFacture = useCallback(
    (annee: number, mois: number, f: Omit<Facture, "id">) => {
      const id = newId();
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: [...m.factures, { ...f, id }],
      }));
      return id;
    },
    [updateMois]
  );

  const updateFacture = useCallback(
    (
      annee: number,
      mois: number,
      id: number,
      patch: Partial<Facture>
    ) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      }));
    },
    [updateMois]
  );

  const removeFacture = useCallback(
    (annee: number, mois: number, id: number) => {
      updateMois(annee, mois, (m) => {
        const f = m.factures.find((x) => x.id === id);
        let transactions = m.transactions;
        if (f?.transactionId) {
          transactions = transactions.filter((t) => t.id !== f.transactionId);
        }
        return {
          ...m,
          factures: m.factures.filter((x) => x.id !== id),
          transactions,
        };
      });
    },
    [updateMois]
  );

  const marquerPayee = useCallback(
    (annee: number, mois: number, factureId: number) => {
      updateMois(annee, mois, (m) => {
        const f = m.factures.find((x) => x.id === factureId);
        if (!f || f.statut === "payee" || f.statut === "proforma") return m;
        const transId = newId();
        const trans: Transaction = {
          id: transId,
          date: f.date,
          desc: `Facture ${f.numero} — ${f.client}`,
          type: "r",
          m: f.totalTtc,
          source: "facture",
          factureId: f.id,
        };
        return {
          ...m,
          transactions: [...m.transactions, trans],
          factures: m.factures.map((x) =>
            x.id === factureId
              ? { ...x, statut: "payee", transactionId: transId }
              : x
          ),
        };
      });
    },
    [updateMois]
  );

  const convertirProforma = useCallback(
    (annee: number, mois: number, factureId: number, nouveauNumero: string) => {
      updateMois(annee, mois, (m) => ({
        ...m,
        factures: m.factures.map((x) =>
          x.id === factureId
            ? { ...x, statut: "en_attente", numero: nouveauNumero }
            : x
        ),
      }));
    },
    [updateMois]
  );

  // Employés
  const addEmploye = useCallback((e: Omit<Employe, "id">) => {
    setEmployes((prev) => [...prev, { ...e, id: newId() }]);
  }, []);

  const removeEmploye = useCallback((id: number) => {
    setEmployes((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addPrime = useCallback(
    (annee: number, mois: number, employeId: number, prime: Omit<Prime, "id">) => {
      updateMois(annee, mois, (m) => {
        const list = m.primes[employeId] || [];
        return {
          ...m,
          primes: { ...m.primes, [employeId]: [...list, { ...prime, id: newId() }] },
        };
      });
    },
    [updateMois]
  );

  const removePrime = useCallback(
    (annee: number, mois: number, employeId: number, primeId: number) => {
      updateMois(annee, mois, (m) => {
        const list = m.primes[employeId] || [];
        return {
          ...m,
          primes: {
            ...m.primes,
            [employeId]: list.filter((p) => p.id !== primeId),
          },
        };
      });
    },
    [updateMois]
  );

  const importerDonnees = useCallback(
    (data: { donneesMensuelles?: DonneesMensuelles; employes?: Employe[] }) => {
      setDonneesMensuelles(
        data.donneesMensuelles && typeof data.donneesMensuelles === "object"
          ? data.donneesMensuelles
          : {}
      );
      setEmployes(Array.isArray(data.employes) ? data.employes : []);
    },
    []
  );

  const anneesDisponibles = useMemo(() => {
    const s = new Set<number>();
    Object.keys(donneesMensuelles).forEach((k) => {
      const a = parseInt(k.split("-")[0], 10);
      if (!isNaN(a)) s.add(a);
    });
    const cur = new Date().getFullYear();
    const max = Math.max(2035, cur + 2, ...Array.from(s));
    const min = Math.min(2025, ...Array.from(s));
    const out: number[] = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
  }, [donneesMensuelles]);

  return {
    donneesMensuelles,
    employes,
    getMois,
    addTransaction,
    removeTransaction,
    addFacture,
    updateFacture,
    removeFacture,
    marquerPayee,
    convertirProforma,
    addEmploye,
    removeEmploye,
    addPrime,
    removePrime,
    importerDonnees,
    anneesDisponibles,
  };
};