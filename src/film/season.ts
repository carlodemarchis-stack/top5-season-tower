// One player's season at one club, from our match cards — THE single calculation behind every player card: the squad
// film builds it in the page, scripts/update-scorers.mjs and update-keepers.mjs at build time (Node imports this file
// directly, so it must stay free of imports and of non-erasable TypeScript).
type Dict = Record<string, any>
// a club: its league, code, match records (sorted by matchday), the league's TEAMS (names) and its team-card entry
export type Club = { lg: string; code: string; games: Dict[]; teams: Dict; team: Dict }

const clock = (s: unknown) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
// names compared without accents or case: the commentary has "Estéban Lepaul", the roster "Esteban Lepaul"
const plain = (n: unknown) => String(n || '').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const lastWord = (n: unknown) => plain(n).split(/\s+/).pop()
const sideOf = (c: Club, M: Dict) => M.h === c.code ? 'h' : 'a'
export const teamLineOf = (t: Dict) => ({ pos: t.pos ?? null, pts: t.pts ?? 0, W: t.W ?? 0, D: t.D ?? 0, L: t.L ?? 0, GF: t.GF ?? 0, GA: t.GA ?? 0, played: (t.W ?? 0) + (t.D ?? 0) + (t.L ?? 0) })

// a game he didn't play, as far as the match report knows: 'U' on the bench (not used), 'X' not in the matchday squad,
// '' unknown (a report saved before the bench was kept)
const benchState = (T: Dict, id: string) => !Array.isArray(T.bench) ? '' : T.bench.some((b: string[]) => String(b[0]) === String(id)) ? 'U' : 'X'
// only what the reports can tell: 'X' counts from his first matchday squad on (before it he may not have been at the
// club yet), and an 'X' right after his red card is the ban ('XR'); no other reason is ever guessed
function settle(list: Dict[], key: string, rc: (x: Dict) => boolean) {
  const first = list.findIndex(x => x[key] && x[key] !== 'X')
  list.forEach((x, i) => {
    if (x[key] !== 'X') return
    if (first < 0 || i < first) x[key] = ''
    else if (i > 0 && rc(list[i - 1])) x[key] = 'XR'
  })
}
// the line over the strip: a run of games out of the matchday squad, said as a fact; a run that opens right after a red
// card names the ban (where[i] = "at Como" for game i)
function availNote(states: string[], mds: number[], where: string[]) {
  const known = states.map((s, i) => ({ s, md: mds[i], i })).filter(x => x.s)
  let run = 0; for (let i = known.length - 1; i >= 0 && (known[i].s === 'X' || known[i].s === 'XR'); i--) run++
  const last5 = known.slice(-5), n5 = last5.filter(x => x.s === 'X' || x.s === 'XR').length
  const first = known[known.length - run], ban = run && first.s === 'XR' ? `sent off ${where[first.i - 1]} in MD ${mds[first.i - 1]}` : ''
  if (run === 1 && ban) return `<i></i>Suspended for MD ${first.md}: ${ban}`
  if (run >= 2) return `<i></i>Not in the matchday squad for the last <b>${run}</b> games (since MD ${first.md})${ban ? `, the first a ban: ${ban}` : ''}`
  if (n5 >= 2) return `<i></i>Not in the matchday squad in <b>${n5}</b> of the last ${last5.length} games`
  return ''
}
const whereOf = (c: Club) => c.games.map(M => M.h === c.code ? `vs ${c.teams[M.a]?.name || M.a}` : `at ${c.teams[M.h]?.name || M.h}`)
// his bio fields as every card shows them (sq = his team-card squad entry, or a stand-in built from the match cards)
const bioOf = (sq: Dict) => ({ name: sq.name, jersey: sq.jersey || null, pos: sq.pos || null, age: sq.age ?? null, nat: sq.natName || sq.nat || null, natCode: sq.nat || null,
  heightCm: sq.heightCm ?? null, thumb: sq.thumb || null })

