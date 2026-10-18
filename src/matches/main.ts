// Match-card film: one card per league match, one film per matchday (?lg=ITA&md=6), latest kick-off first.
// ?lg=ALL: no matchday — every match of the five leagues from the last 7 days (counted back from the latest match).
// Every column is split at the halfway line — the home team on top, the away team below:
//   left   both XIs on one pitch, every goal / assist / card / substitution on the player, the score big
//   middle every attempt (home at the top goal, away at the bottom one) and the flow of the match across halfway
//   right  where each side's attempts went on goal, the scorers, and the numbers mirrored at the centre line
// Data: src/data/matches-<LG>-<season>-md<NN>.js (scripts/update-matches.mjs); club names / colours from the schedule.
import '../film/film.css'
import { initFilm, initHighlight, initNav, initLinks } from '../film/chrome'
import { loadCoaches, coachOf, coachHref, surname } from '../film/coach'
type Dict = Record<string, any>
const QS = new URLSearchParams(location.search)
const SEASON = QS.get('season') || '2026-27'
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
const LEAGUE_NAME: Record<string, string> = { ITA: 'Serie A', ENG: 'Premier League', ESP: 'LaLiga', FRA: 'Ligue 1', GER: 'Bundesliga' }
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }

// which leagues / matchdays have match cards (the data files that exist)
const FILES = import.meta.glob('../data/matches-*-*-md*.js')
const mdsOf = (lg: string) => Object.keys(FILES).map(f => f.match(new RegExp(`matches-${lg}-${SEASON}-md(\\d+)\\.js$`))).filter(Boolean).map(m => +m![1]).sort((a, b) => a - b)
const has = (lg: string) => mdsOf(lg).length > 0
let LAST = ''; try { LAST = localStorage.getItem('top5.matches.lg') || '' } catch { }
const LG = [QS.get('lg') || '', LAST].find(l => (l === 'ALL' || LG_ORDER.includes(l)) && (l === 'ALL' || has(l))) || LG_ORDER.find(has) || 'ITA'
const ALL = LG === 'ALL'
try { localStorage.setItem('top5.matches.lg', LG) } catch { }
const MDS = ALL ? [] : mdsOf(LG)
const MD = ALL ? 0 : MDS.includes(+(QS.get('md') || 0)) ? +QS.get('md')! : MDS[MDS.length - 1]
const WINDOW_DAYS = 7
const mdFile = (lg: string, md: number) => FILES[`../data/matches-${lg}-${SEASON}-md${String(md).padStart(2, '0')}.js`]
// every match carries its league (club names, colours, crests come from that league's schedule)
const TEAMS_OF: Record<string, Dict> = {}, COACHES_OF: Record<string, Dict | null> = {}
let MATCHES: Dict[] = []
for (const lg of ALL ? LG_ORDER.filter(has) : [LG]) {
  // one league: its matchday · all leagues: the last three matchdays of each (a midweek round + its weekends), then the window
  const mds = ALL ? mdsOf(lg).slice(-3) : [MD]
  const [sch, ...files] = await Promise.all([import(`../data/schedule-${lg}-${SEASON}.js`), ...mds.map(md => mdFile(lg, md)())]) as Dict[]
  TEAMS_OF[lg] = sch.TEAMS
  COACHES_OF[lg] = SEASON === '2026-27' ? await loadCoaches(lg, SEASON) : null
  for (const f of files) for (const m of f.MATCHES) MATCHES.push({ ...m, lg })
}
if (ALL) {
  const newest = Math.max(...MATCHES.map(m => +new Date(m.kick || 0)))
  MATCHES = MATCHES.filter(m => m.kick && newest - +new Date(m.kick) <= WINDOW_DAYS * 864e5)
}
const TEAM = (M: Dict, code: string) => TEAMS_OF[M.lg]?.[code] || {}
const P: Dict[] = [...MATCHES].sort((a: Dict, b: Dict) => String(b.kick || '').localeCompare(String(a.kick || '')))   // latest first (same kick-off: file order)
// ?m=<fixture id> (a game box on the scorer / team / keeper cards): open on that match, then drop it from the URL
if (QS.has('m')) {
  const at = P.findIndex(x => String(x.id) === QS.get('m')), q = new URLSearchParams(location.search); q.delete('m')
  history.replaceState(null, '', location.pathname + '?' + q.toString() + (at >= 0 ? '#' + (at + 1) : location.hash))
}

