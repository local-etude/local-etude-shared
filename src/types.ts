export type TypeSeance = "Étude" | "Étude Avancée" | "Intensif" | "Visio";

export type EnfantSimple = {
  id: string;
  prenom: string;
  nom: string;
  niveau: string;
  type_forfait: string | null;
  discipline_intensif_debut: string | null;
  urgence_bloquee: boolean;
};

export type CompteurJour = {
  etude: number;
  etudeAvancee: number;
  intensif: number;
  visio: number;
  /**
   * Les mêmes comptes, mais UNIQUEMENT LES SÉANCES QUE LA FAMILLE A CHOISIES.
   *
   * Deux sortes de lignes `reservations` confirmées n'en sont pas :
   *
   *  · la PLACE D'ATTENTE PARENT, que la RPC `reserver_attente_parent` pose sur
   *    le créneau adjacent pour que l'enfant patiente en salle jusqu'à l'arrivée
   *    de son parent. L'enfant n'y suit aucun cours ;
   *  · la RETENUE disciplinaire, posée par le secrétariat. Elle est subie, pas
   *    réservée — refuser à l'élève son Intensif habituel parce qu'il a une
   *    retenue sur un créneau Intensif reviendrait à le punir deux fois
   *    (décision Stephen du 21 août 2026).
   *
   * Ces deux comptes servent la règle des doublons (« une seule Intensif / une
   * seule Visio par jour », Tranche 2, et Tranche 3 quand sa date d'effet est
   * atteinte). Le plafond horaire et l'interdiction Intensif+Visio, eux, se
   * lisent sur `gardesEtRetenues` ci-dessous (lot L2, décision D9).
   *
   * Optionnels À DESSEIN : un client non reconstruit — l'app mobile n'a pas
   * d'OTA — ne les envoie pas, et la règle retombe alors sur les compteurs
   * bruts. Elle est donc plus stricte, jamais plus permissive, et le vrai
   * rempart reste le trigger en base.
   */
  intensifChoisies?: number;
  visioChoisies?: number;
  /**
   * Les places de GARDE (`attente_parent`) et les RETENUES du jour, par type de
   * créneau — les lignes déjà comptées dans `etude`, `etudeAvancee`, `intensif`
   * et `visio` qui ne sont pas des séances choisies.
   *
   * Décision D9 du plan § 255 (16/11/2026) : la garde, Tranche 1 comprise, sort
   * de la limite quotidienne ; la retenue est traitée comme une garde. Quand ce
   * champ est fourni, le plafond horaire (1 h / 2 h) et l'interdiction
   * Intensif + Visio ne comptent plus ces lignes.
   *
   * ⚠️ Optionnel À DESSEIN, comme les deux champs ci-dessus : sans lui, la règle
   * compte toutes les lignes, comme avant le lot L2. Un client qui ne l'envoie
   * pas reste donc plus strict, jamais plus permissif. Corollaire : tant que le
   * trigger `check_limite_tranche_age` compte encore la garde dans le plafond
   * (avant le lot L3), un écran qui fournit ce champ proposerait une séance que
   * la base refuserait. Ne pas le brancher avant L3.
   */
  gardesEtRetenues?: {
    etude: number;
    etudeAvancee: number;
    intensif: number;
    visio: number;
  };
};

/**
 * La règle d'annulation d'une réservation, du point de vue du parent.
 *
 *  · `libre`      — plus de 18 h avant le début : gratuite ;
 *  · `frais`      — de 18 h à 2 h avant : 2 € (hors décompte du barème) ;
 *  · `moins_2h`   — de 2 h avant jusqu'à l'heure de début : annulation permise,
 *                   2 € décomptés au barème (décisions D3 et D5 du plan § 255).
 *                   N'est rendue que si la règle est ACTIVE (date d'effet
 *                   `annulation_moins_2h` atteinte pour la date de la séance) ;
 *  · `impossible` — séance commencée ; et, tant que `moins_2h` n'est pas actif,
 *                   tout le délai de moins de 2 h, comme avant le lot L2.
 */
export type RegleAnnulation = "libre" | "frais" | "moins_2h" | "impossible";
