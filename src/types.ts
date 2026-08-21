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
   * Les mêmes comptes, PLACES D'ATTENTE PARENT EXCLUES.
   *
   * Une place d'attente parent est une ligne `reservations` confirmée comme une
   * autre — la RPC `reserver_attente_parent` en insère une sur le créneau
   * ADJACENT pour que l'enfant patiente en salle jusqu'à l'arrivée du parent.
   * Ce n'est pas une séance : l'enfant n'y suit aucun cours.
   *
   * Le plafond horaire et l'interdiction Intensif+Visio continuent de les
   * compter — comportement historique, délibérément inchangé. Seule la règle
   * « une seule Intensif / une seule Visio par jour en Tranche 2 » les ignore :
   * sinon un parent qui demande une place d'attente sur un créneau Visio
   * adjacent se la verrait refuser au motif qu'il aurait « deux Visio », ce qui
   * est faux. Le planning contient 17 paires de Visio adjacentes et 10 d'
   * Intensif : le cas n'est pas théorique.
   *
   * Optionnels À DESSEIN : un client non reconstruit — l'app mobile n'a pas
   * d'OTA — ne les envoie pas, et la règle retombe alors sur les compteurs
   * bruts. Elle est donc plus stricte, jamais plus permissive, et le vrai
   * rempart reste le trigger en base.
   */
  intensifHorsAttente?: number;
  visioHorsAttente?: number;
};

export type RegleAnnulation = "libre" | "frais" | "impossible";
