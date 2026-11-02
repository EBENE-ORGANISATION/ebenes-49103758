export const LIBELLES_ACTIONS = {
  transactions: 'Opérations', factures: 'Factures', ecritures: 'Écritures',
  bulletins: 'Bulletins', suivi_declarations: 'Déclarations', autres: 'Autres',
}

export interface Recap {
  cabinet: string
  societe: string
  debut: string
  fin: string
  actions: Record<keyof typeof LIBELLES_ACTIONS, number>
  total: number
  validations: number
  declarations: Array<{ type: string; annee: number; mois: number | null; statut: string }>
  personnes: Array<{ nom: string; actions: number }>
  en_attente_client: { transactions: number; factures: number }
}

export function aEnvoyer(r: Recap): boolean {
  return r.total > 0 || r.en_attente_client.transactions > 0 || r.en_attente_client.factures > 0
}
