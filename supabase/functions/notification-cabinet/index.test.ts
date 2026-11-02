// Aucune connexion : le client Supabase et le serveur Deno sont simulés.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const simulation = vi.hoisted(() => ({
  rpc: vi.fn(), invoke: vi.fn(), from: vi.fn(),
}))
vi.mock('https://esm.sh/@supabase/supabase-js@2.45.0', () => ({
  createClient: () => ({ rpc: simulation.rpc, from: simulation.from, functions: { invoke: simulation.invoke } }),
}))

const dossier = '00000000-ca3d-0000-0003-000000000001'
let traiter: (requete: Request) => Promise<Response>
let lignes: Record<string, Record<string, unknown>[]>
let lectures: { table: string; filtres: unknown[][] }[]

function requete(ancien: string | null = 'invitation', nouveau = 'actif', secret = 'secret-de-test') {
  return new Request('https://exemple.invalid', {
    method: 'POST', headers: { 'X-Internal-Secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dossier_id: dossier, ancien, nouveau }),
  })
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  lectures = []
  lignes = {
    cabinet_dossiers: [{ cabinet_id: 'cabinet', societe_id: 'societe', depart_motif: 'Motif de test' }],
    cabinets: [{ nom: 'Cabinet Exemple' }], societes: [{ nom: 'Société Exemple' }],
    user_societes: [], user_roles: [], cabinet_membres: [], profiles: [],
  }
  simulation.rpc.mockResolvedValue({ data: 'secret-de-test', error: null })
  simulation.invoke.mockResolvedValue({ data: { success: true }, error: null })
  simulation.from.mockImplementation((table: string) => {
    const filtres: unknown[][] = []
    lectures.push({ table, filtres })
    const resultat = () => {
      const data = (lignes[table] ?? []).filter(ligne => filtres.every(([operateur, cle, valeur]) =>
        operateur === 'eq' ? ligne[cle as string] === valeur : (valeur as unknown[]).includes(ligne[cle as string])))
      return { data, error: null }
    }
    const chaine = {
      select: () => chaine,
      eq: (cle: string, valeur: unknown) => { filtres.push(['eq', cle, valeur]); return chaine },
      in: (cle: string, valeur: unknown[]) => { filtres.push(['in', cle, valeur]); return chaine },
      single: async () => ({ data: (lignes[table] ?? [])[0], error: null }),
      then: (resoudre: (valeur: unknown) => unknown) => Promise.resolve(resultat()).then(resoudre),
    }
    return chaine
  })
  vi.stubGlobal('Deno', {
    env: { get: (cle: string) => ({ PUBLIC_SITE_URL: 'https://exemple.invalid/', SUPABASE_URL: 'https://exemple.invalid', SUPABASE_SERVICE_ROLE_KEY: 'cle-de-test' })[cle] },
    serve: (fonction: typeof traiter) => { traiter = fonction },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await import('./index')
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('notification cabinet sans réseau', () => {
  it('répond à OPTIONS sans lire le secret', async () => {
    expect((await traiter(new Request('https://exemple.invalid', { method: 'OPTIONS' }))).status).toBe(200)
    expect(simulation.rpc).not.toHaveBeenCalled()
  })
  it('refuse le mauvais secret avant toute lecture ou tout envoi', async () => {
    expect((await traiter(requete('invitation', 'actif', 'incorrect'))).status).toBe(403)
    expect(simulation.from).not.toHaveBeenCalled()
    expect(simulation.invoke).not.toHaveBeenCalled()
  })
  it('refuse une erreur de lecture du secret', async () => {
    simulation.rpc.mockResolvedValue({ data: null, error: {} })
    expect((await traiter(requete())).status).toBe(403)
    expect(simulation.invoke).not.toHaveBeenCalled()
  })
  it('valide les états et le dossier', async () => {
    expect((await traiter(requete('inconnu'))).status).toBe(400)
    const invalide = new Request('https://exemple.invalid', { method: 'POST', headers: { 'X-Internal-Secret': 'secret-de-test' }, body: JSON.stringify({ dossier_id: 'incorrect', ancien: null, nouveau: 'invitation' }) })
    expect((await traiter(invalide)).status).toBe(400)
    expect(simulation.from).not.toHaveBeenCalled()
  })
  it('ignore les transitions hors tableau', async () => {
    expect(await (await traiter(requete(null, 'actif'))).json()).toEqual({ ok: true, envoyes: 0 })
    expect(simulation.invoke).not.toHaveBeenCalled()
  })
  it('ne considère pas une société sans administrateur comme un échec', async () => {
    expect(await (await traiter(requete())).json()).toEqual({ ok: true, envoyes: 0, echecs: 0 })
    expect(simulation.invoke).not.toHaveBeenCalled()
  })
  it('exclut tous les membres de cabinet des administrateurs clients', async () => {
    lignes.user_societes = [{ user_id: 'admin', societe_id: 'societe' }, { user_id: 'membre', societe_id: 'societe' }]
    lignes.user_roles = [{ user_id: 'admin', role: 'admin' }, { user_id: 'membre', role: 'admin' }]
    lignes.cabinet_membres = [{ user_id: 'membre', cabinet_id: 'autre', actif: false }]
    lignes.profiles = [{ user_id: 'admin', email: 'admin@exemple.invalid' }, { user_id: 'membre', email: 'membre@exemple.invalid' }]
    expect(await (await traiter(requete())).json()).toEqual({ ok: true, envoyes: 1, echecs: 0 })
    expect(simulation.invoke.mock.calls[0][1].body.recipientEmail).toBe('admin@exemple.invalid')
    expect(simulation.invoke.mock.calls[0][1].body.templateData.lien).toBe('https://exemple.invalid/admin/societe')
  })
  it('déduplique les adresses, ignore les absentes et conserve le premier public', async () => {
    lignes.user_roles = [{ user_id: 'super', role: 'super_admin' }, { user_id: 'general', role: 'admin_general' }]
    lignes.cabinet_membres = [
      { user_id: 'responsable', cabinet_id: 'cabinet', role: 'responsable', actif: true },
      { user_id: 'inactif', cabinet_id: 'cabinet', role: 'responsable', actif: false },
    ]
    lignes.profiles = [{ user_id: 'super', email: ' COMMUN@exemple.invalid ' }, { user_id: 'general', email: null }, { user_id: 'responsable', email: 'commun@exemple.invalid' }, { user_id: 'inactif', email: 'inactif@exemple.invalid' }]
    expect(await (await traiter(requete('actif', 'depart_demande'))).json()).toEqual({ ok: true, envoyes: 1, echecs: 0 })
    expect(simulation.invoke).toHaveBeenCalledTimes(1)
    const envoi = simulation.invoke.mock.calls[0][1].body
    expect(envoi.templateData).toEqual({ evenement: 'depart_demande', cabinet: 'Cabinet Exemple', societe: 'Société Exemple', lien: 'https://exemple.invalid/super-admin', motif: 'Motif de test' })
    expect(envoi.idempotencyKey).toMatch(new RegExp(`^cabinet-${dossier}-depart_demande-\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}-commun@exemple.invalid$`))
    expect(lectures.find(lecture => lecture.table === 'profiles')?.filtres[0][1]).toBe('user_id')
  })
  it.each(['refus', 'erreur', 'exception'])('journalise un %s sans divulguer d’adresse et répond 200', async (cas) => {
    lignes.cabinet_membres = [{ user_id: 'responsable', cabinet_id: 'cabinet', role: 'responsable', actif: true }]
    lignes.profiles = [{ user_id: 'responsable', email: 'responsable@exemple.invalid' }]
    if (cas === 'refus') simulation.invoke.mockResolvedValue({ data: { success: false }, error: null })
    if (cas === 'erreur') simulation.invoke.mockResolvedValue({ data: null, error: { message: 'Donnée personnelle' } })
    if (cas === 'exception') simulation.invoke.mockRejectedValue(new Error('Donnée personnelle'))
    const reponse = await traiter(requete(null, 'invitation'))
    expect(reponse.status).toBe(200)
    expect(await reponse.json()).toEqual({ ok: true, envoyes: 0, echecs: 1 })
    expect(console.error).toHaveBeenCalledWith('Échec de notification cabinet', { evenement: 'invitation_recue', dossier_id: dossier })
  })
})