// ---------- helpers ----------
const RES = (d: number) => d >= 2 ? '#177a41' : d === 1 ? '#3a9e62' : d === 0 ? '#EAB308' : d === -1 ? '#dc5c5e' : '#b3323a'
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const ord = (n: number | null) => n == null ? '–' : n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
const minOf = (c: string) => { const m = String(c).match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
const ini = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('')
const short = (n: string) => { const w = n.split(/\s+/); return w[w.length - 1] || n }
const rgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, k) => v - rgb(b)[k]))
const mix = (c: string, to: number, f: number) => '#' + rgb(c).map(v => Math.round(v + (to - v) * f).toString(16).padStart(2, '0')).join('')
// two clubs in the same colour: the away side wears a lighter shade of its own colour (a darker one when that is still
// too close), light grey only as a last resort — never a dark grey that reads as "nobody"
const awayColor = (h: string, a: string) => dist(h, a) >= 120 ? a : [mix(a, 255, .5), mix(a, 0, .45)].find(c => dist(h, c) >= 110) || '#a9b0b8'
const lum = (h: string) => { const [r, g, b] = rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }
const ink = (c: string) => lum(c) > .62 ? '#15181d' : c
// a light half of the pitch (Dortmund yellow, a light away shade): its name, formation and table move in a deep shade
// of the club colour instead of white, its big score filled darker
const light = (c: string) => lum(c) > .58
const onLight = (c: string) => light(c) ? `" style="--tk:${mix(c, 0, .65)}` : ''
const scoreInk = (c: string) => light(c) ? mix(c, 0, .4) : c
const rnd = (s: number) => { const x = Math.sin(s * 99.13) * 43758.5453; return x - Math.floor(x) }
const logo = (code: string, lg: string) => `logos/${lg === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code}.png`
const SHORTN: Record<string, string> = { 'Paris Saint-Germain FC': 'Paris SG', 'Bayer 04 Leverkusen': 'Leverkusen', '1. FSV Mainz 05': 'Mainz', 'Eintracht Frankfurt': 'Frankfurt' }
const nameOf = (M: Dict, code: string) => { const n = TEAM(M, code).name || code; return SHORTN[n] || n.replace(/^(FC|CF|AS|AC|SSC|RC|RCD)\s+/, '').replace(/\s+(FC|CF)$/, '') }

