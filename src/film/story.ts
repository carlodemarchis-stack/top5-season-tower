// The Tactical tab of a player card (squad, scorers and keepers films): the Season | Tactical switch top right flips every
// card of the film. Every fixture of his club, one grid: above each box the opponent and the score; a start shows the XI
// as small dots and him big (a keeper: the shots on target he faced, his saves); below, his role + the formation, then
// minutes (↑ on / ↓ off), goals ●, assists ○, cards and, in Serie A, the mark. The match cards load the first time
// the tab is used (a league's at a time), and each card's pane is drawn when it comes into view.
import { rowsOf } from './pitch'
import { esc, type Ctx } from './cards'
type Dict = Record<string, any>

const MATCH_FILES = import.meta.glob('../data/matches-*-*-md*.js')
const RECS: Record<string, Promise<Dict[]>> = {}
const recsOf = (lg: string, season: string) => RECS[lg + season] ??= Promise.all(Object.keys(MATCH_FILES).filter(f => f.includes(`/matches-${lg}-${season}-md`)).map(f => MATCH_FILES[f]()))
  .then(fs => (fs as Dict[]).flatMap(f => f.MATCHES))

// the Heatmaps view: per match, each player's touches (FotMob), packed by scripts/update-heatmaps.mjs
const HEAT_FILES = import.meta.glob('../data/heat-*.js')
// distance run + top speed per match (Serie A and Premier League tracking), by scripts/update-runs.mjs
const RUN_FILES = import.meta.glob('../data/run-*.js')
const RUNS: Record<string, Promise<Dict>> = {}
const runOf = (lg: string, season: string) => RUNS[lg + season] ??= (RUN_FILES[`../data/run-${lg}-${season}.js`]?.() ?? Promise.resolve({ RUN: {} })).then(m => (m as Dict).RUN || {})
const HEATS: Record<string, Promise<Dict>> = {}
const heatOf = (lg: string, season: string) => HEATS[lg + season] ??= (HEAT_FILES[`../data/heat-${lg}-${season}.js`]?.() ?? Promise.resolve({ HEAT: {} })).then(m => (m as Dict).HEAT || {})
// the Heatmaps pitch (68 × 92 like .msp, attacking up): a spot is [metres from his own goal line, metres from his left
// touchline]. An outfield player gets the whole pitch; a keeper the 36 m in front of his goal, where all of his game is
type Spot = (d: number, a: number) => number[]
const FULL: Spot = (d, a) => [a, 92 - d * 92 / 105]
const KEEP: Spot = (d, a) => [(a - 4) * 68 / 60, 92 - d * 92 / 36]
const f1 = (v: number) => v.toFixed(1)
// his touches: soft overlapping blobs, darker where he was most often; over them the shots (svg markup, see shotMarks)
let HG = 0   // each pitch its own gradient id: a shared one breaks every pitch when its first copy sits in a hidden card
function heatPitch(packed: string, tint: string, P: Spot, shots = '') {
  const pts = packed.match(/../g) || [], id = `hg${++HG}`
  const blobs = pts.map(c => { const [x, y] = P(parseInt(c[0], 36) / 35 * 105, parseInt(c[1], 36) / 35 * 68); return `<circle cx="${f1(x)}" cy="${f1(y)}" r="9" fill="url(#${id})"/>` }).join('')
  const box = (d0: number, d1: number, a0: number, a1: number) => { const [x0, y0] = P(d0, a0), [x1, y1] = P(d1, a1); return `<rect x="${f1(Math.min(x0, x1))}" y="${f1(Math.min(y0, y1))}" width="${f1(Math.abs(x1 - x0))}" height="${f1(Math.abs(y1 - y0))}"/>` }
  // the lines: the full pitch has the halfway line + the box he attacks (.msp draws his own); the keeper's the box and the six-yard box
  const lines = P === KEEP ? box(-1, 16.5, 13.84, 54.16) + box(-1, 5.5, 24.84, 43.16) : `<line x1="0" x2="68" y1="46" y2="46"/>${box(88.5, 106, 13.84, 54.16)}`
  return `<div class="msp res heat${P === KEEP ? ' gk' : ''}" style="--rc:${tint}"><svg viewBox="0 0 68 92" preserveAspectRatio="none"><defs><radialGradient id="${id}"><stop offset="0" stop-color="#15181d" stop-opacity=".3"/><stop offset="1" stop-color="#15181d" stop-opacity="0"/></radialGradient></defs><g fill="none" stroke="#fff" stroke-width="1">${lines}</g>${blobs}${shots}</svg></div>`
}
// shots in the zone they came from (the commentary gives a zone, not a spot: [metres from the goal line from–to, across
// from–to, from the shooter's left], as on the match card), scattered inside it; the app's one vocabulary: ● goal ·
// ○ on target · × off target · ▪ blocked. faced: shots at his own goal (a keeper's; a goal is one he let in, in red)
const ZONE: Record<string, number[]> = { six: [1, 5, 27, 41], 'box-c': [6, 15, 24, 44], 'box-l': [6, 16, 14, 23], 'box-r': [6, 16, 45, 54], 'angle-l': [1, 5, 14, 21], 'angle-r': [1, 5, 47, 54], out: [17, 27, 18, 50], long: [29, 38, 20, 48], pen: [11, 11, 34, 34] }
const rnd = (i: number) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v) }
function shotMarks(list: Dict[], P: Spot, faced: boolean) {
  const ink = '#15181d'
  return [...list].sort((a, b) => +(a.k === 'goal') - +(b.k === 'goal')).map((s, i) => {
    const z = ZONE[s.z] || ZONE['box-c'], dd = z[0] + (z[1] - z[0]) * rnd(s.min * 7 + i + 1), aa = z[2] + (z[3] - z[2]) * rnd(s.min * 3 + i + 5)
    // the shooter's left is a keeper's right
    const [x, y] = faced ? P(dd, 68 - aa) : P(105 - dd, aa)
    if (s.k === 'goal') return `<circle cx="${f1(x)}" cy="${f1(y)}" r="3" fill="${faced ? '#b3323a' : ink}" stroke="#fff" stroke-width="1"/>`
    if (s.k === 'on') return `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.4" fill="#fff" stroke="${ink}" stroke-width="1.1"/>`
    if (s.k === 'blk') return `<rect x="${f1(x - 1.6)}" y="${f1(y - 1.6)}" width="3.2" height="3.2" fill="${ink}" stroke="#fff" stroke-width=".5"/>`
    return `<g stroke="${ink}" stroke-width="1.1" stroke-linecap="round"><line x1="${f1(x - 2)}" y1="${f1(y - 2)}" x2="${f1(x + 2)}" y2="${f1(y + 2)}"/><line x1="${f1(x - 2)}" y1="${f1(y + 2)}" x2="${f1(x + 2)}" y2="${f1(y - 2)}"/></g>`
  }).join('')
}
// names compared without accents or case; else his surname, when only one shooter of his side has it (as src/film/season.ts)
const plain = (n: unknown) => String(n || '').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
function shotsBy(M: Dict, side: string, name: string) {
  const S = (M.shots as Dict[]).filter(x => x.s === side), last = (n: unknown) => plain(n).split(/\s+/).pop()
  let mine = S.filter(x => plain(x.who) === plain(name))
  if (!mine.length) { const L = S.filter(x => last(x.who) === last(name)); if (new Set(L.map(x => x.who)).size === 1) mine = L }
  return mine
}

