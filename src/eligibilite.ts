import { tranche } from "./tranche";
import type { EnfantSimple, TypeSeance, CompteurJour } from "./types";

export function disciplineIntensifBloquee(e: EnfantSimple): boolean {
  if (e.type_forfait !== "malin") return false;
  if (!e.discipline_intensif_debut) return true;
  const [y, m, d] = e.discipline_intensif_debut.split("-").map(Number);
  const fin = new Date(y, m - 1, d);
  fin.setMonth(fin.getMonth() + 2);
  return fin.getTime() < Date.now();
}

export type OptionsLimiteTrancheAge = {
  /**
   * Vrai quand la règle `doublons_t3` est active POUR LA DATE DE LA SÉANCE
   * (`regleActive(dateEffet, dateSeance)`, calculé par l'appelant). La Tranche 3
   * perd alors le droit de doubler l'Intensif et la Visio, comme la Tranche 2
   * (décisions D8 du plan § 255 et du 15/11/2026, HISTORIQUE 16.388). Absent ou
   * faux : comportement d'avant L2, la Tranche 3 peut doubler.
   */
  doublonsT3Actifs?: boolean;
};

/**
 * Retourne un message d'erreur si l'ajout de `type` viole l'article 6.3, sinon null.
 *
 * Jamais appelée pour une garde, une retenue ou une connexion en autonomie : ces
 * places n'ont pas de limite quotidienne (D9) et ne sont pas des doublons. Elles
 * peuvent en revanche figurer dans `compteur` ; voir `CompteurJour`.
 */
export function violeLimiteTrancheAge(
  niveau: string,
  compteur: CompteurJour,
  type: TypeSeance,
  options: OptionsLimiteTrancheAge = {}
): string | null {
  const c = { ...compteur };
  if (type === "Étude") c.etude += 1;
  else if (type === "Étude Avancée") c.etudeAvancee += 1;
  else if (type === "Intensif") c.intensif += 1;
  else if (type === "Visio") c.visio += 1;

  // La séance qu'on est en train d'ajouter est une VRAIE séance : cette fonction
  // n'est jamais appelée pour une place d'attente parent, que la RPC pose
  // directement en base. Les compteurs « hors attente » doivent donc suivre —
  // sans cela, un enfant de Tranche 2 sans aucune Visio dans la journée aurait
  // un `visioChoisies` resté à 0 et pourrait en réserver autant qu'il veut.
  if (c.intensifChoisies !== undefined && type === "Intensif") c.intensifChoisies += 1;
  if (c.visioChoisies !== undefined && type === "Visio") c.visioChoisies += 1;

  const t = tranche(niveau);

  // ── Les séances CHOISIES, pour le plafond et le cumul Intensif + Visio ─────
  // Décision D9 du plan § 255 (16/11/2026) : la garde, Tranche 1 comprise, sort de
  // la limite quotidienne ; la retenue est traitée comme une garde. Sans
  // `gardesEtRetenues`, rien n'est retiré : le compte reste brut, donc strict.
  // La séance ajoutée, elle, est toujours une vraie séance : elle est déjà dans `c`.
  const hors = c.gardesEtRetenues;
  const etudeSeances = c.etude - (hors?.etude ?? 0);
  const etudeAvanceeSeances = c.etudeAvancee - (hors?.etudeAvancee ?? 0);
  const intensifSeances = c.intensif - (hors?.intensif ?? 0);
  const visioSeances = c.visio - (hors?.visio ?? 0);

  if (etudeAvanceeSeances > 0 && t < 3) {
    return "L'Étude Avancée est réservée aux élèves de la Tranche 3 (3ème à la Terminale).";
  }
  if (intensifSeances > 0 && visioSeances > 0) {
    return "Intensif et Visio ne peuvent pas être cumulés le même jour pour ce niveau.";
  }

  // ── TRANCHE 2, ET TRANCHE 3 À SA DATE D'EFFET : une seule Intensif, une seule
  //    Visio par jour ───────────────────────────────────────────────────────────
  // Décision Stephen du 21 août 2026, sur un défaut constaté en production.
  //
  // Le trou : les règles ci-dessus ne parlent que de CUMULS ENTRE TYPES. Deux
  // séances du MÊME type tenaient donc dans le plafond de 2 h sans enfreindre
  // aucune règle écrite. Un élève de 6ème a réservé 2 h de Visio d'affilée ; à
  // la mesure, 5 élèves l'avaient déjà fait, en Visio ET en Intensif.
  //
  // ⚠️⚠️ RÈGLE DIFFÉRENCIÉE, ET DATÉE POUR LA TRANCHE 3. Décision du 15/11/2026
  // (HISTORIQUE 16.388) : en Tranche 3, deux Intensif ou deux Visio le même jour
  // sont interdits, comme en Tranche 2. Mais cette règle est PLUS STRICTE que la
  // CGV v4.2, qui autorise « deux séances d'un même type » : elle ne s'applique
  // qu'aux séances datées du jour d'effet `doublons_t3` ou après (entrée en
  // vigueur de la v4.3), et l'appelant le dit par `doublonsT3Actifs`. Sans lui, la
  // Tranche 3 garde le droit de doubler, comme depuis le 21 août.
  //
  // ⚠️ L'Étude reste cumulable dans les DEUX tranches — décision explicite du
  // 21 août, confirmée par D8 (16/11/2026) : la règle vise nommément l'Intensif et
  // la Visio, elle ne se généralise pas en « un seul de chaque type ». L'Étude
  // Avancée suit l'Étude (HISTORIQUE 16.392).
  //
  // La Tranche 1 n'a pas besoin d'être citée : son plafond d'1 h par jour
  // interdit déjà tout doublon, quel qu'en soit le type.
  //
  // ⚠️ Seules comptent ici les séances que la FAMILLE A CHOISIES — voir le
  // commentaire de `CompteurJour`. Une place d'attente parent n'est pas un cours ;
  // une RETENUE est subie, pas réservée. Refuser sur l'une priverait l'enfant de
  // l'endroit où attendre son parent ; refuser sur l'autre le punirait deux fois
  // (décision Stephen du 21 août 2026). Le plafond horaire, lui, continue de
  // les compter : cette exclusion ne vaut que pour les deux règles ci-dessous.
  // (Depuis L2, le plafond ne les compte plus non plus quand `gardesEtRetenues`
  // est fourni — voir plus haut.)
  if (t === 2 || (t === 3 && options.doublonsT3Actifs === true)) {
    const intensifChoisi = c.intensifChoisies ?? intensifSeances;
    const visioChoisie    = c.visioChoisies ?? visioSeances;
    if (intensifChoisi > 1) {
      return "Une seule séance d'Intensif par jour pour ce niveau.";
    }
    if (visioChoisie > 1) {
      return "Une seule séance de Visio par jour pour ce niveau.";
    }
  }

  const total = etudeSeances + etudeAvanceeSeances + intensifSeances + visioSeances;
  if (t === 1) {
    if (total > 1) return "Maximum 1h de séances par jour pour ce niveau.";
  } else {
    if (total > 2) return "Maximum 2h de séances par jour pour ce niveau.";
  }
  return null;
}

// ── Article 2.1 CGV — éligibilité au type de séance selon le forfait ────────
/** Retourne un message d'erreur si l'enfant n'a pas le forfait requis pour ce type de séance, sinon null. */
export function eligibiliteForfait(e: EnfantSimple, type: TypeSeance): string | null {
  // L'Essai Serein simule l'abonnement Malin le temps de l'essai (14 jours).
  const forfait = e.type_forfait === "essai" ? "malin" : e.type_forfait;

  if (type === "Étude") {
    return forfait === "etude" || forfait === "malin"
      ? null
      : "Réservé aux forfaits Étude et Malin.";
  }
  if (type === "Visio") {
    // Le forfait Visio (attribué au cas par cas par l'admin — n'est plus vendu
    // au public, cf. CGV 2.1) donne accès aux séances Visio, au même titre que
    // le Malin. Sans cette branche, un enfant 'visio' ne pouvait réserver AUCUNE
    // séance Visio (bug corrigé le 2026-07-25).
    return forfait === "malin" || forfait === "visio"
      ? null
      : "Visio réservé aux forfaits Visio et Malin.";
  }
  if (type === "Intensif") {
    return forfait === "malin" ? null : "Intensif réservé au forfait Malin.";
  }
  // Étude Avancée : Malin + Tranche 3 uniquement
  if (forfait !== "malin") return "Étude Avancée réservée au forfait Malin.";
  return tranche(e.niveau) === 3
    ? null
    : "Étude Avancée réservée aux élèves de la Tranche 3 (3ème à la Terminale).";
}

