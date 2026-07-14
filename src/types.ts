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
};

export type RegleAnnulation = "libre" | "frais" | "impossible";
