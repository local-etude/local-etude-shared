/**
 * ── GARDE, VISIO EN AUTONOMIE, PLACE D'URGENCE ───────────────────────────────
 *
 * Lot L2 du plan § 255, avec les décisions D6, D7, D10 et D11 du 16/11/2026
 * (HISTORIQUE 16.402 ; REFERENCE §7, « Garde et place d'urgence » et « Visio en
 * autonomie »). Fonctions PURES : l'appelant rassemble les données (créneaux
 * voisins, places prises, intervenants affectés), le paquet dit la règle. La base
 * reste le rempart : ces fonctions décident de ce qu'un écran PROPOSE, les
 * triggers et les RPC de ce que la base ACCEPTE (lots L6, L7, L8).
 */
import { tranche } from "./tranche";
import { eligibiliteForfait } from "./eligibilite";
import { ajouterJoursISO } from "./heureParis";
import type { EnfantSimple, TypeSeance } from "./types";

/**
 * Les codes postaux des communes des agences : 77430 (Champagne-sur-Seine) et
 * 77130 (Montereau-Fault-Yonne). Même liste que le site
 * (`lib/eligibilite-geo-attente-parent.ts`) et que la RPC `reserver_attente_parent`.
 *
 * ⚠️ Lu « hors des DEUX communes », comme le code en production : une famille de
 * Montereau qui vient à Champagne n'est pas « éloignée ». C'est la lecture de D7
 * retenue au lot L2 [D] ; l'autre lecture (hors de la commune de l'agence de la
 * séance) changerait aussi la RPC.
 */
export const CODES_POSTAUX_AGENCES = ["77430", "77130"] as const;

/** La famille habite-t-elle hors des communes des agences ? `null` si le code postal manque. */
export function familleEloignee(codePostal: string | null | undefined): boolean | null {
  const cp = codePostal?.trim();
  if (!cp) return null;
  return !(CODES_POSTAUX_AGENCES as readonly string[]).includes(cp);
}

// ── Garde (place d'attente parent) ──────────────────────────────────────────

/**
 * L'enfant a-t-il droit à la garde ? Message de refus, ou `null`.
 *
 *  · Forfait : Malin, ou essai (D6 : la garde est ouverte aux enfants en essai).
 *    Gratuite et incluse dans Malin ; aucun autre forfait n'y ouvre droit.
 *  · Tranche 3 : quel que soit le code postal (la garde remplace la deuxième
 *    séance, D7 et décision du 15/11).
 *  · Tranches 1 et 2 : seulement si la famille habite hors des communes des
 *    agences (familles éloignées, D7).
 *
 * N'examine ni la séance voisine, ni la capacité de garde : voir
 * `signalGardePossible` pour l'affichage sur une carte complète.
 */
export function eligibiliteGarde(
  e: EnfantSimple,
  codePostal: string | null | undefined
): string | null {
  if (e.type_forfait !== "malin" && e.type_forfait !== "essai") {
    return "La garde est réservée au forfait Malin et à l'essai.";
  }
  if (tranche(e.niveau) === 3) return null;
  const eloignee = familleEloignee(codePostal);
  if (eloignee === null) {
    return "Renseignez votre code postal pour savoir si la garde vous est ouverte.";
  }
  if (!eloignee) {
    return "La garde est réservée aux élèves de la 3ème à la Terminale et aux familles qui n'habitent pas la commune d'une agence.";
  }
  return null;
}

export type ContexteSignalGarde = {
  /** La carte (le créneau sur lequel la garde serait posée) est complète. */
  carteComplete: boolean;
  /**
   * Pour chaque séance VOISINE DU MÊME TYPE que la carte (créneaux contigus à la
   * séance de l'enfant, même agence, même jour, la carte comprise), si elle est
   * complète. L'appelant constitue cette liste ; une liste vide ne vaut pas
   * « toutes complètes ».
   */
  voisinesMemeTypeCompletes: boolean[];
  /**
   * L'enfant a déjà ce jour-là une séance CONTIGUË à la carte, DU MÊME TYPE,
   * réservée et CONFIRMÉE (D7 : « la garde est toujours au service d'une séance
   * de l'enfant »).
   */
  seanceContigueMemeTypeConfirmee: boolean;
};

/**
 * Faut-il afficher « garde possible » sur cette carte ? (D7)
 *
 * Toutes les conditions sont nécessaires : enfant éligible à la garde, carte
 * complète, toutes les séances voisines du même type complètes (sinon, mieux vaut
 * proposer la vraie séance d'à côté), et une séance contiguë du même type,
 * confirmée, à laquelle la garde se rattache.
 */
export function signalGardePossible(
  e: EnfantSimple,
  codePostal: string | null | undefined,
  ctx: ContexteSignalGarde
): boolean {
  if (eligibiliteGarde(e, codePostal) !== null) return false;
  if (!ctx.carteComplete) return false;
  if (!ctx.seanceContigueMemeTypeConfirmee) return false;
  if (ctx.voisinesMemeTypeCompletes.length === 0) return false;
  return ctx.voisinesMemeTypeCompletes.every((complete) => complete === true);
}

