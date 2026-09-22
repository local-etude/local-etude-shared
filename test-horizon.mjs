// ═══════════════════════════════════════════════════════════════════════════
// HORIZON DE RÉSERVATION — 14 jours calendaires, bornes incluses
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Stephen du 22/09/2026 (REFERENCE § 7) : « Un parent peut réserver
// toute séance dont la date est comprise entre aujourd'hui et aujourd'hui + 14
// jours inclus. » Jours calendaires, calendrier de Paris, bornes incluses.
//
// Ce fichier est séparé de test.mjs parce qu'il FIGE L'HORLOGE : les fonctions
// d'horizon lisent `new Date()` à chaque appel, et un test qui dépend du jour où
// on le lance ne prouve rien. Le stub remplace le constructeur SANS argument et
// laisse passer tous les autres — `new Date(annee, mois, jour)` doit continuer à
// fonctionner, c'est lui qui fabrique les bornes.
//
// Lancer : node test-horizon.mjs — appelé par `npm test`. Sans argument, le
// fichier SE RELANCE dans plusieurs fuseaux (Vercel tourne en UTC, le téléphone
// du parent dans le sien) : une règle de calendrier qui n'est vérifiée que dans
// le fuseau du poste ne prouve presque rien. Le rappel en commentaire ne
// suffisait pas — personne ne retape une variable d'environnement à la main.
// ═══════════════════════════════════════════════════════════════════════════

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Les fuseaux du balayage : celui de l'agence, celui du serveur, un fuseau en
// retard, un en avance, et deux à décalage NON ENTIER — c'est là que les calculs
// de date se cassent d'habitude.
const FUSEAUX = [
  "Europe/Paris",
  "UTC",
  "America/Los_Angeles",
  "Pacific/Auckland",
  "Asia/Kolkata",
  "Australia/Lord_Howe",
];

if (process.argv[2] !== "--un-seul-fuseau") {
  const moi = fileURLToPath(import.meta.url);
  let echecs = 0;
  for (const tz of FUSEAUX) {
    process.stdout.write(`\n──────── TZ=${tz} ────────`);
    try {
      execFileSync(process.execPath, [moi, "--un-seul-fuseau"], {
        env: { ...process.env, TZ: tz },
        stdio: "inherit",
      });
    } catch {
      echecs++;
    }
  }
  console.log(
    `\n${echecs === 0 ? `✅ LES ${FUSEAUX.length} FUSEAUX PASSENT` : `❌ ${echecs} FUSEAU(X) EN ÉCHEC`}\n`
  );
  process.exit(echecs === 0 ? 0 : 1);
}

import {
  HORIZON_JOURS,
  parisAujourdhuiISO,
  getHorizonReservation,
  dateDansHorizon,
  getSemaineMaxOffset,
  getSemaineLimites,
} from "./dist/index.js";

const VraieDate = Date;
let fail = 0;

function figerHorloge(instantUTC) {
  globalThis.Date = class extends VraieDate {
    constructor(...args) {
      if (args.length === 0) super(instantUTC);
      else super(...args);
    }
    static now() {
      return new VraieDate(instantUTC).getTime();
    }
  };
}
function rendreHorloge() {
  globalThis.Date = VraieDate;
}

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✅" : "❌"} ${label} → ${JSON.stringify(actual)}${ok ? "" : `  (attendu ${JSON.stringify(expected)})`}`);
  if (!ok) fail++;
}

