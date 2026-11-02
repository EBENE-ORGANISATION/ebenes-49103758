# Étude de faisabilité — Ébène Suite

**Recommandation : commencer par fiabiliser la saisie par photo, puis ajouter WhatsApp pour les notifications, puis expérimenter la voix.** La photo dispose déjà d’un parcours complet dans le dépôt ; son amélioration peut produire rapidement un bénéfice mesurable. WhatsApp paraît prometteur pour joindre dirigeants et comptables, mais demande un socle d’envoi fiable et une validation des conditions Meta. La voix pourrait toucher davantage les utilisateurs qui écrivent peu, avec une incertitude plus forte sur les langues et la compréhension des montants.

## Périmètre et lecture des chiffres

Étude réalisée le **2 novembre 2026**, sur la branche locale `main`, commit `d150573`. Elle comporte deux commits d’avance sur `origin/main` et des fichiers non suivis préexistants.

**Aucun fichier modifié, aucun commit, aucun accès réseau à la base, aucun déploiement.** L’analyse repose sur une lecture statique du dépôt et des pages web publiques. Les notes de recette mentionnent des déploiements, mais leur état n’a pas été vérifié.

Dans ce rapport :

- **Dépôt** : comportement observé dans les fichiers ; sa présence ne garantit pas son déploiement.
- **Web** : information publiée, accompagnée de sa source.
- **Estimation** : hypothèse budgétaire ou de développement, sans mesure terrain.

Les budgets sont **mensuels, pour 50 sociétés**, hors développement, taxes, assistance et abonnement Supabase existant. Conversion de planification : **1 USD = 600 FCFA**, hypothèse arrondie et non cours de change vérifié. Les efforts sont des **jours-personne**, pour un développeur connaissant le projet, avec vérification fonctionnelle ; les délais administratifs et pilotes terrain s’ajoutent au calendrier.

## 1. Socle existant et écarts communs

| Élément | Faits vérifiés dans le dépôt | Conséquence |
|---|---|---|
| Alertes et validations | `supabase/functions/notification-alertes/index.ts` et `notification-validation/index.ts` appellent **Resend directement**. | Les quatre familles d’e-mails ne passent pas toutes par le service central indiqué dans le contexte. |
| Notifications cabinet | `notification-cabinet/index.ts`, `evenements.ts` et `recap-cabinet-hebdo/index.ts` appellent `send-transactional-email`. | Réutiliser leurs règles de destinataires et événements. |
| Journal et désinscription e-mail | `send-transactional-email/index.ts` utilise `email_send_log`, `suppressed_emails`, `email_unsubscribe_tokens`. | Base utile pour concevoir le suivi WhatsApp, sans confondre les consentements des canaux. |
| Idempotence | Les fonctions cabinet fournissent `idempotencyKey`. Le service d’envoi la lit, mais ne l’utilise pas pour dédupliquer ni dans l’appel Resend. | **L’idempotence effective reste à construire.** Une relance peut renvoyer un message. |
| Préférences | Aucune préférence utilisateur par canal ou famille trouvée dans les parcours examinés. `alertes_lues` suit des lectures d’alertes, pas un consentement WhatsApp. | Créer un modèle explicite ; ne pas annoncer une réutilisation inexistante. |
| Tâches programmées | `20261102120000_taches_programmees.sql` : alertes à **08 h UTC**. `20261102124000_recap_cabinet.sql` : récapitulatif le **lundi à 07 h UTC**. | Réutiliser ces déclenchements ; le Togo est à UTC. |
| Secrets internes | `private.appeler_fonction_interne`, `vault.decrypted_secrets`, secret `internal_webhook_secret`, appels par `pg_net`. | Réutiliser le mécanisme interne pour les travailleurs programmés. |
| Hors connexion | `src/components/ebene/OfflineBanner.tsx` avertit que rien n’est conservé à la fermeture. | Le bundle Android local ne constitue pas une file durable de saisies. |
| Android et langues | Capacitor 8 ; modules Filesystem, Network et Share présents. `src/i18n/index.ts` déclare français et anglais. | Ni enregistrement vocal, ni interface éwé/mina identifiés. |

Les contrôles métier existants doivent rester le point de passage final : `src/data/transactions.repo.ts`, `src/hooks/data/useTransactions.ts`, `src/hooks/usePeutValider.ts`, permissions et contrôles en base. Le dépôt prévoit notamment un statut `en_validation` et un contrôle « quatre yeux ».

