// ═══════════════════════════════════════════════════════════════════════════
// LOT L2 (plan § 255) — doublons en Tranche 3, garde et retenue hors limite,
// annulation à moins de 2 h en heure de Paris, garde, Visio en autonomie, urgence
// ═══════════════════════════════════════════════════════════════════════════
// Décisions D3, D5, D6, D7, D8, D9, D10, D11 du 16/11/2026 (HISTORIQUE 16.402).
//
// Comme test-horizon.mjs, ce fichier FIGE L'HORLOGE (les règles d'annulation
// lisent Date.now()) et SE RELANCE dans plusieurs fuseaux : la règle d'annulation
// doit donner la même réponse sur le serveur (UTC) et sur un téléphone réglé
// ailleurs, puisqu'elle se calcule désormais en heure de PARIS.
//
// Lancer : node test-regles-l2.mjs — appelé par `npm test`.
// ═══════════════════════════════════════════════════════════════════════════

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  CLES_DATES_EFFET,
  regleActive,
  decalageParisMinutes,
  instantParis,
  ajouterJoursISO,
  minutesAvantSeance,
  regleAnnulation,
  regleAnnulationPlace,
  violeLimiteTrancheAge,
  CODES_POSTAUX_AGENCES,
  familleEloignee,
  eligibiliteGarde,
  signalGardePossible,
  eligibiliteAutonomieVisio,
  TYPES_EPREUVE_URGENCE,
  URGENCE_DELAI_EPREUVE_JOURS,
  MESSAGE_URGENCE_METTRE_A_JOUR,
  MESSAGE_URGENCE_PRISE,
  placesUrgenceRestantes,
  eligibiliteUrgence,
} from "./dist/index.js";

const VraieDate = Date;
let fail = 0;
let total = 0;

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
  total++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.log(`❌ ${label} → ${JSON.stringify(actual)}  (attendu ${JSON.stringify(expected)})`);
    fail++;
  } else if (process.env.VERBEUX) {
    console.log(`✅ ${label} → ${JSON.stringify(actual)}`);
  }
}
function section(titre) {
  if (process.env.VERBEUX) console.log(`\n═══ ${titre} ═══\n`);
}

