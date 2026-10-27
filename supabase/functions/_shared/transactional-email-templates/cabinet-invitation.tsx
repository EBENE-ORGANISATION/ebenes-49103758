/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Invitation de l'espace cabinet (fonction cabinet-ops) :
//   * objet 'membre'       : un responsable ajoute un membre à son cabinet ;
//   * objet 'admin_client' : un responsable invite l'administrateur d'un
//     dossier client.
// nouveauCompte : le lien sert à choisir son mot de passe (lien de
// réinitialisation, à usage unique) ; sinon, simple lien de connexion.

interface Props {
  objet?: 'membre' | 'admin_client'
  nom?: string
  cabinetNom?: string
  societeNom?: string
  roleLibelle?: string
  lienUrl?: string
  nouveauCompte?: boolean
}

const CabinetInvitationEmail = ({
  objet = 'membre',
  nom = '',
  cabinetNom = '',
  societeNom = '',
  roleLibelle = '',
  lienUrl = '#',
  nouveauCompte = false,
}: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>
      {objet === 'admin_client'
        ? `Votre accès administrateur à ${societeNom}`
        : `Vous rejoignez le cabinet ${cabinetNom}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {objet === 'admin_client' ? 'Votre société sur Ébène' : 'Bienvenue dans votre cabinet'}
        </Heading>
        <Text style={text}>Bonjour{nom ? ` ${nom}` : ''},</Text>
        {objet === 'admin_client' ? (
          <Text style={text}>
            Le cabinet <strong>{cabinetNom}</strong> tient la comptabilité de <strong>{societeNom}</strong> sur
            Ébène. Vous en êtes désormais l'administrateur : vous gérez les utilisateurs de la société et
            la mission confiée au cabinet.
          </Text>
        ) : (
          <Text style={text}>
            Vous avez été ajouté au cabinet <strong>{cabinetNom}</strong>
            {roleLibelle ? <> en tant que <strong>{roleLibelle}</strong></> : null}. Vous retrouverez les
            dossiers clients qui vous sont attribués dans le sélecteur de société.
          </Text>
        )}
        <Text style={text}>
          {nouveauCompte
            ? 'Pour activer votre compte, choisissez votre mot de passe (lien à usage unique, valable peu de temps) :'
            : 'Connectez-vous avec votre compte habituel :'}
        </Text>
        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={lienUrl} style={button}>
            {nouveauCompte ? 'Choisir mon mot de passe' : 'Se connecter'}
          </Button>
        </Section>
        <Text style={footer}>
          Si vous n'attendiez pas ce message, ignorez-le ou signalez-le à votre administrateur.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CabinetInvitationEmail,
  subject: (data: Record<string, any>) =>
    data.objet === 'admin_client'
      ? `Votre accès à ${data.societeNom ?? 'votre société'} sur Ébène`
      : `Vous rejoignez ${data.cabinetNom ?? 'votre cabinet'} sur Ébène`,
  displayName: 'Invitation espace cabinet',
  previewData: {
    objet: 'membre',
    nom: 'Awa',
    cabinetNom: 'Cabinet Exemple',
    roleLibelle: 'collaborateur',
    lienUrl: 'https://example.com/',
    nouveauCompte: true,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const button = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '12px 28px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }
const footer = { fontSize: '12px', color: '#64748b', margin: '24px 0 0' }
