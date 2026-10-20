// Coach card film: one card per head coach of the five leagues — every current coach, plus the departed ones with three
// or more games at the club this season (marked former) — ranked by points per game; fewer than three games ranks after.
// ?lg=ITA… = that league's coaches; no lg = All Leagues. The card is the squad film's coach card (src/film/coach.ts).
// Data: src/data/coaches-<LG>-<season>.js (scripts/update-coaches.mjs, FotMob), the match cards, the team cards (table),
// the schedules (fixtures, colours); Serie A adds the coach's Fantacalcio mark (votes-ITA `c`).
import '../film/film.css'
import { initFilm, initHighlight, initLinks, initNav, initHScroll } from '../film/chrome'
import { esc, LEAGUE_NAME, fitBios, type Ctx } from '../film/cards'
import { loadCoaches, coachCard, stints, headOf, coachHref } from '../film/coach'
import { teamLineOf } from '../film/season'
import { initStory } from '../film/story'
type Dict = Record<string, any>
const QS = new URLSearchParams(location.search)
const SEASON = '2026-27'   // coaches are kept for the current season only
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }
const MIN_GAMES = 3
const LIST = LG_ORDER.includes(QS.get('lg') || '') ? QS.get('lg')! : 'ALL'
const FULL = LIST === 'ALL' ? LG_ORDER : [LIST]   // match data only for the leagues on show; the rest just count their coaches

const MATCH_FILES = import.meta.glob('../data/matches-*-*-md*.js')
const VOTE_FILES = import.meta.glob('../data/votes-*.js')
const TEAMS: Record<string, Dict> = {}, CARDS: Record<string, Dict> = {}, COACHES: Record<string, Dict> = {}, RECS: Record<string, Dict[]> = {}
await Promise.all(LG_ORDER.map(async lg => {
  if (!FULL.includes(lg)) { const C = await loadCoaches(lg, SEASON); if (C) COACHES[lg] = C; return }
  const files = Object.keys(MATCH_FILES).filter(f => f.includes(`/matches-${lg}-${SEASON}-md`))
  const [sch, tc, C, ...MF] = await Promise.all([import(`../data/schedule-${lg}-${SEASON}.js`), import(`../data/teams-${lg}-${SEASON}.js`), loadCoaches(lg, SEASON), ...files.map(f => MATCH_FILES[f]())]) as Dict[]
  TEAMS[lg] = sch.TEAMS; CARDS[lg] = tc.TEAMCARDS; if (C) COACHES[lg] = C
  RECS[lg] = MF.flatMap((f: Dict) => f.MATCHES)
}))
const MARKS: Dict = ((await VOTE_FILES[`../data/votes-ITA-${SEASON}.js`]?.()) as Dict | undefined)?.VOTES?.c || {}
const CTX: Ctx = { TEAMS, SEASON, VOTES: {} }

// ---------- every coach of every club this season, with his record there ----------
type Entry = { lg: string; code: string; id: string; former: boolean; G: number; P: number; GD: number; ppg: number; played: Dict[]; recs: Dict[]; teamLine: Dict }
const ENTRIES: Entry[] = []
for (const lg of FULL) {
  const C = COACHES[lg]; if (!C) continue
  for (const code of Object.keys(TEAMS[lg])) {
    const recs = RECS[lg].filter(M => M.h === code || M.a === code).sort((a, b) => a.md - b.md)
    const played = recs.map(M => { const me = M.h === code ? 'h' : 'a', op = me === 'h' ? 'a' : 'h'; return { id: M.id, md: M.md, opp: M[op], ha: me === 'h' ? 'H' : 'A', gf: M.score[me], ga: M.score[op] } })
    const S = stints(C, code, played), H = headOf(C, code, S); if (!H.id) continue
    const t = CARDS[lg].teams.find((x: Dict) => x.code === code) || {}
    const teamLine = teamLineOf(t)   // the club line under his name: place, points, W-D-L, GD
    for (const id of new Set([H.id, ...S.map(s => s.id)])) {
      if (id !== H.id && S.filter(s => s.id === id).every(s => H.standIn.includes(s))) continue   // a stand-in: his games are the head coach's
      const mine = S.filter(s => s.id === id || (id === H.id && H.standIn.includes(s))), G = mine.reduce((a, s) => a + s.W + s.D + s.L, 0)
      const former = id !== H.id; if (former && G < MIN_GAMES) continue   // a one- or two-game stand-in gets no card
      const P = mine.reduce((a, s) => a + 3 * s.W + s.D, 0), GD = mine.reduce((a, s) => a + s.GF - s.GA, 0)
      ENTRIES.push({ lg, code, id, former, G, P, GD, ppg: G ? P / G : 0, played, recs, teamLine })
    }
  }
}
// points per game, best first; under three games after everyone else; ties on points, then goal difference
const order = (a: Entry, b: Entry) => +(b.G >= MIN_GAMES) - +(a.G >= MIN_GAMES) || b.ppg - a.ppg || b.P - a.P || b.GD - a.GD
const listOf = (l: string) => ENTRIES.filter(e => l === 'ALL' || e.lg === l).sort(order)
const P = listOf(LIST)
const nameOf = (e: Entry) => COACHES[e.lg].coaches[e.id].name
const club = (e: Entry) => TEAMS[e.lg][e.code]?.name || e.code

