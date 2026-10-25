# 00 · Cadrage commercial d'Ébène Suite

> **Résumé**
> - **Objectif** : 20 structures qui paient Ébène d'ici fin avril 2027 (6 mois à partir du 25/10/2026).
> - **Moyens** : un fondateur seul, sans horaire fixe, moins de 50 000 FCFA par mois au départ. Le budget augmentera dès les premiers clients.
> - **Point de départ** : un produit qui fonctionne, mais aucun client, aucun prix, aucune structure juridique. Seuls atouts : un nom de domaine et quelques comptables dans le réseau.
> - **Deux blocages à lever avant le premier paiement** : créer une structure pour pouvoir facturer, et sécuriser la question de l'hébergement des données (en Irlande).
> - **Prochain livrable** : `01-diagnostic.md` (marché togolais, concurrents vérifiés, besoins des cibles).

Légende : **[Fait]** vérifié, avec la source · **[Réponse]** donnée par le fondateur le 25/10/2026 · **[Hypothèse]** à tester · **[À vérifier]** information manquante.

---

## 1. Le produit

| Élément | Contenu | Statut |
|---|---|---|
| Nom | Ébène Suite | [Fait] `docs/recette/resume-reprise.md` |
| Promesse actuelle | « Toute votre entreprise au même endroit : facturer, payer, suivre la trésorerie, tenir la comptabilité SYSCOHADA et déclarer, au Togo. » | [Fait] `docs/guide/guide.html` |
| Modules | Facturation et devis, comptabilité SYSCOHADA (journal, grand livre, balance, bilan, liasse fiscale), paie (IRPP Togo, CNSS, congés, primes, heures supplémentaires), stock, immobilisations, lecture des factures par photo | [Fait] code source |
| Multi-société | Plusieurs sociétés dans un même compte, avec des rôles séparés par société | [Fait] code source |
| Supports | Web, Windows et Android | [Fait] |
| Maturité | Version 2.6.1 (24/10/2026), recette complète en cours | [Fait] |
| Utilisateurs actuels | Aucun, même gratuit | [Réponse] |

