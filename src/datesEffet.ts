/**
 * ── LES DATES D'EFFET DES RÈGLES PLUS STRICTES QUE LA CGV EN VIGUEUR ─────────
 *
 * Plan § 255, principe 0.1 ; lot L1a en production le 16/11/2026. La table
 * `regles_dates_effet` (une ligne par règle, `date_effet` NULL = inactive) est
 * lue par les triggers, le web et le mobile. L'activation d'une règle est un
 * UPDATE d'une ligne en base, sans déploiement ni build mobile.
 *
 * Ce module est le MIROIR de la fonction SQL `regle_active(p_cle, p_date_seance)`
 * (migration 20261115_fondations_garde_urgence.sql). Les deux doivent dire la même
 * chose : la base décide de ce qu'elle ACCEPTE, l'écran de ce qu'il PROPOSE.
 */

/** Les clés semées par la migration L1a. Toute autre clé est inconnue de la base. */
export const CLES_DATES_EFFET = {
  doublonsT3: "doublons_t3",
  annulationMoins2h: "annulation_moins_2h",
  urgenceBlocageMois: "urgence_blocage_mois",
  etudeAvancee18: "etude_avancee_18",
} as const;

export type CleDateEffet = (typeof CLES_DATES_EFFET)[keyof typeof CLES_DATES_EFFET];

/**
 * La règle est-elle active pour une séance de cette date ?
 *
 * Vraie si la date d'effet est posée ET que la séance est datée de ce jour ou
 * après — la règle vise les SÉANCES DATÉES du jour d'effet ou après, pas les
 * réservations faites après ce jour (décision D1 du plan § 255).
 *
 * Fausse pour une date d'effet nulle ou absente (règle non activée), et pour une
 * date de séance vide — exactement comme la fonction SQL, qui rend `false` faute
 * de ligne ou de date.
 *
 * Comparaison textuelle sur AAAA-MM-JJ : ce format se range dans l'ordre
 * chronologique. `slice(0, 10)` protège d'un appelant qui passerait un instant
 * complet (« 2027-01-15T00:00:00Z » serait sinon supérieur à « 2027-01-15 »).
 */
export function regleActive(
  dateEffet: string | null | undefined,
  dateSeanceISO: string | null | undefined
): boolean {
  if (!dateEffet || !dateSeanceISO) return false;
  return dateSeanceISO.slice(0, 10) >= dateEffet.slice(0, 10);
}
