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
const sur = (n: string) => n.split(' ').slice(1).join(' ') || n
const PL: Record<string, number[]> = { bl: [.17, .74], br: [.83, .74], tl: [.17, .27], tr: [.83, .27], c: [.5, .52], tc: [.5, .25], bc: [.5, .76] }

function storyHTML(ctx: Ctx, lg: string, code: string, ID: string, recs: Dict[]) {
  const club = ctx.TEAMS[lg]?.[code] || {}, mine = recs.filter(M => M.h === code || M.a === code), byId = Object.fromEntries(mine.map(M => [M.id, M]))
  const me = mine.flatMap(M => (M.h === code ? M.home : M.away).players).find((p: Dict) => String(p.id) === ID)
  const GK = me?.pos === 'G', name = me?.name || ''
  // his role in a game: ESPN's position when it is a precise one (Serie A: "CF-L" → LS), else from his slot in the XI
  const roleOf = (p: Dict, T: Dict) => (p.pos && p.pos.length > 1 && SHORT[p.pos]) || slotRole(rowsOf(T), String(p.id)) || SHORT[p.pos] || p.pos || ''
  const spots = (T: Dict) => { const rows = rowsOf(T), n = rows.length
    return rows.flatMap((r, i) => r.map((p, j) => ({ p, x: (j + 1) / (r.length + 1) * 100, y: 90 - i * (80 / Math.max(1, n - 1)) }))) }
  // a start's pitch takes the match's result colour (as on the season strip), so the row reads as the run of results;
  // his team-mates are neutral dots, he is the big one in the club colour
  const pitch = (T: Dict, tint: string) => `<div class="msp res" style="--rc:${tint}">${spots(T).map(({ p, x, y }) => String(p.id) === ID ? `<i class="me" style="left:${x}%;top:${y}%">${esc(p.n)}</i>` : `<i style="left:${x}%;top:${y}%"></i>`).join('')}</div>`
  const goal = (M: Dict, side: string, until: number) => {
    const op = side === 'h' ? 'a' : 'h', faced = (M.shots as Dict[]).filter(x => x.s === op && (x.k === 'on' || x.k === 'goal') && x.min + Math.min(x.ex || 0, 6) * .5 <= until && PL[x.p])
    return `<svg viewBox="0 0 100 44"><path d="M6 40V8H94V40" fill="none" stroke="#15181d" stroke-width="2.4"/><line x1="0" x2="100" y1="40" y2="40" stroke="#c9ced4"/>${faced.map((x, i) => {
      const [px, py] = PL[x.p], X = 6 + px * 88 + ((i * 37) % 9 - 4), Y = 8 + py * 30 + ((i * 53) % 7 - 3)
      return x.k === 'goal' ? `<circle cx="${X}" cy="${Y}" r="3.6" fill="#b3323a" stroke="#fff" stroke-width="1"/>` : `<circle cx="${X}" cy="${Y}" r="3" fill="#fff" stroke="var(--c)" stroke-width="1.6"/>` }).join('')}</svg>` }
  const href = (md: number, id: string) => ctx.SEASON === '2026-27' ? ` data-href="matches.html?lg=${lg}&md=${md}&m=${id}"` : ''
  const cell = (g: Dict) => {
    const M = byId[g.id], at = g.ha === 'A' ? '@' : ''
    if (!M) return `<div class="msc up"><div class="mst"><span>${at}${esc(g.opp)}</span></div><div class="msp"></div></div>`
    const side = M.h === code ? 'h' : 'a', op = side === 'h' ? 'a' : 'h', T = side === 'h' ? M.home : M.away, gf = M.score[side], ga = M.score[op]
    const top = `<div class="mst"><span>${at}${esc(g.opp)}</span><b class="rs" style="background:${RES[res(gf, ga)]}">${gf}-${ga}</b></div>`
    const p = (T.players as Dict[]).find(x => String(x.id) === ID)
    if (!p) { const bench = (T.bench || []).some((b: string[]) => String(b[0]) === ID)
      return `<div class="msc out"${href(M.md, M.id)} title="${bench ? 'on the bench, not used' : 'not in the matchday squad'}">${top}<div class="msp ${bench ? 'bn' : 'ns'}">${bench ? 'bench' : ''}</div><div class="msf">&nbsp;</div><div class="msr">&nbsp;</div><div class="msl">&nbsp;</div></div>` }
    const on = p.st ? null : (M.subs as Dict[]).find(s => String(s.on) === ID), off = (M.subs as Dict[]).find(s => String(s.off) === ID), red = (p.ev as string[][]).find(e => e[0] === 'rc')
    const end = Math.min(90, off ? clock(off.min) : red ? clock(red[1]) : 90), mins = Math.max(1, Math.round(end - (p.st ? 0 : clock(on?.min))))
    const G = (M.goals as Dict[]).filter(x => String(x.byId) === ID && x.s === side && x.kind !== 'og').length, A = (p.ev as string[][]).filter(e => e[0] === 'ast').length
    const mk = ctx.VOTES[ID]?.[M.md]
    // three lines under the box: the formation · his minutes (↑ on / ↓ off) · goals, assists, cards, mark (his role is the dot)
    const minTxt = !p.st ? `↑${esc(on?.min || '')}` : off ? `↓${esc(off.min)}` : `${mins}'`
    const facts = `${'<i class="gl"></i>'.repeat(G)}${'<i class="as"></i>'.repeat(A)}${(p.ev as string[][]).some(e => e[0] === 'yc') ? '<i class="yc"></i>' : ''}${red ? '<i class="rc"></i>' : ''}${mk != null ? `<b class="mk${mk >= 7 ? ' hi' : mk < 6 ? ' lo' : ''}">${mk}</b>` : ''}`
    const tip = `MD${M.md} · ${at ? 'at' : 'vs'} ${g.opp} ${gf}-${ga} · ${ROLE[p.pos] || p.pos || ''} · ${T.form || ''} · ${mins}'`
    let box: string
    if (GK && p.st) { const sv = M.stats?.[side]?.saves ?? 0
      box = `<div class="msg">${goal(M, side, end)}<b class="sv">${sv}</b><span>save${sv === 1 ? '' : 's'}</span>${ga === 0 && mins >= 89 ? '<em class="cs">clean sheet</em>' : `<em>${ga} against</em>`}</div>` }
    else if (!p.st) box = `<div class="msp bn res" style="--rc:${RES[res(gf, ga)]}">off the bench<b>${esc(on?.min || '')}</b>${on ? `for ${esc(sur((T.players as Dict[]).find(x => String(x.id) === String(on.off))?.name || ''))}` : ''}</div>`
    else box = pitch(T, RES[res(gf, ga)])
    return `<div class="msc${p.st ? ' st' : ' sub'}" data-mid="${M.id}"${href(M.md, M.id)} title="${esc(tip)}">${top}${box}<div class="msf">${esc(T.form || '')}</div><div class="msr">${minTxt}</div><div class="msl">${facts || '&nbsp;'}</div></div>`
  }
  const starts = mine.filter(M => (M.h === code ? M.home : M.away).players.some((x: Dict) => String(x.id) === ID && x.st))
  const subs = mine.filter(M => (M.h === code ? M.home : M.away).players.some((x: Dict) => String(x.id) === ID && !x.st))
  const roles: Record<string, number[]> = {}
  for (const M of starts) { const T = M.h === code ? M.home : M.away, p = T.players.find((x: Dict) => String(x.id) === ID); (roles[roleOf(p, T)] ||= []).push(M.md) }
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w)
  return `<div class="msgrid">${all.map(cell).join('')}</div>
    <div class="msleg"><span><b>${starts.length}</b> start${starts.length === 1 ? '' : 's'} · <b>${subs.length}</b> off the bench</span>${GK ? '' : Object.entries(roles).sort((a, b) => b[1].length - a[1].length).map(([r, mds]) => `<span><b>${NAMED[r] || esc(r)}</b> ×${mds.length}</span>`).join('')}
      <span>↑ came on · ↓ went off · ● goal · ○ assist · <i class="yc"></i><i class="rc"></i> cards${lg === 'ITA' ? ' · number: Fantacalcio mark' : ''}</span></div>`
}

