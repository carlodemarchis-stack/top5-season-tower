// Top-scorers card film: one full-screen card per player (top 50 by goals across the top 5 leagues, ties included).
// Data: src/data/scorers-TOP5-<season>.js (scripts/update-scorers.mjs, from our match cards; back seasons: update-scorers-espn.mjs); club colours/names from the schedules.
import '../film/film.css'
import '../film/statcols.css'
import { initStory } from '../film/story'
import { initFilm, initHighlight, initTip, initLinks, initNav, initSort, readSort } from '../film/chrome'
import { outfieldCard, matchTip, esc, LEAGUE_NAME, lum, type Ctx, fitBios } from '../film/cards'
import { shotsOf } from '../film/goals'
type Dict = Record<string, any>
// ?season=2025-26 loads a past season (data from `update-scorers-espn.mjs --season`)
const QS = new URLSearchParams(location.search)
const SEASON = QS.get('season') || '2026-27'
const [{ SCORERS }, ...TL] = await Promise.all([
  import(`../data/scorers-TOP5-${SEASON}.js`),
  ...['ITA', 'ENG', 'ESP', 'FRA', 'GER'].map(lg => import(`../data/schedule-${lg}-${SEASON}.js`)),
]) as Dict[]
// Serie A: each game's Fantacalcio mark (Redazione) under its box — scripts/update-votes.mjs; other leagues have none
const VOTE_FILES = import.meta.glob('../data/votes-*.js')
const VOTES: Dict = ((await VOTE_FILES[`../data/votes-ITA-${SEASON}.js`]?.()) as Dict | undefined)?.VOTES?.v || {}
const TEAMS: Record<string, Dict> = { ITA: TL[0].TEAMS, ENG: TL[1].TEAMS, ESP: TL[2].TEAMS, FRA: TL[3].TEAMS, GER: TL[4].TEAMS }
const CTX: Ctx = { TEAMS, SEASON, VOTES }
// the one player card (src/film/cards.ts): his rank in this list under his role, the name opens his squad card
const card = (p: Dict) => outfieldCard(CTX, p, { rank: p.rank, sort: SORT, href: SEASON === '2026-27' ? `player.html?lg=${p.lg}&team=${p.team}&p=${p.espnId}` : undefined, story: SEASON === '2026-27' })

// ---------- the standard card-film chrome: top bar (league logos), control bar, search, modals, keys, restore ----------
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
// which film: ?lg=ITA = that league's own top 25 (ties), none = the five-league top 50; each list carries its own ranks
const LIST = LG_ORDER.includes(QS.get('lg') || '') ? QS.get('lg')! : 'ALL'
const BYID: Record<string, Dict> = Object.fromEntries(SCORERS.players.map((p: Dict) => [p.espnId, p]))
const byGoals = (k: string): Dict[] => SCORERS.lists ? SCORERS.lists[k].map(([id, rank]: [string, number]) => ({ ...BYID[id], rank })) : SCORERS.players
// the order (Order by, remembered): goals (the list's own ranks), minutes per goal — fewest first, under 3 goals last —
// or age, youngest first; the same players either way, the rank badge their place in this order
const SORTS: Record<string, string> = { goals: 'goals', mpg: 'minutes per goal', age: 'age' }
let SORT = SCORERS.lists ? readSort('top5.scorers.sort', SORTS) : 'goals'   // a back season (ESPN, one list): by goals only
const listOf = (k: string, sort = SORT): Dict[] => { const L = byGoals(k); if (sort === 'goals') return L
  const v = (p: Dict) => sort === 'mpg' ? (p.G >= 3 ? p.min / p.G : 1e6 + (p.G ? p.min / p.G : 1e6)) : p.age ?? 999
  return [...L].sort((a, b) => v(a) - v(b) || a.rank - b.rank).map((p, i) => ({ ...p, rank: i + 1 })) }
