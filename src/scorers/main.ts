// Top-scorers card film: one full-screen card per player (top 50 by goals across the top 5 leagues, ties included).
// Data: src/data/scorers-TOP5-<season>.js (built + verified by scripts/update-scorers.mjs); club colours/names from the schedules.
import '../film/film.css'
import { initFilm, initHighlight, initTip } from '../film/chrome'
type Dict = Record<string, any>
// ?season=2025-26 loads a past season (data from `update-scorers.mjs --season`)
const QS = new URLSearchParams(location.search)
const SEASON = QS.get('season') || '2026-27'
const [{ SCORERS }, ...TL] = await Promise.all([
  import(`../data/scorers-TOP5-${SEASON}.js`),
  ...['ITA', 'ENG', 'ESP', 'FRA', 'GER'].map(lg => import(`../data/schedule-${lg}-${SEASON}.js`)),
]) as Dict[]
const TEAMS: Record<string, Dict> = { ITA: TL[0].TEAMS, ENG: TL[1].TEAMS, ESP: TL[2].TEAMS, FRA: TL[3].TEAMS, GER: TL[4].TEAMS }
const LEAGUE_NAME: Record<string, string> = { ITA: 'Serie A', ENG: 'Premier League', ESP: 'LaLiga', FRA: 'Ligue 1', GER: 'Bundesliga' }
// the league photo shoots frame differently (LaLiga / Ligue 1 waist-up, the rest chest-up): scale so heads read the same size
const PHOTO_H: Record<string, string> = { ESP: '90%', FRA: '88%', ITA: '82%', ENG: '80%', GER: '80%' }

