import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const simulation = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), invoke: vi.fn(),
  traiter: undefined as undefined | ((requete: Request) => Promise<Response>),
}))
vi.mock('https://esm.sh/@supabase/supabase-js@2.45.0', () => ({
  createClient: () => ({ rpc: simulation.rpc, from: simulation.from, functions: { invoke: simulation.invoke } }),
}))

function lecture(donnees: unknown) {
  const chaine: Record<string, unknown> = {}
  for (const methode of ['select', 'in', 'eq', 'order', 'range']) chaine[methode] = () => chaine
  chaine.then = (resoudre: (valeur: unknown) => unknown) => Promise.resolve({ data: donnees, error: null }).then(resoudre)
  return chaine
}
const recap = {
  cabinet: 'Cabinet', societe: 'Client', debut: '2026-11-02T07:00:00Z', fin: '2026-11-09T07:00:00Z',
  actions: {}, total: 1, validations: 0, declarations: [], personnes: [], en_attente_client: { transactions: 0, factures: 0 },
}
const appeler = (secret?: string) => simulation.traiter!(new Request('https://exemple.invalid', {
  method: 'POST', headers: secret ? { 'X-Internal-Secret': secret } : {},
}))
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('Deno', { env: { get: () => 'https://exemple.invalid' }, serve: (traiter: typeof simulation.traiter) => { simulation.traiter = traiter } })
  simulation.rpc.mockImplementation(async (nom: string) => ({ data: nom === 'get_internal_webhook_secret' ? 'secret-interne' : recap, error: null }))
  simulation.invoke.mockResolvedValue({ data: { success: true }, error: null })
  await import('./index')
})
afterEach(() => vi.unstubAllGlobals())
describe('envoi du récapitulatif', () => {
  it.each([undefined, 'mauvais-secret'])('refuse le secret %s avant toute lecture ou envoi', async secret => {
    expect((await appeler(secret)).status).toBe(403)
    expect(simulation.from).not.toHaveBeenCalled()
    expect(simulation.invoke).not.toHaveBeenCalled()
  })
  it('saute un client sans administrateur sans erreur', async () => {
    simulation.from.mockImplementation((table: string) => lecture(table === 'cabinet_dossiers' ? [{ id: 'dossier', societe_id: 'client' }] : []))
    expect(await (await appeler('secret-interne')).json()).toEqual({ ok: true, envoyes: 0, sautes: 1, echecs: 0 })
    expect(simulation.invoke).not.toHaveBeenCalled()
  })
  it('saute une semaine vide avant de chercher les destinataires', async () => {
    simulation.rpc.mockImplementation(async (nom: string) => ({ data: nom === 'get_internal_webhook_secret' ? 'secret-interne' : { ...recap, total: 0 }, error: null }))
    simulation.from.mockReturnValue(lecture([{ id: 'dossier', societe_id: 'client' }]))
    expect(await (await appeler('secret-interne')).json()).toEqual({ ok: true, envoyes: 0, sautes: 1, echecs: 0 })
    expect(simulation.from).toHaveBeenCalledTimes(1)
    expect(simulation.invoke).not.toHaveBeenCalled()
  })
  it('exclut les membres de cabinet et déduplique les adresses', async () => {
    const tables: Record<string, unknown> = {
      cabinet_dossiers: [{ id: 'dossier', societe_id: 'client' }],
      user_societes: [{ user_id: 'admin' }, { user_id: 'membre' }],
      user_roles: [{ user_id: 'admin' }, { user_id: 'membre' }], cabinet_membres: [{ user_id: 'membre' }],
      profiles: [{ email: ' CLIENT@exemple.invalid ' }, { email: 'client@exemple.invalid' }, { email: null }],
    }
    simulation.from.mockImplementation((table: string) => lecture(tables[table]))
    expect(await (await appeler('secret-interne')).json()).toEqual({ ok: true, envoyes: 1, sautes: 0, echecs: 0 })
    expect(simulation.invoke).toHaveBeenCalledWith('send-transactional-email', { body: {
      templateName: 'cabinet-recap', recipientEmail: 'client@exemple.invalid',
      idempotencyKey: expect.stringMatching(/^recap-dossier-.*-client@exemple\.invalid$/),
      templateData: { ...recap, lien: 'https://exemple.invalid/' },
    } })
  })
})
