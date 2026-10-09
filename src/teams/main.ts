// Team-card film: one full-screen card per club, in table order, one league at a time (?lg=ITA …).
// Data: src/data/teams-<LG>-<season>.js (built + verified by scripts/update-teams.mjs); club colours/names from the schedule.
import '../film/film.css'
import { initFilm, initHighlight } from '../film/chrome'
type Dict = Record<string, any>
const QS = new URLSearchParams(location.search)
const SEASON = QS.get('season') || '2026-27'
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
const LEAGUE_NAME: Record<string, string> = { ITA: 'Serie A', ENG: 'Premier League', ESP: 'LaLiga', FRA: 'Ligue 1', GER: 'Bundesliga' }
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }
// which leagues have team cards for this season (the data files that exist)
const FILES = import.meta.glob('../data/teams-*-*.js')
const has = (lg: string) => !!FILES[`../data/teams-${lg}-${SEASON}.js`]
let LAST = ''; try { LAST = localStorage.getItem('top5.teams.lg') || '' } catch { }
const LG = [QS.get('lg') || '', LAST].find(l => LG_ORDER.includes(l) && has(l)) || LG_ORDER.find(has) || 'ITA'
try { localStorage.setItem('top5.teams.lg', LG) } catch { }
const [{ TEAMCARDS }, { TEAMS }] = await Promise.all([
  FILES[`../data/teams-${LG}-${SEASON}.js`](),
  import(`../data/schedule-${LG}-${SEASON}.js`),
]) as Dict[]
// players with a card in this league's scorers film: espnId → its card number there (squad tiles link to it)
const SCORER_CARD: Record<string, number> = await import(`../data/scorers-TOP5-${SEASON}.js`)
  .then((m: Dict) => Object.fromEntries((m.SCORERS.lists?.[LG] || []).map(([id]: [string], i: number) => [id, i + 1]))).catch(() => ({}))
// the league photo shoots frame differently (LaLiga / Ligue 1 waist-up, the rest chest-up)
const PHOTO_H: Record<string, string> = { ESP: '82%', FRA: '80%', ITA: '76%', ENG: '74%', GER: '74%' }