const RES: Record<string, string> = { bigW: '#177a41', W1: '#3a9e62', D: '#EAB308', nil: '#9aa0a8', L1: '#dc5c5e', bigL: '#b3323a' }
const res = (gf: number, ga: number) => { const d = gf - ga; return d >= 2 ? 'bigW' : d === 1 ? 'W1' : d === 0 ? (gf ? 'D' : 'nil') : d === -1 ? 'L1' : 'bigL' }
const ROLE: Record<string, string> = { G: 'goalkeeper', CD: 'centre-back', 'CD-L': 'left centre-back', 'CD-R': 'right centre-back', LB: 'left-back', RB: 'right-back', LWB: 'left wing-back', RWB: 'right wing-back',
  DM: 'defensive mid', CM: 'central mid', 'CM-L': 'left central mid', 'CM-R': 'right central mid', LM: 'left mid', RM: 'right mid', AM: 'attacking mid', 'AM-L': 'left attacking mid', 'AM-R': 'right attacking mid',
  LF: 'left forward', RF: 'right forward', CF: 'striker', 'CF-L': 'left striker', 'CF-R': 'right striker', LW: 'left wing', RW: 'right wing' }
const SHORT: Record<string, string> = { G: 'GK', CD: 'CB', 'CD-L': 'LCB', 'CD-R': 'RCB', LB: 'LB', RB: 'RB', LWB: 'LWB', RWB: 'RWB', DM: 'DM', CM: 'CM', 'CM-L': 'LCM', 'CM-R': 'RCM',
  LM: 'LM', RM: 'RM', AM: 'AM', 'AM-L': 'LAM', 'AM-R': 'RAM', LF: 'LF', RF: 'RF', CF: 'ST', 'CF-L': 'LS', 'CF-R': 'RS', LW: 'LW', RW: 'RW' }
