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
   * Le plafond horaire et l'interdiction Intensif+Visio continuent de compter
   * ces deux-là : comportement historique, délibérément inchangé. Seule la règle
   * « une seule Intensif / une seule Visio par jour en Tranche 2 » les ignore.
   *
   * Optionnels À DESSEIN : un client non reconstruit — l'app mobile n'a pas
   * d'OTA — ne les envoie pas, et la règle retombe alors sur les compteurs
   * bruts. Elle est donc plus stricte, jamais plus permissive, et le vrai
   * rempart reste le trigger en base.
   */
  intensifChoisies?: number;
  visioChoisies?: number;
};

export type RegleAnnulation = "libre" | "frais" | "impossible";