// ---------- an outfield player (the scorer card) ----------
export function outfieldSeason(c: Club, sq: Dict): Dict {
  const id = String(sq.espnId)
  const matches = c.games.map(M => {
    const me = sideOf(c, M), op = me === 'h' ? 'a' : 'h', T = me === 'h' ? M.home : M.away
    const base = { id: M.id, w: M.md, ha: me === 'h' ? 'H' : 'A', opp: M[op], gf: M.score[me], ga: M.score[op] }
    const pl = T.players.find((x: Dict) => String(x.id) === id)
    const on = pl && !pl.st ? M.subs.find((s: Dict) => String(s.on) === id) : null
    if (!pl || (!pl.st && !on)) return { ...base, role: benchState(T, id), min: 0, goals: [], assists: [], G: 0, A: 0, SH: 0, SOG: 0, YC: 0, RC: 0 }
    const off = M.subs.find((s: Dict) => String(s.off) === id), red = pl.ev.find((e: string[]) => e[0] === 'rc')
    const start = pl.st ? 0 : clock(on.min), end = Math.min(90, off ? clock(off.min) : red ? clock(red[1]) : 90)
    const goals = M.goals.filter((g: Dict) => String(g.byId) === id && g.s === me && g.kind !== 'og').map((g: Dict) => ({ min: g.min, kind: g.kind || '', ast: g.ast || null }))
    const n = (k: string) => pl.ev.filter((e: string[]) => e[0] === k).length
    // his assists: the minute from his own events, the scorer from our side's goal at that minute
    const assists = pl.ev.filter((e: string[]) => e[0] === 'ast').map((e: string[]) => ({ min: e[1], to: M.goals.find((g: Dict) => g.s === me && g.min === e[1])?.by || '' }))
    const sh = shotsIn(M, me, sq.name)
    // the substitution: who he came on for, or who replaced him, and when
    const nameOf = (pid: unknown) => T.players.find((x: Dict) => String(x.id) === String(pid))?.name || ''
    const sub = on ? { min: on.min, who: nameOf(on.off) } : off ? { min: off.min, who: nameOf(off.on) } : null
    return { ...base, role: pl.st ? 'S' : 'B', min: Math.max(1, Math.round(end - start)), sub, goals, assists, G: goals.length, A: n('ast'),
      // shots: the box score's totals (the match card keeps them per player); the goal's dots come from the commentary
      SH: pl.sh ? pl.sh[0] : sh.length, SOG: pl.sh ? pl.sh[1] : sh.filter(x => x.k === 'on' || x.k === 'goal').length, YC: n('yc'), RC: n('rc') }
  })
  settle(matches, 'role', (m: Dict) => !!m.RC)
  const played = matches.filter(m => m.role === 'S' || m.role === 'B'), sum = (k: string) => played.reduce((a, m: Dict) => a + (m[k] || 0), 0)
  const at = c.games.flatMap(M => { const me = sideOf(c, M); return M[me === 'h' ? 'home' : 'away'].players.some((p: Dict) => String(p.id) === id) ? shotsIn(M, me, sq.name).map(x => [x.p || '', x.k === 'goal' ? 'g' : x.k]) : [] })
  return { espnId: id, ...bioOf(sq), lg: c.lg, team: c.code, photo: `players/${id}.webp`, teamLine: teamLineOf(c.team), matches, at,
    note: availNote(matches.map(m => m.role === 'S' || m.role === 'B' ? 'P' : m.role), matches.map(m => m.w), whereOf(c)),
    G: sum('G'), A: sum('A'), YC: sum('YC'), RC: sum('RC'), min: sum('min'), apps: played.length, starts: played.filter(m => m.role === 'S').length,
    pens: played.reduce((a, m: Dict) => a + m.goals.filter((g: Dict) => g.kind === 'pen').length, 0), shots: sum('SH'), sog: sum('SOG') }
}
// his shots in a game: filed under his name in the commentary; else (none so) his surname, when only one shooter of his
// side has it ("Francesco Pio Esposito")
function shotsIn(M: Dict, me: string, name: string): Dict[] {
  const S = M.shots as Dict[]
  let mine = S.filter(x => x.s === me && plain(x.who) === plain(name))
  if (!mine.length) { const L = S.filter(x => x.s === me && lastWord(x.who) === lastWord(name)); if (new Set(L.map(x => x.who)).size === 1) mine = L }
  return mine
}

