/**
 * L'HORIZON DE RÉSERVATION — 14 jours calendaires, bornes incluses.
 *
 * « Un parent peut réserver toute séance dont la date est comprise entre
 * aujourd'hui et aujourd'hui + 14 jours inclus. » Décision de Stephen du
 * 22/09/2026, écrite en section 7 de REFERENCE.
 *
 * ⚠️ REMPLACE `SEMAINE_MAX_OFFSET = 2` (semaine courante + 2 semaines CIVILES),
 * retiré le 22/09/2026. L'ancienne borne donnait une fenêtre GLISSANTE de J+14 à
 * J+20 selon le jour du clic : un lundi, le parent réservait jusqu'à J+20 ; un
 * dimanche, jusqu'à J+14. Personne ne s'en apercevait parce que la règle des
 * 14 jours n'était écrite NULLE PART — ni REFERENCE, ni ETAT, ni CGV — elle ne
 * vivait que dans cette constante. Constaté le 22/09/2026 sur trois Visio posées
 * à J+17 (HISTORIQUE 16.316).
 *
 * ⚠️ Cette borne est aussi posée EN BASE, dans `check_eligibilite_forfait`
 * (migration 20260922). Les deux doivent rester d'accord. Celle-ci décide de ce
 * qu'on PROPOSE, celle de la base de ce qu'on ACCEPTE — et c'est la seule des
 * deux qui protège l'app mobile déjà installée, qui n'a pas d'OTA.
 *
 * Les séances à DOMICILE ne sont pas concernées : leur horizon relève des droits
 * ouverts au foyer, pas du planning (voir `reserver_intervention_domicile`).
 */
export const HORIZON_JOURS = 14;

/**
 * La date civile de Paris, quelle que soit l'horloge de la machine.
 *
 * Cette fonction tourne à DEUX endroits très différents : sur le serveur Vercel,
 * réglé en UTC, et sur le téléphone du parent, réglé sur son propre fuseau. Sans
 * cet ancrage, « aujourd'hui » n'a pas le même sens des deux côtés et la fenêtre
 * recule d'un jour entre minuit et 2 h du matin (heure de Paris). Le procédé —
 * `en-CA` rend AAAA-MM-JJ — est celui déjà en service dans DashboardScreen
 * (mobile) et parisTodayISO (web).
 */
function dateCivileParis(): { annee: number; mois: number; jour: number } {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const [annee, mois, jour] = iso.split("-").map(Number);
  return { annee, mois, jour };
}

