// Team-card film: one full-screen card per club, in table order, one league at a time (?lg=ITA …),
// or all five leagues in one film ranked by points per game (?lg=ALL), so leagues of 18 and 20 clubs compare fairly.
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
const LG = [QS.get('lg') || '', LAST].find(l => l === 'ALL' || (LG_ORDER.includes(l) && has(l))) || LG_ORDER.find(has) || 'ITA'
try { localStorage.setItem('top5.teams.lg', LG) } catch { }
const ALL = LG === 'ALL'
const LOAD = ALL ? LG_ORDER.filter(has) : [LG]
// per league: its clubs (names, colours, fixtures), its table size, its team cards; every card carries its league as t.lg
const TEAMS_OF: Record<string, Dict> = {}, N_OF: Record<string, number> = {}, CARDS_OF: Record<string, Dict> = {}
await Promise.all(LOAD.map(async lg => {
  const [{ TEAMCARDS }, { TEAMS }] = await Promise.all([FILES[`../data/teams-${lg}-${SEASON}.js`](), import(`../data/schedule-${lg}-${SEASON}.js`)]) as Dict[]
  TEAMCARDS.teams.forEach((t: Dict) => t.lg = lg)
  TEAMS_OF[lg] = TEAMS; N_OF[lg] = TEAMCARDS.teams.length; CARDS_OF[lg] = TEAMCARDS
}))
// players with a card in their league's scorers film: league → espnId → its card number there (squad tiles link to it)
const SCORER_CARD: Record<string, Record<string, number>> = await import(`../data/scorers-TOP5-${SEASON}.js`)
  .then((m: Dict) => Object.fromEntries(LOAD.map(lg => [lg, Object.fromEntries((m.SCORERS.lists?.[lg] || []).map(([id]: [string], i: number) => [id, i + 1]))]))).catch(() => ({}))
