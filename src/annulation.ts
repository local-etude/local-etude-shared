import type { RegleAnnulation } from "./types";

export function minutesAvantSeance(dateISO: string, heureDebut: string): number {
  const [y, m, d]   = dateISO.split("-").map(Number);
  const [h, min]    = heureDebut.split(":").map(Number);
  const seance = new Date(y, m - 1, d, h, min);
  return (seance.getTime() - Date.now()) / 60_000;
}

export function regleAnnulation(dateISO: string, heureDebut: string): RegleAnnulation {
  const minutes = minutesAvantSeance(dateISO, heureDebut);
  if (minutes > 18 * 60) return "libre";
  if (minutes > 2  * 60) return "frais";
  return "impossible";
}