console.log(`\nFuseau de la machine : ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

// ─── A. La constante et les bornes ──────────────────────────────────────────
console.log("\n═══ A. Les deux bornes, INCLUSES ═══\n");

check("HORIZON_JOURS", HORIZON_JOURS, 14);

// Mardi 22 septembre 2026, 12 h 00 UTC (14 h à Paris).
figerHorloge("2026-09-22T12:00:00Z");
check("aujourd'hui (Paris)", parisAujourdhuiISO(), "2026-09-22");
check("horizon", getHorizonReservation(), { premierJour: "2026-09-22", dernierJour: "2026-10-06" });

check("J+0  — aujourd'hui           → accepté", dateDansHorizon("2026-09-22"), true);
check("J+1                          → accepté", dateDansHorizon("2026-09-23"), true);
check("J+13                         → accepté", dateDansHorizon("2026-10-05"), true);
check("J+14 — dernier jour inclus   → accepté", dateDansHorizon("2026-10-06"), true);
check("J+15 — premier jour au-delà  → REFUSÉ ", dateDansHorizon("2026-10-07"), false);
check("J+16                         → REFUSÉ ", dateDansHorizon("2026-10-08"), false);
check("J-1  — hier                  → REFUSÉ ", dateDansHorizon("2026-09-21"), false);

// Un instant complet au lieu d'une date : le dernier jour de la fenêtre serait
// refusé en silence sans la normalisation (« 2026-10-06T00:00:00Z » > « 2026-10-06 »).
check("J+14 passé en instant ISO    → accepté", dateDansHorizon("2026-10-06T00:00:00.000Z"), true);
check("J+15 passé en instant ISO    → REFUSÉ ", dateDansHorizon("2026-10-07T00:00:00.000Z"), false);

// Les trois Visio du 08/10 qui ont déclenché le chantier (HISTORIQUE 16.316) :
// posées le 21/09, à J+17 de ce jour-là. Sous la règle des 14 jours, l'écran ne
// les aurait pas proposées.
figerHorloge("2026-09-21T15:52:00Z");
check("21/09 : horizon", getHorizonReservation(), { premierJour: "2026-09-21", dernierJour: "2026-10-05" });
check("21/09 : les 3 Visio du 08/10 → REFUSÉES", dateDansHorizon("2026-10-08"), false);
check("21/09 : l'ancienne borne allait jusqu'au 11/10 → REFUSÉ", dateDansHorizon("2026-10-11"), false);

// ─── B. Débordements de mois et d'année ─────────────────────────────────────
console.log("\n═══ B. Fin de mois, fin d'année, année bissextile ═══\n");

figerHorloge("2026-12-25T10:00:00Z");
check("25 déc. → 8 janv. (passage d'année)", getHorizonReservation().dernierJour, "2027-01-08");

figerHorloge("2026-10-25T10:00:00Z");
check("25 oct. → 8 nov. (passage d'heure d'hiver le 25)", getHorizonReservation().dernierJour, "2026-11-08");

figerHorloge("2028-02-20T10:00:00Z");
check("20 fév. 2028 (bissextile) → 5 mars", getHorizonReservation().dernierJour, "2028-03-05");

figerHorloge("2027-02-20T10:00:00Z");
check("20 fév. 2027 (non bissextile) → 6 mars", getHorizonReservation().dernierJour, "2027-03-06");

// ─── C. Le passage de minuit, calendrier de PARIS ───────────────────────────
console.log("\n═══ C. Minuit à Paris, pas minuit UTC ═══\n");

// ÉTÉ (UTC+2). 21 h 59 UTC = 23 h 59 à Paris : on est encore le 22.
figerHorloge("2026-09-22T21:59:00Z");
check("22 sept. 23 h 59 (Paris) : aujourd'hui", parisAujourdhuiISO(), "2026-09-22");
check("22 sept. 23 h 59 (Paris) : dernier jour", getHorizonReservation().dernierJour, "2026-10-06");
check("22 sept. 23 h 59 : le 07/10 est hors horizon", dateDansHorizon("2026-10-07"), false);

// 22 h 00 UTC = minuit à Paris : on est passé au 23, et l'horizon avance d'un jour.
figerHorloge("2026-09-22T22:00:00Z");
check("23 sept. 00 h 00 (Paris) : aujourd'hui", parisAujourdhuiISO(), "2026-09-23");
check("23 sept. 00 h 00 (Paris) : dernier jour", getHorizonReservation().dernierJour, "2026-10-07");
check("23 sept. 00 h 00 : le 07/10 vient de s'ouvrir", dateDansHorizon("2026-10-07"), true);
check("23 sept. 00 h 00 : le 22/09 est retombé hors horizon", dateDansHorizon("2026-09-22"), false);

// HIVER (UTC+1). 22 h 59 UTC = 23 h 59 à Paris : encore le 15.
figerHorloge("2026-12-15T22:59:00Z");
check("15 déc. 23 h 59 (Paris) : aujourd'hui", parisAujourdhuiISO(), "2026-12-15");
check("15 déc. 23 h 59 (Paris) : dernier jour", getHorizonReservation().dernierJour, "2026-12-29");

// 23 h 00 UTC = minuit à Paris.
figerHorloge("2026-12-15T23:00:00Z");
check("16 déc. 00 h 00 (Paris) : aujourd'hui", parisAujourdhuiISO(), "2026-12-16");
check("16 déc. 00 h 00 (Paris) : dernier jour", getHorizonReservation().dernierJour, "2026-12-30");

// Le piège que l'ancre de Paris existe pour éviter : 23 h 00 UTC en été, c'est
// déjà le lendemain à Paris. Un calcul fait en UTC serait resté la veille.
figerHorloge("2026-07-01T23:00:00Z");
check("2 juil. 01 h 00 (Paris) alors qu'il est encore le 1er en UTC", parisAujourdhuiISO(), "2026-07-02");

// ─── D. L'offset de semaine est DÉDUIT de l'horizon ─────────────────────────
console.log("\n═══ D. Navigation par semaine : la dernière semaine est TRONQUÉE ═══\n");

// Du lundi 21 au dimanche 27 septembre 2026 : l'offset max vaut 2 tous les jours
// de la semaine, mais le nombre de jours réservables dans cette 3ᵉ semaine varie
// de 1 (le lundi) à 7 (le dimanche). C'est ce que les écrans doivent dire.
const semaine = [
  ["lundi 21",    "2026-09-21", "2026-10-05", 1],
  ["mardi 22",    "2026-09-22", "2026-10-06", 2],
  ["mercredi 23", "2026-09-23", "2026-10-07", 3],
  ["jeudi 24",    "2026-09-24", "2026-10-08", 4],
  ["vendredi 25", "2026-09-25", "2026-10-09", 5],
  ["samedi 26",   "2026-09-26", "2026-10-10", 6],
  ["dimanche 27", "2026-09-27", "2026-10-11", 7],
];
for (const [label, jour, dernier, joursVisiblesS2] of semaine) {
  figerHorloge(`${jour}T12:00:00Z`);
  const { lundi, dimanche } = getSemaineLimites(getSemaineMaxOffset());
  check(`${label} : offset max`, getSemaineMaxOffset(), 2);
  check(`${label} : dernier jour réservable`, getHorizonReservation().dernierJour, dernier);
  check(`${label} : la dernière semaine affichée est ${lundi}→${dimanche}, dont ${joursVisiblesS2} jour(s) réservable(s)`,
    [lundi <= dernier, dernier <= dimanche], [true, true]);
}

// Le dimanche, la semaine +2 est réservable en entier : c'est le seul jour où
// l'horizon tombe pile sur un dimanche. Tous les autres jours, elle est coupée.
figerHorloge("2026-09-27T12:00:00Z");
check("dimanche : le dernier jour tombe pile sur le dimanche de la semaine +2",
  getHorizonReservation().dernierJour, getSemaineLimites(2).dimanche);
figerHorloge("2026-09-22T12:00:00Z");
check("mardi : le dernier jour tombe AVANT le dimanche de la semaine +2",
  getHorizonReservation().dernierJour < getSemaineLimites(2).dimanche, true);

// Et la semaine 0 comme la semaine 1 sont, elles, entièrement dans l'horizon
// côté FIN — mais la semaine 0 contient des jours ÉCOULÉS, qui n'y sont pas.
check("mardi : le lundi écoulé de la semaine courante est hors horizon",
  dateDansHorizon(getSemaineLimites(0).lundi), false);
check("mardi : le dimanche de la semaine +1 est dans l'horizon",
  dateDansHorizon(getSemaineLimites(1).dimanche), true);

rendreHorloge();

console.log(`\n${fail === 0 ? "✅ TOUT PASSE" : `❌ ${fail} ÉCHEC(S)`}\n`);
process.exit(fail === 0 ? 0 : 1);
