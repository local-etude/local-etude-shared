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

  const t = tranche(niveau);

  if (c.etudeAvancee > 0 && t < 3) {
    return "L'Étude Avancée est réservée aux élèves de la Tranche 3 (3ème à la Terminale).";
  }
  if (c.intensif > 0 && c.visio > 0) {
    return "Intensif et Visio ne peuvent pas être cumulés le même jour pour ce niveau.";
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
 * Séances qui exigent un dossier Malin VALIDÉ. Pendant l'instruction du dossier,
 * seule l'Étude de base reste ouverte ; Étude Avancée / Intensif / Visio (et les
 * cours à domicile, gérés hors de ce mécanisme) attendent la validation finale.
 */
export function seanceExigeDossierMalin(type: TypeSeance): boolean {
  return type !== "Étude";
}

/**
 * Un enfant en forfait Malin ne peut réserver que des séances 'Étude' tant que
 * son dossier n'est pas validé par le secrétariat (Unipros/URSSAF). Renvoie un
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
 * Ne vise QUE les enfants réellement `type_forfait === "malin"` (comme le gate
 * dossier) : l'essai, l'Étude et le Visio ne paient pas de frais d'agence Malin.
 * Miroir exact du rempart DB (trigger check_eligibilite_forfait pour les séances en
 * agence, RPC reserver_intervention_domicile pour le Domicile).
 */
export function eligibiliteImpayes(
  e: EnfantSimple,
  type: TypeSeance | "Domicile",
  impayes: { fraisAgenceBloque: boolean; uniprosBloque: boolean }
): string | null {
  if (e.type_forfait !== "malin") return null;
  if (impayes.fraisAgenceBloque && type !== "Domicile") {
    return "Réservation suspendue : le 2e versement de vos frais d'agence est en attente. Régularisez-le depuis votre espace.";
  }
  if (impayes.uniprosBloque && (type === "Domicile" || type === "Intensif" || type === "Visio")) {
    return "Réservation suspendue : régularisez votre mensualité auprès d'Unipros.";
  }
  return null;
}
