import { describe, expect, it } from 'vitest'
import { destinataires, evenement, lienPour, type EtatLien, type Evenement } from './evenements'

const cas: [EtatLien | null, EtatLien, Evenement][] = [
  [null, 'invitation', 'invitation_recue'],
  ['invitation', 'actif', 'invitation_acceptee'],
  ['invitation', 'termine', 'invitation_close'],
  ['actif', 'depart_demande', 'depart_demande'],
  ['depart_demande', 'termine', 'depart_valide'],
  ['depart_demande', 'actif', 'depart_annule'],
]
describe('événements du lien cabinet', () => {
  it.each(cas)('%s → %s : %s', (ancien, nouveau, attendu) => {
    expect(evenement(ancien, nouveau)).toBe(attendu)
  })
  it.each<[EtatLien | null, EtatLien]>([
    ['actif', 'actif'], [null, 'actif'], ['termine', 'actif'], ['depart_demande', 'depart_demande'],
  ])('ignore %s → %s', (ancien, nouveau) => expect(evenement(ancien, nouveau)).toBeNull())
  it('vise les publics dans l’ordre du tableau', () => {
    expect(destinataires('invitation_recue')).toEqual(['responsables'])
    expect(destinataires('invitation_acceptee')).toEqual(['admins_client'])
    for (const e of ['invitation_close', 'depart_valide', 'depart_annule'] as const) {
      expect(destinataires(e)).toEqual(['responsables', 'admins_client'])
    }
    expect(destinataires('depart_demande')).toEqual(['super_admins', 'responsables', 'admins_client'])
  })
  it('ouvre l’espace du public concerné', () => {
    expect(lienPour('responsables', 'https://exemple.invalid')).toBe('https://exemple.invalid/cabinet')
    expect(lienPour('admins_client', 'https://exemple.invalid')).toBe('https://exemple.invalid/admin/societe')
    expect(lienPour('super_admins', 'https://exemple.invalid')).toBe('https://exemple.invalid/super-admin')
  })
})