console.log(`\nFuseau de la machine : ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

// ─── A. Dates d'effet : miroir de regle_active() en SQL ─────────────────────
section("A. regleActive");
check("clés semées par la migration L1a", CLES_DATES_EFFET, {
  doublonsT3: "doublons_t3",
  annulationMoins2h: "annulation_moins_2h",
  urgenceBlocageMois: "urgence_blocage_mois",
  etudeAvancee18: "etude_avancee_18",
});
check("date d'effet NULL → inactive", regleActive(null, "2027-01-20"), false);
check("date d'effet absente → inactive", regleActive(undefined, "2027-01-20"), false);
check("date d'effet vide → inactive", regleActive("", "2027-01-20"), false);
check("séance sans date → inactive", regleActive("2027-01-15", null), false);
check("séance la veille du jour d'effet → inactive", regleActive("2027-01-15", "2027-01-14"), false);
check("séance LE jour d'effet → ACTIVE (borne incluse)", regleActive("2027-01-15", "2027-01-15"), true);
check("séance le lendemain → active", regleActive("2027-01-15", "2027-01-16"), true);
check("passage d'année : 31/12 avant un effet au 01/01 → inactive", regleActive("2027-01-01", "2026-12-31"), false);
check("instant complet le jour d'effet → active (slice)", regleActive("2027-01-15", "2027-01-15T00:00:00.000Z"), true);
check("date d'effet passée en instant → lue au jour", regleActive("2027-01-15T23:00:00Z", "2027-01-15"), true);

// ─── B. Heure de Paris, sans Intl : recoupement avec la base de fuseaux ─────
section("B. decalageParisMinutes / instantParis");
function decalageIntl(ms) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(new VraieDate(ms)).map((x) => [x.type, x.value]));
  const commeUTC = VraieDate.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (commeUTC - ms) / 60_000;
}
// Toutes les heures de 2026 à 2030, plus les minutes qui encadrent chaque changement.
let ecartsDecalage = 0;
for (let ms = VraieDate.UTC(2026, 0, 1); ms < VraieDate.UTC(2031, 0, 1); ms += 3_600_000) {
  if (decalageParisMinutes(ms) !== decalageIntl(ms)) ecartsDecalage++;
}
check("décalage arithmétique = base de fuseaux, chaque heure 2026-2030", ecartsDecalage, 0);
for (const [label, iso, attendu] of [
  ["28/03/2027 00:59:59 UTC (dernière seconde d'hiver)", "2027-03-28T00:59:59Z", 60],
  ["28/03/2027 01:00:00 UTC (première seconde d'été)", "2027-03-28T01:00:00Z", 120],
  ["25/10/2026 00:59:59 UTC (dernière seconde d'été)", "2026-10-25T00:59:59Z", 120],
  ["25/10/2026 01:00:00 UTC (première seconde d'hiver)", "2026-10-25T01:00:00Z", 60],
  ["29/03/2026 01:00 UTC", "2026-03-29T01:00:00Z", 120],
  ["31/10/2027 01:00 UTC", "2027-10-31T01:00:00Z", 60],
]) {
  check(`décalage ${label}`, decalageParisMinutes(VraieDate.parse(iso)), attendu);
}
// instantParis = l'instant dont l'heure murale de Paris est celle demandée.
let ecartsInstant = 0;
for (let jour = VraieDate.UTC(2026, 0, 1); jour < VraieDate.UTC(2028, 0, 1); jour += 86_400_000) {
  const d = new VraieDate(jour).toISOString().slice(0, 10);
  for (const h of ["00:00", "08:30", "13:00", "17:00", "18:00", "19:30", "23:59"]) {
    const ms = instantParis(d, h);
    const mur = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new VraieDate(ms));
    if (mur !== `${d} ${h}`) ecartsInstant++;
  }
}
check("instantParis relu à Paris = heure demandée, 7 heures × chaque jour 2026-2027", ecartsInstant, 0);
check("20/11/2026 17:00 Paris (hiver) = 16:00 UTC", new VraieDate(instantParis("2026-11-20", "17:00")).toISOString(), "2026-11-20T16:00:00.000Z");
check("20/06/2027 17:00 Paris (été) = 15:00 UTC", new VraieDate(instantParis("2027-06-20", "17:00")).toISOString(), "2027-06-20T15:00:00.000Z");
check("secondes acceptées et ignorées (17:00:00)", instantParis("2026-11-20", "17:00:00"), instantParis("2026-11-20", "17:00"));
check("nuit d'hiver : 02:30 jouée deux fois → la première (00:30 UTC)", new VraieDate(instantParis("2026-10-25", "02:30")).toISOString(), "2026-10-25T00:30:00.000Z");
check("nuit d'hiver : 03:30 → 02:30 UTC", new VraieDate(instantParis("2026-10-25", "03:30")).toISOString(), "2026-10-25T02:30:00.000Z");
check("nuit d'été : 02:30 n'existe pas → lue 03:30 d'été (01:30 UTC)", new VraieDate(instantParis("2027-03-28", "02:30")).toISOString(), "2027-03-28T01:30:00.000Z");
check("nuit d'été : 03:30 → 01:30 UTC", new VraieDate(instantParis("2027-03-28", "03:30")).toISOString(), "2027-03-28T01:30:00.000Z");
check("nuit d'été : 01:30 → 00:30 UTC", new VraieDate(instantParis("2027-03-28", "01:30")).toISOString(), "2027-03-28T00:30:00.000Z");
check("1er janvier 00:30 → 31/12 23:30 UTC", new VraieDate(instantParis("2027-01-01", "00:30")).toISOString(), "2026-12-31T23:30:00.000Z");
check("ajouterJoursISO fin de mois", ajouterJoursISO("2026-11-28", 4), "2026-12-02");
check("ajouterJoursISO fin d'année", ajouterJoursISO("2026-12-30", 4), "2027-01-03");
check("ajouterJoursISO bissextile", ajouterJoursISO("2028-02-27", 4), "2028-03-02");
check("ajouterJoursISO enjambe le changement d'heure", ajouterJoursISO("2027-03-26", 4), "2027-03-30");
check("ajouterJoursISO négatif", ajouterJoursISO("2027-03-01", -1), "2027-02-28");

// ─── C. regleAnnulation : bornes, Paris, changements d'heure ────────────────
section("C. regleAnnulation (D3, D5)");
const ACTIVE = { annulationMoins2hActive: true };
// Séance du vendredi 20/11/2026 à 17:00 Paris = 16:00 UTC.
const S = ["2026-11-20", "17:00"];
const cas = [
  // [instant UTC du clic, sans règle, règle active, libellé]
  ["2026-11-19T21:59:00Z", "libre", "libre", "18 h 01 avant"],
  ["2026-11-19T22:00:00Z", "frais", "frais", "18 h pile avant (borne : frais)"],
  ["2026-11-19T22:01:00Z", "frais", "frais", "17 h 59 avant"],
  ["2026-11-20T13:59:00Z", "frais", "frais", "2 h 01 avant"],
  ["2026-11-20T13:59:59Z", "frais", "frais", "2 h 00 min 01 s avant"],
  ["2026-11-20T14:00:00Z", "impossible", "moins_2h", "2 h pile avant (borne : moins de 2 h)"],
  ["2026-11-20T14:01:00Z", "impossible", "moins_2h", "1 h 59 avant"],
  ["2026-11-20T15:59:00Z", "impossible", "moins_2h", "1 min avant"],
  ["2026-11-20T15:59:59Z", "impossible", "moins_2h", "1 s avant"],
  ["2026-11-20T16:00:00Z", "impossible", "impossible", "heure de début pile (commencée)"],
  ["2026-11-20T16:00:01Z", "impossible", "impossible", "1 s après le début"],
  ["2026-11-20T17:30:00Z", "impossible", "impossible", "séance terminée"],
  ["2026-11-25T10:00:00Z", "impossible", "impossible", "séance passée de plusieurs jours"],
];
for (const [clic, sans, avec, label] of cas) {
  figerHorloge(clic);
  check(`20/11 17:00, clic ${label} — règle inactive`, regleAnnulation(...S), sans);
  check(`20/11 17:00, clic ${label} — règle inactive (option fausse)`, regleAnnulation(...S, { annulationMoins2hActive: false }), sans);
  check(`20/11 17:00, clic ${label} — règle ACTIVE`, regleAnnulation(...S, ACTIVE), avec);
}
figerHorloge("2026-11-20T14:00:00Z");
check("minutesAvantSeance : 2 h pile = 120 min, quel que soit le fuseau", minutesAvantSeance(...S), 120);

// Été : séance du 20/06/2027 à 17:00 Paris = 15:00 UTC.
figerHorloge("2027-06-20T13:00:00Z");
check("été, 2 h pile avant → moins_2h", regleAnnulation("2027-06-20", "17:00", ACTIVE), "moins_2h");
figerHorloge("2027-06-20T12:59:00Z");
check("été, 2 h 01 avant → frais", regleAnnulation("2027-06-20", "17:00", ACTIVE), "frais");
figerHorloge("2027-06-20T15:00:00Z");
check("été, heure de début → impossible", regleAnnulation("2027-06-20", "17:00", ACTIVE), "impossible");

// Le changement d'heure ENTRE le clic et la séance : la nuit dure 23 ou 25 heures,
// les seuils comptent en heures RÉELLES.
// Hiver : séance le dimanche 25/10/2026 à 14:00 Paris (13:00 UTC, heure d'hiver).
// Samedi 24/10 à 20:00 Paris = 18:00 UTC (été) : 19 h réelles avant → libre.
figerHorloge("2026-10-24T18:00:00Z");
check("nuit de 25 h : samedi 20:00 → dimanche 14:00 = 19 h réelles → libre", regleAnnulation("2026-10-25", "14:00", ACTIVE), "libre");
// Samedi 21:00 Paris = 19:00 UTC : 18 h réelles pile → frais (alors que l'horloge murale dit 17 h).
figerHorloge("2026-10-24T19:00:00Z");
check("nuit de 25 h : samedi 21:00 → 18 h réelles pile → frais", regleAnnulation("2026-10-25", "14:00", ACTIVE), "frais");
figerHorloge("2026-10-24T18:59:00Z");
check("nuit de 25 h : samedi 20:59 → 18 h 01 réelles → libre", regleAnnulation("2026-10-25", "14:00", ACTIVE), "libre");
// Été : séance le dimanche 28/03/2027 à 14:00 Paris (12:00 UTC, heure d'été).
// Samedi 27/03 à 19:00 Paris = 18:00 UTC (hiver) : 18 h réelles pile → frais.
figerHorloge("2027-03-27T18:00:00Z");
check("nuit de 23 h : samedi 19:00 → 18 h réelles pile → frais", regleAnnulation("2027-03-28", "14:00", ACTIVE), "frais");
figerHorloge("2027-03-27T17:59:00Z");
check("nuit de 23 h : samedi 18:59 → 18 h 01 réelles → libre", regleAnnulation("2027-03-28", "14:00", ACTIVE), "libre");
// Séance le matin d'un changement d'heure : 2 h pile avant une séance à 09:00 d'été.
figerHorloge("2027-03-28T05:00:00Z");
check("dimanche du passage à l'été, 09:00 : 2 h pile avant → moins_2h", regleAnnulation("2027-03-28", "09:00", ACTIVE), "moins_2h");
figerHorloge("2026-10-25T06:00:00Z");
check("dimanche du passage à l'hiver, 09:00 : 2 h pile avant → moins_2h", regleAnnulation("2026-10-25", "09:00", ACTIVE), "moins_2h");
figerHorloge("2026-10-25T05:59:00Z");
check("dimanche du passage à l'hiver, 09:00 : 2 h 01 avant → frais", regleAnnulation("2026-10-25", "09:00", ACTIVE), "frais");
// Minuit de Paris : un clic à 23:30 pour une séance du lendemain 01:00.
figerHorloge("2026-11-20T22:30:00Z");
check("clic 23:30 Paris, séance du lendemain 01:00 (1 h 30) → moins_2h", regleAnnulation("2026-11-21", "01:00", ACTIVE), "moins_2h");
rendreHorloge();

// ─── D. regleAnnulationPlace : garde et autonomie toujours gratuites ─────────
section("D. regleAnnulationPlace");
for (const [regle, place, attendu] of [
  ["libre", true, "libre"], ["frais", true, "libre"], ["moins_2h", true, "libre"], ["impossible", true, "impossible"],
  ["libre", false, "libre"], ["frais", false, "frais"], ["moins_2h", false, "moins_2h"], ["impossible", false, "impossible"],
  ["frais", null, "frais"], ["moins_2h", undefined, "moins_2h"],
]) {
  check(`regleAnnulationPlace(${regle}, ${place})`, regleAnnulationPlace(regle, place), attendu);
}

// ─── E. violeLimiteTrancheAge : doublons T3 datés, garde et retenue hors limite ─
section("E. violeLimiteTrancheAge (D8, D9)");
const Z = { etude: 0, etudeAvancee: 0, intensif: 0, visio: 0 };
const T3ON = { doublonsT3Actifs: true };
const UNE_INT = "Une seule séance d'Intensif par jour pour ce niveau.";
const UNE_VIS = "Une seule séance de Visio par jour pour ce niveau.";
const MAX1 = "Maximum 1h de séances par jour pour ce niveau.";
const MAX2 = "Maximum 2h de séances par jour pour ce niveau.";
const CUMUL = "Intensif et Visio ne peuvent pas être cumulés le même jour pour ce niveau.";

// Doublons en Tranche 3 : libres sans la règle, interdits avec (Intensif et Visio seulement).
for (const niveau of ["3ème", "2nde", "1ère", "Terminale"]) {
  check(`${niveau} — 2e Intensif, règle inactive → autorisé`, violeLimiteTrancheAge(niveau, { ...Z, intensif: 1 }, "Intensif"), null);
  check(`${niveau} — 2e Intensif, règle ACTIVE → refusé`, violeLimiteTrancheAge(niveau, { ...Z, intensif: 1 }, "Intensif", T3ON), UNE_INT);
  check(`${niveau} — 2e Visio, règle ACTIVE → refusée`, violeLimiteTrancheAge(niveau, { ...Z, visio: 1 }, "Visio", T3ON), UNE_VIS);
  check(`${niveau} — 2e Visio, option fausse → autorisée`, violeLimiteTrancheAge(niveau, { ...Z, visio: 1 }, "Visio", { doublonsT3Actifs: false }), null);
  check(`${niveau} — 2e Étude, règle ACTIVE → autorisée (D8)`, violeLimiteTrancheAge(niveau, { ...Z, etude: 1 }, "Étude", T3ON), null);
  check(`${niveau} — 2e Étude Avancée, règle ACTIVE → autorisée (suit l'Étude)`, violeLimiteTrancheAge(niveau, { ...Z, etudeAvancee: 1 }, "Étude Avancée", T3ON), null);
  check(`${niveau} — Étude + Intensif, règle ACTIVE → autorisé`, violeLimiteTrancheAge(niveau, { ...Z, etude: 1 }, "Intensif", T3ON), null);
}
// La Tranche 2 ne dépend pas de l'option ; la Tranche 1 reste bornée par son plafond.
check("T2 (5ème) — 2e Visio, option fausse → refusée quand même", violeLimiteTrancheAge("5ème", { ...Z, visio: 1 }, "Visio", { doublonsT3Actifs: false }), UNE_VIS);
check("T2 (5ème) — 2e Intensif, option vraie → refusé", violeLimiteTrancheAge("5ème", { ...Z, intensif: 1 }, "Intensif", T3ON), UNE_INT);
check("T1 (CP) — 2e Visio, option vraie → plafond d'1 h", violeLimiteTrancheAge("CP", { ...Z, visio: 1 }, "Visio", T3ON), MAX1);
// Garde et retenue exclues du doublon en Tranche 3 (D9).
check("T3 règle ACTIVE — l'Intensif du jour est une GARDE → un vrai Intensif reste possible",
  violeLimiteTrancheAge("2nde", { ...Z, intensif: 1, intensifChoisies: 0 }, "Intensif", T3ON), null);
check("T3 règle ACTIVE — l'Intensif du jour est une RETENUE (par gardesEtRetenues) → possible",
  violeLimiteTrancheAge("2nde", { ...Z, intensif: 1, gardesEtRetenues: { ...Z, intensif: 1 } }, "Intensif", T3ON), null);
check("T3 règle ACTIVE — client non reconstruit (compteur brut) → strict",
  violeLimiteTrancheAge("2nde", { ...Z, intensif: 1 }, "Intensif", T3ON), UNE_INT);

// Garde hors limite quotidienne, Tranche 1 comprise (D9).
check("T1 (CE1) — une garde Étude + une vraie Étude → autorisé (garde hors limite)",
  violeLimiteTrancheAge("CE1", { ...Z, etude: 1, gardesEtRetenues: { ...Z, etude: 1 } }, "Étude"), null);
check("T1 (CE1) — même cas, client sans gardesEtRetenues → plafond d'1 h (strict, comme avant)",
  violeLimiteTrancheAge("CE1", { ...Z, etude: 1 }, "Étude"), MAX1);
check("T1 (CE1) — une vraie Étude + une garde → 2e vraie Étude refusée",
  violeLimiteTrancheAge("CE1", { ...Z, etude: 2, gardesEtRetenues: { ...Z, etude: 1 } }, "Étude"), MAX1);
check("T2 (6ème) — 2 vraies Études + 1 garde → 3e vraie séance refusée (2 h)",
  violeLimiteTrancheAge("6ème", { ...Z, etude: 3, gardesEtRetenues: { ...Z, etude: 1 } }, "Étude"), MAX2);
check("T2 (6ème) — 1 vraie Étude + 2 gardes → 2e vraie séance autorisée",
  violeLimiteTrancheAge("6ème", { ...Z, etude: 3, gardesEtRetenues: { ...Z, etude: 2 } }, "Étude"), null);
check("T3 (Terminale) — Étude + retenue Intensif + garde Visio → Étude Avancée autorisée",
  violeLimiteTrancheAge("Terminale", { ...Z, etude: 1, intensif: 1, visio: 1, gardesEtRetenues: { ...Z, intensif: 1, visio: 1 } }, "Étude Avancée"), null);
// Le cumul Intensif + Visio ne compte plus la garde ni la retenue.
check("T2 (5ème) — garde Intensif + vraie Visio → autorisé (garde hors cumul)",
  violeLimiteTrancheAge("5ème", { ...Z, intensif: 1, gardesEtRetenues: { ...Z, intensif: 1 } }, "Visio"), null);
check("T2 (5ème) — retenue Visio + vrai Intensif → autorisé (retenue hors cumul)",
  violeLimiteTrancheAge("5ème", { ...Z, visio: 1, gardesEtRetenues: { ...Z, visio: 1 } }, "Intensif"), null);
check("T2 (5ème) — vraie Visio + vrai Intensif → refusé",
  violeLimiteTrancheAge("5ème", { ...Z, visio: 1, gardesEtRetenues: Z }, "Intensif"), CUMUL);
check("T2 (5ème) — garde Intensif sans gardesEtRetenues → cumul refusé (strict, comme avant)",
  violeLimiteTrancheAge("5ème", { ...Z, intensif: 1 }, "Visio"), CUMUL);
// L'Étude Avancée d'une Tranche 2 : une garde sur un créneau d'Étude Avancée ne la bloque pas.
check("T2 (4ème) — garde sur un créneau d'Étude Avancée + vraie Étude → autorisé",
  violeLimiteTrancheAge("4ème", { ...Z, etudeAvancee: 1, gardesEtRetenues: { ...Z, etudeAvancee: 1 } }, "Étude"), null);
check("T2 (4ème) — Étude Avancée réservée → toujours refusée",
  violeLimiteTrancheAge("4ème", { ...Z, gardesEtRetenues: Z }, "Étude Avancée"), "L'Étude Avancée est réservée aux élèves de la Tranche 3 (3ème à la Terminale).");

// ─── F. eligibiliteGarde (D6, D7) ──────────────────────────────────────────
section("F. eligibiliteGarde");
const enf = (niveau, type_forfait) => ({ id: "x", prenom: "P", nom: "N", niveau, type_forfait, discipline_intensif_debut: null, urgence_bloquee: false });
const G_FORFAIT = "La garde est réservée au forfait Malin et à l'essai.";
const G_CP = "Renseignez votre code postal pour savoir si la garde vous est ouverte.";
const G_PROCHE = "La garde est réservée aux élèves de la 3ème à la Terminale et aux familles qui n'habitent pas la commune d'une agence.";
check("codes postaux des agences", CODES_POSTAUX_AGENCES, ["77430", "77130"]);
check("familleEloignee(null)", familleEloignee(null), null);
check("familleEloignee('  ')", familleEloignee("  "), null);
check("familleEloignee('77430')", familleEloignee("77430"), false);
check("familleEloignee(' 77130 ')", familleEloignee(" 77130 "), false);
check("familleEloignee('77590')", familleEloignee("77590"), true);
for (const forfait of ["malin", "essai"]) {
  for (const niveau of ["3ème", "Terminale"]) {
    for (const cp of [null, "77430", "77130", "77590"]) {
      check(`garde ${forfait} ${niveau} cp=${cp} → ouverte (Tranche 3, tout code postal)`, eligibiliteGarde(enf(niveau, forfait), cp), null);
    }
  }
  for (const niveau of ["CP", "CE2", "CM1", "4ème"]) {
    check(`garde ${forfait} ${niveau} hors agence → ouverte`, eligibiliteGarde(enf(niveau, forfait), "77590"), null);
    check(`garde ${forfait} ${niveau} 77430 → fermée`, eligibiliteGarde(enf(niveau, forfait), "77430"), G_PROCHE);
    check(`garde ${forfait} ${niveau} 77130 → fermée`, eligibiliteGarde(enf(niveau, forfait), "77130"), G_PROCHE);
    check(`garde ${forfait} ${niveau} sans code postal → à renseigner`, eligibiliteGarde(enf(niveau, forfait), null), G_CP);
  }
}
for (const forfait of ["etude", "visio", "expire", null]) {
  check(`garde forfait ${forfait} Terminale hors agence → fermée`, eligibiliteGarde(enf("Terminale", forfait), "77590"), G_FORFAIT);
  check(`garde forfait ${forfait} CM1 hors agence → fermée`, eligibiliteGarde(enf("CM1", forfait), "77590"), G_FORFAIT);
}

// ─── G. signalGardePossible (D7) ───────────────────────────────────────────
section("G. signalGardePossible");
const OK_CTX = { carteComplete: true, voisinesMemeTypeCompletes: [true, true], seanceContigueMemeTypeConfirmee: true };
check("T3, toutes conditions → signal", signalGardePossible(enf("2nde", "malin"), "77430", OK_CTX), true);
check("T3 essai, toutes conditions → signal (D6)", signalGardePossible(enf("2nde", "essai"), "77430", OK_CTX), true);
check("carte non complète → pas de signal", signalGardePossible(enf("2nde", "malin"), "77430", { ...OK_CTX, carteComplete: false }), false);
check("une voisine du même type a de la place → pas de signal", signalGardePossible(enf("2nde", "malin"), "77430", { ...OK_CTX, voisinesMemeTypeCompletes: [true, false] }), false);
check("aucune voisine fournie → pas de signal", signalGardePossible(enf("2nde", "malin"), "77430", { ...OK_CTX, voisinesMemeTypeCompletes: [] }), false);
check("pas de séance contiguë confirmée → pas de signal", signalGardePossible(enf("2nde", "malin"), "77430", { ...OK_CTX, seanceContigueMemeTypeConfirmee: false }), false);
check("T2 famille éloignée → signal", signalGardePossible(enf("5ème", "malin"), "77590", OK_CTX), true);
check("T2 famille de Champagne → pas de signal", signalGardePossible(enf("5ème", "malin"), "77430", OK_CTX), false);
check("T1 famille éloignée → signal", signalGardePossible(enf("CE1", "malin"), "77590", OK_CTX), true);
check("T1 sans code postal → pas de signal", signalGardePossible(enf("CE1", "malin"), null, OK_CTX), false);
check("forfait Étude T3 → pas de signal", signalGardePossible(enf("2nde", "etude"), "77590", OK_CTX), false);

// ─── H. eligibiliteAutonomieVisio (D10) ────────────────────────────────────
section("H. eligibiliteAutonomieVisio");
const AV_OK = { visioDeLEnfantConfirmee: true, visioVoisineExiste: true };
for (const forfait of ["malin", "essai", "visio"]) {
  check(`autonomie T3 forfait ${forfait} → ouverte`, eligibiliteAutonomieVisio(enf("1ère", forfait), AV_OK), null);
  check(`autonomie T2 forfait ${forfait} → fermée`, eligibiliteAutonomieVisio(enf("4ème", forfait), AV_OK), "La connexion en autonomie est réservée aux élèves de la 3ème à la Terminale.");
}
check("autonomie T1 malin → fermée", eligibiliteAutonomieVisio(enf("CP", "malin"), AV_OK), "La connexion en autonomie est réservée aux élèves de la 3ème à la Terminale.");
check("autonomie T3 forfait Étude → fermée (pas de Visio)", eligibiliteAutonomieVisio(enf("3ème", "etude"), AV_OK), "Visio réservé aux forfaits Visio et Malin.");
check("autonomie T3 forfait expiré → fermée", eligibiliteAutonomieVisio(enf("3ème", "expire"), AV_OK), "Visio réservé aux forfaits Visio et Malin.");
check("autonomie sans Visio de l'élève → fermée", eligibiliteAutonomieVisio(enf("3ème", "visio"), { ...AV_OK, visioDeLEnfantConfirmee: false }), "La connexion en autonomie accompagne une séance de Visio de l'élève.");
check("autonomie sans Visio voisine → fermée", eligibiliteAutonomieVisio(enf("3ème", "visio"), { ...AV_OK, visioVoisineExiste: false }), "Aucune séance de Visio juste avant ou juste après celle de l'élève.");

// ─── I. eligibiliteUrgence (D11, D12) ──────────────────────────────────────
section("I. eligibiliteUrgence");
check("types d'épreuve : trois valeurs, libellés de D11", TYPES_EPREUVE_URGENCE, {
  controle: "Contrôle ou devoir noté",
  devoir_sur_table: "Devoir sur table",
  examen: "Examen (brevet blanc, bac blanc, épreuve officielle…)",
});
check("délai d'épreuve", URGENCE_DELAI_EPREUVE_JOURS, 4);
check("places restantes : 0 intervenant, 0 urgence → 1", placesUrgenceRestantes(0, 0), 1);
check("places restantes : 0 intervenant, 1 urgence → 0", placesUrgenceRestantes(1, 0), 0);
check("places restantes : 1 intervenant, 0 urgence → 1", placesUrgenceRestantes(0, 1), 1);
check("places restantes : 2 intervenants, 1 urgence → 1", placesUrgenceRestantes(1, 2), 1);
check("places restantes : 2 intervenants, 2 urgences → 0", placesUrgenceRestantes(2, 2), 0);
check("places restantes : jamais négatif", placesUrgenceRestantes(3, 1), 0);

const CTX = {
  creneau: { type_seance: "Intensif", date: "2026-11-27" },
  placesOrdinairesPrises: 3,
  capacite: 3,
  urgencesConfirmees: 0,
  intervenantsAffectes: 1,
  urgenceBloqueeJusquAu: null,
  aujourdhuiISO: "2026-11-20",
};
const DEM = { epreuveType: "controle", epreuveDate: "2026-11-27" };
const code = (r) => (r === null ? null : r.code);
const msg = (r) => (r === null ? null : r.message);

check("Malin T3, Intensif complet, tout en règle → accordée", eligibiliteUrgence(enf("Terminale", "malin"), CTX, DEM), null);
check("essai T3 → accordée", eligibiliteUrgence(enf("3ème", "essai"), CTX, DEM), null);
check("Malin T3, Visio complète → accordée", eligibiliteUrgence(enf("2nde", "malin"), { ...CTX, creneau: { type_seance: "Visio", date: "2026-11-27" } }, DEM), null);
// Tranche
for (const niveau of ["CP", "CM2", "4ème"]) {
  check(`${niveau} → TRANCHE`, code(eligibiliteUrgence(enf(niveau, "malin"), CTX, DEM)), "TRANCHE");
}
// Forfait Visio : Visio seulement (D11)
check("forfait Visio T3 sur une Visio → accordée", eligibiliteUrgence(enf("1ère", "visio"), { ...CTX, creneau: { type_seance: "Visio", date: "2026-11-27" } }, DEM), null);
check("forfait Visio T3 sur un Intensif → FORFAIT", msg(eligibiliteUrgence(enf("1ère", "visio"), CTX, DEM)), "Intensif réservé au forfait Malin.");
check("forfait Étude T3 sur une Visio → FORFAIT", code(eligibiliteUrgence(enf("1ère", "etude"), { ...CTX, creneau: { type_seance: "Visio", date: "2026-11-27" } }, DEM)), "FORFAIT");
check("forfait expiré T3 → FORFAIT", code(eligibiliteUrgence(enf("1ère", "expire"), CTX, DEM)), "FORFAIT");
// Type de séance
for (const t of ["Étude", "Étude Avancée", "Domicile"]) {
  check(`séance ${t} → TYPE_SEANCE`, code(eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, creneau: { type_seance: t, date: "2026-11-27" } }, DEM)), "TYPE_SEANCE");
}
// Blocage
check("interrupteur historique → BLOQUEE", code(eligibiliteUrgence({ ...enf("Terminale", "malin"), urgence_bloquee: true }, CTX, DEM)), "BLOQUEE");
check("blocage daté jusqu'à demain → BLOQUEE", msg(eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, urgenceBloqueeJusquAu: "2026-11-21" }, DEM)),
  "L'accès à la place d'urgence est suspendu pour cet élève jusqu'au 21/11/2026 inclus.");
