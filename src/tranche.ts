// ── Article 6.3 CGV — limites de réservation par tranche d'âge (3 tranches) ──
export const TRANCHE_1 = ["CP", "CE1", "CE2"];
export const TRANCHE_2 = ["CM1", "CM2", "6ème", "5ème", "4ème"];

export function tranche(niveau: string): 1 | 2 | 3 {
  if (TRANCHE_1.includes(niveau)) return 1;
  if (TRANCHE_2.includes(niveau)) return 2;
  return 3;
}