**Un brouillon IA doit rester distinct d’une opération comptable.** Le confirmer doit réutiliser les règles d’activité, d’exercice, de droits, de validation et de génération d’écritures existantes.

## 2. WhatsApp

### Ce qui existe déjà

Les sources à raccorder sont :

| Fonction | Données et destinataires actuels |
|---|---|
| `notification-alertes/index.ts` | Impayés, échéances fiscales, fins de CDD, stock bas ; sociétés actives et utilisateurs ayant accès avec certains rôles. |
| `notification-validation/index.ts` | Transactions, factures et événements RH en attente de validation. |
| `notification-cabinet/evenements.ts` | Six événements d’invitation ou de départ ; responsables cabinet, administrateurs client ou super-administrateurs selon l’événement. |
| `recap-cabinet-hebdo/index.ts` | Récapitulatif des dossiers actifs ou en départ ; calcul par `recap_cabinet_service`. |

Tables réutilisables : `societes`, `profiles`, `user_societes`, `user_roles`, `cabinets`, `cabinet_membres`, `cabinet_dossiers`.

**Aucune intégration WhatsApp Business entrante ou sortante trouvée.** Le partage Android dans `src/lib/fichiers.ts` peut ouvrir une feuille de partage, éventuellement WhatsApp ; il ne remplace pas une API automatisée.

### Options et coûts

Hypothèse volontairement haute : **deux destinataires par société**, un message quotidien par destinataire, même si les alertes actuelles ne partent qu’en présence d’alertes.

| Usage | Messages/mois |
|---|---:|
| Alertes : 50 × 2 × 30 | 3 000 |
| Validations : 50 × 20 × 2 | 2 000 |
| Récapitulatifs : 50 × 2 × 4,33 | 433 |
| Événements cabinet : 50 × 2 × 2 | 200 |
| **Total arrondi** | **5 650** |