const P: Dict[] = listOf(LIST)
const sortVal = (p: Dict) => SORT === 'mpg' ? `${p.G ? Math.round(p.min / p.G) : '–'}' a goal` : SORT === 'age' ? `${p.age ?? '–'}` : `${p.G} goals`
const listName = (k: string) => k === 'ALL' ? 'Top 50 scorers' : `${LEAGUE_NAME[k]} top scorers`
const listUrl = (k: string) => { const q = new URLSearchParams(location.search); k === 'ALL' ? q.delete('lg') : q.set('lg', k); const qs = q.toString(); return location.pathname + (qs ? '?' + qs : '') + '#1' }   // a top-bar switch starts at card 1
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }
// ---------- the closing card: Finishing — shots → on target → goals, five ranked columns over the film's players with
// 15 shots or more (fewer: a percentage means little); xG from the FotMob shot maps, loaded after the film is up ----------
const MIN_SHOTS = 15
let XG: Record<string, { g: number; xg: number; npg: number; npxg: number }> | null = null   // by player: from the shot maps
const pc = (v: number) => `${Math.round(v * 100)}%`, sgn = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
function finishingInner() {
  type Col = { title: string, sub: string, v: (p: Dict) => number | null, show: (p: Dict) => string, low?: boolean, xg?: boolean }
  const ok = (p: Dict) => (p.shots || 0) >= MIN_SHOTS, x = (p: Dict) => XG?.[p.espnId]
  const COLS: Col[] = [
    { title: 'Conversion', sub: 'goals per shot', v: p => ok(p) ? p.G / p.shots : null, show: p => pc(p.G / p.shots) },
    { title: 'On target', sub: 'shots on target', v: p => ok(p) ? p.sog / p.shots : null, show: p => pc(p.sog / p.shots) },
    { title: 'Shots per goal', sub: 'fewest first', v: p => ok(p) && p.G ? p.shots / p.G : null, show: p => (p.shots / p.G).toFixed(1), low: true },
    { title: 'Goals − xG', sub: 'above the chances', v: p => ok(p) && x(p) ? x(p)!.g - x(p)!.xg : null, show: p => sgn(x(p)!.g - x(p)!.xg), xg: true },
    { title: 'Non-penalty', sub: 'goals − xG, penalties aside', v: p => ok(p) && x(p) ? x(p)!.npg - x(p)!.npxg : null, show: p => sgn(x(p)!.npg - x(p)!.npxg), xg: true },
  ]
  const all = LIST === 'ALL', N = Math.min(20, P.filter(ok).length)
  const short = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : n }   // G. Varela: room for his numbers
  const col = (c: Col) => {
    if (c.xg && !XG) return `<div class="tsc-col"><div class="tsh"><b>${c.title}</b><span>${c.sub}</span></div><p class="tsnone">loading the shot maps…</p></div>`
    const L = P.map((p, i) => ({ p, i, v: c.v(p) })).filter(r => r.v != null).sort((a, b) => (c.low ? a.v! - b.v! : b.v! - a.v!) || a.i - b.i).slice(0, N)
    const rows = L.map((r, k) => { const club = TEAMS[r.p.lg][r.p.team] || {}, bg = club.primary || '#555', fg = lum(bg) > 0.55 ? '#15181d' : '#fff'
      return `<a class="tsr" data-i="${r.i}" title="${esc(r.p.name)} · ${esc(club.name || r.p.team)}${all ? ` · ${LEAGUE_NAME[r.p.lg]}` : ''} · ${r.p.G} goals from ${r.p.shots} shots, ${r.p.sog} on target${x(r.p) ? ` · xG ${x(r.p)!.xg.toFixed(1)}` : ''}"><span class="tr-rk">${k && c.show(L[k - 1].p) === c.show(r.p) ? '' : L.findIndex(y => c.show(y.p) === c.show(r.p)) + 1}</span>${all ? `<img class="tr-lg" src="leagues/${r.p.lg}.png" alt="">` : ''}<b class="tcode" style="background:${bg};color:${fg}">${esc(club.abbr || r.p.team)}</b><span class="tnm">${esc(short(r.p.name))}</span><span class="tfn">${r.p.shots} · ${r.p.sog} · ${r.p.G}</span><em>${c.show(r.p)}</em></a>` }).join('')
    return `<div class="tsc-col"><div class="tsh"><b>${c.title}</b><span>${c.sub}</span></div>${rows}</div>`
  }
  return `<div class="tb"><div class="tb-hd"><h2>Finishing</h2><span>shots → on target → goals (the small numbers by each name) · the ${all ? 'top 50' : 'top'} scorers with ${MIN_SHOTS} shots or more (${P.filter(ok).length}) · ties share a rank · click a player for his card</span></div>
    <div class="tsg co fin${all ? ' all' : ''}" style="--n:${N};--k:${COLS.length}">${COLS.map(c => col(c)).join('')}</div></div>`
}
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
const FIN = SEASON === '2026-27'   // the shot maps: this season only
film.innerHTML = P.map(card).join('') + (FIN ? `<section class="card tbl" id="s-finish">${finishingInner()}</section>` : '')
film.addEventListener('click', e => { const r = (e.target as HTMLElement).closest<HTMLElement>('.tsr[data-i]'); if (r) (window as any).go(+r.dataset.i!) })

// top bar: "All Leagues" + the five leagues switch between the six lists; the number is each list's size
const lsize = (k: string) => byGoals(k).length
$('lgs').innerHTML = `<a class="lgb all${LIST === 'ALL' ? ' on' : ''}" href="${listUrl('ALL')}" title="Top 50 across the five leagues · ${lsize('ALL')} players"><b>All Leagues</b><span>${lsize('ALL')}</span></a>` +
  LG_ORDER.map(lg => `<a class="lgb${LIST === lg ? ' on' : ''}" data-lg="${lg}" href="${listUrl(lg)}" title="${LEAGUE_NAME[lg]} top scorers · ${lsize(lg)} players"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"><span>${lsize(lg)}</span></a>`).join('')