const ppgOf = (t: Dict) => t.played ? t.pts / t.played : -1
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
const logo = (code: string, lg: string) => `logos/${lg === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code}.png`
function lum(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const kindName = (k: string) => k === 'pen' ? 'penalty' : k === 'head' ? 'header' : k === 'fk' ? 'free kick' : k === 'og' ? 'own goal' : 'goal'
const parseMin = (min: string) => { const mm = String(min).match(/(\d+)'?(?:\s*\+\s*(\d+))?/) || []; return { base: +(mm[1] || 0), extra: +(mm[2] || 0) } }

function card(t: Dict) {
  const club = TEAMS_OF[t.lg][t.code] || {}
  const c = club.primary || '#555'
  const light = lum(c) > 0.55
  const ink = light ? '#15181d' : '#fff'
  const c2 = light ? '#15181d' : c
  const hlInk = lum(c) > 0.183 ? '#15181d' : '#fff'
  const gd = t.GF - t.GA
  const photos = (t.panel || []).slice(0, 3)   // three players with a real photo: goals, then assists, then minutes
  const group = photos.length
    ? `<div class="grp">${photos.map((s: Dict, i: number) => `<img class="p${photos.length === 2 && i === 1 ? 2 : i}" src="${s.photo}" alt="${esc(s.name)}">`).join('')}</div>`
    : `<img class="bigcrest" src="${logo(t.code, t.lg)}" alt="">`
  const ppg = t.played ? (t.pts / t.played).toFixed(ALL ? 2 : 1) : '–'
  // all leagues: the rank is across the five and the big number is points per game (the sort key)
  return `<section class="card" id="t-${t.lg}-${t.code}" style="--c:${c};--c2:${c2};--ink:${ink};--hlink:${hlInk};--ph:${PHOTO_H[t.lg]}">
    <div class="pan">
      <img class="wm team" src="${logo(t.code, t.lg)}" alt="" onerror="this.remove()">
      <div class="rk">#${ALL ? t.rank : t.pos ?? '–'}</div>
      <div class="gbig${ALL ? ' ppg' : ''}">${ALL ? `<b>${ppg}</b><span>points per game</span>` : `<b>${t.pts}</b><span>point${t.pts === 1 ? '' : 's'}</span>`}</div>
      ${group}
    </div>
    <div class="body">
      <div>
        <h1 style="--len:${[...club.name || t.code].length};--word:${Math.max(...(club.name || t.code).split(/[\s-]+/).map((w: string) => [...w].length))}">${esc(club.name || t.code)}</h1>
        <div class="meta" style="margin-top:8px">${LEAGUE_NAME[t.lg]} · <b>${t.pos ? ord(t.pos) : '–'}</b> · ${t.W}-${t.D}-${t.L} · GD ${gd >= 0 ? '+' : ''}${gd}${t.scorers[0]?.G ? ` · top scorer <b>${esc(t.scorers[0].name)}</b>` : ''}</div>
      </div>
      <div class="tabs"><button class="tab" data-tab="season">Season</button><button class="tab" data-tab="squad">Squad <span>${(t.squad || []).length}</span></button>${SORTBAR}</div>
      <div class="pane pane-season">
      <div class="nums">
        <div class="n big"><b>${t.pts}</b><span>Points · ${ppg}/game</span></div>
        <div class="n"><b>${t.GF}–${t.GA}</b><span>For–against</span></div>
        <div class="n"><b>${t.cs}</b><span>Clean sheets</span></div>
        <div class="n"><b>${t.avg.poss != null ? Math.round(t.avg.poss) : '–'}%</b><span>Possession</span></div>
        <div class="n" title="season: ${t.matches.reduce((a: number, m: Dict) => a + (m.sot || 0), 0)} on target from ${t.matches.reduce((a: number, m: Dict) => a + (m.sh || 0), 0)} shots in ${t.matches.length} games"><b>${t.avg.sot != null ? Math.round(t.avg.sot) : '–'}/${t.avg.sh != null ? Math.round(t.avg.sh) : '–'}</b><span>On target / shots a game</span></div>
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
    if (!m) return `<div class="c2 tm up" data-gid="${g.id}"><div class="bx"></div><div class="op">${at}${esc(g.opp)}</div></div>`
    const [bg, fg] = RES6[res6(m.gf, m.ga)]
    const veil = Math.round(100 - Math.max(0, Math.min(100, m.poss)))
    const keys = [`m${m.id}`, ...m.for.filter((x: Dict) => x.kind !== 'og').map((x: Dict) => `p${slug(x.by)}`)].join(' ')
    return `<div class="c2 tm" data-h="m${m.id}" data-k="${keys}" data-gid="${g.id}">
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
  // a pile of goals at nearby minutes stacks in lanes, 11px apart; past three lanes they close up so the line never grows taller
  const su = Math.min(11, 33 / nu), sd = Math.min(11, 33 / nd)
  const upH = 6 + nu * su, dnH = 6 + nd * sd
  const dot = (q: Dict, side: string) => {
    const og = q.g.kind === 'og', cls = side === 'for' ? `gd${og ? ' og' : q.g.kind === 'pen' ? ' pen' : q.g.kind === 'head' ? ' head' : q.g.kind === 'fk' ? ' fk' : ''}` : `gd ag${og ? ' og' : ''}`
    const keys = [`m${q.m.id}`, side === 'for' && !og ? `p${slug(q.g.by)}` : ''].filter(Boolean).join(' ')
    const pos = side === 'for' ? `bottom:${dnH + 2 + q.lane * su}px` : `top:${upH + 2 + q.lane * sd}px`
    return `<i class="${cls}" style="left:${(q.x / 93) * 100}%;${pos}" data-h="m${q.m.id}" data-k="${keys}" title="${esc(q.g.min)} ${side === 'for' ? (og ? 'own goal' : `${q.g.by} · ${kindName(q.g.kind)}`) : `conceded${og ? ' (own goal)' : ` · ${q.g.by}`}`} · MD${q.m.w} ${q.m.ha === 'H' ? 'vs' : 'at'} ${esc(q.m.opp)}"></i>`
  }
  const ticks = [0, 15, 30, 45, 60, 75, 90].map(v => `<span style="left:${(v / 93) * 100}%">${v}'</span>`).join('')
  return `<div class="gline" style="--h:${upH + dnH}px"><div class="ax two"><em class="mid" style="top:${upH}px"></em>${up.map((q: Dict) => dot(q, 'for')).join('')}${dn.map((q: Dict) => dot(q, 'against')).join('')}<em class="ht"></em></div><div class="tk">${ticks}</div></div>`
}

// ---------- table position after each matchday (1 at the top), with the top-4 / bottom-3 bands ----------
function posLine(t: Dict, club: Dict) {
  const N = (club.games || []).length || 38
  const x = (md: number) => ((md - 1) / Math.max(1, N - 1)) * 100
  const y = (p: number) => ((p - 1) / Math.max(1, N_OF[t.lg] - 1)) * 100
  // only matchdays the club played: a round still under way (or a postponed game) moves the table without them
  const mOf: Record<number, Dict> = Object.fromEntries(t.matches.map((m: Dict) => [m.w, m]))
  const pts = (t.posPath as number[][]).filter(([md]) => mOf[md])
  const poly = pts.map(([md, p]) => `${x(md)},${y(p)}`).join(' ')
  // each matchday's dot takes that game's result shade (same six as the strip)
  const dots = pts.map(([md, p], i) => {
    const m = mOf[md], last = i === pts.length - 1, d = last ? 12 : 9
    return `<i class="pd" data-h="m${m.id}" data-k="m${m.id}" style="position:absolute;left:${x(md)}%;top:${y(p)}%;width:${d}px;height:${d}px;margin:-${d / 2}px 0 0 -${d / 2}px;border-radius:50%;background:${RES6[res6(m.gf, m.ga)][0]};box-shadow:0 0 0 1.5px #fff" data-gid="${m.id}" data-after="${p}"></i>`
  }).join('')
  // the latest position written beside the last dot (on its left once the line nears the end of the season)
  const [lmd, lp] = pts[pts.length - 1] || [], right = lmd && x(lmd) > 88
  const tag = lmd ? `<span class="plast" style="top:${y(lp)}%;${right ? `right:${100 - x(lmd)}%;margin-right:12px` : `left:${x(lmd)}%;margin-left:12px`}">${ord(lp)}</span>` : ''
  return `<div class="pline"><div class="plot">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
      <rect class="zone" x="0" y="0" width="100" height="${y(4.5)}" fill="#177a41"/><rect class="zone" x="0" y="${y(N_OF[t.lg] - 2.5)}" width="100" height="${100 - y(N_OF[t.lg] - 2.5)}" fill="#b3323a"/>
      ${pts.length > 1 ? `<polyline points="${poly}" fill="none" stroke="#8a9099" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` : ''}
    </svg>${dots}${tag}</div>
    <div class="ax2"><span>MD 1</span><span>1st top · ${N_OF[t.lg]}th bottom</span><span>MD ${N}</span></div></div>`
}

// ---------- the squad as a deck of player tiles (like the NBA team cards): portrait on a wash of the club colour,
// shirt number as a watermark, three stats across the foot; grouped by position, most minutes first ----------
// Squad order, one choice for every card, remembered: role (default) / minutes (most first) / age (youngest first);
// clicking the chosen one again reverses it
const SORT = { k: 'role', rev: false }
try { const v = localStorage.getItem('top5.teams.sort') || ''; if (/^(role|min|age)(-r)?$/.test(v)) { SORT.k = v.replace('-r', ''); SORT.rev = v.endsWith('-r') } } catch { }
// players with no league minute yet: shown (default) or hidden, one choice for every card, remembered
let SHOW0 = true
try { SHOW0 = localStorage.getItem('top5.teams.unused') !== 'hide' } catch { }
const played = (t: Dict) => (t.squad || []).filter((p: Dict) => SHOW0 || p.apps)
const SORTBAR = `<span class="sortby"><button class="u0" title="show or hide the players with no league minutes yet"><i></i>0′ players</button>Order by${[['role', 'Role'], ['min', 'Minutes'], ['age', 'Age']].map(([k, l]) => `<button data-sort="${k}">${l}<i></i></button>`).join('')}</span>`
// "Christian Pulisic" → "C. Pulisic" (a one-word name stays as it is)
const initialName = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : n }
// a tile shows the full name when it fits, else "C. Pulisic", else "Pulisic" (still too long: the ellipsis)
function fitNames() {
  if (TAB !== 'squad') return
  // all writes, then all reads, then the swaps: two layouts in all, not one per name
  const els = [...film.querySelectorAll<HTMLElement>('.pmname span[data-f]')]
  els.forEach(el => { el.textContent = el.dataset.f! })
  const long = els.filter(el => el.scrollWidth > el.clientWidth)
  long.forEach(el => { el.textContent = el.dataset.s! })
  long.filter(el => el.scrollWidth > el.clientWidth).forEach(el => { el.textContent = el.dataset.s!.replace(/^\S\. /, '') })
}
// what the four numbers on a tile are, once, under the deck
const SQKEY = `<div class="sqkey"><span><b>age</b> · minutes · goals · assists</span><span>goalkeepers: <b>age</b> · minutes · saves · goals conceded</span></div>`
const POSN: [string, string, string][] = [['G', 'Goalkeepers', 'GK'], ['D', 'Defenders', 'DEF'], ['M', 'Midfielders', 'MID'], ['F', 'Forwards', 'FWD']]
function squadGrid(t: Dict) {
  const sq: Dict[] = played(t)
  const ini = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('')
  const short = (p: Dict) => POSN.find(x => x[0] === p.pos)?.[2] || ''
  const tile = (p: Dict) => {
    // every tile: its role in the club colour; four numbers without labels, age first (the key is on the tab line)
    const tag = `<b class="grptag">${short(p)}</b>`
    const pills = p.pos === 'G'
      ? [[p.age ?? '–', 'age'], [`${p.min}'`, 'minutes'], [p.SV ?? 0, 'saves'], [p.GA ?? 0, 'goals conceded']]
      : [[p.age ?? '–', 'age'], [`${p.min}'`, 'minutes'], [p.G, 'goals'], [p.A, 'assists']]
    const tip = `${p.name}${p.jersey ? ` · #${p.jersey}` : ''}${p.age ? ` · ${p.age}` : ''}${p.nat ? ` · ${p.nat}` : ''} — ${p.apps ? `${p.apps} games (${p.starts} starts), ${p.min}'` : 'no league minutes yet'}${p.YC ? ` · ${p.YC} yellow` : ''}${p.RC ? ` · ${p.RC} red` : ''}${p.inj ? ` · ${p.inj}` : ''}`
    const sc = SCORER_CARD[t.lg]?.[p.espnId]
    const open = sc ? `<a class="pm${p.apps ? '' : ' unused'} has-card" href="scorers.html?lg=${t.lg}#${sc}" title="${esc(tip)} — open his scorer card">` : `<div class="pm${p.apps ? '' : ' unused'}" title="${esc(tip)}">`
    return `${open}
      <span class="pmshot">${tag}<i class="pmfb">${esc(ini(p.name))}</i>${p.thumb ? `<img src="${p.thumb}" alt="" loading="lazy">` : ''}${p.jersey ? `<b class="pmwm">${esc(p.jersey)}</b>` : ''}${p.inj ? '<i class="inj" title="injured">+</i>' : ''}
        <span class="pmpills">${pills.map(([v, k]) => `<b title="${k}">${v}</b>`).join('')}</span></span>
      <span class="pmname"><span data-f="${esc(p.name)}" data-s="${esc(initialName(p.name))}">${esc(p.name)}</span>${p.RC ? '<i class="rc"></i>' : p.YC ? '<i class="yc"></i>' : ''}${sc ? '<i class="sclink" title="has a scorer card"></i>' : ''}</span>${sc ? '</a>' : '</div>'}`
  }
  // Minutes / Age: one run in that order
  if (SORT.k !== 'role') {
    const v = (p: Dict) => SORT.k === 'min' ? p.min : p.age ?? null
    const dir = (SORT.k === 'min' ? -1 : 1) * (SORT.rev ? -1 : 1)
    const ps = [...sq].sort((a, b) => (v(a) == null ? 1 : v(b) == null ? -1 : (v(a) - v(b)) * dir) || b.min - a.min)
    return `<div class="sq"><div class="deck">${ps.map(tile).join('')}</div></div>${SQKEY}`
  }
  // Role: one continuous run, goalkeepers to forwards, most minutes first within each
  return `<div class="sq"><div class="deck">${POSN.map(([k]) => sq.filter(p => p.pos === k)
    .sort((a, b) => b.min - a.min || b.apps - a.apps || (+a.jersey || 99) - (+b.jersey || 99)).map(tile).join('')).join('')}</div></div>${SQKEY}`
}

// the top three as photo pills, everyone else as one compact line
function scorerChips(t: Dict) {
  const all = t.scorers.filter((s: Dict) => s.G)
  if (!all.length) return '<span class="sc">No goals yet</span>'
  // a scorer also lights up when one of the matches he scored in is hovered
  const inM: Record<string, string[]> = {}
  for (const m of t.matches) for (const g of m.for) if (g.kind !== 'og') (inM[slug(g.by)] ||= []).push(`m${m.id}`)
  const k = (s: Dict) => `data-h="p${slug(s.name)}" data-k="${[`p${slug(s.name)}`, ...new Set(inM[slug(s.name)] || [])].join(' ')}"`
  const thumbOf: Record<string, string> = Object.fromEntries((t.squad || []).filter((p: Dict) => p.thumb).map((p: Dict) => [p.espnId, p.thumb]))
  const top = all.slice(0, 3).map((s: Dict) => `<span class="sc" ${k(s)}>${thumbOf[s.espnId] ? `<img src="${thumbOf[s.espnId]}" alt="">` : '<i class="nophoto"></i>'}${esc(s.name)} <b>${s.G}</b>${s.A ? ` · ${s.A} ast` : ''}</span>`).join('')
  const rest = all.slice(3).map((s: Dict) => `<span class="sc2" ${k(s)}>${esc(s.name)} <b>${s.G}</b></span>`).join('')
  return top + (rest ? `<div class="rest">${rest}</div>` : '')
}

// ---------- the standard card-film chrome ----------
// one league: its table order. All leagues: points per game, then fewer defeats (0-0-4 ahead of 0-0-5), then goal
// difference, then goals scored
const P: Dict[] = ALL
  ? Object.values(CARDS_OF).flatMap(c => c.teams).sort((a, b) => ppgOf(b) - ppgOf(a) || a.L - b.L || (b.GF - b.GA) - (a.GF - a.GA) || b.GF - a.GF)
  : CARDS_OF[LG].teams
P.forEach((t, i) => t.rank = i + 1)
const UPDATED = Math.max(...Object.values(CARDS_OF).map(c => +new Date(c.updated)))
const nameOf = (t: Dict) => TEAMS_OF[t.lg][t.code]?.name || t.code
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map(card).join('')
const lgUrl = (lg: string) => { const q = new URLSearchParams(location.search); q.set('lg', lg); return location.pathname + '?' + q.toString() }
$('lgs').innerHTML = `<a class="lgb all${ALL ? ' on' : ''}" href="${lgUrl('ALL')}" title="All five leagues in one film, ranked by points per game"><b>All Leagues</b></a>` + LG_ORDER.map(lg => `<a class="lgb${lg === LG ? ' on' : ''}${has(lg) ? '' : ' soon'}" data-lg="${lg}" href="${lgUrl(lg)}" title="${LEAGUE_NAME[lg]}${has(lg) ? ' team cards' : ' — coming soon'}"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"></a>`).join('')
$('cnote').innerHTML = `${ALL ? `All ${P.length} clubs of the five leagues, ranked by points per game (then fewer defeats, goal difference, goals scored), so leagues with fewer games compare fairly. It says nothing about how strong each league is` : `${P.length} clubs of ${LEAGUE_NAME[LG]}, in table order`}. Season ${SEASON.replace('-', '/')}, updated ${new Date(UPDATED).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`

const KEY = 'top5.teams.card.' + LG + (SEASON === '2026-27' ? '' : '.' + SEASON)
function onPaint(i: number) {
  const t = P[i]
  $('ctx').innerHTML = ALL
    ? `All Leagues ${SEASON.replace('-', '/')} · by points per game · <b>${esc(nameOf(t))}</b> · ${ppgOf(t) >= 0 ? ppgOf(t).toFixed(2) : '–'} a game, ${t.pos ? ord(t.pos) : '–'} in ${LEAGUE_NAME[t.lg]}`
    : `${LEAGUE_NAME[LG]} ${SEASON.replace('-', '/')} · <b>${esc(nameOf(t))}</b> · ${t.pos ? ord(t.pos) : '–'}, ${t.pts} pts`
  if (ALL) $('lgs').querySelectorAll<HTMLElement>('.lgb[data-lg]').forEach(b => b.classList.toggle('cur', b.dataset.lg === t.lg))   // mark this card's league
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[t.lg]); meta('title', `${nameOf(t)} · ${ALL ? `${ppgOf(t).toFixed(2)} pts/game · top-5 leagues` : `${t.pts} pts · ${LEAGUE_NAME[LG]}`}`)
}

// search: a club, or any of its scorers; a number jumps to that card
const INDEX = P.map((t, i) => ({ i, label: nameOf(t), sub: ALL ? `${LEAGUE_NAME[t.lg]} ${t.pos ? ord(t.pos) : '–'} · ${ppgOf(t) >= 0 ? ppgOf(t).toFixed(2) : '–'}/game` : `${t.pos ? ord(t.pos) : '–'} · ${t.pts} pts`,
  key: [nameOf(t), t.code, LEAGUE_NAME[t.lg], ...t.scorers.map((s: Dict) => s.name)].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }))
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  return hits.length ? `<div class="jsec"><div class="jsechd">${ALL ? 'All Leagues' : `<img src="leagues/${LG}.png" alt="">${LEAGUE_NAME[LG]}`}<span>${hits.length}</span></div><div class="jgrid">${hits.map(x =>
    `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` : '<p>No club matches.</p>'
}

// Season | Squad tab: one choice for every card, remembered
let TAB = 'season'
try { TAB = localStorage.getItem('top5.teams.tab') === 'squad' ? 'squad' : 'season' } catch { }
const setTab = (t: string) => {
  TAB = t; document.body.classList.toggle('tab-squad', t === 'squad')
  film.querySelectorAll<HTMLElement>('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t))
  try { localStorage.setItem('top5.teams.tab', t) } catch { }
  sizeDeck()
}
// Squad tab: one tile size for every club in the film, the size at which the biggest squad fills the space under
// the header (on phones the card scrolls and the tiles keep their own size)
let NMAX = 0
const GAP = 7, RATIO = 1.42, MIN_W = 86
function sizeDeck() {
  const on = TAB === 'squad' && innerWidth > 760
  NMAX = Math.max(1, ...P.map(t => played(t).length))
  film.classList.toggle('fit', false)
  if (!on) return
  const boxes = [...film.querySelectorAll<HTMLElement>('.sq')].map(e => [e.clientWidth - 4, e.clientHeight - 6])
  const W = Math.min(...boxes.map(b => b[0])), H = Math.min(...boxes.map(b => b[1]))
  // for each column count, the biggest tile that fits, its shape kept between 1 : 1.1 and 1 : 1.9 (so it can stretch
  // to fill the height or the width); the column count with the biggest tiles wins
  let pick = [1, 0, 0, 0]
  for (let c = 1; c <= NMAX; c++) {
    const rows = Math.ceil(NMAX / c), wMax = (W - (c - 1) * GAP) / c, hMax = (H - (rows - 1) * GAP) / rows
    const w = Math.min(wMax, hMax / 1.1), h = Math.min(hMax, w * 1.9)
    if (w >= MIN_W && w * h > pick[3]) pick = [c, w, h, w * h]   // never below a readable width
  }
  if (pick[1] < MIN_W) {   // too small to read: tiles of at least MIN_W across the width, and the biggest squads scroll
    const c = Math.max(1, Math.floor((W + GAP) / (MIN_W + GAP))), w = (W - (c - 1) * GAP) / c
    pick = [c, w, w * RATIO, 0]
  }
  film.style.setProperty('--cols', String(pick[0])); film.style.setProperty('--tw', Math.floor(pick[1]) + 'px'); film.style.setProperty('--th', Math.floor(pick[2]) + 'px')
  film.style.setProperty('--k', String(Math.min(1.5, Math.max(1, pick[1] / 100))))   // text grows with the tile on big screens
  film.classList.toggle('fit', true)
  fitNames()
}
let rz: number | undefined
addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(sizeDeck, 120) })
const markSort = () => film.querySelectorAll<HTMLElement>('.sortby button[data-sort]').forEach(b => {
  b.classList.toggle('on', b.dataset.sort === SORT.k)
  b.querySelector('i')!.textContent = b.dataset.sort === SORT.k && SORT.k !== 'role' ? ((SORT.k === 'min') !== SORT.rev ? ' ↓' : ' ↑') : ''
})
function setShow0(v: boolean) {
  SHOW0 = v
  try { localStorage.setItem('top5.teams.unused', v ? 'show' : 'hide') } catch { }
  film.querySelectorAll<HTMLElement>('.pane-squad').forEach((el, i) => el.innerHTML = squadGrid(P[i]))
  markSort(); sizeDeck()
}
function setSort(k: string) {
  SORT.rev = k === SORT.k && k !== 'role' ? !SORT.rev : false; SORT.k = k
  try { localStorage.setItem('top5.teams.sort', k + (SORT.rev ? '-r' : '')) } catch { }
  film.querySelectorAll<HTMLElement>('.pane-squad').forEach((el, i) => el.innerHTML = squadGrid(P[i]))
  markSort(); fitNames()
}
const markShow0 = () => film.querySelectorAll('.u0').forEach(b => b.classList.toggle('on', SHOW0))
markSort(); markShow0()
film.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.sortby button'); if (!b) return
  if (b.classList.contains('u0')) { setShow0(!SHOW0); markShow0() } else setSort(b.dataset.sort!)
})
setTab(TAB)
film.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.tab'); if (b) setTab(b.dataset.tab!) })
addEventListener('keydown', e => { if (e.key === 't' && !document.querySelector('.mod.on') && !e.metaKey && !e.ctrlKey) setTab(TAB === 'squad' ? 'season' : 'squad') })

// hover / tap a match, a goal or a scorer: everything sharing its key lights up in the club colour, the rest dims
initHighlight(film, '[data-h]', k => `[data-k~="${k}"]`, el => el.dataset.h!)

// ---------- match card on hover / tap: a match box or a position dot ----------
const tipEl = document.createElement('div'); tipEl.id = 'mtip'; document.body.appendChild(tipEl)
const KIND: Record<string, string> = { pen: 'pen', head: 'header', fk: 'free kick', og: 'own goal' }
const surname = (n: string) => n.split(/\s+/).length > 1 ? n.split(/\s+/).slice(1).join(' ') : n
function matchTip(t: Dict, gid: string, after?: string) {
  const club = TEAMS_OF[t.lg][t.code] || {}, g = (club.games || []).find((x: Dict) => x.id === gid), m = t.matches.find((x: Dict) => x.id === gid)
  if (!g) return ''
  const opp = TEAMS_OF[t.lg][g.opp] || {}, when = g.et ? new Date(g.et.replace(' ', 'T')) : null
  // fixture times are CET, as in the tower; a small-hours time is a placeholder for a kick-off not fixed yet
  const hh = g.et ? g.et.slice(11, 16) : '', tbc = !hh || +hh.slice(0, 2) < 6
  const date = when ? when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + (m || tbc ? '' : ` · ${hh} CET`) : ''
  const side = (code: string, name: string, lg: string) => `<span class="mt-team"><img src="${logo(code, lg)}" alt="">${esc(name)}</span>`
  const home = g.ha === 'H' ? [t.code, club.name] : [g.opp, opp.name || g.oppFull || g.opp], away = g.ha === 'H' ? [g.opp, opp.name || g.oppFull || g.opp] : [t.code, club.name]
  const head = `<div class="mt-top">MD ${g.w}${date ? ` · ${date}` : ''} · ${g.ha === 'H' ? 'home' : 'away'}${after ? ` · ${ord(+after)} after it` : ''}</div>`
  if (!m) return `${head}<div class="mt-score">${side(home[0], home[1], t.lg)}<b class="mt-vs">vs</b>${side(away[0], away[1], t.lg)}</div><div class="mt-foot">to play</div>`
  const [bg, fg] = RES6[res6(m.gf, m.ga)], hs = g.ha === 'H' ? `${m.gf}–${m.ga}` : `${m.ga}–${m.gf}`
  const goal = (x: Dict, ours: boolean) => `<div class="mt-g${ours ? '' : ' ag'}"><span class="mt-min">${esc(x.min)}</span><span>${x.kind === 'og' ? (ours ? 'own goal' : `${esc(surname(x.by || ''))} (own goal)`) : esc(x.by)}${x.kind && x.kind !== 'og' ? ` <em>${KIND[x.kind] || x.kind}</em>` : ''}${ours && x.ast ? ` <i>· ${esc(surname(x.ast))}</i>` : ''}</span></div>`
  const goals: [Dict, boolean][] = [...m.for.map((x: Dict) => [x, true]), ...m.against.map((x: Dict) => [x, false])]
  goals.sort((a, b) => { const p = parseMin(a[0].min), q = parseMin(b[0].min); return p.base - q.base || p.extra - q.extra })
  return `${head}
    <div class="mt-score">${side(home[0], home[1], t.lg)}<b class="mt-res" style="background:${bg};color:${fg}">${hs}</b>${side(away[0], away[1], t.lg)}</div>
    ${goals.length ? `<div class="mt-goals">${goals.map(([x, o]) => goal(x, o)).join('')}</div>` : ''}
    <div class="mt-poss"><span>possession</span><div class="mt-bar"><i style="width:${m.poss}%"></i></div><b>${Math.round(m.poss)}%</b></div>
    <div class="mt-stats"><span><b>${m.sh}</b> shots</span><span><b>${m.sot}</b> on target</span><span><b>${m.pass}%</b> passing</span><span><b>${m.cor}</b> corners</span>${m.yc || m.rc ? `<span><b>${m.yc}</b><i class="yc"></i>${m.rc ? ` <b>${m.rc}</b><i class="rc"></i>` : ''}</span>` : ''}</div>`
}
let tipFor: HTMLElement | null = null
function showTip(el: HTMLElement) {
  const card = el.closest<HTMLElement>('.card'); if (!card) return
  const t = P[[...film.children].indexOf(card)]; const html = matchTip(t, el.dataset.gid!, el.dataset.after); if (!html) return
  tipFor = el; tipEl.innerHTML = html; tipEl.style.setProperty('--c', getComputedStyle(card).getPropertyValue('--c')); tipEl.classList.add('on')
  const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))
  const y = r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'
}
const hideTip = () => { tipFor = null; tipEl.classList.remove('on') }
film.addEventListener('mouseover', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-gid]'); if (el) { if (el !== tipFor) showTip(el) } else if (tipFor) hideTip() })
film.addEventListener('mouseleave', hideTip)
film.addEventListener('click', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-gid]'); if (el) showTip(el); else hideTip() })
film.addEventListener('scroll', hideTip, { passive: true })
initFilm({ count: P.length, key: KEY, onPaint, jumpHTML, self: 'teams.html' })