// the switch: one view for every card of the film, remembered; 't' toggles; a pane is drawn when its card comes into view
export function initStory(film: HTMLElement, ctx: Ctx, key = 'top5.player.view') {
  let view = 'season'; try { if (localStorage.getItem(key) === 'tac') view = 'tac' } catch { }
  const fill = async (pane: HTMLElement) => {
    if (pane.dataset.done) return; pane.dataset.done = '1'
    const [lg, code, id] = pane.dataset.story!.split('|')
    pane.innerHTML = '<p class="msload">Loading the match cards…</p>'
    pane.innerHTML = storyHTML(ctx, lg, code, id, await recsOf(lg, ctx.SEASON))
  }
  const io = new IntersectionObserver(es => { if (view === 'tac') es.forEach(e => e.isIntersecting && fill(e.target as HTMLElement)) }, { rootMargin: '0px 100% 0px 100%' })
  film.querySelectorAll<HTMLElement>('.pane-tac').forEach(p => io.observe(p))
  const set = (v: string) => {
    view = v; document.body.classList.toggle('view-tac', v === 'tac')
    film.querySelectorAll<HTMLElement>('.tacsw button').forEach(b => b.classList.toggle('on', b.dataset.view === v))
    try { localStorage.setItem(key, v) } catch { }
    if (v === 'tac') film.querySelectorAll<HTMLElement>('.pane-tac').forEach(p => { const r = p.getBoundingClientRect(); if (r.right > -innerWidth && r.left < innerWidth * 2) fill(p) })
  }
  film.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.tacsw button'); if (b) { e.stopPropagation(); set(b.dataset.view!) } })
  addEventListener('keydown', e => { if (e.key === 't' && !document.querySelector('.mod.on') && !e.metaKey && !e.ctrlKey && !(e.target as HTMLElement).closest?.('input')) set(view === 'tac' ? 'season' : 'tac') })
  set(view)
}
