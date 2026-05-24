import type { CompteComptable, LigneEcriture, TypeOperationGuide, CodeJournal } from "@/types/ebene";

/**
 * Plan comptable SYSCOHADA révisé — Classes 1 à 8.
 * Source: Acte Uniforme OHADA relatif au droit comptable et à la comptabilité des entreprises.
 * Seuls les comptes les plus couramment utilisés par les PME togolaises sont listés ici.
 * Les entreprises peuvent créer des subdivisions supplémentaires selon leurs besoins.
 */
export const PLAN_COMPTABLE: CompteComptable[] = [
  // ─── CLASSE 1 : RESSOURCES DURABLES ────────────────────────────────────────
  { code: "10",   intitule: "Capital",                                              classe: 1, sens: "credit", racine: true },
  { code: "101",  intitule: "Capital social",                                       classe: 1, sens: "credit", racine: true },
  { code: "1013", intitule: "Capital souscrit, appelé, versé, non amorti",          classe: 1, sens: "credit" },
  { code: "11",   intitule: "Réserves",                                             classe: 1, sens: "credit", racine: true },
  { code: "111",  intitule: "Réserve légale",                                       classe: 1, sens: "credit" },
  { code: "118",  intitule: "Autres réserves",                                      classe: 1, sens: "credit" },
  { code: "12",   intitule: "Report à nouveau",                                     classe: 1, sens: "credit", racine: true },
  { code: "121",  intitule: "Report à nouveau créditeur",                           classe: 1, sens: "credit" },
  { code: "129",  intitule: "Report à nouveau débiteur",                            classe: 1, sens: "debit" },
  { code: "13",   intitule: "Résultat net de l'exercice",                           classe: 1, sens: "credit", racine: true },
  { code: "131",  intitule: "Résultat net : bénéfice",                              classe: 1, sens: "credit" },
  { code: "139",  intitule: "Résultat net : perte",                                 classe: 1, sens: "debit" },
  { code: "16",   intitule: "Emprunts et dettes assimilées",                        classe: 1, sens: "credit", racine: true },
  { code: "162",  intitule: "Emprunts et dettes auprès des établissements de crédit", classe: 1, sens: "credit" },
  { code: "165",  intitule: "Dépôts et cautionnements reçus",                      classe: 1, sens: "credit" },
  { code: "19",   intitule: "Provisions financières pour risques et charges",       classe: 1, sens: "credit", racine: true },
  { code: "191",  intitule: "Provisions pour litiges",                              classe: 1, sens: "credit" },

  // ─── CLASSE 2 : ACTIF IMMOBILISÉ ───────────────────────────────────────────
  { code: "21",   intitule: "Immobilisations incorporelles",                        classe: 2, sens: "debit", racine: true },
  { code: "211",  intitule: "Frais de recherche et de développement",               classe: 2, sens: "debit" },
  { code: "212",  intitule: "Brevets, licences, concessions et droits similaires",  classe: 2, sens: "debit" },
  { code: "213",  intitule: "Logiciels",                                            classe: 2, sens: "debit" },
  { code: "215",  intitule: "Fonds commercial",                                     classe: 2, sens: "debit" },
  { code: "22",   intitule: "Terrains",                                             classe: 2, sens: "debit", racine: true },
  { code: "221",  intitule: "Terrains agricoles et forestiers",                     classe: 2, sens: "debit" },
  { code: "222",  intitule: "Terrains nus",                                         classe: 2, sens: "debit" },
  { code: "223",  intitule: "Terrains bâtis",                                       classe: 2, sens: "debit" },
  { code: "23",   intitule: "Bâtiments, installations techniques et agencements",   classe: 2, sens: "debit", racine: true },
  { code: "231",  intitule: "Bâtiments industriels, agricoles, administratifs sur sol propre", classe: 2, sens: "debit" },
  { code: "232",  intitule: "Bâtiments sur sol d'autrui",                           classe: 2, sens: "debit" },
  { code: "234",  intitule: "Installations techniques",                             classe: 2, sens: "debit" },
  { code: "235",  intitule: "Aménagements de bureaux",                              classe: 2, sens: "debit" },
  { code: "24",   intitule: "Matériel",                                             classe: 2, sens: "debit", racine: true },
  { code: "241",  intitule: "Matériel et outillage industriel et commercial",       classe: 2, sens: "debit" },
  { code: "244",  intitule: "Matériel et mobilier",                                 classe: 2, sens: "debit", racine: true },
  { code: "2441", intitule: "Matériel de bureau",                                   classe: 2, sens: "debit" },
  { code: "2442", intitule: "Matériel informatique",                                classe: 2, sens: "debit" },
  { code: "2443", intitule: "Matériel bureautique",                                 classe: 2, sens: "debit" },
  { code: "2444", intitule: "Mobilier de bureau",                                   classe: 2, sens: "debit" },
  { code: "245",  intitule: "Matériel de transport",                                classe: 2, sens: "debit", racine: true },
  { code: "2451", intitule: "Matériel automobile",                                  classe: 2, sens: "debit" },
  { code: "28",   intitule: "Amortissements",                                       classe: 2, sens: "credit", racine: true },
  { code: "281",  intitule: "Amortissements des immobilisations incorporelles",     classe: 2, sens: "credit" },
  { code: "2813", intitule: "Amortissements des logiciels",                         classe: 2, sens: "credit" },
  { code: "283",  intitule: "Amortissements des bâtiments et installations",        classe: 2, sens: "credit" },
  { code: "2831", intitule: "Amortissements des bâtiments sur sol propre",          classe: 2, sens: "credit" },
  { code: "284",  intitule: "Amortissements du matériel",                           classe: 2, sens: "credit", racine: true },
  { code: "2841", intitule: "Amortissements du matériel et outillage industriel",   classe: 2, sens: "credit" },
  { code: "2842", intitule: "Amortissements du matériel informatique",              classe: 2, sens: "credit" },
  { code: "2844", intitule: "Amortissements du matériel et mobilier",               classe: 2, sens: "credit" },
  { code: "2845", intitule: "Amortissements du matériel de transport",              classe: 2, sens: "credit" },

  // ─── CLASSE 3 : STOCKS ─────────────────────────────────────────────────────
  { code: "31",   intitule: "Marchandises",                                         classe: 3, sens: "debit", racine: true },
  { code: "311",  intitule: "Marchandises A",                                       classe: 3, sens: "debit" },
  { code: "312",  intitule: "Marchandises B",                                       classe: 3, sens: "debit" },
  { code: "32",   intitule: "Matières premières et fournitures liées",              classe: 3, sens: "debit", racine: true },
  { code: "321",  intitule: "Matières A",                                           classe: 3, sens: "debit" },
  { code: "33",   intitule: "Autres approvisionnements",                            classe: 3, sens: "debit", racine: true },
  { code: "334",  intitule: "Fournitures de bureau",                                classe: 3, sens: "debit" },
  { code: "36",   intitule: "Produits finis",                                       classe: 3, sens: "debit", racine: true },
  { code: "39",   intitule: "Dépréciations des stocks",                             classe: 3, sens: "credit", racine: true },

  // ─── CLASSE 4 : COMPTES DE TIERS ───────────────────────────────────────────
  { code: "40",   intitule: "Fournisseurs et comptes rattachés",                    classe: 4, sens: "credit", racine: true },
  { code: "401",  intitule: "Fournisseurs, dettes en compte",                       classe: 4, sens: "credit", racine: true },
  { code: "4011", intitule: "Fournisseurs",                                         classe: 4, sens: "credit" },
  { code: "4012", intitule: "Fournisseurs Groupe",                                  classe: 4, sens: "credit" },
  { code: "408",  intitule: "Fournisseurs, factures non parvenues",                 classe: 4, sens: "credit" },
  { code: "409",  intitule: "Fournisseurs débiteurs",                               classe: 4, sens: "debit", racine: true },
  { code: "4091", intitule: "Fournisseurs avances et acomptes versés",              classe: 4, sens: "debit" },
  { code: "41",   intitule: "Clients et comptes rattachés",                         classe: 4, sens: "debit", racine: true },
  { code: "411",  intitule: "Clients",                                              classe: 4, sens: "debit", racine: true },
  { code: "4111", intitule: "Clients",                                              classe: 4, sens: "debit" },
  { code: "4112", intitule: "Clients Groupe",                                       classe: 4, sens: "debit" },
  { code: "416",  intitule: "Créances clients litigieuses ou douteuses",            classe: 4, sens: "debit" },
  { code: "419",  intitule: "Clients créditeurs",                                   classe: 4, sens: "credit", racine: true },
  { code: "4191", intitule: "Clients, avances et acomptes reçus",                   classe: 4, sens: "credit" },
  { code: "42",   intitule: "Personnel",                                            classe: 4, sens: "credit", racine: true },
  { code: "421",  intitule: "Personnel, avances et acomptes",                       classe: 4, sens: "debit" },
  { code: "422",  intitule: "Personnel, rémunérations dues",                        classe: 4, sens: "credit" },
  { code: "43",   intitule: "Organismes sociaux",                                   classe: 4, sens: "credit", racine: true },
  { code: "431",  intitule: "Sécurité sociale (CNSS)",                              classe: 4, sens: "credit" },
  { code: "433",  intitule: "Autres organismes sociaux (AMU)",                      classe: 4, sens: "credit" },
  { code: "44",   intitule: "État et collectivités publiques",                      classe: 4, sens: "credit", racine: true },
  { code: "441",  intitule: "État, impôt sur les bénéfices (IS)",                   classe: 4, sens: "credit" },
  { code: "442",  intitule: "État, autres impôts et taxes",                         classe: 4, sens: "credit" },
  { code: "443",  intitule: "État, TVA facturée",                                   classe: 4, sens: "credit", racine: true },
  { code: "4431", intitule: "TVA facturée sur ventes",                              classe: 4, sens: "credit" },
  { code: "4432", intitule: "TVA facturée sur prestations de services",             classe: 4, sens: "credit" },
  { code: "444",  intitule: "État, TVA due ou crédit de TVA",                       classe: 4, sens: "credit", racine: true },
  { code: "4441", intitule: "État, TVA due",                                        classe: 4, sens: "credit" },
  { code: "4449", intitule: "État, crédit de TVA à reporter",                       classe: 4, sens: "debit" },
  { code: "445",  intitule: "État, TVA récupérable",                                classe: 4, sens: "debit", racine: true },
  { code: "4451", intitule: "TVA récupérable sur immobilisations",                  classe: 4, sens: "debit" },
  { code: "4452", intitule: "TVA récupérable sur achats",                           classe: 4, sens: "debit" },
  { code: "4454", intitule: "TVA récupérable sur services extérieurs",              classe: 4, sens: "debit" },
  { code: "447",  intitule: "État, impôts retenus à la source (IRPP)",              classe: 4, sens: "credit" },
  { code: "449",  intitule: "État, créances et dettes diverses",                    classe: 4, sens: "credit", racine: true },
  { code: "476",  intitule: "Charges constatées d'avance",                          classe: 4, sens: "debit" },
  { code: "477",  intitule: "Produits constatés d'avance",                          classe: 4, sens: "credit" },
  { code: "491",  intitule: "Dépréciations des comptes clients",                    classe: 4, sens: "credit" },

  // ─── CLASSE 5 : TRÉSORERIE ─────────────────────────────────────────────────
  { code: "52",   intitule: "Banques",                                              classe: 5, sens: "debit", racine: true },
  { code: "521",  intitule: "Banques locales",                                      classe: 5, sens: "debit", racine: true },
  { code: "5211", intitule: "Banque principale (BOA / BICIAB / Ecobank...)",        classe: 5, sens: "debit" },
  { code: "5212", intitule: "Banque secondaire",                                    classe: 5, sens: "debit" },
  { code: "57",   intitule: "Caisse",                                               classe: 5, sens: "debit", racine: true },
  { code: "571",  intitule: "Caisse siège social",                                  classe: 5, sens: "debit" },
  { code: "5711", intitule: "Caisse (FCFA)",                                        classe: 5, sens: "debit" },

  // ─── CLASSE 6 : CHARGES ────────────────────────────────────────────────────
  { code: "60",   intitule: "Achats et variations de stocks",                       classe: 6, sens: "debit", racine: true },
  { code: "601",  intitule: "Achats de marchandises",                               classe: 6, sens: "debit" },
  { code: "602",  intitule: "Achats de matières premières et fournitures liées",    classe: 6, sens: "debit" },
  { code: "604",  intitule: "Achats stockés de matières et fournitures consommables", classe: 6, sens: "debit", racine: true },
  { code: "6041", intitule: "Matières consommables",                                classe: 6, sens: "debit" },
  { code: "6047", intitule: "Fournitures de bureau",                                classe: 6, sens: "debit" },
  { code: "605",  intitule: "Autres achats",                                        classe: 6, sens: "debit", racine: true },
  { code: "6051", intitule: "Fournitures non stockables - Eau",                     classe: 6, sens: "debit" },
  { code: "6052", intitule: "Fournitures non stockables - Électricité",             classe: 6, sens: "debit" },
  { code: "6055", intitule: "Fournitures de bureau non stockables",                 classe: 6, sens: "debit" },
  { code: "6056", intitule: "Achats de petit matériel et outillage",                classe: 6, sens: "debit" },
  { code: "6057", intitule: "Achats d'études et prestations de services",           classe: 6, sens: "debit" },
  { code: "61",   intitule: "Transports",                                           classe: 6, sens: "debit", racine: true },
  { code: "611",  intitule: "Transports sur achats",                                classe: 6, sens: "debit" },
  { code: "612",  intitule: "Transports sur ventes",                                classe: 6, sens: "debit" },
  { code: "614",  intitule: "Transports du personnel",                              classe: 6, sens: "debit" },
  { code: "618",  intitule: "Autres frais de transport",                            classe: 6, sens: "debit" },
  { code: "6181", intitule: "Voyages et déplacements",                              classe: 6, sens: "debit" },
  { code: "62",   intitule: "Services extérieurs A",                                classe: 6, sens: "debit", racine: true },
  { code: "622",  intitule: "Locations et charges locatives",                       classe: 6, sens: "debit" },
  { code: "6222", intitule: "Locations de bâtiments",                               classe: 6, sens: "debit" },
  { code: "624",  intitule: "Entretien, réparations et maintenance",                classe: 6, sens: "debit" },
  { code: "625",  intitule: "Primes d'assurance",                                   classe: 6, sens: "debit" },
  { code: "627",  intitule: "Publicité, publications, relations publiques",         classe: 6, sens: "debit" },
  { code: "628",  intitule: "Frais de télécommunications",                          classe: 6, sens: "debit" },
  { code: "6281", intitule: "Frais de téléphone",                                   classe: 6, sens: "debit" },
  { code: "63",   intitule: "Services extérieurs B",                                classe: 6, sens: "debit", racine: true },
  { code: "631",  intitule: "Frais bancaires",                                      classe: 6, sens: "debit" },
  { code: "632",  intitule: "Rémunérations d'intermédiaires et de conseils",        classe: 6, sens: "debit" },
  { code: "6324", intitule: "Honoraires",                                           classe: 6, sens: "debit" },
  { code: "633",  intitule: "Frais de formation du personnel",                      classe: 6, sens: "debit" },
  { code: "634",  intitule: "Redevances pour brevets, licences, logiciels",         classe: 6, sens: "debit" },
  { code: "638",  intitule: "Autres charges externes",                              classe: 6, sens: "debit" },
  { code: "64",   intitule: "Impôts et taxes",                                      classe: 6, sens: "debit", racine: true },
  { code: "641",  intitule: "Impôts et taxes directs",                              classe: 6, sens: "debit" },
  { code: "6412", intitule: "Patentes, licences et taxes annexes",                  classe: 6, sens: "debit" },
  { code: "647",  intitule: "Pénalités et amendes fiscales",                        classe: 6, sens: "debit" },
  { code: "65",   intitule: "Autres charges",                                       classe: 6, sens: "debit", racine: true },
  { code: "658",  intitule: "Charges diverses",                                     classe: 6, sens: "debit" },
  { code: "6581", intitule: "Jetons de présence",                                   classe: 6, sens: "debit" },
  { code: "6582", intitule: "Dons",                                                 classe: 6, sens: "debit" },
  { code: "66",   intitule: "Charges de personnel",                                 classe: 6, sens: "debit", racine: true },
  { code: "661",  intitule: "Rémunérations directes versées au personnel national", classe: 6, sens: "debit", racine: true },
  { code: "6611", intitule: "Appointements, salaires et commissions",               classe: 6, sens: "debit" },
  { code: "6612", intitule: "Primes et gratifications",                             classe: 6, sens: "debit" },
  { code: "6613", intitule: "Congés payés",                                         classe: 6, sens: "debit" },
  { code: "6614", intitule: "Indemnités de préavis, de licenciement",               classe: 6, sens: "debit" },
  { code: "663",  intitule: "Indemnités forfaitaires versées au personnel",         classe: 6, sens: "debit" },
  { code: "6631", intitule: "Indemnités de logement",                               classe: 6, sens: "debit" },
  { code: "6632", intitule: "Indemnités de représentation",                         classe: 6, sens: "debit" },
  { code: "664",  intitule: "Charges sociales",                                     classe: 6, sens: "debit", racine: true },
  { code: "6641", intitule: "Charges sociales sur rémunération du personnel national", classe: 6, sens: "debit" },
  { code: "67",   intitule: "Frais financiers et charges assimilées",               classe: 6, sens: "debit", racine: true },
  { code: "671",  intitule: "Intérêts des emprunts",                                classe: 6, sens: "debit" },
  { code: "676",  intitule: "Pertes de change",                                     classe: 6, sens: "debit" },
  { code: "68",   intitule: "Dotations aux amortissements",                         classe: 6, sens: "debit", racine: true },
  { code: "681",  intitule: "Dotations aux amortissements d'exploitation",          classe: 6, sens: "debit", racine: true },
  { code: "6812", intitule: "Dotations aux amortissements des immobilisations incorporelles", classe: 6, sens: "debit" },
  { code: "6813", intitule: "Dotations aux amortissements des immobilisations corporelles",  classe: 6, sens: "debit" },
  { code: "69",   intitule: "Dotations aux provisions",                             classe: 6, sens: "debit", racine: true },
  { code: "691",  intitule: "Dotations aux provisions d'exploitation",              classe: 6, sens: "debit" },

  // ─── CLASSE 7 : PRODUITS ───────────────────────────────────────────────────
  { code: "70",   intitule: "Ventes",                                               classe: 7, sens: "credit", racine: true },
  { code: "701",  intitule: "Ventes de marchandises",                               classe: 7, sens: "credit" },
  { code: "702",  intitule: "Ventes de produits finis",                             classe: 7, sens: "credit" },
  { code: "705",  intitule: "Travaux facturés",                                     classe: 7, sens: "credit" },
  { code: "706",  intitule: "Services vendus",                                      classe: 7, sens: "credit" },
  { code: "707",  intitule: "Produits accessoires",                                 classe: 7, sens: "credit", racine: true },
  { code: "7071", intitule: "Ports, emballages perdus et autres frais facturés",    classe: 7, sens: "credit" },
  { code: "7073", intitule: "Locations",                                            classe: 7, sens: "credit" },
  { code: "7076", intitule: "Redevances pour brevets, logiciels, marques",          classe: 7, sens: "credit" },
  { code: "71",   intitule: "Subventions d'exploitation",                           classe: 7, sens: "credit", racine: true },
  { code: "75",   intitule: "Autres produits",                                      classe: 7, sens: "credit", racine: true },
  { code: "754",  intitule: "Produits des cessions courantes d'immobilisations",    classe: 7, sens: "credit" },
  { code: "758",  intitule: "Produits divers",                                      classe: 7, sens: "credit" },
  { code: "759",  intitule: "Reprises de charges provisionnées d'exploitation",     classe: 7, sens: "credit" },
  { code: "77",   intitule: "Revenus financiers et produits assimilés",             classe: 7, sens: "credit", racine: true },
  { code: "771",  intitule: "Intérêts de prêts",                                    classe: 7, sens: "credit" },
  { code: "776",  intitule: "Gains de change",                                      classe: 7, sens: "credit" },
  { code: "779",  intitule: "Reprises de charges provisionnées financières",        classe: 7, sens: "credit" },
  { code: "79",   intitule: "Reprises de provisions",                               classe: 7, sens: "credit", racine: true },
  { code: "791",  intitule: "Reprises de provisions d'exploitation",                classe: 7, sens: "credit" },

  // ─── CLASSE 8 : CHARGES ET PRODUITS HAO ────────────────────────────────────
  { code: "81",   intitule: "Valeurs comptables des cessions d'immobilisations",    classe: 8, sens: "debit", racine: true },
  { code: "811",  intitule: "VNC cessions — Immobilisations incorporelles",         classe: 8, sens: "debit" },
  { code: "812",  intitule: "VNC cessions — Immobilisations corporelles",           classe: 8, sens: "debit" },
  { code: "82",   intitule: "Produits des cessions d'immobilisations",              classe: 8, sens: "credit", racine: true },
  { code: "821",  intitule: "Produits de cessions — Immobilisations incorporelles", classe: 8, sens: "credit" },
  { code: "822",  intitule: "Produits de cessions — Immobilisations corporelles",   classe: 8, sens: "credit" },
  { code: "83",   intitule: "Charges hors activités ordinaires",                    classe: 8, sens: "debit", racine: true },
  { code: "831",  intitule: "Charges HAO constatées",                               classe: 8, sens: "debit" },
  { code: "84",   intitule: "Produits hors activités ordinaires",                   classe: 8, sens: "credit", racine: true },
  { code: "841",  intitule: "Produits HAO constatés",                               classe: 8, sens: "credit" },
  { code: "89",   intitule: "Impôts sur le résultat",                               classe: 8, sens: "debit", racine: true },
  { code: "891",  intitule: "Impôts sur les bénéfices de l'exercice (IS)",          classe: 8, sens: "debit" },
  { code: "895",  intitule: "Impôt minimum forfaitaire (IMF)",                      classe: 8, sens: "debit" },
];