const card = (e: Entry, i: number) => coachCard(CTX, COACHES[e.lg], e.lg, e.code, e.played, e.teamLine, e.recs, e.lg === 'ITA' ? MARKS[e.code] : undefined,
  { who: e.id, badge: `#${i + 1}`, id: `c-${e.lg}-${e.code}-${e.id}`, href: e.former ? undefined : coachHref(e.lg, e.code) })

// ---------- the film and its top bar ----------
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map(card).join('')
const listUrl = (l: string) => { const q = new URLSearchParams(location.search); l === 'ALL' ? q.delete('lg') : q.set('lg', l); const qs = q.toString(); return location.pathname + (qs ? '?' + qs : '') + '#1' }   // a top-bar switch starts at card 1
// a league not loaded counts from its coaches file alone: every current coach + anyone else on its benches 3+ times
function countOf(lg: string) {
  const C = COACHES[lg]; if (!C) return 0
  const games: Record<string, number> = {}
  for (const [k, [h, a]] of Object.entries(C.matches as Record<string, string[]>)) { const [H, A] = k.split('-'); games[`${H}:${h}`] = (games[`${H}:${h}`] || 0) + 1; games[`${A}:${a}`] = (games[`${A}:${a}`] || 0) + 1 }
  const cur = new Set(Object.entries(C.teams as Record<string, string>).map(([code, id]) => `${code}:${id}`))
  return cur.size + Object.entries(games).filter(([k, n]) => !cur.has(k) && n >= MIN_GAMES).length
}
const lsize = (l: string): number => l === 'ALL' ? LG_ORDER.reduce((a, lg) => a + lsize(lg), 0) : FULL.includes(l) ? listOf(l).length : countOf(l)
$('lgs').innerHTML = `<a class="lgb all${LIST === 'ALL' ? ' on' : ''}" href="${listUrl('ALL')}" title="Every coach of the five leagues · ${lsize('ALL')}"><b>All Leagues</b><span>${lsize('ALL')}</span></a>` +
  LG_ORDER.map(lg => `<a class="lgb${LIST === lg ? ' on' : ''}" data-lg="${lg}" href="${listUrl(lg)}" title="${LEAGUE_NAME[lg]} coaches · ${lsize(lg)}"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"><span>${lsize(lg)}</span></a>`).join('')
const formers = P.filter(e => e.former).length
$('cnote').innerHTML = `${P.length} coaches${LIST === 'ALL' ? ' of the five leagues' : ` of ${LEAGUE_NAME[LIST]}`}: every club's head coach${formers ? ` and ${formers} who left during the season (three or more games)` : ''}, ranked by points per game. Season ${SEASON.replace('-', '/')}.`

function onPaint(i: number) {
  const e = P[i]
  $('ctx').innerHTML = `${LIST === 'ALL' ? 'Coaches' : `${LEAGUE_NAME[LIST]} coaches`} ${SEASON.replace('-', '/')} · by points per game · <b>${esc(nameOf(e))}</b> · ${esc(club(e))}${e.former ? ' (former)' : ''} · ${e.G ? e.ppg.toFixed(2) : '–'} ppg`
  if (LIST === 'ALL') $('lgs').querySelectorAll<HTMLElement>('.lgb[data-lg]').forEach(b => b.classList.toggle('cur', b.dataset.lg === e.lg))
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[e.lg]); meta('title', `${nameOf(e)} · ${club(e)} · ${e.G ? e.ppg.toFixed(2) : '–'} points per game`)
}

// search: a coach, a club or a nation; a number jumps to that card
const INDEX = P.map((e, i) => { const k = COACHES[e.lg].coaches[e.id]
  return { i, lg: e.lg, label: k.name, sub: `${club(e)}${e.former ? ' · former' : ''} · ${e.G ? e.ppg.toFixed(2) : '–'} ppg`,
    key: [k.name, k.nat, club(e), e.code, LEAGUE_NAME[e.lg], e.former ? 'former' : ''].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() } })
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  return LG_ORDER.map(lg => { const rows = hits.filter(x => x.lg === lg); if (!rows.length) return ''
    return `<div class="jsec"><div class="jsechd"><img src="leagues/${lg}.png" alt="">${LEAGUE_NAME[lg]}<span>${rows.length}</span></div><div class="jgrid">${rows.map(x =>
      `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` }).join('') || '<p>No coach found.</p>'
}

initLinks(film)
initHScroll(film)
fitBios(film)
initHighlight(film, '[data-mid]', k => `[data-mid="${k}"]`, el => el.dataset.mid!)
initNav('coaches', LIST, SEASON)
initStory(film, CTX)   // Season | Tactical
initFilm({ label: i => nameOf(P[i]), count: P.length, key: 'top5.coaches.card' + (LIST === 'ALL' ? '' : '.' + LIST), onPaint, jumpHTML, self: 'coaches.html' })
