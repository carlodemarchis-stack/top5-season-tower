// Goalkeeper card film: one card per keeper (per club), ranked by saves — like the scorer cards.
// ?lg=ITA… = that league's regular keepers; no lg = All Leagues, the top 25 across the five.
// Data: src/data/keepers-TOP5-<season>.js (scripts/update-keepers.mjs, from the match cards); club colours / fixtures
// from the schedules.
import '../film/film.css'
import { initStory } from '../film/story'
import { initFilm, initHighlight, initLinks, initNav, initSort, readSort } from '../film/chrome'
import { keeperFilmCard, esc, LEAGUE_NAME, type Ctx, fitBios } from '../film/cards'
type Dict = Record<string, any>
const QS = new URLSearchParams(location.search)
const SEASON = QS.get('season') || '2026-27'
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }
const [{ KEEPERS }, ...TL] = await Promise.all([
  import(`../data/keepers-TOP5-${SEASON}.js`),
  ...LG_ORDER.map(lg => import(`../data/schedule-${lg}-${SEASON}.js`)),
]) as Dict[]
const TEAMS: Record<string, Dict> = Object.fromEntries(LG_ORDER.map((lg, i) => [lg, TL[i].TEAMS]))
// Serie A: each game's Fantacalcio mark (Redazione) under its box — scripts/update-votes.mjs; other leagues have none
const VOTE_FILES = import.meta.glob('../data/votes-*.js')
const VOTES: Dict = ((await VOTE_FILES[`../data/votes-ITA-${SEASON}.js`]?.()) as Dict | undefined)?.VOTES?.v || {}
const CTX: Ctx = { TEAMS, SEASON, VOTES }
// the one player card (src/film/cards.ts): his rank in this list under his role, the name opens his squad card
const card = (k: Dict) => keeperFilmCard(CTX, k, { rank: k.rank, sort: SORT, href: SEASON === '2026-27' ? `player.html?lg=${k.lg}&team=${k.team}&p=${k.id}` : undefined, story: SEASON === '2026-27' })

// ---------- the lists, the film ----------
const LIST = LG_ORDER.includes(QS.get('lg') || '') ? QS.get('lg')! : 'ALL'
const bySaves = (l: string): Dict[] => (KEEPERS.lists[l] || []).map(([key, rank]: [string, number]) => ({ ...KEEPERS.keepers[key], rank }))
// the order (Order by, remembered): saves (the list's own ranks), save % or clean sheets — best first, under three
// games last — or age, youngest first; the same keepers either way, the rank badge their place in this order
const SORTS: Record<string, string> = { saves: 'saves', pct: 'save %', cs: 'clean sheets', age: 'age' }
let SORT = readSort('top5.keepers.sort', SORTS)
const listOf = (l: string, sort = SORT): Dict[] => { const L = bySaves(l); if (sort === 'saves') return L
  const few = (k: Dict) => +(k.GP < 3)
  const cmp = (a: Dict, b: Dict) => sort === 'age' ? (a.age ?? 999) - (b.age ?? 999)
    : few(a) - few(b) || (sort === 'pct' ? (b.PCT ?? -1) - (a.PCT ?? -1) : b.CS - a.CS || (b.PCT ?? -1) - (a.PCT ?? -1))
  return [...L].sort((a, b) => cmp(a, b) || a.rank - b.rank).map((k, i) => ({ ...k, rank: i + 1 })) }
const P: Dict[] = listOf(LIST)
const sortVal = (k: Dict) => SORT === 'pct' ? `${k.PCT ?? '–'}% saved` : SORT === 'cs' ? `${k.CS} clean sheets` : SORT === 'age' ? `${k.age ?? '–'}` : `${k.SV} saves, ${k.PCT ?? '–'}%`
const listUrl = (l: string) => { const q = new URLSearchParams(location.search); l === 'ALL' ? q.delete('lg') : q.set('lg', l); const qs = q.toString(); return location.pathname + (qs ? '?' + qs : '') + '#1' }   // a top-bar switch starts at card 1
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map(card).join('')
const lsize = (l: string) => bySaves(l).length
$('lgs').innerHTML = `<a class="lgb all${LIST === 'ALL' ? ' on' : ''}" href="${listUrl('ALL')}" title="The top 25 keepers by saves across the five leagues · ${lsize('ALL')}"><b>All Leagues</b><span>${lsize('ALL')}</span></a>` +
  LG_ORDER.map(lg => `<a class="lgb${LIST === lg ? ' on' : ''}" data-lg="${lg}" href="${listUrl(lg)}" title="${LEAGUE_NAME[lg]} goalkeepers · ${lsize(lg)}"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"><span>${lsize(lg)}</span></a>`).join('')
const upd = new Date(KEEPERS.updated)
$('cnote').innerHTML = `${P.length} goalkeepers: ${LIST === 'ALL' ? `the top 25 by saves across the five leagues, plus everyone tied on ${KEEPERS.cut}` : `every ${LEAGUE_NAME[LIST]} club's first-choice keeper and anyone with three or more starts`}, ranked by ${SORTS[SORT]}${SORT === 'age' ? ' (youngest first)' : SORT === 'saves' ? '' : ' (under three games last)'}. Season ${KEEPERS.season.replace('-', '/')}, updated ${upd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`

function onPaint(i: number) {
  const k = P[i]
  $('ctx').innerHTML = `${LIST === 'ALL' ? 'Goalkeepers' : `${LEAGUE_NAME[LIST]} goalkeepers`} ${SEASON.replace('-', '/')} · by ${SORTS[SORT]} · <b>${esc(k.name)}</b> · ${sortVal(k)}`
  if (LIST === 'ALL') $('lgs').querySelectorAll<HTMLElement>('.lgb[data-lg]').forEach(b => b.classList.toggle('cur', b.dataset.lg === k.lg))
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[k.lg]); meta('title', `${k.name} · ${k.SV} saves · ${LIST === 'ALL' ? 'top-5 leagues' : LEAGUE_NAME[LIST]}`)
}

// search: a keeper or a club; a number jumps to that card
const INDEX = P.map((k, i) => ({ i, label: k.name, sub: `${TEAMS[k.lg][k.team]?.name || k.team} · ${k.SV} saves`,
  key: [k.name, k.team, TEAMS[k.lg][k.team]?.name, LEAGUE_NAME[k.lg]].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }))
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  return hits.length ? `<div class="jsec"><div class="jsechd">${LIST === 'ALL' ? 'All Leagues' : `<img src="leagues/${LIST}.png" alt="">${LEAGUE_NAME[LIST]}`}<span>${hits.length}</span></div><div class="jgrid">${hits.map(x =>
    `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` : '<p>No keeper found.</p>'
}

// hover / tap a game: its goals against light up in the club colour
initLinks(film)
if (SEASON === '2026-27') initStory(film, CTX)
fitBios(film)
initHighlight(film, '[data-mid]', k => `[data-mid="${k}"]`, el => el.dataset.mid!)
initNav('keepers', LIST, SEASON)
initSort({ store: 'top5.keepers.sort', sorts: SORTS, notes: { pct: 'best first', age: 'youngest first' }, current: SORT, list: P,
  inOrder: k => listOf(LIST, k), same: (a, b) => a.key === b.key })
initFilm({ label: i => P[i].name, count: P.length, key: 'top5.keepers.card' + (SEASON === '2026-27' ? '' : '.' + SEASON) + (LIST === 'ALL' ? '' : '.' + LIST), onPaint, jumpHTML, self: 'keepers.html' })
