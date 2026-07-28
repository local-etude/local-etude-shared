// ─── Suspension pour impayé : la règle de décision ───────────────────────────
//
// Placée ici, dans le paquet de règles partagé, pour une raison précise : c'est la
// SEULE suspension automatique du système (un foyer perd l'accès à ses réservations
// en agence sans intervention humaine). Une règle de ce poids doit être écrite une
// fois, testée, et ne jamais être ré-exprimée en SQL d'un côté et en TypeScript de
// l'autre — c'est exactement ce genre de duplication qui dérive silencieusement.
//
// Le cron balaie donc largement en base, puis applique CES prédicats.

export type StatutEcheance = "a_venir" | "debite" | "echec" | "annule";

export type EcheanceImpayee = {
  statut: StatutEcheance;
  montantCentimes: number;
  /** Fin du délai de grâce (YYYY-MM-DD), posée à l'échec du prélèvement. */
  graceJusquAu: string | null;
  /** Horodatage de réclamation par le cron (capture éventuellement en cours). */
  tentativeLe?: string | null;
};

/**
 * Cette échéance justifie-t-elle de suspendre le foyer, au jour donné ?
 *
 * Quatre conditions, toutes nécessaires :
 *   • statut 'echec' — une échéance payée ('debite'), à venir ou annulée par une
 *     rétractation ('annule') ne suspend jamais ;
 *   • un montant réellement dû — jamais de suspension pour 0 € ;
 *   • un délai de grâce POSÉ — sans délai accordé, pas de sanction ;
 *   • ce délai STRICTEMENT dépassé — le jour même de l'échéance de grâce, le foyer
 *     a encore la journée pour régler.
 */
export function echeanceJustifieSuspension(e: EcheanceImpayee, dateISO: string): boolean {
  if (e.statut !== "echec") return false;
  if (e.montantCentimes <= 0) return false;
  if (!e.graceJusquAu) return false;
  return e.graceJusquAu < dateISO;
}

/**
 * Le foyer doit-il être suspendu ? Vrai dès qu'UNE de ses échéances le justifie.
 * `aEnfantMalin` : le rempart en base ne vise que les enfants réellement Malin — un
 * foyer qui n'en a plus ne doit pas recevoir d'email de suspension sans objet.
 */
export function foyerDoitEtreSuspendu(
  echeances: EcheanceImpayee[],
  aEnfantMalin: boolean,
  dateISO: string
): boolean {
  if (!aEnfantMalin) return false;
  return echeances.some((e) => echeanceJustifieSuspension(e, dateISO));
}

/**
 * Le drapeau de suspension est un ÉTAT DÉRIVÉ : un foyer suspendu qui n'a plus aucune
 * échéance justifiant la sanction doit être libéré, même si personne ne l'a demandé.
 * C'est la soupape qui évite qu'un déblocage raté laisse une famille bloquée à vie.
 */
export function foyerDoitEtreLibere(
  dejaSuspendu: boolean,
  echeances: EcheanceImpayee[],
  aEnfantMalin: boolean,
  dateISO: string
): boolean {
  if (!dejaSuspendu) return false;
  return !foyerDoitEtreSuspendu(echeances, aEnfantMalin, dateISO);
}