// ── Visio en autonomie ──────────────────────────────────────────────────────

export type ContexteAutonomieVisio = {
  /** L'enfant a une Visio confirmée ce jour-là, à laquelle la connexion se rattache. */
  visioDeLEnfantConfirmee: boolean;
  /** Une Visio existe juste avant ou juste après celle de l'enfant (D10). */
  visioVoisineExiste: boolean;
};

/**
 * L'enfant peut-il se connecter en autonomie sur une Visio voisine ? Message de
 * refus, ou `null`. (D10, REFERENCE §7 « Visio en autonomie ».)
 *
 *  · Tranche 3 seulement ;
 *  · quel que soit le forfait, pourvu qu'il ouvre la Visio (Malin, essai, forfait
 *    Visio) — c'est la règle de `eligibiliteForfait` pour la Visio ;
 *  · sur une Visio voisine EXISTANTE, juste avant ou juste après la Visio de
 *    l'élève : jamais à une heure inventée.
 *
 * Pas de limite de places (« sans limite, non prioritaire »). Le lien de
 * connexion est remis hors de l'application. La garde physique sur une Visio en
 * agence suit, elle, `eligibiliteGarde`.
 */
export function eligibiliteAutonomieVisio(
  e: EnfantSimple,
  ctx: ContexteAutonomieVisio
): string | null {
  if (tranche(e.niveau) !== 3) {
    return "La connexion en autonomie est réservée aux élèves de la 3ème à la Terminale.";
  }
  const forfait = eligibiliteForfait(e, "Visio");
  if (forfait !== null) return forfait;
  if (!ctx.visioDeLEnfantConfirmee) {
    return "La connexion en autonomie accompagne une séance de Visio de l'élève.";
  }
  if (!ctx.visioVoisineExiste) {
    return "Aucune séance de Visio juste avant ou juste après celle de l'élève.";
  }
  return null;
}

// ── Place d'urgence ─────────────────────────────────────────────────────────

/**
 * Les trois types d'épreuve (D11). Les clés sont celles prévues pour la colonne
 * `reservations.urgence_epreuve` (plan § 255, L1 : `controle`, `devoir_sur_table`,
 * `examen`) — colonne pas encore créée, reportée au lot L8. Les libellés sont ceux
 * de la décision, au mot près.
 */
export const TYPES_EPREUVE_URGENCE = {
  controle: "Contrôle ou devoir noté",
  devoir_sur_table: "Devoir sur table",
  examen: "Examen (brevet blanc, bac blanc, épreuve officielle…)",
} as const;

export type TypeEpreuveUrgence = keyof typeof TYPES_EPREUVE_URGENCE;

/**
 * L'épreuve doit avoir lieu au plus tard 4 jours calendaires après la séance, le
 * jour même compris (D11) : de J (le jour de la séance) à J+4 inclus.
 * Lecture [D] de « le jour même compris » : l'épreuve peut avoir lieu le jour
 * même de la séance. L'autre lecture (le jour même compte parmi les 4, soit J à
 * J+3) se change ici, en un seul endroit.
 */
export const URGENCE_DELAI_EPREUVE_JOURS = 4;

/** D11 : réponse aux versions de l'app qui n'envoient ni type ni date d'épreuve. Texte de la décision, au mot près. */
export const MESSAGE_URGENCE_METTRE_A_JOUR = "Mettez à jour l'application pour demander une place d'urgence.";

/** Même phrase que la route d'urgence du site (`lib/urgence/refus.ts`, § 258). */
export const MESSAGE_URGENCE_PRISE = "La place d'urgence de cette séance vient d'être prise.";

export type CodeRefusUrgence =
  | "TRANCHE"
  | "BLOQUEE"
  | "TYPE_SEANCE"
  | "FORFAIT"
  | "METTRE_A_JOUR"
  | "EPREUVE_TYPE"
  | "EPREUVE_DATE"
  | "NON_COMPLETE"
  | "URGENCE_COMPLETE";

export type RefusUrgence = { code: CodeRefusUrgence; message: string };

export type ContexteUrgence = {
  /** Type et date (AAAA-MM-JJ) du créneau visé. */
  creneau: { type_seance: TypeSeance | string; date: string };
  /**
   * Places ORDINAIRES occupées : séances confirmées HORS garde, retenue et
   * urgence (D11 : l'urgence est un vrai « +1 », hors du compte des places
   * ordinaires), et capacité du créneau.
   */
  placesOrdinairesPrises: number;
  capacite: number;
  /** Urgences confirmées sur le créneau. */
  urgencesConfirmees: number;
  /** Intervenants affectés au créneau (`intervenants_creneaux`). Zéro compte pour un. */
  intervenantsAffectes: number;
  /** Fin du blocage daté de l'accès à l'urgence (AAAA-MM-JJ, inclus), ou null. */
  urgenceBloqueeJusquAu: string | null;
  /** Aujourd'hui au calendrier de Paris (`parisAujourdhuiISO()`). */
  aujourdhuiISO: string;
};

/** Le motif saisi par la famille. Les deux champs manquent dans les anciennes versions de l'app. */
export type DemandeUrgence = {
  epreuveType?: string | null;
  epreuveDate?: string | null;
};

