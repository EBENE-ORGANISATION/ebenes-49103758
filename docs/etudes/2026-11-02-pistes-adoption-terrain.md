# Étude : WhatsApp, photo et voix pour Ébène Suite

Date : 2026-11-02. Étude de faisabilité, sans développement. Deux études indépendantes ont été faites (Claude, Codex) ; le comparatif est en fin de document.

## Point de départ

Constat discuté le 02/11 : au Togo, une partie des utilisateurs lit et écrit peu, travaille surtout sur téléphone et lit WhatsApp bien plus que ses e-mails.

Chiffres vérifiés :
- **Internet** : 37,0 % de la population en ligne fin 2025, stable depuis 2024 ([DataReportal 2026](https://datareportal.com/reports/digital-2026-togo), [2024](https://datareportal.com/reports/digital-2024-togo)).
- **Alphabétisation des adultes** : environ 73 % en 2022 ([Measured World](https://measuredworld.com/countries/togo/education/literacy)) ; le dernier chiffre par sexe trouvé date de 2011 : 76,9 % des hommes, 52,4 % des femmes (enquête QUIBB). Sources anciennes ou divergentes : à prendre comme ordre de grandeur.

Qui est concerné dans Ébène Suite :
- **dirigeants et administrateurs** : reçoivent alertes, validations, récapitulatifs ; ne lisent pas leurs e-mails ;
- **personnes du terrain** (caissiers, agents, employés) : saisissent dépenses et ventes ; écrivent peu ;
- **comptables et cabinets** : à l'aise avec l'écrit ; pas la cible de ces pistes.

État de la base (02/11) : 6 sociétés, 10 comptes, 756 opérations en 30 jours, 18 e-mails envoyés en 30 jours. Les profils n'ont **pas de numéro de téléphone** (seuls `societes`, `employes`, `fournisseurs`, `activites` et `societe_config` en ont un).

## Piste 1 : WhatsApp

### Ce qui existe

Quatre envois automatiques par e-mail :
- `notification-alertes` (quotidien, 08:00 UTC) et `notification-validation` (pièces à valider) appellent **Resend directement** ;
- `notification-cabinet` (événements des liens cabinet) et `recap-cabinet-hebdo` (lundi 07:00 UTC) passent par `send-transactional-email` (modèles, liste d'exclusion, journal `email_send_log`).

Ce service lit une clé d'idempotence mais **ne s'en sert pas** pour éviter les doublons : une relance peut envoyer deux fois le même message (constat de Codex, vérifié). Aucune préférence de canal n'existe par utilisateur. Les appels internes passent par `private.appeler_fonction_interne` avec le secret du coffre.

### Options

| Option | Coût | Avantages | Limites |
|---|---|---|---|
| **API WhatsApp Cloud de Meta, en direct** | ≈ 0,004 $ par message « utilitaire » (zone « Reste de l'Afrique », tarif à confirmer sur la grille Meta ; [SleekFlow](https://sleekflow.io/en-us/blog/whatsapp-business-price), [ManyChat](https://help.manychat.com/hc/en-us/articles/14281380243740-WhatsApp-pricing-guide)) | pas d'intermédiaire ; prix le plus bas | vérification de l'entreprise par Meta ; un numéro dédié ; modèles de message validés par Meta |
| Fournisseur intermédiaire (Twilio, 360dialog…) | tarif Meta + marge ou abonnement | console, assistance | coût plus élevé ; un tiers de plus voit les données |
| Lien `wa.me` (partage manuel) | gratuit | aucune démarche | rien d'automatique : l'utilisateur doit appuyer sur « Envoyer » |

Règles WhatsApp à respecter ([smsmode](https://www.smsmode.com/en/whatsapp-business-api-customer-care-window-ou-templates-comment-les-utiliser/), [Chakra](https://chakrahq.com/article/whatsapp-template-messages-complete-guide/)) :
- hors réponse à un message reçu dans les 24 h, on n'envoie que des **modèles approuvés** par Meta ;
- nos envois sont des messages « utilitaires » (alertes, validations), la catégorie la moins chère et la plus facile à faire approuver, à condition de n'y mettre aucune promotion ;
- l'utilisateur doit avoir **accepté** de recevoir des messages WhatsApp (case à cocher et preuve conservée).

### Coût estimé

Hypothèse : 50 sociétés, 2 destinataires chacune, environ 60 messages par personne et par mois (alertes, validations, récapitulatif).
6 000 messages × 0,004 $ ≈ **24 $ par mois, soit environ 15 000 FCFA**. Aujourd'hui (10 comptes), quelques centaines de francs.

### Architecture proposée

- `profiles` : numéro WhatsApp au format international, date et preuve du consentement, canal préféré (`email`, `whatsapp`, `les_deux`).
- Une fonction Edge `send-whatsapp` sur le modèle de `send-transactional-email` : modèle, variables, clé d'idempotence, journal `whatsapp_send_log`, liste d'exclusion.
- Un webhook Meta pour les statuts (remis, lu, échec) et le mot « STOP » (retrait du consentement).
- Les quatre fonctions d'envoi choisissent le canal selon la préférence ; l'e-mail reste le canal de secours si WhatsApp échoue.
- Textes courts : une phrase, un chiffre, un bouton vers l'application. Pas de données comptables détaillées dans le message.

### Effort

- **Étape 1 (sortant)** : 6 à 8 jours.
  - numéro et consentement dans le profil, écran de préférences : 1,5 j ;
  - migration (colonnes, journal, liste d'exclusion) : 1 j ;
  - `send-whatsapp` et webhook : 2 j ;
  - branchement des quatre envois : 1,5 j ;
  - tests et recette : 1 j.
- **De votre côté, en parallèle** : compte Meta Business vérifié pour EBENE SERVICES, un numéro de téléphone dédié, soumission des modèles. Compter de quelques jours à deux ou trois semaines.
- **Étape 2 (entrant, plus tard)** : recevoir une photo ou une note vocale par WhatsApp et créer un brouillon. 8 à 12 jours ; elle réutilise les pistes 2 et 3.

### Risques

- Délai de vérification Meta, indépendant de nous.
- Chaque message part chez Meta : n'y mettre que le strict nécessaire.
- Numéros mal saisis : vérifier le format, envoyer un message de confirmation à l'inscription.

## Piste 2 : saisie par photo

### Ce qui existe

- La fonction Edge `ocr-facture` envoie l'image à **Gemini 2.5 Flash** (Google) et reçoit en retour `fournisseur`, `client`, `numero`, `date`, `montantHT`, `tva` et `montantTTC`. L'utilisateur doit être connecté.
- L'écran `OCRFacture.tsx` (champ photo avec `capture="environment"`, qui ouvre l'appareil photo sur téléphone) sert à deux endroits : les achats en Comptabilité et les ventes en Factures.
- Il n'existe pas de saisie par photo pour une **dépense de trésorerie** (carburant, transport, petit achat), qui est le cas le plus fréquent sur le terrain.

### Ce qu'il manque

- Un « reçu de dépense » : montant, date, fournisseur, moyen de paiement, et une **catégorie proposée** d'après le contenu (carburant, transport, fournitures…).
- Un gros bouton « Photographier un reçu » en mode « confort terrain ».
- L'image réduite sur le téléphone avant l'envoi : moins de données consommées, envoi plus rapide sur une connexion lente.
- Le brouillon créé **en validation** (`en_validation`), jamais validé d'office : le circuit de validation existe déjà.
- Les petits reçus manuscrits ou thermiques effacés, à tester sur de vrais reçus togolais.

### Coût estimé

Une photo ≈ 1 000 à 2 000 unités de texte (jetons) envoyées à Gemini Flash. Pour 10 000 reçus par mois (50 sociétés × 200), le coût est de l'ordre de **5 à 10 $ par mois**. Le coût réel est à mesurer sur la facturation Google.

### Effort

3 à 5 jours :
- élargir `ocr-facture` au reçu de dépense : 1 j ;
- écran et bouton terrain : 1,5 j ;
- réduction de l'image : 0,5 j ;
- tests sur de vrais reçus : 1 j.

### Risques

Lecture fausse d'un montant : mitigée par la validation humaine et l'affichage de la photo à côté du brouillon. La photo part chez Google : c'est déjà le cas aujourd'hui pour les factures, avec la facturation activée, ce qui interdit à Google de s'entraîner sur ces données.

## Piste 3 : saisie par la voix

### Ce qui existe

Rien : pas de micro, pas de reconnaissance vocale. Le module Android de Capacitor n'a pas d'extension micro ou parole installée.

### Options

| Option | Avantages | Limites |
|---|---|---|
| **Enregistrer l'audio, l'envoyer à Gemini** qui transcrit *et* structure en un seul appel (montant, libellé, moyen de paiement) | une seule chaîne pour le web, Windows et Android ; Gemini comprend déjà le français ; coût très faible | demande la connexion ; il faut gérer l'autorisation du micro dans l'application Android (à tester) |
| Reconnaissance du téléphone (extension Capacitor `SpeechRecognizer`, [Capgo](https://capgo.app/docs/plugins/speech-recognition/getting-started), [Capawesome](https://capawesome.io/docs/plugins/speech-recognition/)) | gratuite, peut marcher sans connexion | l'API vocale du navigateur n'existe pas dans l'affichage web Android ([Chromium](https://issues.chromium.org/41172064)) ; résultats variables selon les téléphones ; il faut ensuite structurer le texte |
| Service de transcription dédié (Google Speech, Whisper) | bonne qualité en français | deux appels (transcrire, puis structurer) |

**Langues** : le français est bien reconnu. Pour l'éwé, il n'existe que des modèles communautaires (Whisper adapté, environ 10 % de mots erronés sur des textes bibliques ; [Hugging Face](https://huggingface.co/abiyo27/whisper-small-ewe-2)) et peu de données ouvertes ([ICNLSP 2025](https://aclanthology.org/2025.icnlsp-1.32.pdf)). Aucune source trouvée sur l'éwé ou le mina chez Gemini ou Google : à tester. Le français mêlé d'éwé ou de mina, très courant, est le vrai défi.

### Coût estimé

Une note de 15 secondes coûte une fraction de centime avec Gemini Flash (estimations entre 0,04 $ et 1,20 $ par heure d'audio selon les sources : [Mixpeek](https://mixpeek.com/guides/how-much-does-it-cost-to-transcribe-an-hour-of-audio), [convertaudiototext](https://convertaudiototext.com/blog/transcription-pricing-comparison-2026)). Même 10 000 notes par mois restent **sous 10 $**.

### Effort

6 à 10 jours :
- bouton micro et enregistrement (web et Android, autorisation du micro) : 2 à 3 j ;
- fonction Edge « dictée vers brouillon » avec Gemini : 1,5 j ;
- écran de relecture : ce qui a été compris, montant en gros, « Corriger » ou « Envoyer en validation » : 1,5 j ;
- tests en conditions réelles, avec accents et bruit : 1 à 2 j ;
- éwé ou mina : essai à part, sans engagement.

### Risques

- Mauvaise compréhension des montants (« quinze mille » ou « quinze cents »). La relecture doit afficher le montant en chiffres, en gros.
- L'audio part chez Google : même cadre que pour les photos.
- La reconnaissance hors français est incertaine.

## Classement (avis Claude)

| | Photo | WhatsApp (sortant) | Voix |
|---|---|---|---|
| Effort | **3-5 j** | 6-8 j + démarches Meta | 6-10 j |
| Dépendances extérieures | aucune (Gemini déjà en place) | vérification Meta, numéro dédié | aucune, mais langues incertaines |
| Qui en profite | terrain | dirigeants, administrateurs | terrain |
| Impact sur l'adoption | moyen à fort | **fort** | moyen, à confirmer |
| Coût mensuel (50 sociétés) | 5-10 $ | ≈ 24 $ | < 10 $ |
| Risque | faible | moyen (Meta) | moyen (langues, montants) |

**Ordre proposé** :
1. **Lancer tout de suite les démarches Meta** (de votre côté) : c'est le délai le plus long et il ne dépend pas de nous.
2. **Pendant ce temps, la photo des reçus de dépense** : elle s'appuie sur l'existant et est livrable en une semaine.
3. **Puis WhatsApp sortant**, dès que Meta a validé.
4. **La voix en dernier**, d'abord en essai en français avec quelques utilisateurs de terrain, avant de la généraliser.

### Première étape détaillée (photo des reçus de dépense)

1. Élargir `ocr-facture` avec un paramètre `nature: "depense"` qui rend `{ fournisseur, date, montant, moyen_paiement, categorie_proposee }` ; tests sur des images d'exemple.
2. Réduire l'image dans le navigateur (côté le plus long : 1 600 px, JPEG qualité 0,7) avant l'envoi.
3. Ajouter un bouton « Photographier un reçu » en Trésorerie, mis en avant en mode « confort terrain ».
4. Créer l'opération en `en_validation`, la photo jointe, pour que le dirigeant la confirme.
5. Faire la recette sur une vingtaine de vrais reçus togolais (station-service, marché, pharmacie) et mesurer le taux de montants justes.

## Points à trancher par vous

- Ouvrir le compte Meta Business au nom d'EBENE SERVICES et choisir le numéro dédié à WhatsApp.
- WhatsApp : vient-il **en plus** de l'e-mail, ou **à la place** quand l'utilisateur le choisit ?
- Photo et voix : qui peut s'en servir (tous les rôles, ou seulement les profils terrain) ?
- Accepter que les photos et l'audio passent par Google (comme aujourd'hui pour les factures).

## Comparatif des deux études

Étude Codex complète : [2026-11-02-pistes-adoption-terrain-codex.md](2026-11-02-pistes-adoption-terrain-codex.md). Les deux études ont été faites séparément, sans que l'une voie l'autre.

### Ce sur quoi elles s'accordent

- **Même ordre** : photo d'abord, puis WhatsApp pour les envois, puis la voix.
- **Même principe de sécurité** : la photo ou la voix ne produit qu'un **brouillon** ; une personne confirme ; aucune écriture comptable ne naît directement de l'IA.
- **Même choix technique pour WhatsApp** : l'API directe de Meta, des modèles « utilitaires », un consentement explicite, un webhook pour les statuts et le « STOP », des messages courts sans détail comptable.
- **Mêmes réserves sur les langues** : le français d'abord ; l'éwé et le mina en essai séparé, sans garantie.
- **Même conclusion sur les coûts** : les coûts des API sont faibles, de 10 à 30 $ par mois et par piste pour 50 sociétés. Ce qui décide, c'est la fiabilité, pas le prix.

### Où elles divergent

| Point | Claude | Codex | Retenu |
|---|---|---|---|
| Effort photo | 3-5 j | 10-16 j | **8-12 j**. Codex ajoute ce qui manque vraiment : reprise après coupure, quotas, contrôle des montants, corpus de test. La sauvegarde hors connexion complète peut attendre une deuxième étape. |
| Effort WhatsApp sortant | 6-8 j | 13-19 j | **12-16 j**. Codex a raison : il faut d'abord une vraie file d'envoi avec anti-doublon. L'existant ne l'assure pas, même pour l'e-mail. |
| Effort voix | 6-10 j | 12-18 j | **12-15 j**. Mon estimation sous-évaluait l'enregistrement sur Android et la constitution d'un corpus. |
| Coût WhatsApp | ≈ 24 $/mois (0,004 $/message) | 23-113 $/mois (0,004 à 0,02 $) | Le tarif utilitaire de 0,004 $ est le plus cité ; Codex garde une marge prudente. Prévoir **25 à 50 $/mois**, à confirmer sur la grille Meta. |
| Moteur pour la voix | Gemini (transcription et compréhension en un appel) | Transcription OpenAI, puis extraction | À **tester sur les mêmes enregistrements**. Gemini a l'avantage d'être déjà en place (clé, contrat). |
| Démarches Meta | À lancer **tout de suite**, en parallèle | 1 à 3 semaines à prévoir | Lancer tôt : c'est le délai le plus long et il ne dépend pas de nous. |

### Ce que Codex a vu et pas moi

- **Doublons d'e-mails possibles** : la clé d'idempotence n'est pas appliquée (vérifié). À corriger de toute façon, WhatsApp ou non.
- **Loi togolaise n° 2019-014** sur les données personnelles, avec ses règles de transfert vers l'étranger : le consentement WhatsApp ne suffit pas. Avant un pilote réel, il faut vérifier les formalités auprès de l'IPDCP ou d'un conseil local.
- **Modèle Gemini 2.5** : Google en restreint l'accès aux comptes qui l'utilisent déjà. Il faut rendre le modèle configurable.
- **Défauts de l'OCR actuel** : pas de compression, pas de contrôle serveur de la taille, une TVA absente traitée comme zéro, pas de contrôle « HT + TVA = TTC ».
- **Fournisseurs spécialisés en éwé** : Khaya AI et Sunbird, sur devis.
- **Indicateurs de réussite** : au moins 95 % de montants justes, temps de saisie réduit d'au moins 30 %, moins de 10 % d'abandons.

### Ce que j'ai vu et pas Codex

- **Pas de numéro de téléphone dans les profils** : c'est le premier prérequis de WhatsApp.
- **Pas de saisie par photo d'une dépense de trésorerie** : c'est le cas le plus fréquent sur le terrain.
- **Volume réel aujourd'hui** : 6 sociétés, 10 comptes, 18 e-mails en 30 jours. Les coûts actuels sont négligeables.
- **L'anomalie 36 est déjà en ligne** (`ocr-facture` v6). Codex la croyait « à déployer » d'après la fiche, qui n'était pas à jour.

### Conclusion commune

1. **Vous, tout de suite** : ouvrir le compte Meta Business au nom d'EBENE SERVICES et réserver un numéro dédié. Vérifier avec un conseil les formalités prévues par la loi 2019-014.
2. **Développement, première étape (8-12 j)** : la photo des reçus de dépense, sur le plan de Codex :
   - un corpus d'une centaine de vrais reçus ;
   - une image compressée ;
   - un brouillon à confirmer ;
   - des contrôles de montants ;
   - une reprise sans doublon.
3. **Ensuite (12-16 j)** : une file d'envoi commune avec anti-doublon, qui corrige aussi l'e-mail, puis WhatsApp pour les quatre envois.
4. **Enfin** : un essai de la voix en français avec quelques agents, en comparant Gemini et OpenAI sur les mêmes enregistrements.

Effort total estimé : **environ 32 à 43 jours de développement**, étalés selon vos priorités.
