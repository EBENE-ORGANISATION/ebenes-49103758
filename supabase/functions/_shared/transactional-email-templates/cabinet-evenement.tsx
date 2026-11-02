/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import type { Evenement } from '../../notification-cabinet/evenements.ts'

interface Props {
  evenement: Evenement
  cabinet: string
  societe: string
  lien: string
  motif?: string | null
}

function contenu({ evenement, cabinet, societe }: Pick<Props, 'evenement' | 'cabinet' | 'societe'>) {
  const messages = {
    invitation_recue: {
      objet: `${societe} invite votre cabinet`,
      texte: `${societe} invite ${cabinet} à suivre son dossier. Acceptez ou refusez l'invitation dans votre espace cabinet.`,
    },
    invitation_acceptee: {
      objet: `${cabinet} a accepté votre invitation`,
      texte: `${cabinet} suit désormais le dossier ${societe}.`,
    },
    invitation_close: {
      objet: `Invitation close : ${societe}`,
      texte: `L'invitation de ${cabinet} pour le dossier ${societe} est close (refusée ou retirée).`,
    },
    depart_demande: {
      objet: `Fin de mission demandée : ${societe}`,
      texte: `Une fin de mission a été demandée entre ${cabinet} et ${societe}. En attendant la décision du super-administrateur, le cabinet ne peut plus que consulter le dossier.`,
    },
    depart_valide: {
      objet: `Fin de mission validée : ${societe}`,
      texte: `${cabinet} n'a plus accès au dossier ${societe}. Le client garde toutes ses données.`,
    },
    depart_annule: {
      objet: `Fin de mission annulée : ${societe}`,
      texte: `La demande de fin de mission entre ${cabinet} et ${societe} est annulée. Le cabinet retrouve ses droits.`,
    },
  }
  return messages[evenement]
}

const CabinetEvenementEmail = (donnees: Props) => {
  const { objet, texte } = contenu(donnees)
  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>{objet}</Preview>
      <Body style={principal}>
        <Container style={conteneur}>
          <Heading style={titre}>{objet}</Heading>
          <Text style={paragraphe}>Bonjour,</Text>
          <Text style={paragraphe}>{texte}</Text>
          {donnees.evenement === 'depart_demande' && donnees.motif
            ? <Text style={paragraphe}>Motif : {donnees.motif}</Text> : null}
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button href={donnees.lien} style={bouton}>Ouvrir Ébène Suite</Button>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CabinetEvenementEmail,
  subject: (donnees: Record<string, any>) => contenu({
    evenement: donnees.evenement, cabinet: donnees.cabinet, societe: donnees.societe,
  }).objet,
  displayName: 'Événement du lien cabinet',
  previewData: {
    evenement: 'depart_demande', cabinet: 'Cabinet Exemple', societe: 'Société Exemple',
    lien: 'https://ebnservicess.com/cabinet', motif: 'Changement de cabinet',
  },
} satisfies TemplateEntry

const principal = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const conteneur = { padding: '24px 28px', maxWidth: '560px' }
const titre = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const paragraphe = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const bouton = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '12px 28px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }
