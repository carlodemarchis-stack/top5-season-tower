// Match-card film: one card per league match, one film per matchday (?lg=ITA&md=6), in kick-off order.
// Every column is split at the halfway line — the home team on top, the away team below:
//   left   both XIs on one pitch, every goal / assist / card / substitution on the player, the score big
//   middle every attempt (home at the top goal, away at the bottom one) and the flow of the match across halfway
//   right  where each side's attempts went on goal, the scorers, and the numbers mirrored at the centre line
// Data: src/data/matches-<LG>-<season>-md<NN>.js (scripts/update-matches.mjs); club names / colours from the schedule.
import '../film/film.css'
import { initFilm, initHighlight } from '../film/chrome'
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
const LG = [QS.get('lg') || '', LAST].find(l => LG_ORDER.includes(l) && has(l)) || LG_ORDER.find(has) || 'ITA'
try { localStorage.setItem('top5.matches.lg', LG) } catch { }
const MDS = mdsOf(LG)
const MD = MDS.includes(+(QS.get('md') || 0)) ? +QS.get('md')! : MDS[MDS.length - 1]
const [{ MATCHES }, { TEAMS }] = await Promise.all([
  FILES[`../data/matches-${LG}-${SEASON}-md${String(MD).padStart(2, '0')}.js`](),
  import(`../data/schedule-${LG}-${SEASON}.js`),
]) as Dict[]
const P: Dict[] = MATCHES