check("blocage daté jusqu'à AUJOURD'HUI → encore BLOQUEE (date de fin incluse)", code(eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, urgenceBloqueeJusquAu: "2026-11-20" }, DEM)), "BLOQUEE");
check("blocage daté fini HIER → levé tout seul", eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, urgenceBloqueeJusquAu: "2026-11-19" }, DEM), null);
check("blocage au 31/12, aujourd'hui 01/01 → levé", eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, urgenceBloqueeJusquAu: "2026-12-31", aujourdhuiISO: "2027-01-01", creneau: { type_seance: "Intensif", date: "2027-01-05" } }, { epreuveType: "examen", epreuveDate: "2027-01-05" }), null);
// Motif : anciennes versions de l'app
check("ni type ni date (ancienne app) → METTRE_A_JOUR", msg(eligibiliteUrgence(enf("Terminale", "malin"), CTX, {})), MESSAGE_URGENCE_METTRE_A_JOUR);
check("texte de D11 au mot près", MESSAGE_URGENCE_METTRE_A_JOUR, "Mettez à jour l'application pour demander une place d'urgence.");
check("demande absente → METTRE_A_JOUR", code(eligibiliteUrgence(enf("Terminale", "malin"), CTX)), "METTRE_A_JOUR");
check("champs vides → METTRE_A_JOUR", code(eligibiliteUrgence(enf("Terminale", "malin"), CTX, { epreuveType: " ", epreuveDate: "" })), "METTRE_A_JOUR");
check("date sans type → EPREUVE_TYPE", code(eligibiliteUrgence(enf("Terminale", "malin"), CTX, { epreuveDate: "2026-11-27" })), "EPREUVE_TYPE");
check("type inconnu → EPREUVE_TYPE", code(eligibiliteUrgence(enf("Terminale", "malin"), CTX, { ...DEM, epreuveType: "oral" })), "EPREUVE_TYPE");
check("type « toString » → EPREUVE_TYPE (pas de faux positif)", code(eligibiliteUrgence(enf("Terminale", "malin"), CTX, { ...DEM, epreuveType: "toString" })), "EPREUVE_TYPE");
check("libellé au lieu de la clé → EPREUVE_TYPE", code(eligibiliteUrgence(enf("Terminale", "malin"), CTX, { ...DEM, epreuveType: "Devoir sur table" })), "EPREUVE_TYPE");
for (const t of Object.keys(TYPES_EPREUVE_URGENCE)) {
  check(`type ${t} → accepté`, eligibiliteUrgence(enf("Terminale", "malin"), CTX, { ...DEM, epreuveType: t }), null);
}
check("type sans date → EPREUVE_DATE", code(eligibiliteUrgence(enf("Terminale", "malin"), CTX, { epreuveType: "examen" })), "EPREUVE_DATE");
check("date mal formée → EPREUVE_DATE", code(eligibiliteUrgence(enf("Terminale", "malin"), CTX, { ...DEM, epreuveDate: "27/11/2026" })), "EPREUVE_DATE");
// Bornes de la date d'épreuve : séance du 27/11, épreuve du 27/11 (J) au 01/12 (J+4).
const dateEp = (d) => eligibiliteUrgence(enf("Terminale", "malin"), CTX, { ...DEM, epreuveDate: d });
check("épreuve la veille de la séance (J-1) → refusée", msg(dateEp("2026-11-26")), "L'épreuve ne peut pas avoir lieu avant la séance.");
check("épreuve le jour même (J) → acceptée", dateEp("2026-11-27"), null);
check("épreuve à J+1 → acceptée", dateEp("2026-11-28"), null);
check("épreuve à J+4 (01/12, passage de mois) → acceptée", dateEp("2026-12-01"), null);
check("épreuve à J+5 → refusée", msg(dateEp("2026-12-02")), "L'épreuve doit avoir lieu au plus tard 4 jours après la séance (le jour même compris).");
check("épreuve en instant complet à J+4 → acceptée", dateEp("2026-12-01T00:00:00.000Z"), null);
const ctxFinAnnee = { ...CTX, creneau: { type_seance: "Visio", date: "2026-12-30" }, aujourdhuiISO: "2026-12-28" };
check("séance 30/12, épreuve 03/01 (J+4, passage d'année) → acceptée", eligibiliteUrgence(enf("Terminale", "malin"), ctxFinAnnee, { ...DEM, epreuveDate: "2027-01-03" }), null);
check("séance 30/12, épreuve 04/01 (J+5) → refusée", code(eligibiliteUrgence(enf("Terminale", "malin"), ctxFinAnnee, { ...DEM, epreuveDate: "2027-01-04" })), "EPREUVE_DATE");
const ctxEte = { ...CTX, creneau: { type_seance: "Intensif", date: "2027-03-26" }, aujourdhuiISO: "2027-03-20" };
check("séance 26/03, épreuve 30/03 (J+4, enjambe le passage à l'été) → acceptée", eligibiliteUrgence(enf("Terminale", "malin"), ctxEte, { ...DEM, epreuveDate: "2027-03-30" }), null);
check("séance 26/03, épreuve 31/03 (J+5) → refusée", code(eligibiliteUrgence(enf("Terminale", "malin"), ctxEte, { ...DEM, epreuveDate: "2027-03-31" })), "EPREUVE_DATE");
// Séance complète, urgence hors du compte ordinaire
check("2 places ordinaires sur 3 → NON_COMPLETE", msg(eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, placesOrdinairesPrises: 2 }, DEM)), "La place d'urgence ne s'ouvre que lorsque la séance est complète.");
check("Visio 4 places, 4 prises → accordée", eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, creneau: { type_seance: "Visio", date: "2026-11-27" }, capacite: 4, placesOrdinairesPrises: 4 }, DEM), null);
check("Visio 4 places, 3 prises + 1 urgence → NON_COMPLETE (l'urgence n'est pas une place ordinaire)",
  code(eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, creneau: { type_seance: "Visio", date: "2026-11-27" }, capacite: 4, placesOrdinairesPrises: 3, urgencesConfirmees: 1, intervenantsAffectes: 2 }, DEM)), "NON_COMPLETE");
