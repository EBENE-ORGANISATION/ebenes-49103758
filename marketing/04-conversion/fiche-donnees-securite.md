# Fiche « Vos données et votre sécurité »

> **Note interne (à retirer avant de remettre la fiche)**
> - **Usage** : à remettre en main propre ou à envoyer en PDF par WhatsApp après une démonstration, à tout cabinet qui envisage le pilote.
> - **Règle** : n'écrire **que ce qui est vrai aujourd'hui**. Les passages entre crochets `[…]` sont à compléter par vous, ou à supprimer si la chose n'est pas encore faite.
> - **Faits vérifiés le 25/10/2026** : base Supabase hébergée en Irlande (région `eu-west-1`), plan Pro ; fonctions de sécurité constatées dans le code de l'application. Les garanties de Supabase proviennent de ses pages officielles (sources en bas de page).
> - **À valider par un juriste** avant une diffusion large : la partie « Cadre légal ».
> - **L'export Excel** (commit `4766670` du 25/10/2026, testé) est poussé sur `origin/main`. Avant de remettre cette fiche, vérifiez qu'il apparaît bien dans le menu de la version en ligne.

---

## Ébène Suite · Vos données et votre sécurité

**Vos données vous appartiennent. Voici, sans jargon, où elles sont, qui peut les voir et comment elles sont protégées.**

### Où sont vos données ?
- Elles sont stockées chez **Supabase**, un hébergeur professionnel de bases de données, dans un centre de données situé en **Irlande (Union européenne)**.
- Elles sont **chiffrées** : pendant leur transfert entre votre appareil et le serveur (TLS), et sur les disques du serveur (AES-256), selon Supabase.

### Sont-elles sauvegardées ?
- **Oui, chaque jour.** Supabase conserve une sauvegarde quotidienne de la base pendant **7 jours**.
- **En plus**, l'administrateur de votre compte peut à tout moment :
  - **télécharger toutes les données de sa société dans un classeur Excel** (menu → *Exporter Excel*), lisible sans Ébène : un onglet par type de données (factures et leurs lignes, devis, opérations, écritures comptables, stock, immobilisations, personnel et paie, taux fiscaux), avec des dates et des noms en clair ;
  - les **sauvegarder sur son propre Google Drive** (menu → *Sauvegarder Drive*).
- Les pièces jointes (photos et PDF de factures) ne sont pas incluses dans le classeur Excel.

### Qui peut voir vos données ?
- **Chaque société est cloisonnée.** Un utilisateur ne voit que les sociétés auxquelles il a été rattaché.
- **Chaque personne a un rôle** (administrateur, comptable, employé…). Elle ne voit et ne fait que ce que ce rôle permet. Un salarié ne voit que **son propre** bulletin dans son portail.
- **La double authentification (2FA) est disponible** : en plus du mot de passe, un code à 6 chiffres est demandé, généré par une application sur le téléphone.
- **Tout est tracé** : le **journal d'audit** enregistre qui a créé, modifié, validé ou supprimé quoi, et quand.
- **Les suppressions sont rattrapables** : un élément supprimé passe d'abord par une **corbeille**.
- **Une écriture comptable est validée par une autre personne que son auteur** (sauf l'administrateur), et un exercice clôturé est verrouillé.

### Et si Ébène s'arrêtait ?
- Vous pouvez **récupérer vos données à tout moment**, sans frais.
- **Notre engagement écrit** : en cas d'arrêt du service, vous serez prévenu au moins **[60] jours** à l'avance, et vos données vous seront remises dans un format exploitable.

### Et si la connexion coupe ?
- Ébène fonctionne **en ligne**. Si la connexion coupe, un bandeau rouge le signale : attendez le retour du réseau avant de saisir.
- Il fonctionne aussi sur téléphone Android, ce qui permet de continuer en partage de connexion.

### Cadre légal
- Au Togo, la protection des données personnelles est encadrée par la **loi n° 2019-014 du 29 octobre 2019**, sous le contrôle de l'**IPDCP** (Instance de protection des données à caractère personnel).
- Vos données étant hébergées hors du Togo, [à compléter selon la réalité : « nous avons engagé les formalités prévues auprès de l'IPDCP » **ou** supprimer cette ligne tant que ce n'est pas fait].
- Nous n'utilisons **jamais** vos données à d'autres fins que le fonctionnement de votre compte, et nous ne les vendons pas.

### Une question ?
**[Votre nom]** · Ébène Suite · [téléphone / WhatsApp] · [adresse e-mail] · [site web]

---

<sub>Sources (consultées le 25/10/2026) : chiffrement — [Supabase, Security](https://supabase.com/security) ; sauvegardes quotidiennes de 7 jours sur le plan Pro — [Supabase, Pricing](https://supabase.com/pricing) et [Database backups](https://supabase.com/features/database-backups) ; loi togolaise — [dataprotection.africa](https://dataprotection.africa/?p=2922). Fonctions de l'application : vérifiées dans le code source d'Ébène Suite v2.6.1, plus l'export Excel (commit `4766670`).</sub>