// formation slot (ESPN / Opta formationPlace) → rows from the back, each left → right as the team faces the opponent
const LAYOUT: Record<string, number[][]> = {
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
function rowsOf(t: Dict): Dict[][] {
  const xi: Dict[] = t.players.filter((p: Dict) => p.st), byFp = Object.fromEntries(xi.map(p => [p.fp, p]))
  const lay = LAYOUT[t.form]
  if (lay && lay.flat().every(f => byFp[f]) && byFp[1]) return [[byFp[1]], ...lay.map(r => r.map(f => byFp[f]))]
  const s = [...xi].sort((a, b) => DEPTH(a.pos) - DEPTH(b.pos) || a.fp - b.fp), parts = [1, ...String(t.form || '4-4-2').split('-').map(Number)], rows: Dict[][] = []; let i = 0
  for (const n of parts) { rows.push(s.slice(i, i + n).sort((a, b) => LAT(a.pos) - LAT(b.pos))); i += n }
  if (i < s.length) rows[rows.length - 1].push(...s.slice(i))
  return rows.filter(r => r.length)
}

// ---------- one card ----------
// the coach on each bench (FotMob line-ups): his surname under the formation, a link to his card in the squad film
function coachTag(M: Dict, ha: string) {
  const C = COACHES_OF[M.lg], code = ha === 'H' ? M.h : M.a, id = coachOf(C, code, ha === 'H' ? M.a : M.h, ha), k = id ? C!.coaches[id] : null
  return k ? `<span class="co" data-href="${coachHref(M.lg, code)}" title="${esc(k.name)} · coach">coach ${esc(surname(k))}</span>` : ''
}
function card(M: Dict) {
  const H = { code: M.h, name: nameOf(M, M.h), color: TEAM(M, M.h).primary || '#555', ...M.home }
  const A = { code: M.a, name: nameOf(M, M.a), color: TEAM(M, M.a).primary || '#555', ...M.away }
  A.color = awayColor(H.color, A.color)
  const byId: Dict = {}
  for (const t of [H, A]) for (const p of t.players) { p.team = t; byId[p.id] = p }
  const offBy: Dict = {}; for (const s of M.subs) if (s.off) offBy[s.off] = s
  const d = M.score.h - M.score.a

  // ---- every trace of one goal (pitch chip, shot map, flow, goal frame, scorer) carries g<i> + p<scorer>: hover one, the rest light up ----
  const clk = (c: string) => { const m = String(c).match(/(\d+)'(?:\+(\d+))?/) || []; return [+(m[1] || 0), +(m[2] || 0)] }
  const gk = (i: number) => i < 0 ? '' : ` data-h="g${i}" data-k="g${i} p${M.goals[i].byId}"`
  const taken = new Set<number>()
  const shotGoal: number[] = M.shots.map((s: Dict) => {   // the commentary's goal → the key event at the same minute, same side
    if (s.k !== 'goal') return -1
    const free = M.goals.map((g: Dict, i: number) => i).filter((i: number) => M.goals[i].s === s.s && !taken.has(i))
    const at = (i: number) => { const [m, x] = clk(M.goals[i].min); return Math.abs(m + x / 10 - s.min - (s.ex || 0) / 10) }
    const i = free.sort((a: number, b: number) => at(a) - at(b))[0] ?? -1
    if (i >= 0 && at(i) <= 2) { taken.add(i); return i } return -1
  })
  const goalOf = (p: Dict, lab: string) => M.goals.findIndex((g: Dict) => g.byId === p.id && g.min === lab)
  const assistOf = (p: Dict, lab: string) => M.goals.findIndex((g: Dict) => g.min === lab && g.s === (p.team === H ? 'h' : 'a') && g.kind !== 'og')

  // ---- left: the pitch ----
  const marker = (p: Dict, x: number, y: number, fs: number) => {
    const goals = p.ev.filter((e: string[]) => e[0] === 'goal'), asts = p.ev.filter((e: string[]) => e[0] === 'ast'), cards = p.ev.filter((e: string[]) => e[0] === 'yc' || e[0] === 'rc'), sub = offBy[p.id]
    let chips = goals.map((e: string[]) => `<span class="ch g"${gk(goalOf(p, e[1]))}><i></i>${esc(e[1])}</span>`).join('') + asts.map((e: string[]) => `<span class="ch as"${gk(assistOf(p, e[1]))}><i></i>${esc(e[1])}</span>`).join('')
    if (sub && byId[sub.on]) {
      const on = byId[sub.on], oev = on.ev.filter((e: string[]) => e[0] !== 'sub')
      chips += `<span class="ch sub"><em>⇅</em>${esc(sub.min)} ${esc(short(on.name))}${oev.map((e: string[]) => e[0] === 'goal' ? ` <span class="sg"${gk(goalOf(on, e[1]))}><span class="gb"></span>${esc(e[1])}</span>` : e[0] === 'ast' ? ` <span class="sg"${gk(assistOf(on, e[1]))}>○${esc(e[1])}</span>` : e[0] === 'yc' || e[0] === 'rc' ? ` <span class="cd"${e[0] === 'rc' ? ' style="background:#d92d20"' : ''}></span>` : '').join('')}</span>`
    }
    return `<div class="pl" data-href="player.html?lg=${M.lg}&team=${p.team.code}&p=${p.id}" style="left:${x}%;top:${y}%;--tc:${p.team.color};--fs:${fs}px" title="${esc(p.name)} · ${esc(p.pos)} — his card">
      <div class="face">${p.ph ? `<img src="squad/${p.id}.webp" alt="" loading="lazy">` : `<span class="ini">${esc(ini(p.name))}</span>`}<b class="num">${esc(p.n)}</b>${cards.length ? `<i class="cd${cards.some((c: string[]) => c[0] === 'rc') ? ' r' : ''}"></i>` : ''}</div>
      <span class="nm">${esc(short(p.name))}</span>${chips ? `<div class="chips">${chips}</div>` : ''}</div>`
  }
  const half = (t: Dict, top: boolean) => {
    // more lines (4-2-3-1, 4-1-2-1-2 …) spread over more of the half, on smaller markers
    const rows = rowsOf(t), n = rows.length, fs = n > 5 ? 32 : n > 4 ? 36 : 40, span = n > 5 ? 41 : n > 4 ? 39 : 36, y0 = n > 4 ? 4 : 5
    return rows.map((r, i) => {
      const y = top ? y0 + i * (span / Math.max(1, n - 1)) : 100 - y0 - 4 - i * (span / Math.max(1, n - 1))
      return (top ? [...r].reverse() : r).map((p, j) => marker(p, (j + 1) / (r.length + 1) * 100, y, fs)).join('')
    }).join('')
  }
  const MARKS = `<svg class="mk" viewBox="0 0 68 105" preserveAspectRatio="none"><g fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".45"><rect x="0" y="0" width="68" height="105" rx=".8"/><line x1="0" y1="52.5" x2="68" y2="52.5"/><circle cx="34" cy="52.5" r="9.15"/><rect x="13.84" y="0" width="40.32" height="16.5"/><rect x="24.84" y="0" width="18.32" height="5.5"/><path d="M27.56 16.5 A9.15 9.15 0 0 0 40.44 16.5"/><rect x="13.84" y="88.5" width="40.32" height="16.5"/><rect x="24.84" y="99.5" width="18.32" height="5.5"/><path d="M27.56 88.5 A9.15 9.15 0 0 1 40.44 88.5"/></g></svg>`

  // ---- middle: the flow — who pushed every 5 minutes (shot 1, on target 2, goal 3, corner .5); the line wears the leader's colour ----
  const BIN = 5, NB = 19, pr: Dict = { h: Array(NB).fill(0), a: Array(NB).fill(0) }
  const bin = (m: number) => Math.min(NB - 1, Math.floor(m / BIN))
  for (const s of M.shots) pr[s.s][bin(s.min + (s.ex ? .5 : 0))] += s.k === 'goal' ? 3 : s.k === 'on' ? 2 : 1
  for (const [s, m] of M.corners) pr[s][bin(m)] += .5
  const pmax = Math.max(4, ...pr.h, ...pr.a)
  const goalsT = M.goals.map((g: Dict, i: number) => ({ i, s: g.s, m: minOf(g.min), who: short(g.by) + (g.kind === 'og' ? ' (og)' : ''), lab: g.min })).sort((a: Dict, b: Dict) => a.m - b.m)
  const X = (m: number) => Math.min(100, m / 95 * 100)
  let hS = 0, aS = 0, last = 0; const segs: number[][] = []
  for (const g of goalsT) { segs.push([last, g.m, hS - aS]); g.s === 'h' ? hS++ : aS++; last = g.m }
  segs.push([last, 95, hS - aS])
  const lead = (v: number) => v > 0 ? H.color : v < 0 ? A.color : '#c9ced4'
  const flowSvg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
    ${pr.h.map((v: number, i: number) => `<rect x="${X(i * BIN) + .35}" width="${X(BIN) - .7}" y="${46 - 40 * v / pmax}" height="${40 * v / pmax}" rx=".6" fill="${H.color}" opacity=".88"/>`).join('')}
    ${pr.a.map((v: number, i: number) => `<rect x="${X(i * BIN) + .35}" width="${X(BIN) - .7}" y="54" height="${40 * v / pmax}" rx=".6" fill="${A.color}" opacity=".88"/>`).join('')}
    ${segs.map(([a, b, v]) => `<rect x="${X(a)}" width="${X(b) - X(a)}" y="47.5" height="5" fill="${lead(v)}"/>`).join('')}
    <line x1="${X(45)}" x2="${X(45)}" y1="2" y2="98" stroke="#b9bec5" stroke-width=".25" stroke-dasharray="1 1" vector-effect="non-scaling-stroke"/></svg>`
  const glev: Dict = {}
  // each goal: a ball on the line at its minute + its name just past the bars of its slot (home above, away below)
  const barH = (s: string, m: number) => { const i = bin(m); return 40 * Math.max(...[i - 1, i, i + 1].filter(k => k >= 0 && k < NB).map(k => pr[s][k])) / pmax }
  const flowGoals = goalsT.map((g: Dict) => { let lv = 0; while ((glev[g.s + lv] ?? -99) > X(g.m) - 6) lv++; glev[g.s + lv] = X(g.m)
    const c = g.s === 'h' ? H.color : A.color, at = `calc(${54 + barH(g.s, g.m)}% + ${3 + lv * 24}px)`
    // a thin line in the club colour ties the ball to the name
    const stem = `<i class="gs" data-k="g${g.i}" style="left:${X(g.m)}%;${g.s === 'h' ? 'bottom' : 'top'}:50%;height:calc(${4 + barH(g.s, g.m)}% + ${3 + lv * 24}px);background:${c}"></i>`
    return `${stem}<i class="gm"${gk(g.i)} style="left:${X(g.m)}%;--gc:${c}"></i><div class="gl"${gk(g.i)} style="left:${X(g.m)}%;${g.s === 'h' ? 'bottom' : 'top'}:${at};--lc:${ink(c)}">${esc(g.who)}<small>${esc(g.lab)}</small></div>` }).join('')
  // the flow in three numbers: minutes each side led and level (90', stoppage time not counted), under the chart
  const gsm = { h: 0, lv: 0, a: 0 }
  { let d = 0, last = 0; const run = (to: number) => { const s = to - last; if (d > 0) gsm.h += s; else if (d < 0) gsm.a += s; else gsm.lv += s; last = to }
    for (const g of [...M.goals].map((g: Dict) => [Math.min(90, clk(g.min)[0]), g.s]).sort((x, y) => x[0] - y[0])) { run(g[0]); d += g[1] === 'h' ? 1 : -1 }
    run(90) }
  const gsum = `<div class="gsum"><span class="mb"><i style="width:${gsm.h / .9}%;background:${H.color}"></i><i style="width:${gsm.lv / .9}%;background:#c9ced4"></i><i style="width:${gsm.a / .9}%;background:${A.color}"></i></span><b style="color:${ink(H.color)}">${esc(H.name)}</b> ahead ${gsm.h}′ · level ${gsm.lv}′ · <b style="color:${ink(A.color)}">${esc(A.name)}</b> ahead ${gsm.a}′</div>`
  // a minute tick under an away goal's label steps aside (the label carries its own minute)
  const ticks = [0, 15, 30, 45, 60, 75, 90].filter(v => !goalsT.some((g: Dict) => g.s === 'a' && Math.abs(X(g.m) - X(v)) < 7)).map(v => `<span class="tk" style="left:${X(v)}%">${v}'</span>`).join('')

  // every attempt in the zone it came from: home shoots at the top goal (its left = the screen's left), away at the bottom
  const Z: Record<string, number[]> = { six: [1, 5, 27, 41], 'box-c': [6, 15, 24, 44], 'box-l': [6, 16, 14, 23], 'box-r': [6, 16, 45, 54], 'angle-l': [1, 5, 14, 21], 'angle-r': [1, 5, 47, 54], out: [17, 27, 18, 50], long: [29, 38, 20, 48], pen: [11, 11, 34, 34] }
  const dot = (s: Dict, k: number) => {
    const z = Z[s.z] || Z['box-c'], dd = z[0] + (z[1] - z[0]) * rnd(k + 1), y0 = z[2] + (z[3] - z[2]) * rnd(k + 7)
    const home = s.s === 'h', x = home ? y0 : 68 - y0, y = home ? dd : 105 - dd, c = home ? H.color : A.color
    // a goal's solid hover zone: one transparent box over the dot, its ring and the name (svg only hits painted pixels)
    if (s.k === 'goal') return `<g${gk(shotGoal[k])}><rect class="hit" x="${x - 2}" y="${y - 2}" width="${4.4 + short(s.who).length * .95}" height="4" fill="transparent"/><circle cx="${x}" cy="${y}" r="1" fill="${c}" stroke="#fff" stroke-width=".35"/><circle cx="${x}" cy="${y}" r="1.55" fill="none" stroke="${c}" stroke-width=".3"/><text x="${x + 2.1}" y="${y + .55}" font-size="1.5" font-weight="800" fill="#15181d" paint-order="stroke" stroke="#e8ede8" stroke-width=".5">${esc(short(s.who))}</text></g>`
    if (s.k === 'on') return `<circle cx="${x}" cy="${y}" r=".7" fill="${c}" stroke="#fff" stroke-width=".25"/>`
    if (s.k === 'blk') return `<g stroke="${c}" stroke-width=".4" opacity=".75"><line x1="${x - .5}" y1="${y - .5}" x2="${x + .5}" y2="${y + .5}"/><line x1="${x - .5}" y1="${y + .5}" x2="${x + .5}" y2="${y - .5}"/></g>`
    return `<circle cx="${x}" cy="${y}" r=".65" fill="none" stroke="${c}" stroke-width=".3" opacity=".9"/>`
  }
  const shotSvg = `<svg class="sp" viewBox="0 0 68 105" preserveAspectRatio="none">
    <g fill="none" stroke="#c4ccc4" stroke-width=".35"><rect x="0" y="0" width="68" height="105" rx=".8"/><line x1="0" y1="52.5" x2="68" y2="52.5"/><circle cx="34" cy="52.5" r="9.15"/>
    <rect x="13.84" y="0" width="40.32" height="16.5"/><rect x="24.84" y="0" width="18.32" height="5.5"/><rect x="13.84" y="88.5" width="40.32" height="16.5"/><rect x="24.84" y="99.5" width="18.32" height="5.5"/></g>
    <rect x="30.34" y="-.8" width="7.32" height=".8" fill="#15181d"/><rect x="30.34" y="105" width="7.32" height=".8" fill="#15181d"/>
    ${M.shots.map((s: Dict, k: number) => s.k !== 'goal' ? dot(s, k) : '').join('')}${M.shots.map((s: Dict, k: number) => s.k === 'goal' ? dot(s, k) : '').join('')}</svg>`
  const cnt = (s: string, k?: string) => M.shots.filter((x: Dict) => x.s === s && (!k || x.k === k)).length

  // ---- right: on goal (shooter's view; misses outside the frame) · scorers · the numbers ----
  const PL: Record<string, number[]> = { bl: [.17, .74], br: [.83, .74], tl: [.17, .27], tr: [.83, .27], c: [.5, .52], tc: [.5, .25], bc: [.5, .76], xl: [-.14, .62], xr: [1.14, .62], xh: [.5, -.32], xhl: [.08, -.32], xhr: [.92, -.32], pl: [0, .5], pr: [1, .5], bar: [.5, 0], ntl: [-.07, -.16], ntr: [1.07, -.16] }
  const frame = (s: string) => {
    const t = s === 'h' ? H : A, c = t.color, list = M.shots.map((x: Dict, i: number) => ({ ...x, i })).filter((x: Dict) => x.s === s && x.p && PL[x.p]).sort((a: Dict, b: Dict) => +(a.k === 'goal') - +(b.k === 'goal'))
    // the caption names who stood in this goal: the other side's keeper, then whoever replaced him (subs are listed as 'SUB')
    const o = s === 'h' ? A : H, gk0 = o.players.find((p: Dict) => p.st && p.pos === 'G'), rep = gk0 && M.subs.find((x: Dict) => x.off === gk0.id)
    const gks = [gk0, rep && byId[rep.on]].filter(Boolean)
    const W = 100, Hh = 33, ox = 20, oy = 16
    const pts = list.map((x: Dict, k: number) => { const [px, py] = PL[x.p], cx = ox + px * W + (rnd(x.i + 3) - .5) * 9, cy = oy + py * Hh + (rnd(x.i + 9) - .5) * 6
      return x.k === 'goal' ? `<g${gk(shotGoal[x.i])}><circle r="6" cx="${cx}" cy="${cy}" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="4.2" fill="${c}" stroke="#fff" stroke-width="1.4"/></g>` : x.k === 'on' ? `<circle cx="${cx}" cy="${cy}" r="3.1" fill="#fff" stroke="${c}" stroke-width="1.6"/>` : `<circle cx="${cx}" cy="${cy}" r="2.6" fill="none" stroke="${c}" stroke-width="1" opacity=".55"/>` }).join('')
    return `<div class="gm1"><svg viewBox="0 0 140 51"><defs><pattern id="net${M.id}${s}" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#dfe3e6" stroke-width=".5"/></pattern></defs>
      <rect x="${ox}" y="${oy}" width="${W}" height="${Hh}" fill="url(#net${M.id}${s})"/><path d="M${ox} ${oy + Hh}V${oy}H${ox + W}V${oy + Hh}" fill="none" stroke="#15181d" stroke-width="2.2" stroke-linejoin="round"/>
      <line x1="4" x2="136" y1="${oy + Hh}" y2="${oy + Hh}" stroke="#c9ced4" stroke-width=".8"/>${pts}</svg>
      <div class="cap"><b style="color:${ink(o.color)}">${gks.map((p: Dict) => esc(short(p.name))).join(' / ') || esc(o.name)}</b> · ${M.score[s]} scored · ${cnt(s, 'on')} saved · ${list.filter((x: Dict) => x.k === 'off').length} off</div></div>`
  }
  const scorers = (s: string) => {
    const t = s === 'h' ? H : A, by: Dict = {}
    M.goals.forEach((g: Dict, i: number) => { if (g.s !== s) return
      const r = (by[g.byId || g.by] ||= { g, mins: [] as string[], is: [] as number[], asts: [] as string[], pens: 0 }); r.mins.push(g.min); r.is.push(i); if (g.ast && !r.asts.includes(short(g.ast))) r.asts.push(short(g.ast)); if (g.kind === 'pen') r.pens++ })
    const rows = Object.values(by).sort((a: Dict, b: Dict) => minOf(a.mins[0]) - minOf(b.mins[0])).map((r: Dict) => {
      const p = byId[r.g.byId], og = r.g.kind === 'og'
      return `<span class="s"${p ? ` data-href="player.html?lg=${M.lg}&team=${p.team.code}&p=${p.id}"` : ''} style="--tc:${og ? '#8a9099' : t.color}" data-h="p${r.g.byId}" data-k="p${r.g.byId} ${r.is.map((i: number) => 'g' + i).join(' ')}"><span class="ph">${p?.ph ? `<img src="squad/${p.id}.webp" alt="" loading="lazy">` : og ? 'OG' : esc(ini(r.g.by))}</span><span class="tx"><span>${esc(short(r.g.by))} <small>${r.mins.map(esc).join(' · ')}${r.pens ? ' (pen)' : ''}${og ? ' (og)' : ''}</small></span>${r.asts.length ? `<em>○ ${r.asts.map(esc).join(' · ')}</em>` : ''}</span></span>`
    })
    return `<div class="scs">${rows.join('') || '<span class="none">no goals</span>'}</div>`
  }
  const S = M.stats, nv = (s: string, k: string) => +(S[s]?.[k] || 0)
  const acc = (s: string) => Math.round(100 * nv(s, 'accuratePasses') / Math.max(1, nv(s, 'totalPasses')))
  const STATS: [string, number, number, ((v: number) => string)?][] = [
    ['Poss', nv('h', 'possessionPct'), nv('a', 'possessionPct'), v => Math.round(v) + '%'], ['Shots', cnt('h'), cnt('a')], ['On tgt', cnt('h', 'on') + cnt('h', 'goal'), cnt('a', 'on') + cnt('a', 'goal')],
    ['Passes', nv('h', 'totalPasses'), nv('a', 'totalPasses')], ['Acc', acc('h'), acc('a'), v => v + '%'], ['Corners', nv('h', 'wonCorners'), nv('a', 'wonCorners')],
    ['Saves', nv('h', 'saves'), nv('a', 'saves')], ['Fouls', nv('h', 'foulsCommitted'), nv('a', 'foulsCommitted')], ['Cards', nv('h', 'yellowCards') + nv('h', 'redCards'), nv('a', 'yellowCards') + nv('a', 'redCards')]]
  const col = ([lb, h, a, f = (v: number) => String(v)]: [string, number, number, ((v: number) => string)?]) => { const t = Math.max(1, h + a)
    // the value sits inside its bar, at the base by the label line (dark on a light club colour)
    const bar = (v: number, c: string) => `<i style="height:${100 * v / t}%;background:${c};color:${lum(c) > .62 ? '#15181d' : '#fff'}">${f(v)}</i>`
    return `<div class="ms"><div class="up">${bar(h, H.color)}</div><span class="lb" title="${lb}">${lb}</span><div class="dn">${bar(a, A.color)}</div></div>` }

  return `
    <div class="pan pitch">${MARKS}
      <img class="cw t" src="${logo(H.code, M.lg)}" alt=""><img class="cw b" src="${logo(A.code, M.lg)}" alt="">
      <div class="tlab t${onLight(H.color)}"><a class="tn" href="teams.html?lg=${M.lg}&t=${H.code}" title="${esc(H.name)} · team card">${esc(H.name)}</a><span class="tx"><b>${esc(H.form)}</b>${ord(M.table.h[0])} → ${ord(M.table.h[1])}${coachTag(M, 'H')}</span></div>
      <div class="tlab b${onLight(A.color)}"><a class="tn" href="teams.html?lg=${M.lg}&t=${A.code}" title="${esc(A.name)} · team card">${esc(A.name)}</a><span class="tx"><b>${esc(A.form)}</b>${ord(M.table.a[0])} → ${ord(M.table.a[1])}${coachTag(M, 'A')}</span></div>
      <div class="bigsc t" style="--sc:${scoreInk(H.color)}"><b>${M.score.h}</b></div>
      <div class="bigsc b" style="--sc:${scoreInk(A.color)}"><b>${M.score.a}</b></div>
      ${half(H, true)}${half(A, false)}
    </div>
    <div class="mid">${shotSvg}
      <div class="dir t" style="color:${ink(H.color)}">↑ Shots<span>${cnt('h')} · ${cnt('h', 'on') + cnt('h', 'goal')} on target</span></div>
      ${gsum}
      <div class="dir b" style="color:${ink(A.color)}">↓ Shots<span>${cnt('a')} · ${cnt('a', 'on') + cnt('a', 'goal')} on target</span></div>
      <div class="flk"><i class="ln" style="background:linear-gradient(90deg,${H.color} 0 40%,#c9ced4 40% 60%,${A.color} 60%)"></i>line: who was leading<i class="br"><b style="background:${H.color}"></b><b style="background:${A.color}"></b></i>bars: attacking push, every 5′</div>
      <div class="flow"><span class="lbl">THE FLOW</span>${flowSvg}${flowGoals}${ticks}</div>
    </div>
    <div class="body sym">
      <div class="half top">${frame('h')}${scorers('h')}</div>
      <div class="mstat">${STATS.map(col).join('')}</div>
      <div class="half bot">${scorers('a')}${frame('a')}</div>
    </div>`
}

// ---------- the film: empty cards for every match, filled around the one on screen ----------
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map((M, i) => `<section class="card m3 empty" id="m-${i}" data-i="${i}" style="--c:${TEAM(M, M.h).primary || '#555'};--ch:${TEAM(M, M.h).primary || '#555'};--ca:${TEAM(M, M.a).primary || '#555'}"></section>`).join('')
const cardEls = [...film.children] as HTMLElement[]
// the club names on the pitch: as big as fits their side of the goal — one line, or two when that's clearly bigger
// ("Borussia / Dortmund"); each layout is measured in one pass over all names
function fitNames(root: ParentNode) {
  const els = [...root.querySelectorAll<HTMLElement>('.tlab .tn')]
  const two = (n: string) => { const w = n.split(' '); if (w.length < 2) return null
    let best = 1; for (let i = 1; i < w.length; i++) if (Math.max(w.slice(0, i).join(' ').length, w.slice(i).join(' ').length) < Math.max(w.slice(0, best).join(' ').length, w.slice(best).join(' ').length)) best = i
    return esc(w.slice(0, best).join(' ')) + '<br>' + esc(w.slice(best).join(' ')) }
  const fit = (e: HTMLElement) => e.clientWidth ? NAME_MAX * e.clientWidth / e.scrollWidth : 0   // 0: not laid out (hidden tab)
  els.forEach(e => { e.dataset.n ??= e.textContent || ''; e.textContent = e.dataset.n; e.style.fontSize = '' })
  const one = els.map(fit)
  els.forEach(e => { const h = two(e.dataset.n!); if (h) e.innerHTML = h })
  const dbl = els.map((e, i) => e.innerHTML.includes('<br>') ? Math.min(NAME_MAX2, fit(e)) : 0)
  els.forEach((e, i) => {
    const use2 = dbl[i] > Math.min(NAME_MAX, one[i]) * 1.25, fs = use2 ? dbl[i] : Math.min(NAME_MAX, one[i])
    if (!use2) e.textContent = e.dataset.n!
    if (fs) e.style.fontSize = Math.floor(fs * 10) / 10 + 'px'
  })
}
const NAME_MAX = 46, NAME_MAX2 = 36
let refit = 0
addEventListener('resize', () => { cancelAnimationFrame(refit); refit = requestAnimationFrame(() => fitNames(film)) })
document.fonts?.ready.then(() => fitNames(film))   // measured before Archivo loaded, a name would be sized for the fallback font

function fill(i: number) {
  const el = cardEls[i]; if (!el || !el.classList.contains('empty')) return
  el.innerHTML = card(P[i]); el.classList.remove('empty')
  fitNames(el)
  const A = TEAM(P[i], P[i].a).primary || '#555', H = TEAM(P[i], P[i].h).primary || '#555'
  el.style.setProperty('--ca', awayColor(H, A))
}

// top bar: leagues (only those with match cards), the matchday switch
const url = (o: Dict) => { const q = new URLSearchParams(location.search); for (const [k, v] of Object.entries(o)) v == null ? q.delete(k) : q.set(k, String(v)); return location.pathname + '?' + q.toString() + '#1' }   // league / matchday switches start at card 1
$('lgs').innerHTML = `<a class="lgb all${ALL ? ' on' : ''}" href="${url({ lg: 'ALL', md: null })}" title="Every match of the five leagues from the last ${WINDOW_DAYS} days, latest first"><b>All Leagues</b></a>` + LG_ORDER.map(lg => `<a class="lgb${lg === LG ? ' on' : ''}${has(lg) ? '' : ' soon'}" data-lg="${lg}" href="${url({ lg, md: null })}" title="${LEAGUE_NAME[lg]}${has(lg) ? ' match cards' : ' — coming soon'}"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"></a>`).join('')
const mi = MDS.indexOf(MD)
$('mdsw').innerHTML = ALL ? '' : `<a class="${mi > 0 ? '' : 'off'}" href="${url({ md: MDS[mi - 1] })}" title="Previous matchday">‹</a><b>MD ${MD}</b><a class="${mi < MDS.length - 1 ? '' : 'off'}" href="${url({ md: MDS[mi + 1] })}" title="Next matchday">›</a>`
const kickOf = (M: Dict) => { const w = new Date(M.kick); return M.kick ? `${w.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })} ${w.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}` : '' }
const span = P.length ? `${kickOf(P[P.length - 1]).split(' ').slice(0, 3).join(' ')} – ${kickOf(P[0]).split(' ').slice(0, 3).join(' ')}` : ''
$('cnote').innerHTML = ALL ? `${P.length} matches of the five leagues from the last ${WINDOW_DAYS} days (${span}), latest kick-off first. Season ${SEASON.replace('-', '/')}.`
  : `${P.length} matches of ${LEAGUE_NAME[LG]} matchday ${MD}, latest kick-off first. Season ${SEASON.replace('-', '/')}.`

function onPaint(i: number) {
  for (const k of [i - 1, i, i + 1, i + 2]) fill(k)
  requestAnimationFrame(() => fitNames(cardEls[i]))   // a card filled off screen was measured without layout (content-visibility)
  const M = P[i]
  $('ctx').innerHTML = `${ALL ? `<img class="ctxlg" src="leagues/${M.lg}.png" alt="">` : ''}${LEAGUE_NAME[M.lg]} · MD ${M.md} · <b>${esc(nameOf(M, M.h))} ${M.score.h}–${M.score.a} ${esc(nameOf(M, M.a))}</b> · ${kickOf(M)}${M.venue ? ` · ${esc(M.venue)}` : ''}${M.att ? ` · ${M.att.toLocaleString('en-GB')}` : ''}`
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[M.lg]); meta('title', `${nameOf(M, M.h)} ${M.score.h}–${M.score.a} ${nameOf(M, M.a)} · ${LEAGUE_NAME[M.lg]} MD ${M.md}`)
  if (ALL) $('lgs').querySelectorAll<HTMLElement>('.lgb[data-lg]').forEach(b => b.classList.toggle('cur', b.dataset.lg === M.lg))   // mark this match's league
}

// search: a club or a scorer; a number jumps to that card
const INDEX = P.map((M, i) => ({ i, label: `${nameOf(M, M.h)} ${M.score.h}–${M.score.a} ${nameOf(M, M.a)}`, sub: (ALL ? LEAGUE_NAME[M.lg] + ' · ' : '') + kickOf(M),
  key: [nameOf(M, M.h), nameOf(M, M.a), M.h, M.a, LEAGUE_NAME[M.lg], ...M.goals.map((g: Dict) => g.by)].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }))
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  return hits.length ? `<div class="jsec"><div class="jsechd">${ALL ? `All Leagues · last ${WINDOW_DAYS} days` : `<img src="leagues/${LG}.png" alt="">${LEAGUE_NAME[LG]} · MD ${MD}`}<span>${hits.length}</span></div><div class="jgrid">${hits.map(x =>
    `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` : '<p>No match found.</p>'
}

initLinks(film)
initHighlight(film, '[data-h]', k => `[data-k~="${k}"]`, el => el.dataset.h!)
initNav('matches', LG, SEASON)
initFilm({ count: P.length, key: `top5.matches.card.${LG}${ALL ? '' : '.md' + MD}${SEASON === '2026-27' ? '' : '.' + SEASON}`, onPaint, jumpHTML, self: 'matches.html' })