/** Combien de places d'urgence restent sur le créneau : une par intervenant affecté, au moins une. */
export function placesUrgenceRestantes(urgencesConfirmees: number, intervenantsAffectes: number): number {
  return Math.max(0, Math.max(1, intervenantsAffectes) - urgencesConfirmees);
}

function enFR(dateISO: string): string {
  const [y, m, d] = dateISO.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * L'enfant peut-il prendre une place d'urgence sur ce créneau ? Refus (code et
 * message), ou `null`. (D11, D12 ; REFERENCE §7 « Urgence ».)
 *
 * Contrôles, dans cet ordre :
 *  1. Tranche 3 ;
 *  2. accès non bloqué : ni l'interrupteur historique `urgence_bloquee` (encore
 *     utilisé en cas sérieux d'ici la v4.3, D12), ni un blocage daté en cours
 *     (date de fin incluse, levée automatique le lendemain) ;
 *  3. Intensif ou Visio ;
 *  4. forfait : celui qui ouvre ce type de séance (`eligibiliteForfait`) — un
 *     enfant au forfait Visio peut demander une urgence, sur une Visio seulement ;
 *  5. motif : sans type ni date d'épreuve, « Mettez à jour l'application… » ; type
 *     parmi les trois valeurs ; épreuve de J à J+4 (jour de la séance compris) ;
 *  6. séance complète en places ordinaires (l'urgence n'en fait pas partie) ;
 *  7. une place d'urgence restante (une par intervenant affecté, au moins une).
 *
 * Ne contrôle pas : l'horizon de réservation (`dateDansHorizon`), l'essai expiré,
 * le dossier Malin ni les impayés, déjà portés par d'autres fonctions du paquet et
 * par la base. `matiere` reste contrôlée par l'appelant.
 */
export function eligibiliteUrgence(
  e: EnfantSimple,
  ctx: ContexteUrgence,
  demande: DemandeUrgence = {}
): RefusUrgence | null {
  if (tranche(e.niveau) !== 3) {
    return { code: "TRANCHE", message: "La place d'urgence est réservée aux élèves de la 3ème à la Terminale." };
  }
  if (e.urgence_bloquee) {
    return { code: "BLOQUEE", message: "L'accès à la demande urgence a été désactivé pour cet élève." };
  }
  if (ctx.urgenceBloqueeJusquAu && ctx.aujourdhuiISO.slice(0, 10) <= ctx.urgenceBloqueeJusquAu.slice(0, 10)) {
    return {
      code: "BLOQUEE",
      message: `L'accès à la place d'urgence est suspendu pour cet élève jusqu'au ${enFR(ctx.urgenceBloqueeJusquAu)} inclus.`,
    };
  }
  const type = ctx.creneau.type_seance;
  if (type !== "Intensif" && type !== "Visio") {
    return { code: "TYPE_SEANCE", message: "La place d'urgence n'existe que sur l'Intensif et la Visio." };
  }
  const forfait = eligibiliteForfait(e, type);
  if (forfait !== null) return { code: "FORFAIT", message: forfait };

  const epreuveType = demande.epreuveType?.trim() || null;
  const epreuveDate = demande.epreuveDate?.trim() || null;
  if (!epreuveType && !epreuveDate) {
    return { code: "METTRE_A_JOUR", message: MESSAGE_URGENCE_METTRE_A_JOUR };
  }
  // `hasOwnProperty`, pas `in` : « toString » est « dans » tout objet littéral.
  if (!epreuveType || !Object.prototype.hasOwnProperty.call(TYPES_EPREUVE_URGENCE, epreuveType)) {
    return { code: "EPREUVE_TYPE", message: "Choisissez le type d'épreuve." };
  }
  if (!epreuveDate || !/^\d{4}-\d{2}-\d{2}$/.test(epreuveDate.slice(0, 10))) {
    return { code: "EPREUVE_DATE", message: "Indiquez la date de l'épreuve." };
  }
  const jourSeance = ctx.creneau.date.slice(0, 10);
  const jourEpreuve = epreuveDate.slice(0, 10);
  if (jourEpreuve < jourSeance) {
    return { code: "EPREUVE_DATE", message: "L'épreuve ne peut pas avoir lieu avant la séance." };
  }
  if (jourEpreuve > ajouterJoursISO(jourSeance, URGENCE_DELAI_EPREUVE_JOURS)) {
    return {
      code: "EPREUVE_DATE",
      message: `L'épreuve doit avoir lieu au plus tard ${URGENCE_DELAI_EPREUVE_JOURS} jours après la séance (le jour même compris).`,
    };
  }

  if (ctx.placesOrdinairesPrises < ctx.capacite) {
    return { code: "NON_COMPLETE", message: "La place d'urgence ne s'ouvre que lorsque la séance est complète." };
  }
  if (placesUrgenceRestantes(ctx.urgencesConfirmees, ctx.intervenantsAffectes) <= 0) {
    return { code: "URGENCE_COMPLETE", message: MESSAGE_URGENCE_PRISE };
  }
  return null;
}
