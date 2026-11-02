import { describe, expect, it } from 'vitest'
import { aEnvoyer, LIBELLES_ACTIONS, type Recap } from './recap'

const vide: Recap = {
  cabinet: 'Cabinet', societe: 'Client', debut: '2026-11-02T07:00:00Z', fin: '2026-11-09T07:00:00Z',
  actions: { transactions: 0, factures: 0, ecritures: 0, bulletins: 0, suivi_declarations: 0, autres: 0 },
  total: 0, validations: 0, declarations: [], personnes: [], en_attente_client: { transactions: 0, factures: 0 },
}
describe('récapitulatif hebdomadaire', () => {
  it('saute une semaine vide', () => expect(aEnvoyer(vide)).toBe(false))
  it('envoie une semaine avec activité', () => expect(aEnvoyer({ ...vide, total: 1 })).toBe(true))
  it.each(['transactions', 'factures'] as const)('envoie avec une pièce %s en attente', cle => {
    expect(aEnvoyer({ ...vide, en_attente_client: { ...vide.en_attente_client, [cle]: 1 } })).toBe(true)
  })
  it('nomme toutes les catégories en français', () => {
    expect(LIBELLES_ACTIONS).toEqual({ transactions: 'Opérations', factures: 'Factures', ecritures: 'Écritures', bulletins: 'Bulletins', suivi_declarations: 'Déclarations', autres: 'Autres' })
  })
})
