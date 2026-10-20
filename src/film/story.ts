// "Match story": a player's whole season match by match, opened over his card from the "Match story" button (squad,
// scorers and keepers films). Every fixture of his club in two rows (MD 1–19 over 20–38); above each box the opponent
// and the score; a start shows the XI as small dots and him big (a keeper: the shots on target he faced, his saves);
// below, his role + the formation, then minutes (↑ on / ↓ off), goals ●, assists ○, cards and, in Serie A, the mark.
// The match cards load the first time a story opens (a league's at a time).
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
const clock = (s: unknown) => { const m = String(s || '').match(/(\d+)'?(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
const sur = (n: string) => n.split(' ').slice(1).join(' ') || n
const PL: Record<string, number[]> = { bl: [.17, .74], br: [.83, .74], tl: [.17, .27], tr: [.83, .27], c: [.5, .52], tc: [.5, .25], bc: [.5, .76] }

function storyHTML(ctx: Ctx, lg: string, code: string, ID: string, recs: Dict[]) {
  const club = ctx.TEAMS[lg]?.[code] || {}, mine = recs.filter(M => M.h === code || M.a === code), byId = Object.fromEntries(mine.map(M => [M.id, M]))
  const me = mine.flatMap(M => (M.h === code ? M.home : M.away).players).find((p: Dict) => String(p.id) === ID)
  const GK = me?.pos === 'G', name = me?.name || ''
  const spots = (T: Dict) => { const rows = rowsOf(T), n = rows.length
    return rows.flatMap((r, i) => r.map((p, j) => ({ p, x: (j + 1) / (r.length + 1) * 100, y: 90 - i * (80 / Math.max(1, n - 1)) }))) }
  const pitch = (T: Dict) => `<div class="msp">${spots(T).map(({ p, x, y }) => String(p.id) === ID ? `<i class="me" style="left:${x}%;top:${y}%">${esc(p.n)}</i>` : `<i style="left:${x}%;top:${y}%"></i>`).join('')}</div>`
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
      return `<div class="msc out"${href(M.md, M.id)} title="${bench ? 'on the bench, not used' : 'not in the matchday squad'}">${top}<div class="msp ${bench ? 'bn' : 'ns'}">${bench ? 'bench' : ''}</div><div class="msr">&nbsp;</div><div class="msl">&nbsp;</div></div>` }
    const on = p.st ? null : (M.subs as Dict[]).find(s => String(s.on) === ID), off = (M.subs as Dict[]).find(s => String(s.off) === ID), red = (p.ev as string[][]).find(e => e[0] === 'rc')
    const end = Math.min(90, off ? clock(off.min) : red ? clock(red[1]) : 90), mins = Math.max(1, Math.round(end - (p.st ? 0 : clock(on?.min))))
    const G = (M.goals as Dict[]).filter(x => String(x.byId) === ID && x.s === side && x.kind !== 'og').length, A = (p.ev as string[][]).filter(e => e[0] === 'ast').length
    const mk = ctx.VOTES[ID]?.[M.md]
    const facts = `<span class="mn">${!p.st ? `↑${esc(on?.min || '')}` : off ? `↓${esc(off.min)}` : `${mins}'`}</span>${'<i class="gl"></i>'.repeat(G)}${'<i class="as"></i>'.repeat(A)}${(p.ev as string[][]).some(e => e[0] === 'yc') ? '<i class="yc"></i>' : ''}${red ? '<i class="rc"></i>' : ''}${mk != null ? `<b class="mk${mk >= 7 ? ' hi' : mk < 6 ? ' lo' : ''}">${mk}</b>` : ''}`
    const tip = `MD${M.md} · ${at ? 'at' : 'vs'} ${g.opp} ${gf}-${ga} · ${ROLE[p.pos] || p.pos || ''} · ${T.form || ''} · ${mins}'`
    let box: string
    if (GK && p.st) { const sv = M.stats?.[side]?.saves ?? 0
      box = `<div class="msg">${goal(M, side, end)}<b class="sv">${sv}</b><span>save${sv === 1 ? '' : 's'}</span>${ga === 0 && mins >= 89 ? '<em class="cs">clean sheet</em>' : `<em>${ga} against</em>`}</div>` }
    else if (!p.st) box = `<div class="msp bn">off the bench<b>${esc(on?.min || '')}</b>${on ? `for ${esc(sur((T.players as Dict[]).find(x => String(x.id) === String(on.off))?.name || ''))}` : ''}</div>`
    else box = pitch(T)
    return `<div class="msc${p.st ? ' st' : ' sub'}" data-mid="${M.id}"${href(M.md, M.id)} title="${esc(tip)}">${top}${box}<div class="msr"><b>${GK ? 'GK' : SHORT[p.pos] || esc(p.pos)}</b> ${esc(T.form || '')}</div><div class="msl">${facts}</div></div>`
  }
  const starts = mine.filter(M => (M.h === code ? M.home : M.away).players.some((x: Dict) => String(x.id) === ID && x.st))
  const subs = mine.filter(M => (M.h === code ? M.home : M.away).players.some((x: Dict) => String(x.id) === ID && !x.st))
  const roles: Record<string, number[]> = {}
  for (const M of starts) { const p = (M.h === code ? M.home : M.away).players.find((x: Dict) => String(x.id) === ID); (roles[p.pos] ||= []).push(M.md) }
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w), half = Math.ceil(all.length / 2)
  return `<div class="msh"><h2>${esc(name)}</h2><span class="sm"><b>${starts.length}</b> start${starts.length === 1 ? '' : 's'} · <b>${subs.length}</b> off the bench</span>
      <button class="msx" title="Close (Esc)" aria-label="Close the match story">×</button></div>
    ${GK ? '' : `<div class="msroles">${Object.entries(roles).sort((a, b) => b[1].length - a[1].length).map(([pos, mds]) => `<span><b>${ROLE[pos] || esc(pos)}</b> ×${mds.length} <em>MD ${mds.join(', ')}</em></span>`).join('')}</div>`}
    <div class="msrows"><div class="msrow" style="--n:${half}"><div class="msrl">MD 1–${half}</div>${all.slice(0, half).map(cell).join('')}</div>
      <div class="msrow" style="--n:${half}"><div class="msrl">MD ${half + 1}–${all.length}</div>${all.slice(half).map(cell).join('')}</div></div>
    <div class="msleg"><span>↑ came on · ↓ went off</span><span>● goal · ○ assist</span><span><i class="yc"></i> <i class="rc"></i> yellow / red</span>${lg === 'ITA' ? '<span>number: Fantacalcio mark</span>' : ''}${GK ? '<span>goal: ○ saved · ● conceded (the shots on target he faced)</span>' : '<span>pitch: the XI, him numbered</span>'}<span>a box opens its match card</span></div>`
}

// one story at a time, over the card it was opened from; Esc / × / moving to another card closes it
export function initStory(film: HTMLElement, ctx: Ctx) {
  const close = () => film.querySelectorAll('.story').forEach(e => e.remove())
  film.addEventListener('click', async e => {
    const t = e.target as HTMLElement
    if (t.closest('.msx')) { close(); return }
    const b = t.closest<HTMLElement>('.storyb'); if (!b) return
    e.stopPropagation()
    const [lg, code, id] = b.dataset.story!.split('|'), card = b.closest<HTMLElement>('.card')!
    close()
    const ov = document.createElement('div'); ov.className = 'story'; ov.innerHTML = '<p class="msload">Loading the match cards…</p>'; card.appendChild(ov)
    ov.innerHTML = storyHTML(ctx, lg, code, id, await recsOf(lg, ctx.SEASON))
  })
  addEventListener('keydown', e => { if (e.key === 'Escape' && film.querySelector('.story')) { e.stopImmediatePropagation(); close() } }, true)
  addEventListener('hashchange', close)
}
