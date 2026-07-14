import {
  tranche,
  eligibiliteForfait,
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
};
const types = ["Étude", "Étude Avancée", "Intensif", "Visio"];

// Attendu, reconstruit indépendamment de l'implémentation à partir de l'article 2.1 CGV
// tel que validé aujourd'hui sur le web : essai simule malin ; Étude → etude|malin ;
// Intensif/Visio → malin uniquement ; Étude Avancée → malin + tranche 3 uniquement.
const attendu = {
  essai: { "Étude": null, "Étude Avancée": "Étude Avancée réservée aux élèves de la Tranche 3 (3ème à la Terminale).", "Intensif": null, "Visio": null },
  etude: { "Étude": null, "Étude Avancée": "Étude Avancée réservée au forfait Malin.", "Intensif": "Intensif réservé au forfait Malin.", "Visio": "Visio réservé au forfait Malin." },
  malin: { "Étude": null, "Étude Avancée": null, "Intensif": null, "Visio": null },
};

for (const key of Object.keys(enfants)) {
  for (const type of types) {
    const res = eligibiliteForfait(enfants[key], type);
    check(`${key} (${enfants[key].niveau}, ${enfants[key].type_forfait}) × ${type}`, res, attendu[key][type]);
  }
}

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

console.log("\n═══ C. Seuils d'annulation (regleAnnulation) ═══\n");

function dansXHeures(h) {
  const d = new Date(Date.now() + h * 60 * 60 * 1000);
  const dateISO = d.toISOString().split("T")[0];
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

console.log(`\n${fail === 0 ? "🎉 Tous les scénarios donnent le résultat attendu." : `❌ ${fail} scénario(s) en écart.`}\n`);
process.exitCode = fail === 0 ? 0 : 1;