function versISO(d: Date): string {
  // Reconstruit depuis les composantes LOCALES. Passer par toISOString() ferait
  // repasser la date en UTC et lui ferait perdre un jour en soirée.
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Les bornes de la semaine affichée au parent : du lundi au DIMANCHE inclus.
 *
 * ⚠️ LE DIMANCHE EST DANS LA FENÊTRE (correctif du 12 août 2026). Elle s'arrêtait
 * au samedi (`lundi + 5`), alors que le planning ADMIN, qui portait sa propre
 * copie de ce calcul, allait jusqu'au dimanche. Conséquence : un créneau créé un
 * dimanche était parfaitement visible côté administration et invisible pour
 * TOUTES les familles — le filtre serveur de /reserver le coupait avant même le
 * rendu. Trouvé le 12 août par Stephen, en direct, sur le téléphone d'une cliente
 * qui cherchait ses Visio du dimanche 16 août.
 *
 * La leçon vaut au-delà de ce défaut : deux calculs de la même règle finissent
 * toujours par diverger. Celui-ci est désormais le SEUL — l'écran admin le
 * consomme comme les autres.
 *
 * ⚠️ Élargir la fenêtre n'ouvre RIEN par soi-même : on n'affiche jamais que les
 * créneaux réellement créés. Une semaine sans séance le dimanche s'affiche donc
 * exactement comme avant, les écrans masquant le dimanche vide.
 */
export function getSemaineLimites(offset = 0): { lundi: string; dimanche: string } {
  const { annee, mois, jour } = dateCivileParis();
  // Minuit local sur la date civile de Paris : le jour de la semaine qu'on en
  // tire est le bon quel que soit le fuseau de la machine.
  const jourSemaine = new Date(annee, mois - 1, jour).getDay(); // 0 = dimanche
  // Le dimanche appartient à la semaine ouverte le lundi PRÉCÉDENT (norme ISO),
  // d'où -6 et non +1.
  const versLundi = jourSemaine === 0 ? -6 : 1 - jourSemaine;
  const depart = jour + versLundi + offset * 7;
  return {
    lundi: versISO(new Date(annee, mois - 1, depart)),
    dimanche: versISO(new Date(annee, mois - 1, depart + 6)),
  };
}

/** La date civile de Paris, au format AAAA-MM-JJ. C'est le « aujourd'hui » de la règle. */
export function parisAujourdhuiISO(): string {
  const { annee, mois, jour } = dateCivileParis();
  return versISO(new Date(annee, mois - 1, jour));
}

/**
 * Les deux bornes de l'horizon, INCLUSES : d'aujourd'hui à aujourd'hui + 14 jours.
 *
 * Calendrier de Paris des deux côtés. Le calcul passe par `new Date(annee, mois-1,
 * jour + 14)` : JavaScript reporte le débordement de mois et d'année tout seul, et
 * les composantes restent LOCALES — aucun passage par UTC, donc aucun décalage d'un
 * jour au changement d'heure.
 */
export function getHorizonReservation(): { premierJour: string; dernierJour: string } {
  const { annee, mois, jour } = dateCivileParis();
  return {
    premierJour: versISO(new Date(annee, mois - 1, jour)),
    dernierJour: versISO(new Date(annee, mois - 1, jour + HORIZON_JOURS)),
  };
}

/**
 * La date d'une séance est-elle réservable aujourd'hui ?
 *
 * `dateISO` est une date de créneau (`creneaux.date`), au format AAAA-MM-JJ. La
 * comparaison est textuelle : ce format se range dans l'ordre chronologique, ce
 * qui évite de refabriquer deux objets Date à chaque appel.
 *
 * Les deux bornes comptent : une séance d'aujourd'hui passe, une séance de J+14
 * passe, une séance d'hier ou de J+15 ne passe pas. L'heure n'entre pas en ligne
 * de compte — la règle est en jours calendaires, donc une séance de ce matin
 * reste « aujourd'hui » à 20 h.
 */
export function dateDansHorizon(dateISO: string): boolean {
  const { premierJour, dernierJour } = getHorizonReservation();
  // `slice(0, 10)` : le seul appelant passe aujourd'hui `creneaux.date`, une
  // colonne `date` de PostgreSQL, donc toujours AAAA-MM-JJ. Mais un appelant
  // futur qui passerait un instant complet (`toISOString()`) obtiendrait un
  // REFUS SILENCIEUX le dernier jour de la fenêtre — « 2026-10-06T00:00:00Z »
  // est supérieur à « 2026-10-06 » dans l'ordre des chaînes. Sur une règle qui
  // décide d'accepter ou de refuser une réservation, ce genre de refus ne se
  // voit pas : il ressemble à la règle qui s'applique.
  const jour = dateISO.slice(0, 10);
  return jour >= premierJour && jour <= dernierJour;
}

/**
 * Le dernier `offset` de semaine que la navigation doit atteindre — DÉDUIT de
 * l'horizon, jamais posé à la main.
 *
 * Les écrans montrent toujours une semaine entière (lundi → dimanche) : il faut
 * donc savoir jusqu'à quelle semaine avancer. C'est celle qui CONTIENT le dernier
 * jour réservable. Avec 14 jours, la réponse vaut toujours 2 — mais elle vaut 2
 * PARCE QUE l'horizon est de 14 jours, et non l'inverse : porter `HORIZON_JOURS`
 * à 21 déplacera la navigation sans qu'on ait à y toucher.
 *
 * ⚠️ La dernière semaine est TRONQUÉE : elle contient des jours au-delà de
 * l'horizon (tous, sauf si aujourd'hui est un dimanche). Les écrans doivent le
 * DIRE au parent — une colonne muette passerait pour une semaine sans séance.
 */
export function getSemaineMaxOffset(): number {
  const { lundi } = getSemaineLimites(0);
  const { dernierJour } = getHorizonReservation();
  // Les deux dates sont relues en UTC : la soustraction ne traverse alors aucun
  // changement d'heure, et le quotient est un nombre entier de jours exact.
  const jours = Math.round(
    (Date.parse(`${dernierJour}T00:00:00Z`) - Date.parse(`${lundi}T00:00:00Z`)) / 86_400_000
  );
  return Math.max(0, Math.floor(jours / 7));
}