// same six result shades as the towers / barcode / scorer cards
const RES6: Record<string, [string, string]> = {
  bigW: ['#177a41', '#fff'], W1: ['#3a9e62', '#0b2414'], D: ['#EAB308', '#3d3000'],
  nil: ['#9aa0a8', '#22262d'], L1: ['#dc5c5e', '#2a0709'], bigL: ['#b3323a', '#fff'],
}
const res6 = (gf: number, ga: number) => { const d = gf - ga; return d >= 2 ? 'bigW' : d === 1 ? 'W1' : d === 0 ? (gf === 0 ? 'nil' : 'D') : d === -1 ? 'L1' : 'bigL' }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
const logo = (code: string) => `logos/${LG === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code}.png`
function lum(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const kindName = (k: string) => k === 'pen' ? 'penalty' : k === 'head' ? 'header' : k === 'fk' ? 'free kick' : k === 'og' ? 'own goal' : 'goal'
const parseMin = (min: string) => { const mm = String(min).match(/(\d+)'?(?:\s*\+\s*(\d+))?/) || []; return { base: +(mm[1] || 0), extra: +(mm[2] || 0) } }
const N_CLUBS = TEAMCARDS.teams.length

function card(t: Dict) {
  const club = TEAMS[t.code] || {}
  const c = club.primary || '#555'
  const light = lum(c) > 0.55
  const ink = light ? '#15181d' : '#fff'
  const c2 = light ? '#15181d' : c
  const hlInk = lum(c) > 0.183 ? '#15181d' : '#fff'
  const gd = t.GF - t.GA
  const photos = (t.panel || []).slice(0, 3)   // three players with a real photo: goals, then assists, then minutes
  const group = photos.length
    ? `<div class="grp">${photos.map((s: Dict, i: number) => `<img class="p${photos.length === 2 && i === 1 ? 2 : i}" src="${s.photo}" alt="${esc(s.name)}">`).join('')}</div>`
    : `<img class="bigcrest" src="${logo(t.code)}" alt="">`
  const ppg = t.played ? (t.pts / t.played).toFixed(1) : '–'
  return `<section class="card" id="t-${t.code}" style="--c:${c};--c2:${c2};--ink:${ink};--hlink:${hlInk};--ph:${PHOTO_H[LG]}">
    <div class="pan">
      <img class="wm team" src="${logo(t.code)}" alt="" onerror="this.remove()">
      <div class="rk">#${t.pos ?? '–'}</div>
      <div class="gbig"><b>${t.pts}</b><span>point${t.pts === 1 ? '' : 's'}</span></div>
      ${group}
    </div>
    <div class="body">
      <div>
        <h1 style="--len:${[...club.name || t.code].length};--word:${Math.max(...(club.name || t.code).split(/[\s-]+/).map((w: string) => [...w].length))}">${esc(club.name || t.code)}</h1>
        <div class="meta" style="margin-top:8px">${LEAGUE_NAME[LG]} · <b>${t.pos ? ord(t.pos) : '–'}</b> · ${t.W}-${t.D}-${t.L} · GD ${gd >= 0 ? '+' : ''}${gd}${t.scorers[0]?.G ? ` · top scorer <b>${esc(t.scorers[0].name)}</b>` : ''}</div>
      </div>
      <div class="tabs"><button class="tab" data-tab="season">Season</button><button class="tab" data-tab="squad">Squad <span>${(t.squad || []).length}</span></button></div>
      <div class="pane pane-season">
      <div class="nums">
        <div class="n big"><b>${t.pts}</b><span>Points · ${ppg}/game</span></div>
        <div class="n"><b>${t.GF}–${t.GA}</b><span>For–against</span></div>
        <div class="n"><b>${t.cs}</b><span>Clean sheets</span></div>
        <div class="n"><b>${t.avg.poss != null ? Math.round(t.avg.poss) : '–'}%</b><span>Possession</span></div>
        <div class="n"><b>${t.avg.sot != null ? Math.round(t.avg.sot) : '–'}/${t.avg.sh != null ? Math.round(t.avg.sh) : '–'}</b><span>On target / shots</span></div>
        <div class="n"><b>${t.avg.pass != null ? Math.round(t.avg.pass) : '–'}%</b><span>Passing</span></div>
      </div>
      ${strip(t, club)}
      <div class="s2"><div class="sec">When they score${goalLegend(t)}</div>${goalLine(t)}</div>
      <div class="duo"><div class="s2"><div class="sec">Position<span class="gsum">now <b>${t.pos ? ord(t.pos) : '–'}</b> · best <b>${t.posPath.length ? ord(Math.min(...t.posPath.map((x: number[]) => x[1]))) : '–'}</b></span></div>${posLine(t, club)}</div>
      <div class="s2"><div class="sec">Scorers</div><div class="slist">${scorerChips(t)}</div></div></div>
      </div>
      <div class="pane pane-squad">${squadGrid(t)}</div>
    </div>
  </section>`
}

// ---------- the season in two rows; the darker part of each box = the club's possession ----------
function strip(t: Dict, club: Dict) {
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w)
  const byId: Record<string, Dict> = Object.fromEntries(t.matches.map((m: Dict) => [m.id, m]))
  const half = Math.ceil(all.length / 2)
  const cell = (g: Dict) => {
    const m = byId[g.id], at = g.ha === 'A' ? '@' : ''
    if (!m) return `<div class="c2 tm up" title="MD${g.w} · ${g.ha === 'H' ? 'vs' : 'at'} ${esc(TEAMS[g.opp]?.name || g.opp)} · to play"><div class="bx"></div><div class="op">${at}${esc(g.opp)}</div></div>`
    const [bg, fg] = RES6[res6(m.gf, m.ga)]
    const veil = Math.round(100 - Math.max(0, Math.min(100, m.poss)))
    const keys = [`m${m.id}`, ...m.for.filter((x: Dict) => x.kind !== 'og').map((x: Dict) => `p${slug(x.by)}`)].join(' ')
    const det = `MD${m.w} · ${g.ha === 'H' ? 'vs' : 'at'} ${TEAMS[g.opp]?.name || g.opp} · ${m.gf}-${m.ga}` +
      (m.for.length ? ` · ${m.for.map((x: Dict) => `${x.min} ${x.kind === 'og' ? 'own goal' : x.by}`).join(', ')}` : '') +
      ` · ${m.poss}% possession · ${m.sot}/${m.sh} shots on target`
    return `<div class="c2 tm" data-h="m${m.id}" data-k="${keys}" title="${esc(det)}">
      <div class="bx" style="background:${bg};color:${veil > 55 ? '#15181d' : fg}"><span class="vl" style="height:${veil}%"></span><b>${m.gf}-${m.ga}</b></div>
      <div class="op">${at}${esc(g.opp)}</div></div>`
  }
  const row = (gs: Dict[], lbl: string) => `<div class="row2"><div class="rl">${lbl}</div><div class="cells" style="--n:${half};--mk:0">${gs.map(cell).join('')}</div></div>`
  return `<div class="s2">${row(all.slice(0, half), `MD 1–${half}`)}${row(all.slice(half), `MD ${half + 1}–${all.length}`)}</div>`
}

// ---------- goals by minute: scored above the line, conceded below ----------
function goalLegend(t: Dict) {
  const f = t.matches.flatMap((m: Dict) => m.for), a = t.matches.flatMap((m: Dict) => m.against)
  const h1 = (xs: Dict[]) => xs.filter(x => parseMin(x.min).base <= 45).length
  return `<span class="gsum">scored <b>${f.length}</b> (${h1(f)} + ${f.length - h1(f)}) · conceded <b>${a.length}</b> (${h1(a)} + ${a.length - h1(a)})<span class="key"><i class="gd"></i>scored<i class="gd ag"></i>conceded<i class="gd og"></i>own goal</span></span>`
}
function goalLine(t: Dict) {
  const mk = (side: 'for' | 'against') => t.matches.flatMap((m: Dict) => m[side].map((g: Dict) => {
    const { base, extra } = parseMin(g.min); return { x: Math.min(base, 90) + Math.min(extra, 6) * 0.45, g, m }
  })).sort((a: Dict, b: Dict) => a.x - b.x)
  const lanes = (pts: Dict[]) => { const L: number[] = []; for (const q of pts) { let l = 0; while (L[l] != null && q.x - L[l] < 2.2) l++; L[l] = q.x; q.lane = l } return Math.max(1, L.length) }
  const up = mk('for'), dn = mk('against'), nu = lanes(up), nd = lanes(dn)
  const upH = 6 + nu * 11, dnH = 6 + nd * 11
  const dot = (q: Dict, side: string) => {
    const og = q.g.kind === 'og', cls = side === 'for' ? `gd${og ? ' og' : q.g.kind === 'pen' ? ' pen' : q.g.kind === 'head' ? ' head' : q.g.kind === 'fk' ? ' fk' : ''}` : `gd ag${og ? ' og' : ''}`
    const keys = [`m${q.m.id}`, side === 'for' && !og ? `p${slug(q.g.by)}` : ''].filter(Boolean).join(' ')
    const pos = side === 'for' ? `bottom:${dnH + 2 + q.lane * 11}px` : `top:${upH + 2 + q.lane * 11}px`
    return `<i class="${cls}" style="left:${(q.x / 93) * 100}%;${pos}" data-h="m${q.m.id}" data-k="${keys}" title="${esc(q.g.min)} ${side === 'for' ? (og ? 'own goal' : `${q.g.by} · ${kindName(q.g.kind)}`) : `conceded${og ? ' (own goal)' : ` · ${q.g.by}`}`} · MD${q.m.w} ${q.m.ha === 'H' ? 'vs' : 'at'} ${esc(q.m.opp)}"></i>`
  }
  const ticks = [0, 15, 30, 45, 60, 75, 90].map(v => `<span style="left:${(v / 93) * 100}%">${v}'</span>`).join('')
  return `<div class="gline" style="--h:${upH + dnH}px"><div class="ax two"><em class="mid" style="top:${upH}px"></em>${up.map((q: Dict) => dot(q, 'for')).join('')}${dn.map((q: Dict) => dot(q, 'against')).join('')}<em class="ht"></em></div><div class="tk">${ticks}</div></div>`
}

// ---------- table position after each matchday (1 at the top), with the top-4 / bottom-3 bands ----------
function posLine(t: Dict, club: Dict) {
  const N = (club.games || []).length || 38
  const x = (md: number) => ((md - 1) / Math.max(1, N - 1)) * 100
  const y = (p: number) => ((p - 1) / Math.max(1, N_CLUBS - 1)) * 100
  // only matchdays the club played: a round still under way (or a postponed game) moves the table without them
  const mOf: Record<number, Dict> = Object.fromEntries(t.matches.map((m: Dict) => [m.w, m]))
  const pts = (t.posPath as number[][]).filter(([md]) => mOf[md])
  const poly = pts.map(([md, p]) => `${x(md)},${y(p)}`).join(' ')
  // each matchday's dot takes that game's result shade (same six as the strip)
  const dots = pts.map(([md, p], i) => {
    const m = mOf[md], last = i === pts.length - 1, d = last ? 12 : 9
    return `<i class="pd" data-h="m${m.id}" data-k="m${m.id}" style="position:absolute;left:${x(md)}%;top:${y(p)}%;width:${d}px;height:${d}px;margin:-${d / 2}px 0 0 -${d / 2}px;border-radius:50%;background:${RES6[res6(m.gf, m.ga)][0]};box-shadow:0 0 0 1.5px #fff" title="after MD${md}: ${ord(p)} · ${m.ha === 'H' ? 'vs' : 'at'} ${m.opp} ${m.gf}-${m.ga}"></i>`
  }).join('')
  // the latest position written beside the last dot (on its left once the line nears the end of the season)
  const [lmd, lp] = pts[pts.length - 1] || [], right = lmd && x(lmd) > 88
  const tag = lmd ? `<span class="plast" style="top:${y(lp)}%;${right ? `right:${100 - x(lmd)}%;margin-right:12px` : `left:${x(lmd)}%;margin-left:12px`}">${ord(lp)}</span>` : ''
  return `<div class="pline"><div class="plot">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
      <rect class="zone" x="0" y="0" width="100" height="${y(4.5)}" fill="#177a41"/><rect class="zone" x="0" y="${y(N_CLUBS - 2.5)}" width="100" height="${100 - y(N_CLUBS - 2.5)}" fill="#b3323a"/>
      ${pts.length > 1 ? `<polyline points="${poly}" fill="none" stroke="#8a9099" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` : ''}
    </svg>${dots}${tag}</div>
    <div class="ax2"><span>MD 1</span><span>1st top · ${N_CLUBS}th bottom</span><span>MD ${N}</span></div></div>`
}

// ---------- the squad as a deck of player tiles (like the NBA team cards): portrait on a wash of the club colour,
// shirt number as a watermark, three stats across the foot; grouped by position, most minutes first ----------
const POSN: [string, string, string][] = [['G', 'Goalkeepers', 'GK'], ['D', 'Defenders', 'DEF'], ['M', 'Midfielders', 'MID'], ['F', 'Forwards', 'FWD']]
function squadGrid(t: Dict) {
  const sq: Dict[] = t.squad || []
  const ini = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('')
  const tile = (p: Dict, tag = '') => {
    const pills = p.pos === 'G'
      ? [[`${p.min}'`, 'min'], [p.SV ?? 0, 'saves'], [p.GA ?? 0, 'conc.']]
      : [[`${p.min}'`, 'min'], [p.G, 'goals'], [p.A, 'assists']]
    const tip = `${p.name}${p.jersey ? ` · #${p.jersey}` : ''}${p.age ? ` · ${p.age}` : ''}${p.nat ? ` · ${p.nat}` : ''} — ${p.apps ? `${p.apps} games (${p.starts} starts), ${p.min}'` : 'no league minutes yet'}${p.YC ? ` · ${p.YC} yellow` : ''}${p.RC ? ` · ${p.RC} red` : ''}${p.inj ? ` · ${p.inj}` : ''}`
    const sc = SCORER_CARD[p.espnId]
    const open = sc ? `<a class="pm${p.apps ? '' : ' unused'} has-card" href="scorers.html?lg=${LG}#${sc}" title="${esc(tip)} — open his scorer card">` : `<div class="pm${p.apps ? '' : ' unused'}" title="${esc(tip)}">`
    return `${open}
      <span class="pmshot">${tag}<i class="pmfb">${esc(ini(p.name))}</i>${p.thumb ? `<img src="${p.thumb}" alt="" loading="lazy">` : ''}${p.jersey ? `<b class="pmwm">${esc(p.jersey)}</b>` : ''}${p.inj ? '<i class="inj" title="injured">+</i>' : ''}
        <span class="pmpills">${pills.map(([v, k]) => `<b>${v}<i>${k}</i></b>`).join('')}</span></span>
      <span class="pmname"><span>${esc(p.name)}</span>${p.RC ? '<i class="rc"></i>' : p.YC ? '<i class="yc"></i>' : ''}${sc ? '<i class="sclink" title="has a scorer card"></i>' : ''}</span>${sc ? '</a>' : '</div>'}`
  }
  // one continuous run of tiles (no gaps between positions); each position is tagged on its first tile
  return `<div class="sq"><div class="deck">${POSN.map(([k, label, short]) => {
    const ps = sq.filter(p => p.pos === k).sort((a, b) => b.min - a.min || b.apps - a.apps || (+a.jersey || 99) - (+b.jersey || 99))
    return ps.map((p, i) => tile(p, i ? '' : `<b class="grptag" title="${label}: ${ps.length}">${short} · ${ps.length}</b>`)).join('')
  }).join('')}</div></div>`
}

// the top three as photo pills, everyone else as one compact line
function scorerChips(t: Dict) {
  const all = t.scorers.filter((s: Dict) => s.G)
  if (!all.length) return '<span class="sc">No goals yet</span>'
  const k = (s: Dict) => `data-h="p${slug(s.name)}" data-k="p${slug(s.name)}"`
  const thumbOf: Record<string, string> = Object.fromEntries((t.squad || []).filter((p: Dict) => p.thumb).map((p: Dict) => [p.espnId, p.thumb]))
  const top = all.slice(0, 3).map((s: Dict) => `<span class="sc" ${k(s)}>${thumbOf[s.espnId] ? `<img src="${thumbOf[s.espnId]}" alt="">` : '<i class="nophoto"></i>'}${esc(s.name)} <b>${s.G}</b>${s.A ? ` · ${s.A} ast` : ''}</span>`).join('')
  const rest = all.slice(3).map((s: Dict) => `<span class="sc2" ${k(s)}>${esc(s.name)} <b>${s.G}</b></span>`).join('')
  return top + (rest ? `<div class="rest">${rest}</div>` : '')
}

// ---------- the standard card-film chrome ----------
const P: Dict[] = TEAMCARDS.teams
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map(card).join('')
const lgUrl = (lg: string) => { const q = new URLSearchParams(location.search); q.set('lg', lg); return location.pathname + '?' + q.toString() }
$('lgs').innerHTML = LG_ORDER.map(lg => `<a class="lgb${lg === LG ? ' on' : ''}${has(lg) ? '' : ' soon'}" href="${lgUrl(lg)}" title="${LEAGUE_NAME[lg]}${has(lg) ? ' team cards' : ' — coming soon'}"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"></a>`).join('')
$('cnote').innerHTML = `${P.length} clubs of ${LEAGUE_NAME[LG]}, in table order. Season ${SEASON.replace('-', '/')}, updated ${new Date(TEAMCARDS.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`

const KEY = 'top5.teams.card.' + LG + (SEASON === '2026-27' ? '' : '.' + SEASON)
function onPaint(i: number) {
  const t = P[i]
  $('ctx').innerHTML = `${LEAGUE_NAME[LG]} ${SEASON.replace('-', '/')} · <b>${esc(TEAMS[t.code]?.name || t.code)}</b> · ${t.pos ? ord(t.pos) : '–'}, ${t.pts} pts`
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[LG]); meta('title', `${TEAMS[t.code]?.name || t.code} · ${t.pts} pts · ${LEAGUE_NAME[LG]}`)
}

// search: a club, or any of its scorers; a number jumps to that card
const INDEX = P.map((t, i) => ({ i, label: TEAMS[t.code]?.name || t.code, sub: `${t.pos ? ord(t.pos) : '–'} · ${t.pts} pts`,
  key: [TEAMS[t.code]?.name, t.code, ...t.scorers.map((s: Dict) => s.name)].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }))
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  return hits.length ? `<div class="jsec"><div class="jsechd"><img src="leagues/${LG}.png" alt="">${LEAGUE_NAME[LG]}<span>${hits.length}</span></div><div class="jgrid">${hits.map(x =>
    `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` : '<p>No club matches.</p>'
}

// Season | Squad tab: one choice for every card, remembered
let TAB = 'season'
try { TAB = localStorage.getItem('top5.teams.tab') === 'squad' ? 'squad' : 'season' } catch { }
const setTab = (t: string) => {
  TAB = t; document.body.classList.toggle('tab-squad', t === 'squad')
  film.querySelectorAll<HTMLElement>('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t))
  try { localStorage.setItem('top5.teams.tab', t) } catch { }
}
setTab(TAB)
film.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.tab'); if (b) setTab(b.dataset.tab!) })
addEventListener('keydown', e => { if (e.key === 't' && !document.querySelector('.mod.on') && !e.metaKey && !e.ctrlKey) setTab(TAB === 'squad' ? 'season' : 'squad') })

// hover / tap a match, a goal or a scorer: everything sharing its key lights up in the club colour, the rest dims
initHighlight(film, '[data-h]', k => `[data-k~="${k}"]`, el => el.dataset.h!)
initFilm({ count: P.length, key: KEY, onPaint, jumpHTML, self: 'teams.html' })