// ---------- helpers ----------
const RES = (d: number) => d >= 2 ? '#177a41' : d === 1 ? '#3a9e62' : d === 0 ? '#EAB308' : d === -1 ? '#dc5c5e' : '#b3323a'
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const ord = (n: number | null) => n == null ? '–' : n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
const minOf = (c: string) => { const m = String(c).match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
const ini = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('')
const short = (n: string) => { const w = n.split(/\s+/); return w[w.length - 1] || n }
const rgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const lum = (h: string) => { const [r, g, b] = rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }
const ink = (c: string) => lum(c) > .62 ? '#15181d' : c
const rnd = (s: number) => { const x = Math.sin(s * 99.13) * 43758.5453; return x - Math.floor(x) }
const logo = (code: string) => `logos/${LG === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code}.png`
const SHORTN: Record<string, string> = { 'Paris Saint-Germain FC': 'Paris SG', 'Bayer 04 Leverkusen': 'Leverkusen', '1. FSV Mainz 05': 'Mainz', 'Eintracht Frankfurt': 'Frankfurt' }
const nameOf = (code: string) => { const n = TEAMS[code]?.name || code; return SHORTN[n] || n.replace(/^(FC|CF|AS|AC|SSC|RC|RCD)\s+/, '').replace(/\s+(FC|CF)$/, '') }

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
function card(M: Dict) {
  const H = { code: M.h, name: nameOf(M.h), color: TEAMS[M.h]?.primary || '#555', ...M.home }
  const A = { code: M.a, name: nameOf(M.a), color: TEAMS[M.a]?.primary || '#555', ...M.away }
  const close = Math.hypot(...rgb(H.color).map((v, k) => v - rgb(A.color)[k])) < 120
  if (close) A.color = '#4a5059'   // two clubs in the same colour: the away side goes dark grey
  const byId: Dict = {}
  for (const t of [H, A]) for (const p of t.players) { p.team = t; byId[p.id] = p }
  const offBy: Dict = {}; for (const s of M.subs) if (s.off) offBy[s.off] = s
  const d = M.score.h - M.score.a

  // ---- left: the pitch ----
  const marker = (p: Dict, x: number, y: number, fs: number) => {
    const goals = p.ev.filter((e: string[]) => e[0] === 'goal'), asts = p.ev.filter((e: string[]) => e[0] === 'ast'), cards = p.ev.filter((e: string[]) => e[0] === 'yc' || e[0] === 'rc'), sub = offBy[p.id]
    let chips = goals.map((e: string[]) => `<span class="ch g"><i></i>${esc(e[1])}</span>`).join('') + asts.map((e: string[]) => `<span class="ch as"><i></i>${esc(e[1])}</span>`).join('')
    if (sub && byId[sub.on]) {
      const on = byId[sub.on], oev = on.ev.filter((e: string[]) => e[0] !== 'sub')
      chips += `<span class="ch sub"><em>⇅</em>${esc(sub.min)} ${esc(short(on.name))}${oev.map((e: string[]) => e[0] === 'goal' ? ` <span class="gb"></span>${esc(e[1])}` : e[0] === 'ast' ? ` ○${esc(e[1])}` : e[0] === 'yc' || e[0] === 'rc' ? ` <span class="cd"${e[0] === 'rc' ? ' style="background:#d92d20"' : ''}></span>` : '').join('')}</span>`
    }
    return `<div class="pl" style="left:${x}%;top:${y}%;--tc:${p.team.color};--fs:${fs}px" title="${esc(p.name)} · ${esc(p.pos)}">
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
  const goalsT = M.goals.map((g: Dict) => ({ s: g.s, m: minOf(g.min), who: short(g.by) + (g.kind === 'og' ? ' (og)' : ''), lab: g.min })).sort((a: Dict, b: Dict) => a.m - b.m)
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
  const flowGoals = goalsT.map((g: Dict) => { let lv = 0; while ((glev[g.s + lv] ?? -99) > X(g.m) - 6) lv++; glev[g.s + lv] = X(g.m)
    return `<div class="gl" style="left:${X(g.m)}%;${g.s === 'h' ? `top:${-16 - lv * 22}px` : `bottom:${-44 - lv * 22}px`}">${esc(g.who)}<small>${esc(g.lab)}</small></div>` }).join('')
  const ticks = [0, 15, 30, 45, 60, 75, 90].map(v => `<span class="tk" style="left:${X(v)}%">${v}'</span>`).join('')

  // every attempt in the zone it came from: home shoots at the top goal (its left = the screen's left), away at the bottom
  const Z: Record<string, number[]> = { six: [1, 5, 27, 41], 'box-c': [6, 15, 24, 44], 'box-l': [6, 16, 14, 23], 'box-r': [6, 16, 45, 54], 'angle-l': [1, 5, 14, 21], 'angle-r': [1, 5, 47, 54], out: [17, 27, 18, 50], long: [29, 38, 20, 48], pen: [11, 11, 34, 34] }
  const dot = (s: Dict, k: number) => {
    const z = Z[s.z] || Z['box-c'], dd = z[0] + (z[1] - z[0]) * rnd(k + 1), y0 = z[2] + (z[3] - z[2]) * rnd(k + 7)
    const home = s.s === 'h', x = home ? y0 : 68 - y0, y = home ? dd : 105 - dd, c = home ? H.color : A.color
    if (s.k === 'goal') return `<circle cx="${x}" cy="${y}" r="1" fill="${c}" stroke="#fff" stroke-width=".35"/><circle cx="${x}" cy="${y}" r="1.55" fill="none" stroke="${c}" stroke-width=".3"/><text x="${x + 2.1}" y="${y + .55}" font-size="1.5" font-weight="800" fill="#15181d" paint-order="stroke" stroke="#e8ede8" stroke-width=".5">${esc(short(s.who))}</text>`
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
    const t = s === 'h' ? H : A, c = t.color, list = M.shots.filter((x: Dict) => x.s === s && x.p && PL[x.p])
    const W = 100, Hh = 33, ox = 20, oy = 16
    const pts = list.map((x: Dict, k: number) => { const [px, py] = PL[x.p], cx = ox + px * W + (rnd(k + 3) - .5) * 9, cy = oy + py * Hh + (rnd(k + 9) - .5) * 6
      return x.k === 'goal' ? `<circle cx="${cx}" cy="${cy}" r="4.2" fill="${c}" stroke="#fff" stroke-width="1.4"/>` : x.k === 'on' ? `<circle cx="${cx}" cy="${cy}" r="3.1" fill="#fff" stroke="${c}" stroke-width="1.6"/>` : `<circle cx="${cx}" cy="${cy}" r="2.6" fill="none" stroke="${c}" stroke-width="1" opacity=".55"/>` }).join('')
    return `<div class="gm1"><svg viewBox="0 0 140 51"><defs><pattern id="net${M.id}${s}" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#dfe3e6" stroke-width=".5"/></pattern></defs>
      <rect x="${ox}" y="${oy}" width="${W}" height="${Hh}" fill="url(#net${M.id}${s})"/><path d="M${ox} ${oy + Hh}V${oy}H${ox + W}V${oy + Hh}" fill="none" stroke="#15181d" stroke-width="2.2" stroke-linejoin="round"/>
      <line x1="4" x2="136" y1="${oy + Hh}" y2="${oy + Hh}" stroke="#c9ced4" stroke-width=".8"/>${pts}</svg>
      <div class="cap"><b style="color:${ink(c)}">${esc(t.name)}</b> · ${M.score[s]} scored · ${cnt(s, 'on')} saved · ${list.filter((x: Dict) => x.k === 'off').length} off</div></div>`
  }
  const scorers = (s: string) => {
    const t = s === 'h' ? H : A, by: Dict = {}
    for (const g of M.goals.filter((x: Dict) => x.s === s)) (by[g.byId || g.by] ||= { g, mins: [] as string[], pens: 0 }).mins.push(g.min), g.kind === 'pen' && by[g.byId || g.by].pens++
    const rows = Object.values(by).sort((a: Dict, b: Dict) => minOf(a.mins[0]) - minOf(b.mins[0])).map((r: Dict) => {
      const p = byId[r.g.byId], og = r.g.kind === 'og'
      return `<span class="s" style="--tc:${og ? '#8a9099' : t.color}" data-h="p${r.g.byId}" data-k="p${r.g.byId}"><span class="ph">${p?.ph ? `<img src="squad/${p.id}.webp" alt="" loading="lazy">` : og ? 'OG' : esc(ini(r.g.by))}</span>${esc(short(r.g.by))} <small>${r.mins.map(esc).join(' · ')}${r.pens ? ' (pen)' : ''}${og ? ' (og)' : ''}</small></span>`
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
      <img class="cw t" src="${logo(H.code)}" alt=""><img class="cw b" src="${logo(A.code)}" alt="">
      <div class="tlab t"><span class="tn">${esc(H.name)}</span><span class="tx"><b>${esc(H.form)}</b>${ord(M.table.h[0])} → ${ord(M.table.h[1])}</span></div>
      <div class="tlab b"><span class="tn">${esc(A.name)}</span><span class="tx"><b>${esc(A.form)}</b>${ord(M.table.a[0])} → ${ord(M.table.a[1])}</span></div>
      <div class="bigsc t" style="--sc:${H.color}"><b>${M.score.h}</b></div>
      <div class="bigsc b" style="--sc:${A.color}"><b>${M.score.a}</b></div>
      ${half(H, true)}${half(A, false)}
    </div>
    <div class="mid">${shotSvg}
      <div class="dir t" style="color:${ink(H.color)}">↑ ${esc(H.name)} shots<span>${cnt('h')} · ${cnt('h', 'on') + cnt('h', 'goal')} on target</span></div>
      <div class="dir b" style="color:${ink(A.color)}">↓ ${esc(A.name)} shots<span>${cnt('a')} · ${cnt('a', 'on') + cnt('a', 'goal')} on target</span></div>
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
film.innerHTML = P.map((M, i) => `<section class="card m3 empty" id="m-${i}" data-i="${i}" style="--c:${TEAMS[M.h]?.primary || '#555'};--ch:${TEAMS[M.h]?.primary || '#555'};--ca:${TEAMS[M.a]?.primary || '#555'}"></section>`).join('')
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

function fill(i: number) {
  const el = cardEls[i]; if (!el || !el.classList.contains('empty')) return
  el.innerHTML = card(P[i]); el.classList.remove('empty')
  fitNames(el)
  const A = TEAMS[P[i].a]?.primary || '#555', H = TEAMS[P[i].h]?.primary || '#555'
  if (Math.hypot(...rgb(H).map((v, k) => v - rgb(A)[k])) < 120) el.style.setProperty('--ca', '#4a5059')
}

// top bar: leagues (only those with match cards), the matchday switch
const url = (o: Dict) => { const q = new URLSearchParams(location.search); for (const [k, v] of Object.entries(o)) v == null ? q.delete(k) : q.set(k, String(v)); return location.pathname + '?' + q.toString() }
$('lgs').innerHTML = LG_ORDER.map(lg => `<a class="lgb${lg === LG ? ' on' : ''}${has(lg) ? '' : ' soon'}" href="${url({ lg, md: null })}" title="${LEAGUE_NAME[lg]}${has(lg) ? ' match cards' : ' — coming soon'}"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"></a>`).join('')
const mi = MDS.indexOf(MD)
$('mdsw').innerHTML = `<a class="${mi > 0 ? '' : 'off'}" href="${url({ md: MDS[mi - 1] })}" title="Previous matchday">‹</a><b>MD ${MD}</b><a class="${mi < MDS.length - 1 ? '' : 'off'}" href="${url({ md: MDS[mi + 1] })}" title="Next matchday">›</a>`
$('cnote').innerHTML = `${P.length} matches of ${LEAGUE_NAME[LG]} matchday ${MD}, in kick-off order. Season ${SEASON.replace('-', '/')}.`

const kickOf = (M: Dict) => { const w = new Date(M.kick); return M.kick ? `${w.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })} ${w.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}` : '' }
function onPaint(i: number) {
  for (const k of [i - 1, i, i + 1, i + 2]) fill(k)
  const M = P[i]
  $('ctx').innerHTML = `${LEAGUE_NAME[LG]} · MD ${MD} · <b>${esc(nameOf(M.h))} ${M.score.h}–${M.score.a} ${esc(nameOf(M.a))}</b> · ${kickOf(M)}${M.venue ? ` · ${esc(M.venue)}` : ''}${M.att ? ` · ${M.att.toLocaleString('en-GB')}` : ''}`
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[LG]); meta('title', `${nameOf(M.h)} ${M.score.h}–${M.score.a} ${nameOf(M.a)} · ${LEAGUE_NAME[LG]} MD ${MD}`)
}

// search: a club or a scorer; a number jumps to that card
const INDEX = P.map((M, i) => ({ i, label: `${nameOf(M.h)} ${M.score.h}–${M.score.a} ${nameOf(M.a)}`, sub: kickOf(M),
  key: [nameOf(M.h), nameOf(M.a), M.h, M.a, ...M.goals.map((g: Dict) => g.by)].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }))
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  return hits.length ? `<div class="jsec"><div class="jsechd"><img src="leagues/${LG}.png" alt="">${LEAGUE_NAME[LG]} · MD ${MD}<span>${hits.length}</span></div><div class="jgrid">${hits.map(x =>
    `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` : '<p>No match found.</p>'
}

initHighlight(film, '[data-h]', k => `[data-k~="${k}"]`, el => el.dataset.h!)
initFilm({ count: P.length, key: `top5.matches.card.${LG}.md${MD}${SEASON === '2026-27' ? '' : '.' + SEASON}`, onPaint, jumpHTML, self: 'matches.html' })
