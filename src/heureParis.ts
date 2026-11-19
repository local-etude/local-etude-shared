/**
 * ── L'HEURE MURALE DE PARIS → INSTANT RÉEL ───────────────────────────────────
 *
 * Une séance est saisie « 2026-11-20 à 17:00 », sans fuseau : c'est l'heure de
 * l'agence. Ce module la convertit en instant réel, quel que soit le fuseau de la
 * machine — le serveur Vercel tourne en UTC, le téléphone du parent dans le sien.
 *
 * Avant le lot L2, `minutesAvantSeance` reconstruisait la séance à l'heure DE
 * L'APPAREIL (`new Date(y, m-1, d, h, min)`) : un parent en vacances à une heure
 * de décalage voyait la frontière des 2 h ou des 18 h glisser d'une heure.
 *
 * Calcul ARITHMÉTIQUE, sans Intl, et c'est voulu : ce paquet tourne aussi dans
 * l'app mobile (moteur Hermes), dont la prise en charge des options d'Intl pour
 * l'heure n'est pas établie. La règle européenne est fixe depuis 1996 : heure
 * d'été (UTC+2) du dernier dimanche de mars, 01:00 UTC, au dernier dimanche
 * d'octobre, 01:00 UTC ; UTC+1 le reste de l'année. Les tests la recoupent heure
 * par heure avec la base de fuseaux de Node (`test-regles-l2.mjs`) : si la règle
 * européenne change un jour, ce recoupement cassera dès que Node l'apprendra.
 */

const MINUTE = 60_000;

/** Le jour du mois du dernier dimanche de ce mois (mois de 0 à 11). */
function dernierDimanche(annee: number, mois0: number): number {
  const dernierJour = new Date(Date.UTC(annee, mois0 + 1, 0));
  return dernierJour.getUTCDate() - dernierJour.getUTCDay();
}

/** Le décalage de Paris sur UTC, en minutes (60 l'hiver, 120 l'été), à cet instant. */
export function decalageParisMinutes(instantMs: number): 60 | 120 {
  const annee = new Date(instantMs).getUTCFullYear();
  const debutEte = Date.UTC(annee, 2, dernierDimanche(annee, 2), 1);
  const finEte = Date.UTC(annee, 9, dernierDimanche(annee, 9), 1);
  return instantMs >= debutEte && instantMs < finEte ? 120 : 60;
}

/**
 * L'instant (millisecondes depuis l'époque) d'une heure murale de Paris.
 *
 * `dateISO` : AAAA-MM-JJ (seuls les 10 premiers caractères sont lus) ;
 * `heure` : HH:MM ou HH:MM:SS (les secondes sont ignorées).
 *
 * Les deux heures qui n'ont pas une seule lecture — aucune séance n'y a lieu,
 * mais la fonction doit répondre quelque chose de défini :
 *  · la nuit du passage à l'heure d'HIVER, 02:00-02:59 existe deux fois : on
 *    retient la PREMIÈRE (encore à l'heure d'été) ;
 *  · la nuit du passage à l'heure d'ÉTÉ, 02:00-02:59 n'existe pas : on la lit
 *    à l'heure d'hiver, ce qui la place à 03:00-03:59 heure d'été.
 */
export function instantParis(dateISO: string, heure: string): number {
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  const [h, min] = heure.split(":").map(Number);
  const naif = Date.UTC(y, m - 1, d, h, min);
  const lectureEte = naif - 120 * MINUTE;
  if (decalageParisMinutes(lectureEte) === 120) return lectureEte;
  return naif - 60 * MINUTE;
}

/** La date d'un jour civil décalée de `jours` (négatif accepté), au format AAAA-MM-JJ. */
export function ajouterJoursISO(dateISO: string, jours: number): string {
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + jours)).toISOString().slice(0, 10);
}