// ---------- a goalkeeper (the keeper card): each game he started, every shot on target he faced ----------
export function keeperSeason(c: Club, sq: Dict): Dict {
  const id = String(sq.espnId)
  const k: Dict = { key: `${id}-${c.code}`, id, ...bioOf(sq), n: sq.jersey || null, lg: c.lg, team: c.code, tpos: c.team.pos ?? null, teamLine: teamLineOf(c.team),
    photo: `players/${id}.webp`, games: [], shots: [], conceded: [], missed: [] }
  let subApps = 0
  for (const M of c.games) {
    const me = sideOf(c, M), op = me === 'h' ? 'a' : 'h', T = me === 'h' ? M.home : M.away
    const pl = T.players.find((x: Dict) => String(x.id) === id)
    if (!pl || !pl.st) { if (pl) subApps++; k.missed.push([M.id, M.score[me], M.score[op], pl ? 'P' : benchState(T, id), M.md]); continue }
    const off = pl.ev.find((e: string[]) => e[0] === 'sub'), until = off ? clock(off[1]) : 999
    const inTime = (x: Dict) => x.min + Math.min(x.ex || 0, 6) * .5 <= until
    const faced = M.shots.filter((x: Dict) => x.s === op && (x.k === 'on' || x.k === 'goal') && inTime(x))
    const conc = M.goals.filter((g: Dict) => g.s === op && clock(g.min) <= until)
    const pens = M.shots.filter((x: Dict) => x.s === op && x.pen && inTime(x))
    k.games.push({ id: M.id, md: M.md, opp: M[op], ha: me === 'h' ? 'H' : 'A', gf: M.score[me], ga: M.score[op], min: Math.round(Math.min(until, 90)),
      sv: off ? faced.filter((x: Dict) => x.k === 'on').length : (M.stats[me]?.saves ?? faced.filter((x: Dict) => x.k === 'on').length),
      conc: conc.length, pf: pens.length, ps: pens.filter((x: Dict) => x.k === 'on').length,
      yc: pl.ev.filter((e: string[]) => e[0] === 'yc').length, rc: pl.ev.filter((e: string[]) => e[0] === 'rc').length })
    k.shots.push(...faced.filter((x: Dict) => x.p).map((x: Dict) => [x.p, x.k === 'goal' ? 'g' : 's']))
    k.conceded.push(...conc.map((g: Dict) => [g.min, g.by, g.kind, M.md, M[op]]))
  }
  // the same rules as outfield players, over every club game in order (a start counts as being in the squad)
  const seq: Dict[] = c.games.map(M => { const g = k.games.find((x: Dict) => x.id === M.id), m = k.missed.find((x: any[]) => x[0] === M.id); return { id: M.id, md: M.md, st: g ? 'P' : m ? m[3] : '', rc: g?.rc } })
  settle(seq, 'st', (x: Dict) => !!x.rc)
  for (const x of seq) { const m = k.missed.find((y: any[]) => y[0] === x.id); if (m) m[3] = x.st === 'P' ? '' : x.st }
  k.note = availNote(seq.map(x => x.st), seq.map(x => x.md), whereOf(c))
  const sum = (f: string) => k.games.reduce((a: number, g: Dict) => a + g[f], 0)
  Object.assign(k, { SV: sum('sv'), GA: sum('conc'), MIN: sum('min'), GP: k.games.length, APPS: k.games.length + subApps,
    CS: k.games.filter((g: Dict) => g.conc === 0 && g.min >= 89).length, PF: sum('pf'), PS: sum('ps') })
  k.PCT = k.SV + k.GA ? Math.round(1000 * k.SV / (k.SV + k.GA)) / 10 : null
  return k
}
