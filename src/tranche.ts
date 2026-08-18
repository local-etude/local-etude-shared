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
 * ── La sortie d'effectif à la rentrée ────────────────────────────────────────
 *
 * Quitte l'école à la rentrée tout élève dont le niveau — celui de l'année qui
 * s'achève — figure ici. Décision Stephen du 17 août 2026 : la Première rejoint
 * la Terminale, parce que les épreuves anticipées de Première marquent le début
 * d'une spécialisation que le soutien généraliste ne peut pas toujours suivre
 * au-delà. Un élève qui vient de finir sa Première n'est donc pas reconduit.
 *
 * ⚠️ Le critère n'est PLUS « pas de niveau suivant » (`niveauSuivant === null`) :
 * un élève de Première A un niveau suivant et sort quand même. Les écrans et
 * routes qui testaient l'absence de suivant consomment désormais CE prédicat —
 * réintroduire le test par `niveauSuivant` laisserait les Première se reconduire.
 *
 * La règle de fratrie ne change pas : si au moins un enfant continue, le foyer
 * est reconduit normalement, au montant plein.
 */
export const NIVEAUX_SORTANTS = ["1ère", "Terminale"] as const;

export function quitteALaRentree(niveau: string): boolean {
  return (NIVEAUX_SORTANTS as readonly string[]).includes(niveau);
}

/**
 * Le niveau seul ne suffit PAS à décider qu'un enfant sort — c'est le piège qui
 * a produit trois bloquants à la revue du 17 août 2026 :
 *
 *  · un enfant déclaré « passe en 1ère » cette année porte niveau=1ère avec
 *    niveau_cycle courant : il ENTRE en Première, il ne la quitte pas. Le
 *    tester sur le niveau nu l'envoyait en sortie — la route répondait 409
 *    « déjà déclaré cette année » et le foyer ne pouvait PLUS JAMAIS payer son
 *    forfait Étude ; côté Malin, il disparaissait de la liste à reconduire et
 *    perdait son forfait ;
 *  · un enfant déjà sorti n'a pas à être re-traité.
 *
 * D'où ce prédicat COMPLET, à consommer par tous les écrans (le serveur
 * applique les mêmes gardes, à sa façon, dans ses deux routes). Chaque
 * plateforme fournit son cycle courant — frontière au 1er juillet, calculée à
 * l'heure de Paris, jamais celle de l'appareil.
 */
export function estSortant(
  e: { niveau: string; niveau_cycle: number | null; sorti_le: string | null },
  cycleCourant: number
): boolean {
  return !e.sorti_le && e.niveau_cycle !== cycleCourant && quitteALaRentree(e.niveau);
}

/**
 * Le niveau qui suit, ou `null` pour la Terminale.
 *
 * ⚠️ Ce `null` n'est PLUS le déclencheur de la sortie d'effectif (il l'a été du
 * 12 au 17 août 2026) : la sortie se teste par `quitteALaRentree`, ci-dessus.
 * Ce qui reste vrai ici : un niveau sans suivant ne peut pas monter.
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
