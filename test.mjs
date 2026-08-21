import {
  tranche,
  eligibiliteForfait,
  eligibiliteDossierMalin,
  seanceExigeDossierMalin,
  echeanceJustifieSuspension,
  foyerDoitEtreSuspendu,
  foyerDoitEtreLibere,
  eligibiliteImpayes,
  violeLimiteTrancheAge,
  regleAnnulation,
} from "./dist/index.js";

let fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "✅" : "❌"} ${label} → ${JSON.stringify(actual)}${ok ? "" : `  (attendu ${JSON.stringify(expected)})`}`);
  if (!ok) fail++;
}

console.log("\n═══ A. Matrice éligibilité forfait — 3 enfants × 4 types de séance ═══\n");

const enfants = {
  essai: { id: "e1", prenom: "Essai", nom: "T", niveau: "5ème", type_forfait: "essai", discipline_intensif_debut: null, urgence_bloquee: false },
  etude: { id: "e2", prenom: "Etude", nom: "T", niveau: "5ème", type_forfait: "etude", discipline_intensif_debut: null, urgence_bloquee: false },
  malin: { id: "e3", prenom: "Malin", nom: "T", niveau: "Terminale", type_forfait: "malin", discipline_intensif_debut: null, urgence_bloquee: false },
  visio: { id: "e4", prenom: "Visio", nom: "T", niveau: "5ème", type_forfait: "visio", discipline_intensif_debut: null, urgence_bloquee: false },
};
const types = ["Étude", "Étude Avancée", "Intensif", "Visio"];

// Attendu, reconstruit indépendamment de l'implémentation à partir de l'article 2.1 CGV
// tel que validé aujourd'hui sur le web : essai simule malin ; Étude → etude|malin ;
// Intensif → malin ; Visio → malin|visio ; Étude Avancée → malin + tranche 3 uniquement.
// Le forfait Visio (attribué au cas par cas par l'admin) ouvre les séances Visio et
// RIEN d'autre (bug corrigé 2026-07-25 : auparavant il ne pouvait réserver aucune séance).
const attendu = {
  essai: { "Étude": null, "Étude Avancée": "Étude Avancée réservée aux élèves de la Tranche 3 (3ème à la Terminale).", "Intensif": null, "Visio": null },
  etude: { "Étude": null, "Étude Avancée": "Étude Avancée réservée au forfait Malin.", "Intensif": "Intensif réservé au forfait Malin.", "Visio": "Visio réservé aux forfaits Visio et Malin." },
  malin: { "Étude": null, "Étude Avancée": null, "Intensif": null, "Visio": null },
  visio: { "Étude": "Réservé aux forfaits Étude et Malin.", "Étude Avancée": "Étude Avancée réservée au forfait Malin.", "Intensif": "Intensif réservé au forfait Malin.", "Visio": null },
};

for (const key of Object.keys(enfants)) {
  for (const type of types) {
    const res = eligibiliteForfait(enfants[key], type);
    check(`${key} (${enfants[key].niveau}, ${enfants[key].type_forfait}) × ${type}`, res, attendu[key][type]);
  }
}

console.log("\n═══ A bis. Gate dossier Malin (secrétariat) — eligibiliteDossierMalin ═══\n");

// seanceExigeDossierMalin : Étude ET Étude Avancée (payées par les frais d'agence)
// restent ouvertes pendant l'instruction ; seul le volet Unipros/URSSAF attend.
check("seanceExigeDossierMalin('Étude')", seanceExigeDossierMalin("Étude"), false);
check("seanceExigeDossierMalin('Étude Avancée')", seanceExigeDossierMalin("Étude Avancée"), false);
check("seanceExigeDossierMalin('Intensif')", seanceExigeDossierMalin("Intensif"), true);
check("seanceExigeDossierMalin('Visio')", seanceExigeDossierMalin("Visio"), true);

const BLOQ = "Disponible une fois votre dossier Malin validé.";

// Malin, dossier NON validé : Étude + Étude Avancée ouvertes, Intensif/Visio bloqués.
check("malin dossier NON validé × Étude → ouvert", eligibiliteDossierMalin(enfants.malin, "Étude", false), null);
check("malin dossier NON validé × Étude Avancée → OUVERT", eligibiliteDossierMalin(enfants.malin, "Étude Avancée", false), null);
check("malin dossier NON validé × Intensif → bloqué", eligibiliteDossierMalin(enfants.malin, "Intensif", false), BLOQ);
check("malin dossier NON validé × Visio → bloqué", eligibiliteDossierMalin(enfants.malin, "Visio", false), BLOQ);

// Malin, dossier VALIDÉ : tout ouvert (le gate ne s'applique plus).
check("malin dossier validé × Intensif → ouvert", eligibiliteDossierMalin(enfants.malin, "Intensif", true), null);
check("malin dossier validé × Visio → ouvert", eligibiliteDossierMalin(enfants.malin, "Visio", true), null);

// Exemptés : essai (pas de dossier) et etude/visio (hors dossier Malin), même dossier non validé.
check("essai × Intensif dossier NON validé → exempté (null)", eligibiliteDossierMalin(enfants.essai, "Intensif", false), null);
check("etude × Étude Avancée dossier NON validé → exempté (null)", eligibiliteDossierMalin(enfants.etude, "Étude Avancée", false), null);
check("visio × Visio dossier NON validé → exempté (null)", eligibiliteDossierMalin(enfants.visio, "Visio", false), null);

console.log("\n═══ A ter. Blocages pour impayé (frais d'agence / Unipros) — eligibiliteImpayes ═══\n");

const FRAIS = "Réservation suspendue : le 2e versement de vos frais d'agence est en attente. Régularisez-le depuis votre espace.";
const UNIPROS = "Réservation suspendue : régularisez votre mensualité auprès d'Unipros.";
const NON = { fraisAgenceBloque: false, uniprosBloque: false };
const FRAIS_ON = { fraisAgenceBloque: true, uniprosBloque: false };
const UNIPROS_ON = { fraisAgenceBloque: false, uniprosBloque: true };

// Aucun impayé → jamais de blocage.
for (const type of [...types, "Domicile"]) {
  check(`aucun impayé × ${type} → ouvert`, eligibiliteImpayes(enfants.malin, type, NON), null);
}

// Frais d'agence bloqué : tout SAUF Domicile est bloqué (Domicile reste ouvert).
check("frais bloqué × Étude → bloqué", eligibiliteImpayes(enfants.malin, "Étude", FRAIS_ON), FRAIS);
check("frais bloqué × Étude Avancée → bloqué", eligibiliteImpayes(enfants.malin, "Étude Avancée", FRAIS_ON), FRAIS);
check("frais bloqué × Intensif → bloqué", eligibiliteImpayes(enfants.malin, "Intensif", FRAIS_ON), FRAIS);
check("frais bloqué × Visio → bloqué", eligibiliteImpayes(enfants.malin, "Visio", FRAIS_ON), FRAIS);
check("frais bloqué × Domicile → OUVERT", eligibiliteImpayes(enfants.malin, "Domicile", FRAIS_ON), null);

// Unipros bloqué : Domicile + Intensif + Visio bloqués ; Étude + Étude Avancée ouverts.
check("unipros bloqué × Domicile → bloqué", eligibiliteImpayes(enfants.malin, "Domicile", UNIPROS_ON), UNIPROS);
check("unipros bloqué × Intensif → bloqué", eligibiliteImpayes(enfants.malin, "Intensif", UNIPROS_ON), UNIPROS);
check("unipros bloqué × Visio → bloqué", eligibiliteImpayes(enfants.malin, "Visio", UNIPROS_ON), UNIPROS);
check("unipros bloqué × Étude → OUVERT", eligibiliteImpayes(enfants.malin, "Étude", UNIPROS_ON), null);
check("unipros bloqué × Étude Avancée → OUVERT", eligibiliteImpayes(enfants.malin, "Étude Avancée", UNIPROS_ON), null);

// Ni Malin ni essai : jamais visé par les impayés Malin, même les deux drapeaux à true.
const TOUS = { fraisAgenceBloque: true, uniprosBloque: true };
check("etude (ni malin ni essai) × Étude, 2 drapeaux ON → exempté", eligibiliteImpayes(enfants.etude, "Étude", TOUS), null);

// ⚠️ ATTENTE CORRIGÉE le 2026-08-21. Ce test attendait `null` (« essai exempté »)
// et échouait depuis la décision du 4 août 2026 : l'essai est SOLIDAIRE des
// impayés du foyer. Un foyer suspendu pouvait sinon inscrire un enfant de plus
// en essai et lui faire consommer les mêmes séances — c'est tout l'objet de la
// migration 20260805_essai_solidaire_des_impayes, qui a fait passer le trigger
// de `v_forfait_reel = 'malin'` à `IN ('malin', 'essai')`.
// C'est bien le TEST qui était périmé : le code du paquet et la fonction
// déployée en base disent la même chose, vérifié ligne à ligne. La suite était
// rouge depuis deux semaines, et une suite rouge finit par ne plus être lue.
check(
  "essai × Intensif, frais d'agence bloqués → SUSPENDU (l'essai est solidaire, 04/08)",
  eligibiliteImpayes(enfants.essai, "Intensif", TOUS),
  "Réservation suspendue : le 2e versement de vos frais d'agence est en attente. Régularisez-le depuis votre espace."
);

console.log("\n═══ B. Cas limites de tranche — 4ème vs 3ème (violeLimiteTrancheAge) ═══\n");

check("tranche('4ème')", tranche("4ème"), 2);
check("tranche('3ème')", tranche("3ème"), 3);

check(
  "Étude Avancée pour un 4ème (tranche 2) — doit être bloquée",
  violeLimiteTrancheAge("4ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 0 }, "Étude Avancée"),
  "L'Étude Avancée est réservée aux élèves de la Tranche 3 (3ème à la Terminale)."
);
check(
  "Étude Avancée pour un 3ème (tranche 3) — doit être autorisée",
  violeLimiteTrancheAge("3ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 0 }, "Étude Avancée"),
  null
);

check(
  "Tranche 1 (CE2) — 2e heure dans la journée — doit être bloquée (max 1h)",
  violeLimiteTrancheAge("CE2", { etude: 1, etudeAvancee: 0, intensif: 0, visio: 0 }, "Étude"),
  "Maximum 1h de séances par jour pour ce niveau."
);
check(
  "Tranche 2 (4ème) — 2e heure dans la journée — doit être autorisée (max 2h)",
  violeLimiteTrancheAge("4ème", { etude: 1, etudeAvancee: 0, intensif: 0, visio: 0 }, "Étude"),
  null
);
check(
  "Tranche 2 (4ème) — 3e heure dans la journée — doit être bloquée (max 2h)",
  violeLimiteTrancheAge("4ème", { etude: 2, etudeAvancee: 0, intensif: 0, visio: 0 }, "Étude"),
  "Maximum 2h de séances par jour pour ce niveau."
);
check(
  "Intensif + Visio le même jour — doit être bloqué",
  violeLimiteTrancheAge("5ème", { etude: 0, etudeAvancee: 0, intensif: 1, visio: 0 }, "Visio"),
  "Intensif et Visio ne peuvent pas être cumulés le même jour pour ce niveau."
);

// ── B bis. Doublons du même type — RÈGLE DIFFÉRENCIÉE (décision du 21/08/2026) ──
// Le cœur de ces tests n'est pas « Tranche 2 bloquée » mais « Tranche 3 NON
// bloquée » : une règle uniforme retirerait un droit existant à 13 élèves.
// Chaque interdiction est donc doublée de son autorisation symétrique.
console.log("\n═══ B bis. Doublons Intensif/Visio — Tranche 2 bornée, Tranche 3 libre ═══\n");

check(
  "T2 (6ème) — 2e Visio le même jour — BLOQUÉE (le défaut trouvé en production)",
  violeLimiteTrancheAge("6ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1 }, "Visio"),
  "Une seule séance de Visio par jour pour ce niveau."
);
check(
  "T2 (6ème) — 2e Intensif le même jour — BLOQUÉ",
  violeLimiteTrancheAge("6ème", { etude: 0, etudeAvancee: 0, intensif: 1, visio: 0 }, "Intensif"),
  "Une seule séance d'Intensif par jour pour ce niveau."
);
check(
  "T2 (CM1) — borne basse de la tranche — 2e Visio BLOQUÉE",
  violeLimiteTrancheAge("CM1", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1 }, "Visio"),
  "Une seule séance de Visio par jour pour ce niveau."
);
check(
  "T2 (4ème) — borne haute de la tranche — 2e Visio BLOQUÉE",
  violeLimiteTrancheAge("4ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1 }, "Visio"),
  "Une seule séance de Visio par jour pour ce niveau."
);

check(
  "T3 (3ème) — borne basse de la tranche — 2e Visio AUTORISÉE",
  violeLimiteTrancheAge("3ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1 }, "Visio"),
  null
);
check(
  "T3 (2nde) — 2e Visio AUTORISÉE (Yacine, Edhana : réservations existantes)",
  violeLimiteTrancheAge("2nde", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1 }, "Visio"),
  null
);
check(
  "T3 (2nde) — 2e Intensif AUTORISÉ (Edhana : réservations existantes)",
  violeLimiteTrancheAge("2nde", { etude: 0, etudeAvancee: 0, intensif: 1, visio: 0 }, "Intensif"),
  null
);
check(
  "T3 (Terminale) — borne haute — 2e Visio AUTORISÉE (Omrane)",
  violeLimiteTrancheAge("Terminale", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1 }, "Visio"),
  null
);
check(
  "T3 (2nde) — 3e séance quand même bloquée par le plafond de 2h",
  violeLimiteTrancheAge("2nde", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 2 }, "Visio"),
  "Maximum 2h de séances par jour pour ce niveau."
);

check(
  "T2 (6ème) — Étude + Étude reste AUTORISÉE (décision explicite)",
  violeLimiteTrancheAge("6ème", { etude: 1, etudeAvancee: 0, intensif: 0, visio: 0 }, "Étude"),
  null
);
check(
  "T2 (6ème) — Étude + Visio reste AUTORISÉE",
  violeLimiteTrancheAge("6ème", { etude: 1, etudeAvancee: 0, intensif: 0, visio: 0 }, "Visio"),
  null
);
check(
  "T2 (6ème) — Étude + Intensif reste AUTORISÉ",
  violeLimiteTrancheAge("6ème", { etude: 1, etudeAvancee: 0, intensif: 0, visio: 0 }, "Intensif"),
  null
);
check(
  "T1 (CE1) — 2e Visio bloquée par le plafond d'1h, pas par la règle neuve",
  violeLimiteTrancheAge("CE1", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1 }, "Visio"),
  "Maximum 1h de séances par jour pour ce niveau."
);

// ── Places d'attente parent : une ligne confirmée qui n'est PAS une séance ──
// La RPC reserver_attente_parent pose une réservation sur le créneau ADJACENT.
// Le planning contient 17 paires de Visio adjacentes et 10 d'Intensif : sans
// cette exclusion, un parent de Tranche 2 se verrait refuser la place où son
// enfant attend, au motif qu'il aurait « deux Visio ».
check(
  "T2 (6ème) — la Visio du jour est une PLACE D'ATTENTE → une vraie Visio reste possible",
  violeLimiteTrancheAge("6ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1, visioChoisies: 0 }, "Visio"),
  null
);
check(
  "T2 (6ème) — la Visio du jour est une VRAIE séance → la 2e est bloquée",
  violeLimiteTrancheAge("6ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1, visioChoisies: 1 }, "Visio"),
  "Une seule séance de Visio par jour pour ce niveau."
);
check(
  "T2 (6ème) — l'Intensif du jour est une PLACE D'ATTENTE → un vrai Intensif reste possible",
  violeLimiteTrancheAge("6ème", { etude: 0, etudeAvancee: 0, intensif: 1, visio: 0, intensifChoisies: 0 }, "Intensif"),
  null
);
check(
  "T2 (6ème) — 2 vraies Visio + 1 place d'attente → le plafond de 2h reprend la main",
  violeLimiteTrancheAge("6ème", { etude: 2, etudeAvancee: 0, intensif: 0, visio: 1, visioChoisies: 0 }, "Visio"),
  "Maximum 2h de séances par jour pour ce niveau."
);
check(
  "T2 (6ème) — l'Intensif du jour est une RETENUE → l'Intensif habituel reste possible",
  violeLimiteTrancheAge("6ème", { etude: 0, etudeAvancee: 0, intensif: 1, visio: 0, intensifChoisies: 0 }, "Intensif"),
  null
);
check(
  "T2 (6ème) — une retenue Visio + une vraie Visio → la 2e vraie Visio est bloquée",
  violeLimiteTrancheAge("6ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 2, visioChoisies: 1 }, "Visio"),
  "Une seule séance de Visio par jour pour ce niveau."
);
check(
  "Client non reconstruit (champs absents) — retombe sur le compteur brut, donc STRICT",
  violeLimiteTrancheAge("6ème", { etude: 0, etudeAvancee: 0, intensif: 0, visio: 1 }, "Visio"),
  "Une seule séance de Visio par jour pour ce niveau."
);

console.log("\n═══ C. Seuils d'annulation (regleAnnulation) ═══\n");

function dansXHeures(h) {
  const d = new Date(Date.now() + h * 60 * 60 * 1000);
  // Date ET heure en LOCAL (cohérent avec minutesAvantSeance qui reconstruit via
  // new Date(y,m-1,d,h,min) local). Auparavant dateISO venait de toISOString()
  // (UTC) alors que heure venait de getHours() (local) : dès qu'un instant
  // traversait minuit UTC (ex. 10h en soirée locale), la séance était placée dans
  // le passé → test non déterministe selon l'heure d'exécution.
  const dateISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const heure = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { dateISO, heure };
}

const libre = dansXHeures(19);
check(`Séance dans 19h (${libre.dateISO} ${libre.heure}) → libre`, regleAnnulation(libre.dateISO, libre.heure), "libre");

const frais = dansXHeures(10);
check(`Séance dans 10h (${frais.dateISO} ${frais.heure}) → frais`, regleAnnulation(frais.dateISO, frais.heure), "frais");

const impossible = dansXHeures(1);
check(`Séance dans 1h (${impossible.dateISO} ${impossible.heure}) → impossible`, regleAnnulation(impossible.dateISO, impossible.heure), "impossible");

const limiteHaute = dansXHeures(18.1);
check(`Séance dans 18h06 (juste au-dessus du seuil 18h) → libre`, regleAnnulation(limiteHaute.dateISO, limiteHaute.heure), "libre");

const justeAuDessusDe2h = dansXHeures(2.1);
check(`Séance dans 2h06 (juste au-dessus du seuil 2h) → frais`, regleAnnulation(justeAuDessusDe2h.dateISO, justeAuDessusDe2h.heure), "frais");

const justeEnDessousDe2h = dansXHeures(1.9);
check(`Séance dans 1h54 (juste en dessous du seuil 2h) → impossible`, regleAnnulation(justeEnDessousDe2h.dateISO, justeEnDessousDe2h.heure), "impossible");


// ═══ D. Suspension pour impayé (la SEULE sanction automatique du système) ═══
// Un faux positif ici coupe l'accès d'une famille payante : la matrice est exhaustive.

console.log("\n═══ D. Suspension pour impayé ═══\n");

const JOUR = "2026-10-10";
const ech = (statut, montantCentimes, graceJusquAu) => ({ statut, montantCentimes, graceJusquAu });
const DU = 5000;

// -- Matrice des statuts (grâce dépassée dans tous les cas) --
check("statut 'echec' + grâce dépassée → SUSPEND",
  echeanceJustifieSuspension(ech("echec", DU, "2026-10-09"), JOUR), true);
check("statut 'a_venir' (jamais tenté) → jamais suspendu",
  echeanceJustifieSuspension(ech("a_venir", DU, "2026-10-09"), JOUR), false);
check("statut 'debite' (le foyer a payé) → jamais suspendu",
  echeanceJustifieSuspension(ech("debite", DU, "2026-10-09"), JOUR), false);
check("statut 'annule' (rétractation) → jamais suspendu",
  echeanceJustifieSuspension(ech("annule", DU, "2026-10-09"), JOUR), false);

// -- Le délai de grâce --
check("grâce ABSENTE (jamais accordée) → pas de sanction",
  echeanceJustifieSuspension(ech("echec", DU, null), JOUR), false);
check("grâce encore ouverte (demain) → pas encore",
  echeanceJustifieSuspension(ech("echec", DU, "2026-10-11"), JOUR), false);
check("grâce expirant AUJOURD'HUI → le foyer a encore la journée",
  echeanceJustifieSuspension(ech("echec", DU, JOUR), JOUR), false);
check("grâce expirée d'un jour → SUSPEND",
  echeanceJustifieSuspension(ech("echec", DU, "2026-10-09"), JOUR), true);

// -- Le piège du run courant : l'échec vient d'être posé, grâce à J+7 --
check("échec posé aujourd'hui (grâce J+7) → PAS suspendu le jour même",
  echeanceJustifieSuspension(ech("echec", DU, "2026-10-17"), JOUR), false);

// -- Montant --
check("solde nul en échec → jamais de suspension pour 0 €",
  echeanceJustifieSuspension(ech("echec", 0, "2026-10-09"), JOUR), false);

// -- Au niveau du FOYER --
check("foyer sans enfant Malin → jamais suspendu (rempart sans objet)",
  foyerDoitEtreSuspendu([ech("echec", DU, "2026-10-09")], false, JOUR), false);
check("foyer Malin, une échéance justifiée → suspendu",
  foyerDoitEtreSuspendu([ech("echec", DU, "2026-10-09")], true, JOUR), true);
check("foyer Malin, une seule des deux échéances justifie → suspendu",
  foyerDoitEtreSuspendu([ech("debite", DU, null), ech("echec", DU, "2026-10-09")], true, JOUR), true);
check("foyer Malin sans aucune échéance → pas suspendu",
  foyerDoitEtreSuspendu([], true, JOUR), false);

// -- La soupape : libération automatique (évite le blocage à vie) --
check("suspendu mais plus aucun impayé → LIBÉRÉ",
  foyerDoitEtreLibere(true, [ech("debite", DU, null)], true, JOUR), true);
check("suspendu et impayé toujours là → reste suspendu",
  foyerDoitEtreLibere(true, [ech("echec", DU, "2026-10-09")], true, JOUR), false);
check("suspendu mais plus d'enfant Malin → LIBÉRÉ",
  foyerDoitEtreLibere(true, [ech("echec", DU, "2026-10-09")], false, JOUR), true);
check("pas suspendu → rien à libérer",
  foyerDoitEtreLibere(false, [ech("debite", DU, null)], true, JOUR), false);

console.log(`\n${fail === 0 ? "🎉 Tous les scénarios donnent le résultat attendu." : `❌ ${fail} scénario(s) en écart.`}\n`);
process.exitCode = fail === 0 ? 0 : 1;
