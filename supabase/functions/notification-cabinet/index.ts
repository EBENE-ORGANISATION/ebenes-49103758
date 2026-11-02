import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { destinataires, evenement, lienPour, type EtatLien, type Public } from './evenements.ts'

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}
const site = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://ebnservicess.com').replace(/\/+$/, '')
const etats: readonly string[] = ['invitation', 'actif', 'depart_demande', 'termine']
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function egaliteConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}
function json(corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...entetes, 'Content-Type': 'application/json' } })
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') return new Response(null, { headers: entetes })
  let admin: ReturnType<typeof createClient>
  try {
    admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: secret, error } = await admin.rpc('get_internal_webhook_secret')
    if (error || typeof secret !== 'string' || !secret || !egaliteConstante(requete.headers.get('X-Internal-Secret') ?? '', secret)) {
      return json({ erreur: 'Accès interdit.' }, 403)
    }
  } catch {
    return json({ erreur: 'Accès interdit.' }, 403)
  }
  let corps: { dossier_id: string; ancien: EtatLien | null; nouveau: EtatLien }
  try {
    const valeur = await requete.json()
    if (!valeur || typeof valeur.dossier_id !== 'string' || !uuid.test(valeur.dossier_id)
      || !(valeur.ancien === null || etats.includes(valeur.ancien)) || !etats.includes(valeur.nouveau)) {
      return json({ erreur: 'Paramètres invalides.' }, 400)
    }
    corps = valeur
  } catch {
    return json({ erreur: 'Corps JSON invalide.' }, 400)
  }
  const { dossier_id, ancien, nouveau } = corps
  const typeEvenement = evenement(ancien, nouveau)
  if (!typeEvenement) return json({ ok: true, envoyes: 0 })
  let envoyes = 0
  let echecs = 0
  const journaliser = () => console.error('Échec de notification cabinet', { evenement: typeEvenement, dossier_id })
  try {
    const { data: dossier, error } = await admin.from('cabinet_dossiers')
      .select('cabinet_id, societe_id, depart_motif').eq('id', dossier_id).single()
    if (error || !dossier) throw new Error('Lien introuvable')
    const { data: cabinet, error: erreurCabinet } = await admin.from('cabinets').select('nom').eq('id', dossier.cabinet_id).single()
    const { data: societe, error: erreurSociete } = await admin.from('societes').select('nom').eq('id', dossier.societe_id).single()
    if (erreurCabinet || erreurSociete || !cabinet || !societe) throw new Error('Noms introuvables')

    async function utilisateurs(publicVise: Public): Promise<string[]> {
      if (publicVise === 'responsables') {
        const { data, error } = await admin.from('cabinet_membres').select('user_id')
          .eq('cabinet_id', dossier!.cabinet_id).eq('role', 'responsable').eq('actif', true)
        if (error) throw error
        return (data ?? []).map(ligne => ligne.user_id)
      }
      if (publicVise === 'super_admins') {
        const { data, error } = await admin.from('user_roles').select('user_id').in('role', ['admin_general', 'super_admin'])
        if (error) throw error
        return (data ?? []).map(ligne => ligne.user_id)
      }
      const { data: acces, error: erreurAcces } = await admin.from('user_societes').select('user_id').eq('societe_id', dossier!.societe_id)
      if (erreurAcces) throw erreurAcces
      const ids = (acces ?? []).map(ligne => ligne.user_id)
      if (!ids.length) return []
      const { data: roles, error: erreurRoles } = await admin.from('user_roles').select('user_id').eq('role', 'admin').in('user_id', ids)
      const { data: membres, error: erreurMembres } = await admin.from('cabinet_membres').select('user_id').in('user_id', ids)
      if (erreurRoles || erreurMembres) throw new Error('Lecture des administrateurs impossible')
      const exclus = new Set((membres ?? []).map(ligne => ligne.user_id))
      return (roles ?? []).map(ligne => ligne.user_id).filter(id => !exclus.has(id))
    }

    const adresses = new Set<string>()
    const minute = new Date().toISOString().slice(0, 16)
    for (const publicVise of destinataires(typeEvenement)) {
      try {
        const ids = await utilisateurs(publicVise)
        if (!ids.length) continue
        const { data: profils, error } = await admin.from('profiles').select('email').in('user_id', ids)
        if (error) throw error
        for (const profil of profils ?? []) {
          const email = profil.email?.trim().toLowerCase()
          if (!email || adresses.has(email)) continue
          adresses.add(email)
          try {
            const { data, error } = await admin.functions.invoke('send-transactional-email', {
              body: {
                templateName: 'cabinet-evenement', recipientEmail: email,
                idempotencyKey: `cabinet-${dossier_id}-${typeEvenement}-${minute}-${email}`,
                templateData: { evenement: typeEvenement, cabinet: cabinet.nom, societe: societe.nom,
                  lien: lienPour(publicVise, site), motif: typeEvenement === 'depart_demande' ? dossier.depart_motif : null },
              },
            })
            if (error || data?.success === false) throw new Error('Envoi refusé')
            envoyes++
          } catch { echecs++; journaliser() }
        }
      } catch { echecs++; journaliser() }
    }
  } catch { echecs++; journaliser() }
  return json({ ok: true, envoyes, echecs })
})