// ── Dossier Malin (validation secrétariat / Unipros-URSSAF) ─────────────────
/**
 * Séances qui exigent un dossier Malin VALIDÉ (décision produit du 2026-07-28) :
 * la validation relève du volet Unipros/URSSAF, donc elle ne retient QUE les séances
 * financées par ce volet — Intensif, Visio et les cours à domicile (ces derniers
 * gérés hors de ce mécanisme, par la RPC de réservation).
 *
 * Étude ET Étude Avancée sont payées par les frais d'agence, déjà réglés à ce stade :
 * elles sont donc ouvertes dès le paiement, sans attendre l'instruction du dossier.
 * Même partition que la carte de blocage des impayés (cf. eligibiliteImpayes).
 */
export function seanceExigeDossierMalin(type: TypeSeance): boolean {
  return type !== "Étude" && type !== "Étude Avancée";
}

/**
 * Un enfant en forfait Malin ne peut réserver que l'Étude et l'Étude Avancée tant
 * que son dossier n'est pas validé par le secrétariat (Unipros/URSSAF). Renvoie un
 * message si la séance est bloquée pour cette raison, sinon null.
 *
 * Exemptés : les enfants en essai 14 j (pas de dossier), et les forfaits
 * Étude/Visio (non concernés par le dossier Malin). Le gate ne vise donc QUE les
 * enfants réellement en `type_forfait === "malin"`.
 */
export function eligibiliteDossierMalin(
  e: EnfantSimple,
  type: TypeSeance,
  dossierMalinValide: boolean
): string | null {
  if (e.type_forfait !== "malin") return null;
  if (!seanceExigeDossierMalin(type)) return null;
  if (dossierMalinValide) return null;
  return "Disponible une fois votre dossier Malin validé.";
}

// ── Blocages pour impayé (frais d'agence Stripe / mensualité Unipros) ───────
/**
 * Deux impayés DISTINCTS peuvent suspendre les réservations d'un enfant Malin,
 * avec des effets différents (« carte de blocage ») :
 *   - `fraisAgenceBloque` (2e versement Stripe des frais d'agence non réglé, passé
 *     le délai de grâce) → bloque toutes les séances Local Étude : Étude, Étude
 *     Avancée, Intensif, Visio. Le **Domicile reste ouvert** (financé par Unipros).
 *   - `uniprosBloque` (mensualité Unipros SEPA impayée, signalée manuellement par
 *     l'admin) → bloque **Domicile, Intensif, Visio**. Étude / Étude Avancée restent
 *     ouverts.
 *
 * Vise les enfants en `malin` ET CEUX EN `essai`. L'essai n'est PAS une exception :
 * un enfant en essai bénéficie exactement des mêmes séances qu'un Malin, si bien
 * qu'un foyer suspendu pouvait inscrire un nouvel enfant en essai et lui faire
 * réserver de l'Intensif pendant que la dette courait. La base a fermé ce trou le
 * 4 août 2026 (migration 20260805_essai_solidaire_des_impayes) :
 *   IF v_forfait_reel IN ('malin', 'essai')
 * Cette fonction en est le miroir. Tant qu'elle disait `!== "malin"`, l'écran était
 * plus PERMISSIF que la base : l'enfant paraissait réservable et le refus tombait
 * au clic — précisément la surprise que cet affichage existe pour supprimer.
 *
 * ⚠️ À la différence du GATE DOSSIER, qui reste réservé aux `malin` : un enfant en
 * essai n'a pas de dossier Unipros à faire valider, l'y soumettre fermerait l'essai
 * à sa propre cible. Les deux règles ne partagent donc PAS la même condition.
 *
 * Miroir du rempart DB : trigger check_eligibilite_forfait pour les séances en
 * agence, RPC reserver_intervention_domicile pour le Domicile.
 */
export function eligibiliteImpayes(
  e: EnfantSimple,
  type: TypeSeance | "Domicile",
  impayes: { fraisAgenceBloque: boolean; uniprosBloque: boolean }
): string | null {
  if (e.type_forfait !== "malin" && e.type_forfait !== "essai") return null;
  if (impayes.fraisAgenceBloque && type !== "Domicile") {
    return "Réservation suspendue : le 2e versement de vos frais d'agence est en attente. Régularisez-le depuis votre espace.";
  }
  if (impayes.uniprosBloque && (type === "Domicile" || type === "Intensif" || type === "Visio")) {
    return "Réservation suspendue : régularisez votre mensualité auprès d'Unipros.";
  }
  return null;
}