// Places d'urgence : une par intervenant affecté, au moins une
check("1 intervenant, 1 urgence déjà prise → URGENCE_COMPLETE", msg(eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, urgencesConfirmees: 1 }, DEM)), MESSAGE_URGENCE_PRISE);
check("message identique à la route du site (§ 258)", MESSAGE_URGENCE_PRISE, "La place d'urgence de cette séance vient d'être prise.");
check("aucun intervenant affecté, 0 urgence → accordée (au moins une)", eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, intervenantsAffectes: 0 }, DEM), null);
check("aucun intervenant affecté, 1 urgence → URGENCE_COMPLETE", code(eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, intervenantsAffectes: 0, urgencesConfirmees: 1 }, DEM)), "URGENCE_COMPLETE");
check("Intensif à 2 intervenants (6 places), 1 urgence → la 2e accordée", eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, capacite: 6, placesOrdinairesPrises: 6, intervenantsAffectes: 2, urgencesConfirmees: 1 }, DEM), null);
check("Intensif à 2 intervenants, 2 urgences → URGENCE_COMPLETE", code(eligibiliteUrgence(enf("Terminale", "malin"), { ...CTX, capacite: 6, placesOrdinairesPrises: 6, intervenantsAffectes: 2, urgencesConfirmees: 2 }, DEM)), "URGENCE_COMPLETE");
// Ordre des refus : la tranche et le blocage passent avant le motif.
check("T2 ancienne app → TRANCHE (pas « mettez à jour »)", code(eligibiliteUrgence(enf("5ème", "malin"), CTX, {})), "TRANCHE");
check("bloqué + séance non complète → BLOQUEE d'abord", code(eligibiliteUrgence({ ...enf("Terminale", "malin"), urgence_bloquee: true }, { ...CTX, placesOrdinairesPrises: 0 }, DEM)), "BLOQUEE");

console.log(`${fail === 0 ? `✅ ${total} CONTRÔLES PASSENT` : `❌ ${fail} ÉCHEC(S) sur ${total}`}`);
process.exit(fail === 0 ? 0 : 1);