// same six result shades as the towers / barcode
const RES6: Record<string, [string, string]> = {
  bigW: ['#177a41', '#fff'], W1: ['#3a9e62', '#0b2414'], D: ['#EAB308', '#3d3000'],
  nil: ['#9aa0a8', '#22262d'], L1: ['#dc5c5e', '#2a0709'], bigL: ['#b3323a', '#fff'],
}
const res6 = (gf: number, ga: number) => { const d = gf - ga; return d >= 2 ? 'bigW' : d === 1 ? 'W1' : d === 0 ? (gf === 0 ? 'nil' : 'D') : d === -1 ? 'L1' : 'bigL' }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
const logo = (lg: string, code: string) => `logos/${lg === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code}.png`
function lum(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const POS: Record<string, string> = { F: 'Forward', M: 'Midfielder', D: 'Defender', G: 'Goalkeeper' }

function card(p: Dict) {
  const club = TEAMS[p.lg][p.team] || {}
  const c = club.primary || '#555'
  const light = lum(c) > 0.55
  const ink = light ? '#15181d' : '#fff'
  const c2 = light ? '#15181d' : c                     // the big goals number takes the club colour unless it is too pale to read
  const hlInk = lum(c) > 0.183 ? '#15181d' : '#fff'     // text on the club-colour highlight: white only where it reaches 4.5:1
  const t = p.teamLine
  const ini = p.name.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('')

  const goals = p.matches.flatMap((m: Dict) => m.goals.map((g: Dict) => ({ ...g, m })))
    .map((g: Dict) => `<span class="g" data-mid="${g.m.id}"><b>${esc(g.min)}</b> ${g.m.ha === 'H' ? 'vs' : 'at'} ${esc(g.m.opp)}${g.kind === 'pen' ? '<em>PEN</em>' : g.kind === 'head' ? '<em>HEAD</em>' : g.kind === 'fk' ? '<em>FK</em>' : ''}${g.ast ? ` · ast ${esc(g.ast)}` : ''}</span>`).join('')

  const minPerGoal = p.G ? Math.round(p.min / p.G) : null
  const age = p.age != null ? `${p.age}` : ''
  return `<section class="card" id="p-${p.espnId}" style="--c:${c};--c2:${c2};--ink:${ink};--hlink:${hlInk};--ph:${PHOTO_H[p.lg]}">
    <div class="pan">
      <img class="wm" src="${logo(p.lg, p.team)}" alt="" onerror="this.remove()">
      <div class="rk">#${p.rank}</div>
      <div class="gbig"><b>${p.G}</b><span>goal${p.G === 1 ? '' : 's'}</span></div>
      ${p.photo ? `<img class="ph" src="${p.photo}" alt="${esc(p.name)}">` : `<div class="ini">${esc(ini)}</div>`}
    </div>
    <div class="body">
      <div>
        <h1 style="--len:${[...p.name].length};--word:${Math.max(...p.name.split(/[\s-]+/).map((w: string) => [...w].length))}">${esc(p.name)}</h1>
        <div class="meta" style="margin-top:8px">${[POS[p.pos] || p.posName, age && `<b>${age}</b> yrs`, esc(p.nat), p.jersey && `#${esc(p.jersey)}`, p.heightCm && `${p.heightCm} cm`].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="club"><img src="${logo(p.lg, p.team)}" alt="" onerror="this.remove()">${esc(club.name || p.team)}
        <span class="tl"><b>${t.pos ? ord(t.pos) : '–'}</b> · <b>${t.pts}</b> pts · ${t.W}-${t.D}-${t.L} · GD ${t.GF - t.GA >= 0 ? '+' : ''}${t.GF - t.GA}</span></div>
      <div class="nums">
        <div class="n big"><b>${p.G}</b><span>Goals${p.pens ? ` · ${p.pens} pen${p.pens > 1 ? 's' : ''}` : ''}</span></div>
        <div class="n"><b>${p.A}</b><span>Assists</span></div>
        <div class="n"><b>${p.apps}</b><span>Games${p.starts < p.apps ? ` · ${p.starts} starts` : ''}</span></div>
        <div class="n"><b>${p.min}'</b><span>Minutes</span></div>
        <div class="n"><b>${minPerGoal ?? '–'}'</b><span>Per goal</span></div>
        <div class="n"><b>${p.sog}/${p.shots}</b><span>On target / shots</span></div>
      </div>
      ${strip2(p, club)}
      <div class="glist">
        <div class="sec">The goals</div>
        <div class="goals">${goals}</div>
      </div>
    </div>
  </section>`
}

// ---------- the season in two rows — matchdays 1–19 over 20–38, unplayed fixtures included — plus the goals on a 0–90' line ----------
const kindName = (k: string) => k === 'pen' ? 'penalty' : k === 'head' ? 'header' : k === 'fk' ? 'free kick' : 'goal'
function strip2(p: Dict, club: Dict) {
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w)
  const byId: Record<string, Dict> = Object.fromEntries(p.matches.map((m: Dict) => [m.id, m]))
  const half = Math.ceil(all.length / 2)
  const maxMarks = Math.max(1, ...p.matches.map((m: Dict) => m.goals.length + m.A))
  const cell = (g: Dict) => {
    const m = byId[g.id]
    const at = g.ha === 'A' ? '@' : ''
    if (!m) return `<div class="c2 up" data-gid="${g.id}"><div class="mk"></div><div class="bx"></div><div class="op">${at}${esc(g.opp)}</div></div>`
    const [bg, fg] = RES6[res6(m.gf, m.ga)]
    const marks = [...m.goals.map((x: Dict) => `<i class="gl${x.kind === 'pen' ? ' pen' : ''}"></i>`), ...Array.from({ length: m.A }, () => '<i class="as"></i>')].reverse().join('')
    // the box reads bottom-up as the 90': the unplayed share is veiled — at the top for a starter (he played the start),
    // at the bottom for a sub (he played the end), so the darker part sits where his minutes were
    const veil = m.role ? Math.round((1 - Math.min(m.min, 90) / 90) * 100) : 100
    const ink = !m.role || m.min < 45 ? '#15181d' : fg
    return `<div class="c2${m.role ? (m.role === 'B' ? ' sub' : '') : ' dnp'}" data-mid="${g.id}" data-gid="${g.id}">
      <div class="mk">${marks}</div>
      <div class="bx" style="background:${bg};color:${ink}"><span class="vl" style="height:${veil}%"></span><b>${m.gf}-${m.ga}</b></div>
      <div class="op">${at}${esc(g.opp)}</div></div>`
  }
  const row = (gs: Dict[], lbl: string) => `<div class="row2"><div class="rl">${lbl}</div><div class="cells" style="--n:${half};--mk:${maxMarks}">${gs.map(cell).join('')}</div></div>`
  return `<div class="s2">
    ${row(all.slice(0, half), `MD 1–${half}`)}${row(all.slice(half), `MD ${half + 1}–${all.length}`)}
  </div>
  <div class="s2">
    <div class="sec">When he scores${goalLegend(p)}</div>${goalLine(p)}
  </div>`
}
// "45'+2'" → base 45, extra 2
const parseMin = (min: string) => { const mm = String(min).match(/(\d+)'?(?:\s*\+\s*(\d+))?/) || []; return { base: +(mm[1] || 0), extra: +(mm[2] || 0) } }
// sits on the "When he scores" title line: the half split, goals off the bench, and the marker key
function goalLegend(p: Dict) {
  const all = p.matches.flatMap((m: Dict) => m.goals.map((g: Dict) => ({ g, m })))
  const h1 = all.filter((x: Dict) => parseMin(x.g.min).base <= 45).length
  const bench = all.filter((x: Dict) => x.m.role === 'B').length
  return `<span class="gsum">1st half <b>${h1}</b> · 2nd half <b>${all.length - h1}</b> · off the bench <b>${bench}</b><span class="key"><i class="gd"></i>goal<i class="gd pen"></i>penalty<i class="gd head"></i>header<i class="gd fk"></i>free kick</span></span>`
}
function goalLine(p: Dict) {
  const pts: Dict[] = p.matches.flatMap((m: Dict) => m.goals.map((g: Dict) => {
    const { base, extra } = parseMin(g.min)
    return { x: Math.min(base, 90) + Math.min(extra, 6) * 0.45, base, g, m }
  }))
  // stack goals that would overlap (within ~2.2 minutes) upwards
  pts.sort((a, b) => a.x - b.x)
  const lanes: number[] = []
  for (const q of pts) { let l = 0; while (lanes[l] != null && q.x - lanes[l] < 2.2) l++; lanes[l] = q.x; q.lane = l }
  const dots = pts.map(q => `<i class="gd${q.g.kind === 'pen' ? ' pen' : q.g.kind === 'head' ? ' head' : q.g.kind === 'fk' ? ' fk' : ''}" style="left:${(q.x / 93) * 100}%;bottom:${4 + q.lane * 11}px" data-mid="${q.m.id}" title="${esc(q.g.min)} ${kindName(q.g.kind)} · MD${q.m.w} ${q.m.ha === 'H' ? 'vs' : 'at'} ${esc(q.m.opp)}${q.g.ast ? ` · ast ${esc(q.g.ast)}` : ''}"></i>`).join('')
  const lanesN = Math.max(1, ...pts.map(q => q.lane + 1))
  const ticks = [0, 15, 30, 45, 60, 75, 90].map(t => `<span style="left:${(t / 93) * 100}%">${t}'</span>`).join('')
  return `<div class="gline" style="--h:${8 + lanesN * 11}px"><div class="ax">${dots}<em class="ht"></em></div><div class="tk">${ticks}</div></div>`
}

// ---------- the standard card-film chrome: top bar (league logos), control bar, search, modals, keys, restore ----------
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
// which film: ?lg=ITA = that league's own top 25 (ties), none = the five-league top 50; each list carries its own ranks
const LIST = LG_ORDER.includes(QS.get('lg') || '') ? QS.get('lg')! : 'ALL'
const BYID: Record<string, Dict> = Object.fromEntries(SCORERS.players.map((p: Dict) => [p.espnId, p]))
const listOf = (k: string): Dict[] => SCORERS.lists ? SCORERS.lists[k].map(([id, rank]: [string, number]) => ({ ...BYID[id], rank })) : SCORERS.players
const P: Dict[] = listOf(LIST)
const listName = (k: string) => k === 'ALL' ? 'Top 50 scorers' : `${LEAGUE_NAME[k]} top scorers`
const listUrl = (k: string) => { const q = new URLSearchParams(location.search); k === 'ALL' ? q.delete('lg') : q.set('lg', k); const qs = q.toString(); return location.pathname + (qs ? '?' + qs : '') }
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map(card).join('')

// top bar: "All Leagues" + the five leagues switch between the six lists; the number is each list's size
const lsize = (k: string) => listOf(k).length
$('lgs').innerHTML = `<a class="lgb all${LIST === 'ALL' ? ' on' : ''}" href="${listUrl('ALL')}" title="Top 50 across the five leagues · ${lsize('ALL')} players"><b>All Leagues</b><span>${lsize('ALL')}</span></a>` +
  LG_ORDER.map(lg => `<a class="lgb${LIST === lg ? ' on' : ''}" data-lg="${lg}" href="${listUrl(lg)}" title="${LEAGUE_NAME[lg]} top scorers · ${lsize(lg)} players"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"><span>${lsize(lg)}</span></a>`).join('')
const upd = new Date(SCORERS.updated)
$('cnote').innerHTML = `${P.length} players: ${LIST === 'ALL' ? 'the top 50 by goals across the five leagues' : `${LEAGUE_NAME[LIST]}'s top 25 by goals`}, plus everyone tied on ${SCORERS.cuts?.[LIST] ?? SCORERS.cut} goals. Season ${SCORERS.season.replace('-', '/')}, updated ${upd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`

// page-specific part of every card change: the context line, the five-league mark, the social-capture meta
function onPaint(i: number) {
  const p = P[i]
  $('ctx').innerHTML = `${listName(LIST)} ${SCORERS.season.replace('-', '/')} · <b>${esc(p.name)}</b> · ${p.G} goals`
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
  return LG_ORDER.map(lg => {
    const rows = hits.filter(x => x.lg === lg); if (!rows.length) return ''
    return `<div class="jsec"><div class="jsechd"><img src="leagues/${lg}.png" alt="">${LEAGUE_NAME[lg]}<span>${rows.length}</span></div><div class="jgrid">${rows.map(x =>
      `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>`
  }).join('') || '<p>No player matches.</p>'
}

// hover / tap a match → its goals light up in the minute line and the goal list (and the other way round); the rest dims
initHighlight(film, '[data-mid]', k => `[data-mid="${k}"]`, el => el.dataset.mid!)

// ---------- match card on hover / tap of a season box: the game, and his part in it ----------
const KIND: Record<string, string> = { pen: 'pen', head: 'header', fk: 'free kick' }
function matchTip(p: Dict, gid: string) {
  const club = TEAMS[p.lg][p.team] || {}, g = (club.games || []).find((x: Dict) => x.id === gid), m = p.matches.find((x: Dict) => x.id === gid)
  if (!g) return ''
  const opp = TEAMS[p.lg][g.opp] || {}, when = g.et ? new Date(g.et.replace(' ', 'T')) : null
  const hh = g.et ? g.et.slice(11, 16) : '', tbc = !hh || +hh.slice(0, 2) < 6   // CET, as in the tower; a small-hours time = not fixed yet
  const date = when ? when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + (m || tbc ? '' : ` · ${hh} CET`) : ''
  const side = (code: string, name: string) => `<span class="mt-team"><img src="${logo(p.lg, code)}" alt="">${esc(name)}</span>`
  const us: [string, string] = [p.team, club.name || p.team], them: [string, string] = [g.opp, opp.name || g.oppFull || g.opp]
  const [home, away] = g.ha === 'H' ? [us, them] : [them, us]
  const head = `<div class="mt-top">MD ${g.w}${date ? ` · ${date}` : ''} · ${g.ha === 'H' ? 'home' : 'away'}</div>`
  if (!m) return `${head}<div class="mt-score">${side(...home)}<b class="mt-vs">vs</b>${side(...away)}</div><div class="mt-foot">to play</div>`
  const [bg, fg] = RES6[res6(m.gf, m.ga)], hs = g.ha === 'H' ? `${m.gf}–${m.ga}` : `${m.ga}–${m.gf}`
  const short = p.name
  const part = !m.role ? `<div class="mt-foot">${esc(short)} did not play</div>`
    : `<div class="mt-me"><b>${esc(short)}</b> · ${m.role === 'B' ? 'off the bench' : 'started'} · <b>${m.min}′</b></div>
      ${m.goals.length ? `<div class="mt-goals">${m.goals.map((x: Dict) => `<div class="mt-g"><span class="mt-min">${esc(x.min)}</span><span>goal${x.kind ? ` <em>${KIND[x.kind] || x.kind}</em>` : ''}${x.ast ? ` <i>· ${esc(x.ast)}</i>` : ''}</span></div>`).join('')}</div>` : ''}
      <div class="mt-stats"><span><b>${m.G}</b> goal${m.G === 1 ? '' : 's'}</span><span><b>${m.A}</b> assist${m.A === 1 ? '' : 's'}</span><span><b>${m.SH}</b> shots</span><span><b>${m.SOG}</b> on target</span>${m.YC || m.RC ? `<span><b>${m.YC || m.RC}</b><i class="${m.RC ? 'rc' : 'yc'}"></i></span>` : ''}</div>`
  return `${head}<div class="mt-score">${side(...home)}<b class="mt-res" style="background:${bg};color:${fg}">${hs}</b>${side(...away)}</div>${part}`
}
initTip(film, '[data-gid]', el => matchTip(P[[...film.children].indexOf(el.closest('.card')!)], el.dataset.gid!))
initFilm({ count: P.length, key: 'top5.scorers.card' + (SEASON === '2026-27' ? '' : '.' + SEASON) + (LIST === 'ALL' ? '' : '.' + LIST), onPaint, jumpHTML, self: 'scorers.html' })
