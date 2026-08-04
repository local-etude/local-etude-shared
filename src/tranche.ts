// ── Article 6.3 CGV — limites de réservation par tranche d'âge (3 tranches) ──
export const TRANCHE_1 = ["CP", "CE1", "CE2"];
export const TRANCHE_2 = ["CM1", "CM2", "6ème", "5ème", "4ème"];
export const TRANCHE_3 = ["3ème", "2nde", "1ère", "Terminale"];

/**
 * Les douze niveaux, DANS L'ORDRE de la scolarité. L'ordre porte une règle : il
 * définit ce qu'est « le niveau suivant » au moment du passage de classe.
 *
 * ⚠️ Cette liste existe en trois autres exemplaires (les deux tunnels
 * d'inscription et la route serveur). Ne jamais les synchroniser par un
 * rechercher-remplacer global : une valeur métier a déjà été écrasée ainsi.
 */
export const NIVEAUX = [
  "CP", "CE1", "CE2", "CM1", "CM2",
  "6ème", "5ème", "4ème", "3ème",
  "2nde", "1ère", "Terminale",
] as const;

/**
 * Le niveau qui suit, ou `null` pour la Terminale.
 *
 * Ce `null` n'est pas un cas d'erreur : c'est le déclencheur naturel de la
 * sortie d'effectif. Un élève qui n'a pas de niveau suivant quitte l'école — et
 * c'est la seule façon de le savoir sans stocker un âge.
 *
 * Renvoie `null` aussi pour un niveau inconnu, plutôt que de deviner. La base
 * l'interdit désormais (contrainte `enfants_niveau_valide`), mais une donnée
 * héritée peut encore en porter un.
 */
export function niveauSuivant(niveau: string): string | null {
  const i = NIVEAUX.indexOf(niveau as (typeof NIVEAUX)[number]);
  if (i < 0 || i === NIVEAUX.length - 1) return null;
  return NIVEAUX[i + 1];
}

/**
 * ⚠️ FAIL-OPEN ASSUMÉ, et c'est un piège à connaître : tout niveau qui n'est ni
 * tranche 1 ni tranche 2 est traité comme TRANCHE 3 — la plus permissive
 * (2 h/jour, Étude Avancée ouverte, 90 min à domicile). Une faute de frappe
 * ouvrait donc des droits.
 *
 * Ce défaut n'est plus atteignable par une saisie : la contrainte
 * `enfants_niveau_valide` (migration 20260812) ferme l'entrée de la donnée. On
 * garde ce comportement plutôt que de le rendre fail-closed, car les six copies
 * de cette dérivation — dont deux en SQL — devraient bouger ensemble, et la
 * moindre divergence refuserait une réservation légitime.
 */
export function tranche(niveau: string): 1 | 2 | 3 {
  if (TRANCHE_1.includes(niveau)) return 1;
  if (TRANCHE_2.includes(niveau)) return 2;
  return 3;
}