Meta facture selon le marché, la catégorie et la livraison du message. Sa page publique annonce aussi des exceptions de gratuité pour certains messages de service ou utilitaires en réponse à l’utilisateur. **Le barème officiel exact applicable aux numéros togolais n’a pas pu être extrait** : l’accès à la documentation développeur a renvoyé une limitation. [Source Meta](https://whatsappbusiness.com/products/platform-pricing/)

| Option | Avantages et limites | Estimation mensuelle |
|---|---|---:|
| **Meta Cloud API directe** | Moins d’intermédiaires ; gestion interne des modèles, webhooks, erreurs et suivi. | Avec une **hypothèse** de 0,004–0,02 USD/message : **23–113 USD**, soit **14 000–68 000 FCFA**. |
| **Twilio WhatsApp** | API et accompagnement d’intégration ; intermédiaire supplémentaire et surcoût. | Même provision Meta + **28,25 USD** pour 5 650 messages : **51–141 USD**, soit **31 000–85 000 FCFA**. |
| Prestataire avec boîte de réception partagée | Utile si des humains doivent répondre ; abonnement et dépendance fournisseur. | **Provision de 50–150 USD supplémentaires**, à confirmer par devis. |

Le supplément Twilio vérifié est de **0,005 USD par message entrant ou sortant**, en plus des frais Meta applicables. [Tarifs Twilio](https://www.twilio.com/en-us/whatsapp/pricing)

Ces montants ne constituent pas un devis Meta. La catégorie approuvée peut changer fortement la facture. Doubler les destinataires double approximativement le coût.

**Réception de saisies, en phase ultérieure :** 5 000 saisies mensuelles avec deux réponses chacune représenteraient 15 000 messages chez Twilio, donc **75 USD de frais Twilio**, plus les frais Meta applicables et l’extraction texte/photo/voix. Ce volume est une estimation indépendante du scénario sortant.

### Contraintes et sécurité

Les règles Meta exigent notamment le numéro communiqué par l’utilisateur, un **opt-in**, le respect du retrait, des modèles approuvés pour initier les conversations et une fenêtre de service de 24 heures pour les réponses libres. Prévoir une possibilité claire de joindre une assistance humaine. [Politique WhatsApp Business](https://whatsappbusiness.com/policy/)

Conséquences proposées :

- Consentement nominatif et traçable, par famille de notification ; un administrateur ne consent pas à la place de tous ses employés.
- Numéro vérifié, retrait dans l’application et par message « STOP », traitement des numéros réattribués.
- Modèles utilitaires soumis à Meta ; ne pas y ajouter de promotion.
- Messages courts : « Trois opérations attendent votre validation », avec lien authentifié.
- Éviter montants détaillés, noms de salariés, sanctions, salaires et pièces comptables dans les messages ou aperçus de téléphone.
- Vérifier les droits à l’envoi, y compris après un départ de salarié ou de cabinet.

WhatsApp est familier et peut reprendre ses envois lorsque le réseau revient. Il **ne rend pas Ébène Suite utilisable hors connexion**. Les liens devront fonctionner sur navigateur et Android : le manifeste actuel expose surtout un retour d’authentification, pas un routage complet des notifications.

### Architecture proposée

Nouvelles tables, noms indicatifs :

- `notification_preferences` : utilisateur, société, famille, canal, fréquence, langue.
- `notification_contacts` : numéro E.164, vérification, consentement, version du texte accepté, retrait.
- `notification_outbox` : événement, destinataire, canal, clé unique, état, tentatives, prochaine tentative.
- `notification_deliveries` : identifiant fournisseur, livraison, échec, horodatages.

Événement métier → sélection autorisée des destinataires → préférences/consentement → file d’envoi → fournisseur.

Créer `send-whatsapp` et `whatsapp-webhook`. Vérifier la signature des webhooks sur le corps brut ; dédupliquer messages et statuts entrants. Les secrets fournisseurs restent côté serveur dans les secrets Edge ; le coffre et le secret interne existants servent aux appels programmés.

Réutiliser les crons actuels pour produire les événements, et ajouter un travailleur périodique par petits lots. Une contrainte unique doit porter sur **événement stable + destinataire + canal**. Les clés actuelles fondées sur la minute ou l’heure ne suffisent pas. Après une réponse réseau ambiguë, prévoir une réconciliation : une file locale seule ne garantit pas un envoi exactement une fois.

Écrans : préférences accessibles depuis le compte, `src/pages/ParametresSociete.tsx`, suivi administratif des échecs et liens vers `src/pages/Cabinet.tsx` ou les validations.

Pour les saisies entrantes : ajouter une liaison vérifiée numéro–utilisateur, choisir explicitement la société et produire un **brouillon**. Un numéro WhatsApp ne doit jamais donner, à lui seul, accès à une société.

### Effort, risques et adoption

| Livraison | Effort estimé |
|---|---:|
| Compte fournisseur, modèles et règles de contenu | 2–3 j |
| Contacts vérifiés, consentements, préférences | 3–4 j |
| File, reprises, déduplication et suivi | 4–6 j |
| Raccordement des quatre familles, liens et recette Android | 4–6 j |
| **Sortant complet** | **13–19 j** |
| Réception de texte vers brouillon | **+7–12 j** |

Approbation Meta et pilote : prévoir **1–3 semaines calendaires supplémentaires**, sans garantie.

**Risques :** rejet ou reclassement des modèles, blocage du compte, lassitude face aux alertes quotidiennes répétées, doublons, fuite sur téléphone partagé.

**À trancher :** numéro central Ébène ou identité par société ; canal complémentaire ou remplacement de l’e-mail ; familles sensibles exclues ; budget par société ; qui répond aux messages.

**Impact attendu — hypothèse :** amélioration surtout de la réactivité des dirigeants et comptables. Le bénéfice direct pour les agents terrain restera limité tant qu’il s’agit seulement de notifications textuelles. Mesurer le délai de validation et les actions réalisées après notification, plutôt que le seul statut « lu ».

## 3. Saisie par photo

### Ce qui existe déjà

**La fonctionnalité existe déjà dans le code et ne se limite pas à un prototype serveur.**

`supabase/functions/ocr-facture/index.ts` :

- vérifie la session via `auth.getUser()` ;
- appelle directement **`gemini-2.5-flash`**, avec `GEMINI_API_KEY` ;
- transmet le document à Google ;
- demande un JSON structuré : fournisseur, client, numéro, date, HT, TVA, TTC ;
- demande `null` si une valeur est illisible et suppose les montants en FCFA ;
- retourne des données extraites, sans créer d’opération.

`src/components/ebene/OCRFacture.tsx` :

- sélection d’image ou capture arrière avec `capture="environment"` ;
- limite front de **8 Mo** ;
- envoi de l’image en base64 ;
- retour vers un formulaire à compléter.

Deux appels :

- `Comptabilite.tsx`, `appliquerOCRAchat` : dépense fournisseur, date, TTC, indicateur TVA et photo jointe.
- `Factures.tsx`, `applyOCRDraft` : destinataire comme client, date et ligne globale HT. La photo retournée n’est pas exploitée par ce callback.

`src/data/transactions.repo.ts` mappe les justificatifs vers `piece_jointe`, `piece_jointe_nom`, `piece_jointe_type`.

Les notes `docs/recette/bugs.md` signalent une correction importante de confusion **achat/vente**, marquée **« à déployer »**. Son déploiement n’est pas établi ici.

### Limites concrètes

- Pas de compression, recadrage, contrôle de flou ou persistance hors connexion dans le composant.
- Base64 : environ **33 % de volume supplémentaire**.
- Contrôle de taille uniquement côté front ; pas de quota utilisateur/société visible dans la fonction.
- Le serveur accepte aussi le MIME PDF, mais le composant refuse les fichiers non images : pas de véritable parcours PDF.
- Les types MIME inconnus sont ramenés à JPEG, sans validation réelle du fichier.
- Pas de validation métier robuste du résultat après le JSON : cohérence HT + TVA = TTC, date, devise ou montant aberrant.
- Pas de détection de doublon ni de score de qualité calibré.
- Ni lignes détaillées, ni ventilation multi-taux, ni paiement, ni compte SYSCOHADA extraits.
- L’achat transforme une TVA absente en zéro pour le préremplissage : **« inconnu » doit rester distinct de « sans TVA »**.

La photographie ne démontre ni l’authenticité du reçu ni la déductibilité de la TVA.

### Options et coûts

Hypothèse : **100 documents par société et par mois = 5 000 documents**, une page chacun. Pour Gemini : 2 000 tokens d’entrée et 500 tokens de sortie facturés par document, **raisonnement compris**.

| Option | Avantages et limites | Calcul mensuel estimé |
|---|---|---:|
| **Gemini existant, offre payante** | Réutilisation maximale, extraction structurée ; erreurs possibles et données transmises à Google. | 10 M tokens entrée × 0,30 USD + 2,5 M sortie × 2,50 USD = **9,25 USD**. Provision **10–30 USD**, soit **6 000–18 000 FCFA**. |
| Google Cloud Vision + extraction structurée | OCR séparé, texte réutilisable ; deuxième étape nécessaire pour comprendre facture et champs. | OCR : **6 USD** si les 1 000 unités gratuites sont disponibles, puis extraction : provision **5–15 USD**, total **11–21 USD**. |
| ML Kit embarqué sur Android | Lecture sur téléphone, fonctionnement local ; intégration native et compréhension comptable à ajouter. | Pas d’appel cloud pour l’OCR local ; provision d’intégration supplémentaire **5–9 j**. |

Tarifs vérifiés : Gemini 2.5 Flash, **0,30 USD/M tokens image/texte en entrée, 2,50 USD/M en sortie** ; Google distingue aussi l’usage des données entre offre gratuite et payante. [Tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing)

Vision : premiers 1 000 traitements mensuels gratuits, puis **1,50 USD/1 000** pour la reconnaissance de texte au tarif standard consulté. [Tarifs Vision](https://cloud.google.com/vision/pricing)

ML Kit propose une reconnaissance sur appareil et plusieurs modes d’installation des modèles. [Documentation ML Kit](https://developers.google.com/ml-kit/guides), [installation des modèles](https://developers.google.com/ml-kit/tips/installation-paths)

**Vigilance modèle :** Google indique actuellement que l’accès aux modèles 2.5 est limité aux utilisateurs les ayant déjà utilisés. Le code existant ne prouve pas l’éligibilité de la clé ; prévoir un modèle configurable et un test de référence avant changement. [Cycle de vie Gemini](https://ai.google.dev/gemini-api/docs/deprecations/)

### Architecture proposée

Conserver `OCRFacture` et les formulaires métier, avec :

1. Capture, aperçu, recadrage et compression locale ; cible estimée **200–500 Ko**, à vérifier sur petits reçus.
2. Sauvegarde locale durable avant envoi : IndexedDB pour le web, fichiers privés et métadonnées persistantes sur Android.
3. Stockage privé des justificatifs, chemins par société et URLs signées courtes.
4. `saisie_jobs` : utilisateur, société, source, empreinte, modèle, état, erreur, tentatives, consommation.
5. `saisie_brouillons` : valeurs proposées, champs inconnus, corrections et lien vers l’opération finale.
6. `ocr-facture` renforcée : contrôle serveur de format/taille/pages, quotas, validation du JSON et cohérence arithmétique.
7. Confirmation explicite dans le parcours existant ; aucun passage direct de l’IA aux écritures.

Utiliser l’empreinte du document **dans la société** pour signaler un doublon potentiel ; ne pas bloquer automatiquement deux reçus légitimes identiques. Un identifiant de requête local doit empêcher les doubles créations lors des reprises réseau.

Les crons serviraient aux reprises et purges, pas à retarder toutes les extractions jusqu’au lendemain.

### Effort, risques et adoption

| Livraison | Effort estimé |
|---|---:|
| Corpus de référence, contrôle achat/vente et règles de champs inconnus | 2–3 j |
| Durcissement Edge, quotas, résultats contrôlés | 2–3 j |
| Capture optimisée, brouillon et justificatifs privés | 3–5 j |
| Persistance/reprise, déduplication, recette Android et réseau faible | 3–5 j |
| **Total** | **10–16 j** |

**Risques :** reçus manuscrits, papier thermique effacé, images floues, totaux inventés, TVA mal interprétée, faux doublons, coût réseau supérieur au coût IA.

Avec 300 Ko/document, 5 000 documents représentent environ **1,5 Go de téléversement cumulé par mois**, avant reprises. Avec 8 Mo/document, ce serait 40 Go avant l’expansion base64 : la compression est prioritaire.

**À trancher :** achats seuls au démarrage ; manuscrits inclus ou exclus ; stockage et durée de conservation ; fournisseur IA autorisé ; qui peut confirmer ; niveau acceptable de correction.

**Impact attendu — hypothèse :** gain rapide pour agents et comptables disposant d’un justificatif. Viser **30–60 % de réduction du temps** sur les documents imprimés lisibles, à mesurer. La photo aide à saisir ; elle exige encore une validation compréhensible, avec montants grands et champs à corriger clairement indiqués.

## 4. Saisie par la voix

### Ce qui existe déjà

Aucun usage de `MediaRecorder`, `SpeechRecognition`, service de transcription ou parcours vocal trouvé.

Le manifeste `android/app/src/main/AndroidManifest.xml` déclare Internet, mais pas `RECORD_AUDIO`. Les dépendances ne montrent pas de plugin d’enregistrement vocal.

Réutilisables :

- `Comptabilite.tsx` et `comptabilite/SaisieGuidee.tsx` ;
- `useTransactions.ts` et `transactions.repo.ts` ;
- champs montant, description, date, compte, trésorerie, activité et justificatif ;
- validation existante et traductions françaises/anglaises.

### Options et coûts

Hypothèse : **100 dictées de 20 secondes par société/mois**, soit **5 000 dictées et 1 667 minutes**.

| Option | Avantages et limites | Estimation mensuelle |
|---|---|---:|
| **Transcription OpenAI + extraction JSON** | Deux étapes contrôlables ; adapté à un essai en français. Fiabilité locale à mesurer. | Mini-transcribe : environ **5 USD** ; extraction provisionnée **3–10 USD** ; total **8–15 USD**, soit **4 800–9 000 FCFA**. |
| Google Speech-to-Text V2 + extraction | Alternative à comparer sur le même corpus. | À 0,016 USD/min : **26,70 USD**, puis extraction ; total **30–40 USD**, soit **18 000–24 000 FCFA**. |
| Khaya AI ou Sunbird pour l’éwé | Les fournisseurs annoncent l’éwé ; intérêt pour un essai spécialisé. Mina et mélange des langues non démontrés. | Tarif exploitable non vérifié : **devis nécessaire**. Provision d’essai **50–150 USD/mois**, sans valeur de devis. |
| Reconnaissance sur téléphone ou modèle auto-hébergé | Potentiel hors connexion/confidentialité ; qualité, téléchargement, mémoire, batterie et exploitation à prendre en charge. | Pas de coût API pour le traitement local ; **+10–20 j** estimés pour une première intégration et qualification sérieuse. |

OpenAI publie **0,003 USD/min** pour `gpt-4o-mini-transcribe`, contre 0,006 USD/min pour `gpt-4o-transcribe`. [Tarifs de transcription](https://developers.openai.com/api/docs/pricing)

Google publie **0,016 USD/min** au premier palier standard V2. [Tarifs Speech-to-Text](https://cloud.google.com/speech-to-text/pricing)

L’éwé figure dans les offres annoncées de [Khaya AI](https://www.khaya.ai/features/automatic-speech-recognition) et du [tutoriel Sunbird](https://api.sunbird.ai/tutorial). **Une langue annoncée ne garantit pas la reconnaissance des montants, accents togolais ou expressions mina.**

### Architecture et parcours proposés

Bouton « Dicter » → enregistrement de 10–30 secondes → écoute possible → téléversement différé → transcription → extraction de champs → confirmation.

Exemple :

> « Carburant, quinze mille francs, payé en espèces »

Brouillon proposé :

| Champ | Proposition |
|---|---|
| Nature | Dépense |
| Libellé | Carburant |
| Montant | 15 000 FCFA |
| Paiement | Espèces, trésorerie 571 |
| Date | Aujourd’hui, proposée explicitement |
| Activité | À choisir si obligatoire |
| TVA | Inconnue |
| Compte | Suggestion à confirmer selon le paramétrage |

Créer `transcrire-operation`, puis une extraction structurée contrôlée, réutilisant `saisie_jobs` et `saisie_brouillons` de la photo. Enregistrer source, version du modèle et corrections. **Ne jamais déduire de TVA déductible de la seule dictée.**

Sur Android : permission micro demandée au moment de l’action, plugin ou pont natif compatible Capacitor 8, gestion refus/interruption/appel téléphonique. Tester les formats audio sur WebView et Windows. Sur navigateur, détecter les capacités avant de proposer le bouton.

Éviter le temps réel pour le MVP : enregistrer puis envoyer est plus simple à reprendre. À 24 kbit/s, 20 secondes représentent environ **60 Ko**, soit 300 Mo pour 5 000 dictées, estimation hors surcoûts.

### Langues, effort et risques

Commencer en **français parlé au Togo**, avec exemples très courts et retour visuel. Prévoir ensuite un essai éwé et mina séparé. Les mélanges « français + langue locale », le bruit de marché et les noms de fournisseurs doivent figurer au corpus.

| Livraison | Effort estimé |
|---|---:|
| Corpus consenti et comparaison de transcriptions | 3–4 j |
| Enregistrement web/Android et sauvegarde locale | 3–5 j |
| Transcription, extraction et contrôles des montants | 3–4 j |
| Confirmation accessible, reprise et recette terrain | 3–5 j |
| **MVP français** | **12–18 j** |
| Qualification éwé/mina | **+5–10 j**, sans garantie de résultat |

**Risques :** confusion 1 500/15 000, hallucination sur silence, voix d’un tiers, exposition publique d’informations, corrections écrites difficiles pour le public visé.

**À trancher :** français seul au début ; durée maximale ; conservation audio ; besoin de restitution orale ; erreurs acceptables avant abandon d’un fournisseur.

**Impact attendu — hypothèse :** potentiel élevé pour les utilisateurs qui écrivent peu, mais bénéfice conditionné par une confirmation accessible. Une transcription qu’il faut longuement relire et corriger peut annuler ce gain. Mesurer le montant exact reconnu et la proportion d’opérations terminées sans aide.

## 5. Conditions transversales de faisabilité

### Données personnelles et comptables

La loi togolaise **n° 2019-014 du 29 octobre 2019** encadre la protection des données personnelles et les transferts vers des pays tiers. Le texte prévoit notamment des conditions de protection adéquate et des mécanismes d’autorisation ou de garanties selon les situations. **Le consentement WhatsApp ne règle pas, à lui seul, la question des transferts internationaux.** [Texte publié par l’ANID](https://anid.gouv.tg/wp-content/uploads/2024/11/Loi_2019-014_relative_a_la_protection_des_donnees_a_caractere_personnel.pdf)

Avant un pilote réel :

- Déterminer les rôles d’Ébène, des sociétés, des cabinets et des sous-traitants.
- Vérifier les contrats, lieux de traitement, sous-traitants et formalités applicables avec un conseil local ou l’IPDCP.
- Informer sur les données transmises et les finalités ; distinguer permission micro/caméra et base légale du traitement.
- Exclure initialement paie, sanctions et documents contenant des données particulièrement sensibles.

Ne pas présenter « non utilisé pour entraîner » comme synonyme de « aucune conservation » ou « aucun transfert ». Vérifier les conditions contractuelles de l’offre effectivement utilisée.

### Garde-fous proposés

- RLS par société, droits de création et validation distincts, accès cabinet bornés à leur mission.
- Contrôle d’accès avant traitement et avant conversion d’un brouillon.
- Buckets privés ; aucun document comptable sous URL publique permanente.
- Quotas par société/utilisateur et plafond global de dépense.
- Journaux techniques sans image, audio ou contenu comptable brut.
- Sorties IA traitées comme non fiables : aucun ordre contenu dans une facture ou dictée ne doit déclencher une action.
- Purge proposée : audio sous **7 jours après confirmation**, extraction technique sous **30 jours** ; justificatifs selon la politique comptable et légale validée.
- Données locales isolées par utilisateur/société, purge maîtrisée à la déconnexion, traitement explicite des téléphones partagés.

**Provision commune estimée : 5–20 USD/mois** pour stockage, trafic et reprises au-delà des quotas disponibles. Ce n’est pas un tarif Supabase calculé : les volumes et le plan réel restent inconnus.

## 6. Classement et première étape

| Rang | Piste | Motif principal | Effort estimé |
|---|---|---|---:|
| **1** | **Photo** | Parcours déjà présent ; gain de saisie testable rapidement ; coût IA faible. | **10–16 j** |
| **2** | **WhatsApp sortant** | Canal pertinent selon le constat utilisateur ; améliore le suivi, avec dépendance Meta et fondations d’envoi à construire. | **13–19 j** |
| **3** | **Voix** | Potentiel d’inclusion élevé ; plus forte incertitude sur langues, montants et validation accessible. | **12–18 j**, hors langues locales |

Ces efforts se recoupent : le socle de brouillons et de reprise construit pour la photo réduira le coût ultérieur de la voix. Ils ne doivent pas être additionnés sans réestimation.

**La première étape recommandée est un pilote photo consacré aux dépenses fournisseurs**, sans extension initiale aux factures de vente, au stock ou à la paie.

| Étape livrable | Contenu | Effort |
|---|---|---:|
| 1. Référence et critères | 100 reçus/factures autorisés ou anonymisés, couvrant imprimés, manuscrits, flou et absence de TVA ; vérité terrain établie par un comptable. | 2 j |
| 2. Parcours fiable | Aperçu, compression, conservation de l’image en cas d’échec, distinction « inconnu »/zéro, confirmation des champs. | 3–4 j |
| 3. Traitement protégé | Validation serveur, quotas, modèle configurable, brouillon et contrôle des doublons. | 3–4 j |
| 4. Reprise et recette | Fermeture/réouverture Android, réseau coupé pendant l’envoi, reprise sans double création, vérification multi-sociétés. | 2–4 j |
| **Total** | Premier lot exploitable | **10–14 j** |

Puis pilote de **deux semaines avec cinq sociétés et une dizaine d’agents**, estimation d’organisation.

Critères proposés, **objectifs à valider et non performances acquises** :

- Au moins **95 % de montants TTC exacts** sur les documents imprimés lisibles du corpus.
- Aucun brouillon converti sans confirmation.
- Aucune fuite inter-sociétés ni double opération lors des scénarios de reprise.
- Temps médian réduit d’au moins **30 %** face à la saisie manuelle.
- Taille médiane téléversée inférieure à **400 Ko**.
- Moins de **10 % d’abandons** sur le périmètre de documents retenu.

Le choix de poursuivre doit reposer sur ces résultats et sur l’usage autonome par les agents. **Les coûts API paraissent secondaires ; les vrais facteurs de faisabilité sont la reprise après coupure, la justesse des montants et la simplicité de validation.**