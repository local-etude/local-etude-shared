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
  if (type === "Intensif" || type === "Visio") {
    return forfait === "malin" ? null : `${type} réservé au forfait Malin.`;
  }
  // Étude Avancée : Malin + Tranche 3 uniquement
  if (forfait !== "malin") return "Étude Avancée réservée au forfait Malin.";
  return tranche(e.niveau) === 3
    ? null
    : "Étude Avancée réservée aux élèves de la Tranche 3 (3ème à la Terminale).";
}
