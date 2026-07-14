// Fenêtre de réservation : semaine courante + 2 semaines à l'avance max.
export const SEMAINE_MAX_OFFSET = 2;

export function getSemaineLimites(offset = 0): { lundi: string; samedi: string } {
  const today = new Date();
  const day = today.getDay(); // 0 = dim
  const diff = day === 0 ? -6 : 1 - day;
  const lundi = new Date(today);
  lundi.setDate(today.getDate() + diff + offset * 7);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { lundi: fmt(lundi), samedi: fmt(samedi) };
}
