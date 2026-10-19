// A starting XI in its formation: rows from the goalkeeper forward, each left → right as the team faces the opponent.
// Shared by the match cards (matches.html) and the team cards' Tactical tab (teams.html).
type Dict = Record<string, any>
// formation slot (ESPN / Opta formationPlace) → rows from the back, each left → right as the team faces the opponent
export const LAYOUT: Record<string, number[][]> = {
  '4-3-3': [[3, 6, 5, 2], [8, 4, 7], [11, 9, 10]], '4-2-3-1': [[3, 6, 5, 2], [4, 8], [11, 10, 7], [9]], '4-4-2': [[3, 6, 5, 2], [11, 8, 4, 7], [10, 9]],
  '3-5-2': [[4, 5, 6], [3, 8, 11, 7, 2], [9, 10]], '3-4-2-1': [[4, 5, 6], [3, 8, 7, 2], [11, 10], [9]], '3-4-3': [[4, 5, 6], [3, 8, 7, 2], [11, 9, 10]],
  '5-4-1': [[3, 4, 5, 6, 2], [11, 10, 8, 7], [9]], '5-3-2': [[3, 4, 5, 6, 2], [8, 11, 7], [9, 10]], '3-1-4-2': [[6, 4, 5], [8], [3, 11, 7, 2], [10, 9]],
  '4-1-4-1': [[3, 6, 5, 2], [4], [11, 8, 10, 7], [9]], '4-4-1-1': [[3, 6, 5, 2], [11, 8, 4, 7], [10], [9]],
  '4-1-3-2': [[3, 6, 5, 2], [4], [11, 8, 7], [10, 9]], '4-3-2-1': [[3, 6, 5, 2], [7, 4, 8], [11, 10], [9]], '4-1-2-1-2': [[3, 6, 5, 2], [4], [11, 7], [8], [9, 10]],
  '4-5-1': [[3, 6, 5, 2], [11, 8, 10, 4, 7], [9]], '3-4-1-2': [[4, 5, 6], [3, 8, 7, 2], [9], [11, 10]], '4-2-2-2': [[3, 6, 5, 2], [8, 4], [11, 7], [9, 10]],
  '3-5-1-1': [[4, 5, 6], [3, 8, 11, 7, 2], [10], [9]],
}
const DEPTH = (p: string) => /^G/.test(p) ? 0 : /^(CD|CB|SW|LB|RB|D)/.test(p) ? 1 : /^DM/.test(p) ? 2 : /^(CM|LM|RM|M)/.test(p) ? 3 : /^AM/.test(p) ? 4 : 5
const LAT = (p: string) => /^L/.test(p) ? -2 : /-L$/.test(p) ? -1 : /-R$/.test(p) ? 1 : /^R/.test(p) ? 2 : 0
export function rowsOf(t: Dict): Dict[][] {
  const xi: Dict[] = t.players.filter((p: Dict) => p.st), byFp = Object.fromEntries(xi.map(p => [p.fp, p]))
  const lay = LAYOUT[t.form]
  if (lay && lay.flat().every(f => byFp[f]) && byFp[1]) return [[byFp[1]], ...lay.map(r => r.map(f => byFp[f]))]
  const s = [...xi].sort((a, b) => DEPTH(a.pos) - DEPTH(b.pos) || a.fp - b.fp), parts = [1, ...String(t.form || '4-4-2').split('-').map(Number)], rows: Dict[][] = []; let i = 0
  for (const n of parts) { rows.push(s.slice(i, i + n).sort((a, b) => LAT(a.pos) - LAT(b.pos))); i += n }
  if (i < s.length) rows[rows.length - 1].push(...s.slice(i))
  return rows.filter(r => r.length)
}
