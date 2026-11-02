export type EtatLien = 'invitation' | 'actif' | 'depart_demande' | 'termine'
export type Evenement = 'invitation_recue' | 'invitation_acceptee' | 'invitation_close' | 'depart_demande' | 'depart_valide' | 'depart_annule'
export type Public = 'responsables' | 'admins_client' | 'super_admins'

export function evenement(ancien: EtatLien | null, nouveau: EtatLien): Evenement | null {
  if (ancien === null && nouveau === 'invitation') return 'invitation_recue'
  if (ancien === 'invitation' && nouveau === 'actif') return 'invitation_acceptee'
  if (ancien === 'invitation' && nouveau === 'termine') return 'invitation_close'
  if (ancien === 'actif' && nouveau === 'depart_demande') return 'depart_demande'
  if (ancien === 'depart_demande' && nouveau === 'termine') return 'depart_valide'
  if (ancien === 'depart_demande' && nouveau === 'actif') return 'depart_annule'
  return null
}

export function destinataires(e: Evenement): Public[] {
  if (e === 'invitation_recue') return ['responsables']
  if (e === 'invitation_acceptee') return ['admins_client']
  if (e === 'depart_demande') return ['super_admins', 'responsables', 'admins_client']
  return ['responsables', 'admins_client']
}

export function lienPour(publicVise: Public, site: string): string {
  const chemins = { responsables: '/cabinet', admins_client: '/admin/societe', super_admins: '/super-admin' }
  return `${site}${chemins[publicVise]}`
}
