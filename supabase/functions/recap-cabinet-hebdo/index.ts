import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { aEnvoyer, type Recap } from './recap.ts'

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}
const site = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://ebnservicess.com').replace(/\/+$/, '')
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
  } catch { return json({ erreur: 'Accès interdit.' }, 403) }

  let envoyes = 0
  let sautes = 0
  let echecs = 0
  // Arrondie à l'heure : un second appel dans la même heure réutilise les mêmes clés d'idempotence.
  const fin = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString()
  try {
    // Pagination explicite : ne pas limiter silencieusement l'envoi aux 1 000 premiers liens.
    const taille = 500
    for (let page = 0; ; page++) {
      const { data: dossiers, error } = await admin.from('cabinet_dossiers')
        .select('id, societe_id, cabinets!inner(actif)').in('etat', ['actif', 'depart_demande'])
        .eq('cabinets.actif', true).order('id').range(page * taille, (page + 1) * taille - 1)
      if (error) throw error
      for (const dossier of dossiers ?? []) {
        try {
          // private n'est pas exposé à PostgREST ; cette enveloppe est réservée au service.
          const { data, error: erreurRecap } = await admin.rpc('recap_cabinet_service', { _dossier: dossier.id, _fin: fin })
          if (erreurRecap || !data) throw new Error('Calcul du récapitulatif impossible')
          const recap = data as Recap
          if (!aEnvoyer(recap)) { sautes++; continue }
          const { data: acces, error: erreurAcces } = await admin.from('user_societes').select('user_id').eq('societe_id', dossier.societe_id)
          if (erreurAcces) throw erreurAcces
          const ids = (acces ?? []).map(ligne => ligne.user_id)
          if (!ids.length) { sautes++; continue }
          const { data: roles, error: erreurRoles } = await admin.from('user_roles').select('user_id').eq('role', 'admin').in('user_id', ids)
          const { data: membres, error: erreurMembres } = await admin.from('cabinet_membres').select('user_id').in('user_id', ids)
          if (erreurRoles || erreurMembres) throw new Error('Lecture des administrateurs impossible')
          const exclus = new Set((membres ?? []).map(ligne => ligne.user_id))
          const administrateurs = (roles ?? []).map(ligne => ligne.user_id).filter(id => !exclus.has(id))
          if (!administrateurs.length) { sautes++; continue }
          const { data: profils, error: erreurProfils } = await admin.from('profiles').select('email').in('user_id', administrateurs)
          if (erreurProfils) throw erreurProfils
          const adresses = new Set<string>((profils ?? []).map(profil => profil.email?.trim().toLowerCase()).filter((email): email is string => !!email))
          if (!adresses.size) { sautes++; continue }
          for (const email of adresses) {
            try {
              const { data: envoi, error: erreurEnvoi } = await admin.functions.invoke('send-transactional-email', {
                body: {
                  templateName: 'cabinet-recap', recipientEmail: email,
                  idempotencyKey: `recap-${dossier.id}-${fin}-${email}`,
                  templateData: { ...recap, lien: `${site}/` },
                },
              })
              if (erreurEnvoi || envoi?.success === false) throw new Error('Envoi refusé')
              envoyes++
            } catch { echecs++; console.error('Échec d’envoi du récapitulatif cabinet', { dossier_id: dossier.id }) }
          }
        } catch { echecs++; console.error('Échec du récapitulatif cabinet', { dossier_id: dossier.id }) }
      }
      if ((dossiers ?? []).length < taille) break
    }
  } catch { echecs++; console.error('Lecture des dossiers du récapitulatif impossible') }
  return json({ ok: true, envoyes, sautes, echecs })
})