**Ce qui manque pour vendre** : un module Clients (un client n'est aujourd'hui qu'un nom tapé sur chaque facture), un moyen d'activer ou de couper des modules selon l'abonnement, et un suivi des abonnements et des paiements.

## 2. Objectifs

| Horizon | Objectif | Statut |
|---|---|---|
| 6 mois (fin avril 2027) | 20 structures payantes | [Réponse] |
| Découpage proposé | 3 structures pilotes d'ici fin décembre 2026, 10 payantes fin février 2027, 20 fin avril 2027 | [Hypothèse] |

**Définition** : un « client » est une structure qui paie un abonnement. Un cabinet comptable qui gère 10 sociétés compte pour 1 client, mais pour 10 sociétés dans Ébène.

**Mon avis franc** : 20 clients en 6 mois, seul et avec moins de 50 000 FCFA par mois, est atteignable seulement par la **vente directe** : réseau, démonstrations en personne, comptables prescripteurs. La publicité payante ne suffira pas avec ce budget. Le vrai facteur limitant sera **votre temps**, partagé entre le développement, la vente et le support. C'est une estimation à confirmer par les premiers résultats.

## 3. Moyens

| Ressource | Situation | Statut |
|---|---|---|
| Budget marketing | Moins de 50 000 FCFA par mois, à augmenter si des clients arrivent | [Réponse] |
| Équipe | Le fondateur seul | [Réponse] |
| Temps | Pas d'horaire fixe | [Réponse] |
| Nom de domaine | Oui. Le code utilise `ebnservicess.com` | [Fait] `supabase/functions/send-transactional-email/index.ts`. [À vérifier] : est-ce bien le nom définitif ? Le double « s » peut gêner à l'oral. |
| Site, réseaux sociaux, WhatsApp Business | Non indiqués | [À vérifier] |
| Réseau | Quelques comptables | [Réponse] |

## 4. Marché et cibles

| Élément | Hypothèse de départ | Statut |
|---|---|---|
| Zone | Lomé d'abord, puis le reste du Togo | [Hypothèse] |
| Cible n° 1 | Cabinets comptables et centres de gestion : ils gèrent plusieurs sociétés et utilisent tout ce qu'Ébène sait faire | [Hypothèse] |
| Cible n° 2 | PME de 5 à 50 salariés qui font leur paie et leur comptabilité sur Excel ou à la main | [Hypothèse] |
| Concurrents | Inconnus du fondateur. À étudier : logiciels internationaux, logiciels locaux, Excel, comptable externe, « ne rien faire » | [À vérifier] dans le diagnostic |

## 5. Prix et modèle économique

- **Votre intuition** [Réponse] : un prix progressif, selon les modules que choisit chaque structure.
- **Ma recommandation provisoire** [Hypothèse] : 3 formules au maximum au départ, plutôt qu'un catalogue module par module. Trop de choix ralentit la décision, et chaque formule doit être expliquée en une phrase. Par exemple :
  - **Essentiel** : facturation et trésorerie ;
  - **Gestion** : Essentiel, plus la comptabilité et la paie ;
  - **Cabinet** : plusieurs sociétés.
- **Prix** : aucun montant pour l'instant. Ils seront fixés après le diagnostic, à partir des prix des concurrents (vérifiés et datés) et de ce que diront les pilotes.
- **Paiement** : Flooz, T-Money et virement [Hypothèse], conformément au contexte local du brief.

## 6. Contraintes juridiques et confiance

| Sujet | Constat | Action |
|---|---|---|
| **Structure juridique** | Aucune [Réponse]. Sans structure, vous ne pouvez pas émettre de factures en règle ni signer de contrat d'abonnement. | **Bloquant avant le premier paiement.** Faire valider la forme la plus adaptée (entreprise individuelle, SARL-U…) par un professionnel. Le CFE de Lomé (guichet de création d'entreprises) est le point d'entrée à vérifier. |
| **Hébergement des données** | Base Supabase « EBENE SERVICES », région `eu-west-1`, c'est-à-dire l'Irlande [Fait, console Supabase, 25/10/2026]. Les données des entreprises et de leurs salariés (salaires, identités) sortent donc du Togo. | Voir ci-dessous. |
| **Loi togolaise sur les données** | La loi n° 2019-014 du 29/10/2019 n'autorise un transfert hors du Togo que vers un pays au niveau de protection jugé adéquat, ou avec l'autorisation de l'IPDCP (l'autorité de protection des données), entre autres conditions [Fait : [dataprotection.africa](https://dataprotection.africa/?p=2922), [JO du 29/10/2019](https://www.afapdp.org/wp-content/uploads/2020/02/TOGO-JOS_29_10_2019-64E-ANNEE-N°26-TER.pdf)]. L'IPDCP est en activité depuis le 28/03/2025. | [À vérifier] auprès de l'IPDCP ou d'un juriste : les formalités à remplir (déclaration, autorisation de transfert). |
| **Tendance à surveiller** | En janvier 2026, le président de l'IPDCP a annoncé vouloir « imposer le stockage des données personnelles des Togolais au Togo ». Aucune modalité n'est précisée, et on ne sait pas encore qui sera concerné [Fait : [allAfrica, 31/01/2026](https://fr.allafrica.com/stories/202601310167.html)]. | Risque à suivre : un hébergement local pourrait devenir obligatoire. À intégrer dès maintenant dans l'argumentaire de confiance. |

**Pourquoi c'est un sujet marketing** : les comptables vous demanderont « où sont mes données, qui y a accès, que se passe-t-il si vous disparaissez ? ». Des réponses claires et écrites (hébergement, sauvegardes, export des données, 2FA déjà en place) sont un argument de vente. Des réponses floues font perdre la vente.

## 7. Hypothèses que j'utilise pour avancer

1. Les comptables du réseau acceptent de voir une démonstration et d'en parler à leurs clients.
2. Les PME togolaises acceptent un abonnement mensuel payé par mobile money.
3. La paie (IRPP, CNSS) et la liasse SYSCOHADA sont les deux douleurs qui déclenchent l'achat.
4. Un pilote gratuit de 2 à 3 mois, avec un engagement de retours et de témoignage, est le moyen le plus rapide d'obtenir des preuves.

Chacune sera testée pendant la phase pilote. Le diagnostic précisera comment la mesurer.

## 8. Informations encore manquantes

- [ ] Nom de domaine définitif, et existence éventuelle d'un site ou d'une page sur les réseaux sociaux
- [ ] Nombre exact de comptables dans votre réseau, et leurs noms (à garder hors du dépôt Git, ce sont des données personnelles)
- [ ] Coût actuel d'hébergement et de services (Supabase, e-mails, domaine), pour calculer un prix plancher
- [ ] Votre disponibilité réelle par semaine pour la vente, même approximative

## 9. Prochaine étape

**`01-diagnostic.md`** : le marché des entreprises au Togo, les concurrents et leurs prix (vérifiés, sources datées), les besoins et objections des cabinets et des PME, et un SWOT utile (forces, faiblesses, opportunités, menaces).