// where ESPN gives only a broad position (LaLiga: "F", "M", "D"), the role comes from his slot in the formation: the row
// (back line, midfield, the line behind the forwards, the front) and where he stands in it, left to right
const NAMED: Record<string, string> = { GK: 'goalkeeper', CB: 'centre-back', LCB: 'left centre-back', RCB: 'right centre-back', LB: 'left-back', RB: 'right-back', LWB: 'left wing-back', RWB: 'right wing-back',
  DM: 'defensive mid', CM: 'central mid', LCM: 'left central mid', RCM: 'right central mid', LM: 'left mid', RM: 'right mid', AM: 'attacking mid', LAM: 'left attacking mid', RAM: 'right attacking mid',
  ST: 'striker', LS: 'left striker', RS: 'right striker', LW: 'left wing', RW: 'right wing' }
function slotRole(rows: Dict[][], id: string): string | null {
  const i = rows.findIndex(r => r.some(p => String(p.id) === id)); if (i < 0) return null
  const r = rows[i], n = r.length, j = r.findIndex(p => String(p.id) === id), last = rows.length - 1
  const pick = (L: string[]) => L[j] ?? L[L.length - 1]
  if (i === 0) return 'GK'
  if (i === 1) return n >= 5 ? pick(['LWB', 'LCB', 'CB', 'RCB', 'RWB']) : n === 4 ? pick(['LB', 'CB', 'CB', 'RB']) : n === 3 ? pick(['LCB', 'CB', 'RCB']) : 'CB'
  if (i === last) return n === 1 ? 'ST' : n === 2 ? pick(['LS', 'RS']) : pick(['LW', 'ST', 'RW'])
  if (i === last - 1 && last >= 4 && n <= 3) return n === 1 ? 'AM' : n === 2 ? pick(['LAM', 'RAM']) : pick(['LAM', 'AM', 'RAM'])
  return n === 1 ? 'DM' : n === 2 ? pick(['LCM', 'RCM']) : n === 3 ? pick(['LCM', 'CM', 'RCM']) : n === 4 ? pick(['LM', 'LCM', 'RCM', 'RM']) : pick(['LM', 'LCM', 'CM', 'RCM', 'RM'])
}
const clock = (s: unknown) => { const m = String(s || '').match(/(\d+)'?(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
// the table under a game's box: the formation (left) and his minutes (right) · the km he ran (right) · goals, assists,
// cards and the mark (an empty one, hidden, keeps the rows of the grid level where he didn't play)
const statTable = (form: string, min: string, km: string, facts: string, mark: string, empty = false) =>
  `<div class="msx${empty ? ' none' : ''}"><div class="f"><span>${form || '&nbsp;'}</span><b>${min}</b></div><div class="m">${km || '&nbsp;'}</div><div class="e"><span>${facts}</span>${mark}</div></div>`
const sur = (n: string) => n.split(' ').slice(1).join(' ') || n
const PL: Record<string, number[]> = { bl: [.17, .74], br: [.83, .74], tl: [.17, .27], tr: [.83, .27], c: [.5, .52], tc: [.5, .25], bc: [.5, .76] }

function storyHTML(ctx: Ctx, lg: string, code: string, ID: string, recs: Dict[], heat: Dict | null = null, run: Dict = {}) {
  const club = ctx.TEAMS[lg]?.[code] || {}, mine = recs.filter(M => M.h === code || M.a === code), byId = Object.fromEntries(mine.map(M => [M.id, M]))
  const me = mine.flatMap(M => (M.h === code ? M.home : M.away).players).find((p: Dict) => String(p.id) === ID)
  const GK = me?.pos === 'G', name = me?.name || ''
  // his role in a game: ESPN's position when it is a precise one (Serie A: "CF-L" → LS), else from his slot in the XI
  const roleOf = (p: Dict, T: Dict) => (p.pos && p.pos.length > 1 && SHORT[p.pos]) || slotRole(rowsOf(T), String(p.id)) || SHORT[p.pos] || p.pos || ''
  const spots = (T: Dict) => { const rows = rowsOf(T), n = rows.length
    return rows.flatMap((r, i) => r.map((p, j) => ({ p, x: (j + 1) / (r.length + 1) * 100, y: 90 - i * (80 / Math.max(1, n - 1)) }))) }
  // a start's pitch takes the match's result colour (as on the season strip), so the row reads as the run of results;
  // his team-mates are neutral dots, he is the big one in the club colour
  // his dot carries ↑ (came on) or ↓ (taken off) when he didn't play the whole game; a game off the bench puts him in
  // the slot of the starter he replaced (slot, num)
  const pitch = (T: Dict, tint: string, arrow = '', slot = ID, num = '') => `<div class="msp res" style="--rc:${tint}">${spots(T).map(({ p, x, y }) => String(p.id) === slot ? `<i class="me" style="left:${x}%;top:${y}%">${esc(num || p.n)}${arrow ? `<b class="ar ${arrow === '↑' ? 'up' : 'dn'}">${arrow}</b>` : ''}</i>` : `<i style="left:${x}%;top:${y}%"></i>`).join('')}</div>`
  // the starter whose place he took: the player he replaced, or — a sub for a sub — back up the chain to the XI
  const starterFor = (M: Dict, T: Dict, id: unknown) => { for (let i = 0; i < 5 && id != null; i++) { const q = (T.players as Dict[]).find(x => String(x.id) === String(id)); if (q?.st) return String(q.id); id = (M.subs as Dict[]).find(s => String(s.on) === String(id))?.off } return null }
  const goal = (M: Dict, side: string, until: number) => {
    const op = side === 'h' ? 'a' : 'h', faced = (M.shots as Dict[]).filter(x => x.s === op && (x.k === 'on' || x.k === 'goal') && x.min + Math.min(x.ex || 0, 6) * .5 <= until && PL[x.p])
    return `<svg viewBox="0 0 100 44"><path d="M6 40V8H94V40" fill="none" stroke="#15181d" stroke-width="2.4"/><line x1="0" x2="100" y1="40" y2="40" stroke="#c9ced4"/>${faced.map((x, i) => {
      const [px, py] = PL[x.p], X = 6 + px * 88 + ((i * 37) % 9 - 4), Y = 8 + py * 30 + ((i * 53) % 7 - 3)
      return x.k === 'goal' ? `<circle cx="${X}" cy="${Y}" r="3.6" fill="#b3323a" stroke="#fff" stroke-width="1"/>` : `<circle cx="${X}" cy="${Y}" r="3" fill="#fff" stroke="var(--c)" stroke-width="1.6"/>` }).join('')}</svg>` }
  const href = (md: number, id: string) => ctx.SEASON === '2026-27' ? ` data-href="matches.html?lg=${lg}&md=${md}&m=${id}"` : ''
  let anyFacts = false   // no goal, assist, card or mark all season: the table's third row is left out
  let anyKm = false      // no tracking for him (LaLiga, Ligue 1, Bundesliga): no km row
  const cell = (g: Dict) => {
    const M = byId[g.id], at = g.ha === 'A' ? '@' : ''
    if (!M) return `<div class="msc up"><div class="mst"><span>${at}${esc(g.opp)}</span></div><div class="msp"></div></div>`
    const side = M.h === code ? 'h' : 'a', op = side === 'h' ? 'a' : 'h', T = side === 'h' ? M.home : M.away, gf = M.score[side], ga = M.score[op]
    const top = `<div class="mst"><span>${at}${esc(g.opp)}</span><b class="rs" style="background:${RES[res(gf, ga)]}">${gf}-${ga}</b></div>`
    const p = (T.players as Dict[]).find(x => String(x.id) === ID)
    if (!p) { const bench = (T.bench || []).some((b: string[]) => String(b[0]) === ID)
      return `<div class="msc out"${href(M.md, M.id)} title="${bench ? 'on the bench, not used' : 'not in the matchday squad'}">${top}<div class="msp ${bench ? 'bn' : 'ns'}">${bench ? 'bench' : ''}</div>${statTable('', '', '', '', '', true)}</div>` }
    const on = p.st ? null : (M.subs as Dict[]).find(s => String(s.on) === ID), off = (M.subs as Dict[]).find(s => String(s.off) === ID), red = (p.ev as string[][]).find(e => e[0] === 'rc')
    const end = Math.min(90, off ? clock(off.min) : red ? clock(red[1]) : 90), mins = Math.max(1, Math.round(end - (p.st ? 0 : clock(on?.min))))
    const G = (M.goals as Dict[]).filter(x => String(x.byId) === ID && x.s === side && x.kind !== 'og').length, A = (p.ev as string[][]).filter(e => e[0] === 'ast').length
    const mk = ctx.VOTES[ID]?.[M.md]
    // a small table under the box, one row each: the formation · his minutes (↑ on / ↓ off) · goals, assists and cards,
    // with the Serie A mark in a badge on the right (his role is the dot)
    // the km he ran (Serie A, Premier League) left of the time
    const km = run[M.id]?.[ID] as number[] | undefined
    // the whole game (started, not taken off, not sent off): the minutes reversed, so a full 90 stands out
    const minTxt = !p.st ? `↑${esc(on?.min || '')}` : off ? `↓${esc(off.min)}` : red ? `${mins}'` : `<span class="m90">${mins}'</span>`, kmTxt = km ? `${km[0].toFixed(1)} km` : ''
    if (km) anyKm = true
    const facts = `${'<i class="gl"></i>'.repeat(G)}${'<i class="as"></i>'.repeat(A)}${(p.ev as string[][]).some(e => e[0] === 'yc') ? '<i class="yc"></i>' : ''}${red ? '<i class="rc"></i>' : ''}`
    const mark = mk != null ? `<b class="mk${mk >= 7 ? ' hi' : mk < 6 ? ' lo' : ''}">${mk}</b>` : ''
    if (facts || mark) anyFacts = true
    const subFor = on ? (T.players as Dict[]).find(x => String(x.id) === String(on.off))?.name : ''
    const tip = `MD${M.md} · ${at ? 'at' : 'vs'} ${g.opp} ${gf}-${ga} · ${ROLE[p.pos] || p.pos || ''} · ${T.form || ''} · ${subFor ? `on for ${subFor} at ${on?.min} · ` : ''}${mins}'${km ? ` · ${km[0].toFixed(1)} km, top speed ${km[1].toFixed(1)} km/h` : ''}`
    let box = ''
    // the Heatmaps view: the same box, his touches in place of the XI (a game with no map yet falls back to the XI)
    const hm = heat?.[M.id]?.[ID]
    // over it his shots at the goal he attacks; a keeper's: every shot he faced while on, at his own goal
    if (heat && hm) box = GK
      ? heatPitch(hm, RES[res(gf, ga)], KEEP, shotMarks((M.shots as Dict[]).filter(x => x.s === op && x.min + Math.min(x.ex || 0, 6) * .5 <= end && x.min >= (p.st ? 0 : clock(on?.min))), KEEP, true))
      : heatPitch(hm, RES[res(gf, ga)], FULL, shotMarks(shotsBy(M, side, name), FULL, false))
    else if (GK && p.st) { const sv = M.stats?.[side]?.saves ?? 0
      box = `<div class="msg">${goal(M, side, end)}<b class="sv">${sv}</b><span>save${sv === 1 ? '' : 's'}</span>${ga === 0 && mins >= 89 ? '<em class="cs">clean sheet</em>' : `<em>${ga} against</em>`}</div>` }
    else if (!p.st && on && starterFor(M, T, on.off)) box = pitch(T, RES[res(gf, ga)], '↑', starterFor(M, T, on.off)!, p.n)
    else if (!p.st) box = `<div class="msp bn res" style="--rc:${RES[res(gf, ga)]}">off the bench<b>${esc(on?.min || '')}</b>${on ? `for ${esc(sur((T.players as Dict[]).find(x => String(x.id) === String(on.off))?.name || ''))}` : ''}</div>`
    else box = pitch(T, RES[res(gf, ga)], off ? '↓' : '')
    return `<div class="msc${p.st ? ' st' : ' sub'}" data-mid="${M.id}"${href(M.md, M.id)} title="${esc(tip)}">${top}${box}${statTable(esc(T.form || ''), minTxt, kmTxt, facts, mark)}</div>`
  }
  const starts = mine.filter(M => (M.h === code ? M.home : M.away).players.some((x: Dict) => String(x.id) === ID && x.st))
  const subs = mine.filter(M => (M.h === code ? M.home : M.away).players.some((x: Dict) => String(x.id) === ID && !x.st))
  const roles: Record<string, number[]> = {}
  for (const M of starts) { const T = M.h === code ? M.home : M.away, p = T.players.find((x: Dict) => String(x.id) === ID); (roles[roleOf(p, T)] ||= []).push(M.md) }
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w)
  const cells = all.map(cell).join('')
  return `<div class="msgrid${anyFacts ? '' : ' nofacts'}${anyKm ? '' : ' nokm'}">${cells}</div>
    <div class="msleg"><span><b>${starts.length}</b> start${starts.length === 1 ? '' : 's'} · <b>${subs.length}</b> off the bench</span>${GK ? '' : Object.entries(roles).sort((a, b) => b[1].length - a[1].length).map(([r, mds]) => `<span><b>${NAMED[r] || esc(r)}</b> ×${mds.length}</span>`).join('')}
      <span>↑ came on (on the pitch: in the place of the player he replaced) · ↓ went off · ● goal · ○ assist · <i class="yc"></i><i class="rc"></i> cards${lg === 'ITA' ? ' · number: Fantacalcio mark' : ''}${Object.keys(run).length ? ' · km: distance run (hover a game for his top speed)' : ''}</span>${heat ? `<span>heat: his touches in the game (FotMob), ${GK ? 'the 36 m in front of his goal · the shots he faced, in the zone they came from: <b style="color:#b3323a">●</b> goal against' : 'attacking up · his shots, in the zone they came from: ● goal'} · ○ on target · × off · ▪ blocked</span>` : ''}</div>`
}

// the switch: one view for every card of the film, remembered; 't' toggles; a pane is drawn when its card comes into view
export function initStory(film: HTMLElement, ctx: Ctx, key = 'top5.player.view') {
  const VIEWS = ['season', 'tac', 'heat']
  let view = 'season'; try { const v = localStorage.getItem(key) || ''; if (VIEWS.includes(v)) view = v } catch { }
  // a pane is drawn for the view on show (Tactical or Heatmaps), redrawn when the view changes
  const fill = async (pane: HTMLElement) => {
    const want = view; if (pane.dataset.done === want) return; pane.dataset.done = want
    const [lg, code, id] = pane.dataset.story!.split('|')
    if (!pane.innerHTML) pane.innerHTML = '<p class="msload">Loading the match cards…</p>'
    const [recs, heat, run] = await Promise.all([recsOf(lg, ctx.SEASON), want === 'heat' ? heatOf(lg, ctx.SEASON) : Promise.resolve(null), runOf(lg, ctx.SEASON)])
    if (pane.dataset.done === want) pane.innerHTML = storyHTML(ctx, lg, code, id, recs, heat, run)
  }
  const near = (p: HTMLElement) => { const r = p.getBoundingClientRect(); return r.right > -innerWidth && r.left < innerWidth * 2 }
  const io = new IntersectionObserver(es => { if (view !== 'season') es.forEach(e => e.isIntersecting && fill(e.target as HTMLElement)) }, { rootMargin: '0px 100% 0px 100%' })
  film.querySelectorAll<HTMLElement>('.pane-story').forEach(p => io.observe(p))
  const set = (v: string) => {
    view = v; document.body.classList.toggle('view-tac', v !== 'season')
    film.querySelectorAll<HTMLElement>('.tacsw button').forEach(b => b.classList.toggle('on', b.dataset.view === v))
    try { localStorage.setItem(key, v) } catch { }
    if (v !== 'season') film.querySelectorAll<HTMLElement>('.pane-story').forEach(p => { if (near(p)) fill(p) })
  }
  film.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.tacsw button'); if (b) { e.stopPropagation(); set(b.dataset.view!) } })
  // 't' cycles Season → Tactical → Heatmaps
  addEventListener('keydown', e => { if (e.key === 't' && !document.querySelector('.mod.on') && !e.metaKey && !e.ctrlKey && !(e.target as HTMLElement).closest?.('input')) set(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]) })
  set(view)
}
