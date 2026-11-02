/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { LIBELLES_ACTIONS, type Recap } from '../../recap-cabinet-hebdo/recap.ts'

interface Props extends Recap { lien: string }
const date = (valeur: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Lome', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(valeur))
const objet = (cabinet: string, societe: string) => `Ce que ${cabinet} a fait cette semaine pour ${societe}`
const statuts: Record<string, string> = { deposee: 'déposée', payee: 'payée' }

const CabinetRecapEmail = (r: Props) => {
  const attente = r.en_attente_client.transactions + r.en_attente_client.factures
  return <Html lang="fr" dir="ltr">
    <Head /><Preview>{objet(r.cabinet, r.societe)}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#334155' }}>
      <Container style={{ padding: '24px 28px', maxWidth: '560px' }}>
        <Heading style={{ fontSize: '22px', color: '#0f172a' }}>{objet(r.cabinet, r.societe)}</Heading>
        <Text>Du {date(r.debut)} au {date(r.fin)} (fin exclue, heure de Lomé).</Text>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th align="left">Actions</th><th align="right">Nombre</th></tr></thead>
          <tbody>{(Object.keys(LIBELLES_ACTIONS) as Array<keyof typeof LIBELLES_ACTIONS>).filter(cle => r.actions[cle] > 0).map(cle =>
            <tr key={cle}><td style={{ padding: '8px 0' }}>{LIBELLES_ACTIONS[cle]}</td><td align="right">{r.actions[cle]}</td></tr>)}</tbody>
        </table>
        <Text>Validations : {r.validations}</Text>
        {r.declarations.length > 0 && <><Heading as="h2" style={{ fontSize: '18px' }}>Déclarations</Heading>
          {r.declarations.map((d, i) => <Text key={i}>{d.type} {d.mois == null ? '' : `${String(d.mois).padStart(2, '0')}/`}{d.annee} : {statuts[d.statut] ?? d.statut}</Text>)}</>}
        {r.personnes.length > 0 && <><Heading as="h2" style={{ fontSize: '18px' }}>Personnes intervenues</Heading>
          {r.personnes.map((p, i) => <Text key={i}>{p.nom} : {p.actions} action(s)</Text>)}</>}
        {attente > 0 && <Text>{attente} pièce(s) attendent votre validation</Text>}
        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={r.lien} style={{ backgroundColor: '#0ea5e9', color: '#ffffff', padding: '12px 28px', borderRadius: '8px', fontWeight: 'bold' }}>Ouvrir Ébène Suite</Button>
        </Section>
      </Container>
    </Body>
  </Html>
}
export const template = {
  component: CabinetRecapEmail,
  subject: (r: Record<string, any>) => objet(r.cabinet, r.societe),
  displayName: 'Récapitulatif hebdomadaire du cabinet',
  previewData: {
    cabinet: 'Cabinet Exemple', societe: 'Société Exemple', debut: '2026-11-02T07:00:00Z', fin: '2026-11-09T07:00:00Z',
    actions: { transactions: 4, factures: 1, ecritures: 0, bulletins: 0, suivi_declarations: 1, autres: 0 },
    total: 6, validations: 2, declarations: [{ type: 'TVA', annee: 2026, mois: 10, statut: 'deposee' }],
    personnes: [{ nom: 'Aminata', actions: 6 }], en_attente_client: { transactions: 2, factures: 0 }, lien: 'https://ebnservicess.com/',
  },
} satisfies TemplateEntry