const upd = new Date(SCORERS.updated)
$('cnote').innerHTML = `${P.length} players: ${LIST === 'ALL' ? 'the top 50 by goals across the five leagues' : `${LEAGUE_NAME[LIST]}'s top 25 by goals`}, plus everyone tied on ${SCORERS.cuts?.[LIST] ?? SCORERS.cut} goals${SORT === 'goals' ? '' : `, ordered by ${SORTS[SORT]}${SORT === 'age' ? ' (youngest first)' : ' (fewest first; under three goals last)'}`}. Season ${SCORERS.season.replace('-', '/')}, updated ${upd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`

// page-specific part of every card change: the context line, the five-league mark, the social-capture meta
function onPaint(i: number) {
  const p = P[i]
  if (!p) { $('ctx').innerHTML = `${listName(LIST)} ${SCORERS.season.replace('-', '/')} · <b>finishing</b>`; return }
  $('ctx').innerHTML = `${listName(LIST)} ${SCORERS.season.replace('-', '/')}${SORT === 'goals' ? '' : ` · by ${SORTS[SORT]}`} · <b>${esc(p.name)}</b> · ${sortVal(p)}`
  if (LIST === 'ALL') $('lgs').querySelectorAll<HTMLElement>('.lgb[data-lg]').forEach(b => b.classList.toggle('cur', b.dataset.lg === p.lg))   // five-league film: mark this card's league
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[p.lg]); meta('title', `${p.name} · ${p.G} goals · ${LIST === 'ALL' ? 'top 50 scorers, top-5 leagues' : `${LEAGUE_NAME[LIST]} top scorers`}`)
}

// search: grouped by league, every word must match; a number jumps to that card
const INDEX = P.map((p, i) => {
  const club = TEAMS[p.lg][p.team] || {}
  return { i, lg: p.lg, label: p.name, sub: `${club.name || p.team} · ${p.G} goals`, key: [p.name, p.full, club.name, p.team, LEAGUE_NAME[p.lg], p.nat, p.natCode].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
})
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  // the closing Finishing card, on top (as the other films' Stats)
  const st = FIN && (!qq || (/^\d+$/.test(qq) ? +qq === P.length + 1 : qq.split(/\s+/).every(w => 'stats finishing conversion on target shots per goal xg penalty'.includes(w))))
  const statsSec = st ? `<div class="jsec"><div class="jsechd">Stats<span>1</span></div><div class="jgrid"><div class="jrow" data-i="${P.length}"><span class="jn">${P.length + 1}</span><span class="jl">Finishing<span class="jt">conversion, on target, shots per goal, goals − xG</span></span></div></div></div>` : ''
  return statsSec + LG_ORDER.map(lg => {
    const rows = hits.filter(x => x.lg === lg); if (!rows.length) return ''
    return `<div class="jsec"><div class="jsechd"><img src="leagues/${lg}.png" alt="">${LEAGUE_NAME[lg]}<span>${rows.length}</span></div><div class="jgrid">${rows.map(x =>
      `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>`
  }).join('') || (statsSec ? '' : '<p>No player matches.</p>')
}

// hover / tap a match → its goals light up in the minute line and the goal list (and the other way round); the rest dims
initLinks(film)
if (SEASON === '2026-27') initStory(film, CTX)
fitBios(film)
initHighlight(film, '[data-mid]', k => `[data-mid="${k}"]`, el => el.dataset.mid!)

initTip(film, '[data-gid]', el => matchTip(CTX, P[[...film.children].indexOf(el.closest('.card')!)], el.dataset.gid!))
initNav('scorers', LIST, SEASON)
if (SCORERS.lists) initSort({ store: 'top5.scorers.sort', sorts: SORTS, notes: { mpg: 'fewest first', age: 'youngest first' }, current: SORT, list: P,
  inOrder: k => listOf(LIST, k), same: (a, b) => a.espnId === b.espnId })
initFilm({ label: i => P[i]?.name ?? 'Finishing', count: P.length + (FIN ? 1 : 0), key: 'top5.scorers.card' + (SEASON === '2026-27' ? '' : '.' + SEASON) + (LIST === 'ALL' ? '' : '.' + LIST), onPaint, jumpHTML, self: 'scorers.html' })
// the shot maps of the leagues on show, after the film is up: each player's goals and xG (penalties apart) — then the
// Finishing card's two xG columns are drawn
if (FIN) Promise.all((LIST === 'ALL' ? LG_ORDER : [LIST]).map(lg => shotsOf(lg, SEASON))).then(maps => {
  const want = new Set(P.map(p => String(p.espnId))), out: NonNullable<typeof XG> = {}
  for (const S of maps) for (const rows of Object.values(S) as any[][][]) for (const r of rows) {
    const id = String(r[8] || ''); if (!want.has(id) || r[5] === 'og') continue
    const o = (out[id] ||= { g: 0, xg: 0, npg: 0, npxg: 0 }), g = r[5] === 'g' ? 1 : 0, pen = r[6] === 'p'
    o.g += g; o.xg += r[4]; if (!pen) { o.npg += g; o.npxg += r[4] } }
  XG = out; $('s-finish').innerHTML = finishingInner()
})
