// Fenêtre de réservation : semaine courante + 2 semaines à l'avance max.
export const SEMAINE_MAX_OFFSET = 2;

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
