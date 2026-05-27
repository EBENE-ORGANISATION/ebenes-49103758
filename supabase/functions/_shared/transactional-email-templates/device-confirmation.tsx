/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'EBN Services'

interface Props {
  confirmUrl?: string
  userAgent?: string
  ip?: string
}

const DeviceConfirmationEmail = ({ confirmUrl = '#', userAgent = 'inconnu', ip = 'inconnue' }: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Confirmation de connexion depuis un nouvel appareil</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Nouvelle tentative de connexion</Heading>
        <Text style={text}>
          Une connexion à votre compte {SITE_NAME} a été demandée depuis un nouvel appareil.
        </Text>
        <Section style={infoBox}>
          <Text style={infoLine}><strong>Navigateur :</strong> {userAgent}</Text>
          <Text style={infoLine}><strong>Adresse IP :</strong> {ip}</Text>
        </Section>
        <Text style={text}>
          Si c'est bien vous, confirmez en cliquant ci-dessous (lien valable 15 minutes) :
        </Text>
        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={confirmUrl} style={button}>Confirmer la connexion</Button>
        </Section>
        <Text style={footer}>
          Si ce n'était pas vous, ignorez cet email et changez votre mot de passe.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DeviceConfirmationEmail,
  subject: 'Confirmez votre connexion',
  displayName: 'Confirmation appareil',
  previewData: { confirmUrl: 'https://example.com/confirm', userAgent: 'Chrome on macOS', ip: '1.2.3.4' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const infoBox = { backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '12px 20px', margin: '16px 0' }
const infoLine = { fontSize: '13px', color: '#334155', margin: '4px 0' }
const button = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '12px 28px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }
const footer = { fontSize: '12px', color: '#64748b', margin: '24px 0 0' }