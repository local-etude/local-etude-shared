import type { RegleAnnulation } from "./types";
import { instantParis } from "./heureParis";

/**
 * Minutes restant avant le début de la séance (négatif une fois commencée).
 *
 * ⚠️ HEURE DE PARIS depuis le lot L2 (16/11/2026) : la date et l'heure du créneau
 * sont lues comme l'heure murale de l'agence, et non plus comme l'heure de
 * l'appareil. Même calcul sur le serveur (UTC) et sur un téléphone réglé ailleurs.
 */
export function minutesAvantSeance(dateISO: string, heureDebut: string): number {
  return (instantParis(dateISO, heureDebut) - Date.now()) / 60_000;
}

export type OptionsRegleAnnulation = {
  /**
   * Vrai quand la règle `annulation_moins_2h` est active POUR LA DATE DE CETTE
   * SÉANCE : `regleActive(dateEffet, dateSeance)`, calculé par l'appelant à partir
   * de la table `regles_dates_effet`. Absent ou faux : comportement d'avant L2,
   * l'annulation reste impossible à moins de 2 h.
   */
  annulationMoins2hActive?: boolean;
};

/**
 * La règle d'annulation d'une réservation (CGV art. 4, 6.5, 6.6 ; REFERENCE §7,
 * tableau des annulations ; décisions D3 et D5 du plan § 255).
 *
 *  · plus de 18 h avant                      → `libre`
 *  · de 18 h (inclus) à 2 h (exclu) avant    → `frais`
 *  · de 2 h (inclus) avant à l'heure de début (exclue) :
 *        règle active   → `moins_2h`
 *        règle inactive → `impossible` (comme avant L2)
 *  · à l'heure de début et après             → `impossible`
 *
 * Bornes [D] : à 18 h pile, `frais` ; à 2 h pile, `moins_2h` (ou `impossible`) —
 * les deux seuils reprennent l'inégalité stricte historique (`> 18 h`, `> 2 h`).
 * À l'heure de début pile, la séance est réputée commencée.
 *
 * Même règle pour une place d'urgence (D5) : rien ne la distingue ici. Pour une
 * garde ou une connexion en autonomie, passer le résultat par
 * `regleAnnulationPlace`, qui les rend gratuites.
 */
export function regleAnnulation(
  dateISO: string,
  heureDebut: string,
  options: OptionsRegleAnnulation = {}
): RegleAnnulation {
  const minutes = minutesAvantSeance(dateISO, heureDebut);
  if (minutes > 18 * 60) return "libre";
  if (minutes > 2 * 60) return "frais";
  if (options.annulationMoins2hActive === true && minutes > 0) return "moins_2h";
  return "impossible";
}

/**
 * Annulation d'une PLACE (garde ou connexion en autonomie) : toujours gratuite.
 *
 * Déplacée du site (`lib/bareme/regles.ts`) dans le paquet au lot L2, pour que
 * l'app mobile l'applique aussi : sans elle, le mobile affichait « Annuler (2 €) »
 * sur une garde (§ 254 A.4). Décision de Stephen du 11/10/2026 (garde gratuite
 * entre 18 h et 2 h), étendue à l'annulation à moins de 2 h (plan § 255, L2).
 *
 * `frais` et `moins_2h` deviennent `libre` ; `impossible` reste `impossible` —
 * ce n'est pas une pénalité, c'est la séance commencée (ou, tant que `moins_2h`
 * n'est pas actif, le délai de 2 h que le serveur refuse encore).
 *
 * `estPlace` : vrai pour une garde (`attente_parent`) ou une connexion en
 * autonomie. Toute autre valeur (faux, null, absent) laisse la règle intacte.
 */
export function regleAnnulationPlace<R extends RegleAnnulation>(
  regle: R,
  estPlace: boolean | null | undefined
): R | "libre" {
  return estPlace === true && (regle === "frais" || regle === "moins_2h") ? "libre" : regle;
}
