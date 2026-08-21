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

/** Retourne un message d'erreur si l'ajout de `type` viole l'article 6.3, sinon null. */
export function violeLimiteTrancheAge(
  niveau: string,
  compteur: CompteurJour,
  type: TypeSeance
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

  if (c.etudeAvancee > 0 && t < 3) {
    return "L'Étude Avancée est réservée aux élèves de la Tranche 3 (3ème à la Terminale).";
  }
  if (c.intensif > 0 && c.visio > 0) {
    return "Intensif et Visio ne peuvent pas être cumulés le même jour pour ce niveau.";
  }

  // ── TRANCHE 2 SEULEMENT : une seule Intensif, une seule Visio par jour ─────
  // Décision Stephen du 21 août 2026, sur un défaut constaté en production.
  //
  // Le trou : les règles ci-dessus ne parlent que de CUMULS ENTRE TYPES. Deux
  // séances du MÊME type tenaient donc dans le plafond de 2 h sans enfreindre
  // aucune règle écrite. Un élève de 6ème a réservé 2 h de Visio d'affilée ; à
  // la mesure, 5 élèves l'avaient déjà fait, en Visio ET en Intensif.
  //
  // ⚠️⚠️ RÈGLE DIFFÉRENCIÉE, PAS UNIFORME. La Tranche 3 (3ème → Terminale) garde
  // le droit de doubler l'Intensif et la Visio : à ce niveau, deux heures du
  // même type dans la journée sont un usage assumé. Seule la Tranche 2
  // (CM1 → 4ème) est bornée. Écrire ce test hors du `t === 2` retirerait un
  // droit existant à 13 élèves de Tranche 3, dont quatre l'utilisent déjà.
  //
  // ⚠️ L'Étude reste cumulable dans les DEUX tranches — décision explicite du
  // même jour. La règle vise nommément l'Intensif et la Visio, elle ne se
  // généralise pas en « un seul de chaque type ».
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
  if (t === 2) {
    const intensifChoisi = c.intensifChoisies ?? c.intensif;
    const visioChoisie    = c.visioChoisies ?? c.visio;
    if (intensifChoisi > 1) {
      return "Une seule séance d'Intensif par jour pour ce niveau.";
    }
    if (visioChoisie > 1) {
      return "Une seule séance de Visio par jour pour ce niveau.";
    }
  }

  const total = c.etude + c.etudeAvancee + c.intensif + c.visio;
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