// ─── Fonctions utilitaires ────────────────────────────────────────────────────

/** Recherche un compte par son code exact. */
export function getCompte(code: string): CompteComptable | undefined {
  return PLAN_COMPTABLE.find((c) => c.code === code);
}

/**
 * Recherche des comptes par préfixe de code ou mot dans l'intitulé.
 * Exclut les comptes racines (non saisissables directement).
 */
export function rechercherComptes(query: string, limit = 20): CompteComptable[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PLAN_COMPTABLE
    .filter(
      (c) =>
        !c.racine &&
        (c.code.startsWith(q) || c.intitule.toLowerCase().includes(q)),
    )
    .slice(0, limit);
}

/** Retourne tous les comptes d'une classe donnée (1 à 8). */
export function getComptesByClasse(classe: number): CompteComptable[] {
  return PLAN_COMPTABLE.filter((c) => c.classe === classe);
}

/**
 * Vérifie si une écriture est équilibrée (Σ débits = Σ crédits).
 * Tolère un écart < 0,01 FCFA pour les arrondis.
 */
export function isEcritureEquilibree(
  lignes: Array<{ debit: number; credit: number }>,
): boolean {
  const totalDebit = lignes.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (l.credit || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}

/**
 * Génère automatiquement les lignes d'écriture pour une opération guidée.
 *
 * L'utilisateur choisit le type d'opération en langage courant ;
 * la fonction retourne les lignes SYSCOHADA correctes (comptes, sens, montants).
 *
 * ⚠️ Pour `charge_salaires`, utiliser directement les données du bulletin de paie —
 * cette opération est trop complexe pour être générée depuis un simple montantHT.
 */
export function genererLignesEcriture(
  type: TypeOperationGuide,
  params: {
    /** Montant hors taxes (FCFA). */
    montantHT: number;
    /** Taux de TVA (ex: 0.18). Par défaut : 0.18. */
    tva?: number;
    /** L'opération est-elle soumise à TVA ? Par défaut : true. */
    avecTva?: boolean;
    /** Nom du tiers (client ou fournisseur). */
    tiers?: string;
    /** Code du compte banque à utiliser. Par défaut : "5211". */
    compteBank?: string;
  },
): LigneEcriture[] {
  const {
    montantHT,
    tva = 0.18,
    avecTva = true,
    tiers = "",
    compteBank = "5211",
  } = params;

  const montantTVA = avecTva ? Math.round(montantHT * tva) : 0;
  const montantTTC = montantHT + montantTVA;
  const bankLabel = getCompte(compteBank)?.intitule ?? "Banque";

  let seq = 1;
  const L = (
    compte: string,
    intitule: string,
    debit: number,
    credit: number,
    tiersTxt?: string,
  ): LigneEcriture => ({
    id: seq++,
    compte,
    intitule,
    debit,
    credit,
    tiers: tiersTxt,
  });

  switch (type) {
    // ── Ventes ──────────────────────────────────────────────────────────────
    case "vente_marchandises":
      return avecTva
        ? [
            L("4111", "Clients",                       montantTTC, 0,          tiers),
            L("701",  "Ventes de marchandises",         0,          montantHT),
            L("4431", "TVA facturée sur ventes",        0,          montantTVA),
          ]
        : [
            L("4111", "Clients",                       montantHT,  0,          tiers),
            L("701",  "Ventes de marchandises",         0,          montantHT),
          ];

    case "vente_services":
      return avecTva
        ? [
            L("4111", "Clients",                            montantTTC, 0,          tiers),
            L("706",  "Services vendus",                    0,          montantHT),
            L("4432", "TVA facturée sur prestations",       0,          montantTVA),
          ]
        : [
            L("4111", "Clients",                            montantHT,  0,          tiers),
            L("706",  "Services vendus",                    0,          montantHT),
          ];

    // ── Achats ──────────────────────────────────────────────────────────────
    case "achat_marchandises":
      return avecTva
        ? [
            L("601",  "Achats de marchandises",             montantHT,  0),
            L("4452", "TVA récupérable sur achats",         montantTVA, 0),
            L("4011", "Fournisseurs",                       0,          montantTTC, tiers),
          ]
        : [
            L("601",  "Achats de marchandises",             montantHT,  0),
            L("4011", "Fournisseurs",                       0,          montantHT,  tiers),
          ];

    case "achat_fournitures":
      return avecTva
        ? [
            L("6047", "Fournitures de bureau",              montantHT,  0),
            L("4452", "TVA récupérable sur achats",         montantTVA, 0),
            L("4011", "Fournisseurs",                       0,          montantTTC, tiers),
          ]
        : [
            L("6047", "Fournitures de bureau",              montantHT,  0),
            L("4011", "Fournisseurs",                       0,          montantHT,  tiers),
          ];

    case "achat_service":
      return avecTva
        ? [
            L("6324", "Honoraires / Services extérieurs",  montantHT,  0),
            L("4454", "TVA récupérable sur services",       montantTVA, 0),
            L("4011", "Fournisseurs",                       0,          montantTTC, tiers),
          ]
        : [
            L("6324", "Honoraires / Services extérieurs",  montantHT,  0),
            L("4011", "Fournisseurs",                       0,          montantHT,  tiers),
          ];

    // ── Trésorerie ──────────────────────────────────────────────────────────
    case "encaissement_client":
      return [
        L(compteBank, bankLabel,  montantHT, 0),
        L("4111",     "Clients",  0,         montantHT, tiers),
      ];

    case "paiement_fournisseur":
      return [
        L("4011",     "Fournisseurs", montantHT, 0,         tiers),
        L(compteBank, bankLabel,      0,         montantHT),
      ];

    // ── Charges courantes ────────────────────────────────────────────────────
    case "charge_loyer":
      return avecTva
        ? [
            L("6222",     "Locations de bâtiments",        montantHT,  0),
            L("4452",     "TVA récupérable sur services",  montantTVA, 0),
            L(compteBank, bankLabel,                       0,          montantTTC),
          ]
        : [
            L("6222",     "Locations de bâtiments",        montantHT, 0),
            L(compteBank, bankLabel,                       0,         montantHT),
          ];

    case "charge_telephone":
      return avecTva
        ? [
            L("6281",     "Frais de téléphone",            montantHT,  0),
            L("4452",     "TVA récupérable sur services",  montantTVA, 0),
            L(compteBank, bankLabel,                       0,          montantTTC),
          ]
        : [
            L("6281",     "Frais de téléphone",            montantHT, 0),
            L(compteBank, bankLabel,                       0,         montantHT),
          ];

    case "charge_electricite":
      return avecTva
        ? [
            L("6052",     "Électricité",                   montantHT,  0),
            L("4452",     "TVA récupérable",               montantTVA, 0),
            L(compteBank, bankLabel,                       0,          montantTTC),
          ]
        : [
            L("6052",     "Électricité",                   montantHT, 0),
            L(compteBank, bankLabel,                       0,         montantHT),
          ];

    // ── Clôtures périodiques ─────────────────────────────────────────────────
    case "tva_a_decaisser": {
      // montantHT = total TVA collectée ; params.tva = total TVA déductible (optionnel)
      const tvaDeductible = avecTva ? Math.round(montantHT * tva) : 0;
      const tvaNette = montantHT - tvaDeductible;
      return [
        L("4431", "TVA facturée collectée",    montantHT,    0),
        L("4452", "TVA récupérable",           0,            tvaDeductible),
        L("4441", "État, TVA due",             0,            tvaNette > 0 ? tvaNette : 0),
        ...(tvaNette < 0
          ? [L("4449", "Crédit de TVA à reporter", Math.abs(tvaNette), 0)]
          : []),
      ];
    }

    case "dotation_amortissement":
      return [
        L("6813", "Dotations amortissements — immobilisations corporelles", montantHT, 0),
        L("284",  "Amortissements du matériel",                             0,         montantHT),
      ];

    // ── Opération libre ──────────────────────────────────────────────────────
    case "charge_salaires":
    case "autre":
    default:
      return [];
  }
}

/**
 * Génère un numéro de pièce comptable formaté.
 *
 * Format : `{journal}-{annee}-{sequence sur 4 chiffres}`
 * Exemple : `VE-2025-0042`
 */
export function genererNumeroPiece(
  journal: CodeJournal,
  annee: number,
  sequence: number,
): string {
  return `${journal}-${annee}-${String(sequence).padStart(4, "0")}`;
}
