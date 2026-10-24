// Team-card film: one full-screen card per club, in table order, one league at a time (?lg=ITA …),
// or all five leagues in one film ranked by points per game (?lg=ALL), so leagues of 18 and 20 clubs compare fairly.
// Data: src/data/teams-<LG>-<season>.js (built + verified by scripts/update-teams.mjs); club colours/names from the schedule.
import '../film/film.css'
import { initFilm, initHighlight, initTip, initLinks, initNav } from '../film/chrome'
import { loadCoaches, coachChip } from '../film/coach'
import { rowsOf } from '../film/pitch'
import { upBox } from '../film/cards'
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
const TEAMS_OF: Record<string, Dict> = {}, N_OF: Record<string, number> = {}, CARDS_OF: Record<string, Dict> = {}, COACHES_OF: Record<string, Dict | null> = {}
await Promise.all(LOAD.map(async lg => {
  const [{ TEAMCARDS }, { TEAMS }] = await Promise.all([FILES[`../data/teams-${lg}-${SEASON}.js`](), import(`../data/schedule-${lg}-${SEASON}.js`)]) as Dict[]
  TEAMCARDS.teams.forEach((t: Dict) => t.lg = lg)
  TEAMS_OF[lg] = TEAMS; N_OF[lg] = TEAMCARDS.teams.length; CARDS_OF[lg] = TEAMCARDS
  COACHES_OF[lg] = SEASON === '2026-27' ? await loadCoaches(lg, SEASON) : null
}))
const ppgOf = (t: Dict) => t.played ? t.pts / t.played : -1
// the league photo shoots frame differently (LaLiga / Ligue 1 waist-up, the rest chest-up)
const PHOTO_H: Record<string, string> = { ESP: '82%', FRA: '80%', ITA: '76%', ENG: '74%', GER: '74%' }

// same six result shades as the towers / barcode / scorer cards
const RES6: Record<string, [string, string]> = {
  // white scores on every shade (one look across the app)
  bigW: ['#177a41', '#fff'], W1: ['#3a9e62', '#fff'], D: ['#EAB308', '#fff'],
  nil: ['#9aa0a8', '#fff'], L1: ['#dc5c5e', '#fff'], bigL: ['#b3323a', '#fff'],
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
    ? `<div class="grp">${photos.map((s: Dict, i: number) => `<img class="p${photos.length === 2 && i === 1 ? 2 : i}" src="${s.photo}" alt="${esc(s.name)}" data-href="player.html?lg=${t.lg}&team=${t.code}&p=${s.espnId}" title="${esc(s.name)} · his card">`).join('')}${photos.map((s: Dict, i: number) => {
        // a label at each player's feet: the leader's full name in the middle, the two beside him by surname
        // (first name dropped: "De Bruyne", not "Bruyne"), pinned to the panel's edges; hidden where space is short
        const side = i > 0, nm = side && /\s/.test(s.name) ? s.name.replace(/^\S+\s+/, '') : s.name
        return `<span class="plab l${photos.length === 2 && i === 1 ? 2 : i}" data-href="player.html?lg=${t.lg}&team=${t.code}&p=${s.espnId}">${esc(nm)}</span>` }).join('')}</div>`
    : `<img class="bigcrest" src="${logo(t.code, t.lg)}" alt="">`
  const ppg = t.played ? (t.pts / t.played).toFixed(ALL ? 2 : 1) : '–'
  // all leagues: the rank is across the five and the big number is points per game (the sort key)
  return `<section class="card" id="t-${t.lg}-${t.code}" style="--c:${c};--c2:${c2};--ink:${ink};--hlink:${hlInk};--ph:${PHOTO_H[t.lg]}">
    <div class="pan">
      <img class="wm team" src="${logo(t.code, t.lg)}" alt="" onerror="this.remove()">
      <div class="rk">#${ALL ? t.rank : t.pos ?? '–'}</div>
      <div class="wdl"><span><b>${t.W}</b>–<b>${t.D}</b>–<b>${t.L}</b></span><span class="wl">W – D – L</span>${(g => g.n ? `<span class="gs1p" title="Minutes leading / level / trailing"><i style="--a:${g.lead * 100}%;--b:${(g.lead + g.level) * 100}%"></i><span><span><s></s>led <b>${pc(g.lead)}%</b></span><span><s style="opacity:.45"></s>level <b>${pc(g.level)}%</b></span><span><s style="opacity:.18"></s>behind <b>${pc(g.trail)}%</b></span></span></span>` : '')(gameState(t))}</div>
      <div class="gbig${ALL ? ' ppg' : ''}">${ALL ? `<b>${ppg}</b><span>points per game</span>` : `<b>${t.pts}</b><span>point${t.pts === 1 ? '' : 's'}</span>`}</div>
      ${group}
    </div>
    <div class="body">
      <div>
        <h1 style="--len:${[...club.name || t.code].length};--word:${Math.max(...(club.name || t.code).split(/[\s-]+/).map((w: string) => [...w].length))}">${esc(club.name || t.code)}</h1>
        <div class="meta" style="margin-top:8px">${LEAGUE_NAME[t.lg]} · <b>${t.pos ? ord(t.pos) : '–'}</b> · ${t.W}-${t.D}-${t.L} · GD ${gd >= 0 ? '+' : ''}${gd}${topScorers(t)}</div>
        ${coachChip(COACHES_OF[t.lg], t.lg, t.code, playedOf(t, club))}
      </div>
      <div class="tabs"><button class="tab" data-tab="season">Season</button><button class="tab" data-tab="squad">Squad <span>${(t.squad || []).length}</span></button>${SEASON === '2026-27' ? '<button class="tab" data-tab="tac">Tactical</button><button class="tab" data-tab="goals">Goals</button>' : ''}<button class="tab" data-tab="rivals">Rivals</button>${SORTBAR}</div>
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
      <div class="pane pane-tac"></div>
      <div class="pane pane-goals"></div>
      <div class="pane pane-rivals"></div>
    </div>
  </section>`
}

// the meta line's top scorer and his goals ("top scorer A · 3 goals"); every player tied on the most ("top scorers A, B and C · 2 goals each"), a count past three
function topScorers(t: Dict) {
  const top = t.scorers[0]?.G; if (!top) return ''
  // each name opens his card in the club's squad film
  const names = t.scorers.filter((s: Dict) => s.G === top).map((s: Dict) => `<b class="plk" data-href="player.html?lg=${t.lg}&team=${t.code}&p=${s.espnId}" title="${esc(s.name)} · his card">${esc(s.name)}</b>`)
  if (names.length > 3) return ` · top scorers: <b>${names.length}</b> players on ${top} goal${top === 1 ? '' : 's'} each`   // a long tie: the Scorers section lists them
  return names.length === 1 ? ` · top scorer ${names[0]} · ${top} goal${top === 1 ? '' : 's'}` : ` · top scorers ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} · ${top} goal${top === 1 ? '' : 's'} each`
}
// the club's played games as the coach helpers read them ({ md, opp, ha, gf, ga })
function playedOf(t: Dict, club: Dict) {
  const byId: Record<string, Dict> = Object.fromEntries(t.matches.map((m: Dict) => [m.id, m]))
  return (club.games || []).filter((g: Dict) => byId[g.id]).map((g: Dict) => ({ md: g.w, opp: g.opp, ha: g.ha, gf: byId[g.id].gf, ga: byId[g.id].ga }))
}

// ---------- Tactical tab: every league game's starting XI on a half pitch, newest first, the bench under it ----------
// the match reports load only when the tab first opens (a league's at a time)
const MATCH_FILES = import.meta.glob('../data/matches-*-*-md*.js')
const RECS: Record<string, Promise<Dict[]>> = {}
const recsOf = (lg: string) => RECS[lg] ??= Promise.all(Object.keys(MATCH_FILES).filter(f => f.includes(`/matches-${lg}-${SEASON}-md`)).map(f => MATCH_FILES[f]()))
  .then(fs => (fs as Dict[]).flatMap(f => f.MATCHES))
const surnameOf = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 1 ? w.slice(1).join(' ') : n }
function tacPitch(t: Dict, M: Dict) {
  const me = M.h === t.code ? 'home' : 'away', T = M[me], opp = M[me === 'home' ? 'a' : 'h'], gf = M.score[me === 'home' ? 'h' : 'a'], ga = M.score[me === 'home' ? 'a' : 'h']
  const c = TEAMS_OF[t.lg][t.code]?.primary || '#555', ink = lum(c) > 0.55 ? '#15181d' : '#fff', ring = lum(c) > 0.75 ? '#c9ced4' : 'rgba(255,255,255,.9)'
  const rows = rowsOf(T), n = rows.length
  // a row of four or more: every other name drops a line, so neighbours' names can't run into each other
  // and a long surname there keeps its last word only ("Holmgren Pedersen" → "Pedersen"; "de Roon" stays whole)
  const label = (n: string, crowded: boolean) => { const s = surnameOf(n); return crowded && s.length > 10 && /\s/.test(s) ? s.split(/\s+/).pop()! : s }
  // every player (pitch or bench) carries his id: hover lights him up in every game, a click opens his card
  const pa = (id: unknown, name: string) => ` data-p="${id}" data-href="player.html?lg=${t.lg}&team=${t.code}&p=${id}" title="${esc(name)} · his card"`
  const dot = (p: Dict, x: number, y: number, crowded = false, low = false) => `<div class="tp${low ? ' lo' : ''}"${pa(p.id, p.name)} style="left:${x}%;top:${y}%"><i style="background:${c};color:${ink};box-shadow:0 0 0 1.5px ${ring}">${esc(p.n || '')}</i><span>${esc(label(p.name, crowded))}</span></div>`
  const xi = rows.map((r, i) => r.map((p, j) => dot(p, (j + 1) / (r.length + 1) * 100, 90 - i * (80 / Math.max(1, n - 1)), r.length >= 4, r.length >= 4 && j % 2 === 1))).flat().join('')
  // the bench: who came on (minute, for whom), then the unused substitutes — numbers from the squad list
  const jersey: Record<string, string> = Object.fromEntries((t.squad || []).map((p: Dict) => [String(p.espnId), p.jersey]))
  const subs = (M.subs as Dict[]).filter(s => T.players.some((p: Dict) => String(p.id) === String(s.on)))
  const byId = (id: string) => T.players.find((p: Dict) => String(p.id) === String(id))
  const used = subs.map(s => { const on = byId(s.on), off = byId(s.off)
    return `<div class="tkr"${on ? pa(on.id, on.name) : ''}><i style="background:${c};color:${ink}">${esc(on?.n || '')}</i><b>${esc(surnameOf(on?.name || ''))}</b><em>${esc(s.min)}${off ? ` for ${esc(surnameOf(off.name))}` : ''}</em></div>` }).join('')
  const unused = (T.bench || []).map(([id, nm]: string[]) => `<div class="tkr un"${pa(id, nm)}><i>${esc(jersey[String(id)] || '')}</i><b>${esc(surnameOf(nm))}</b></div>`).join('')
  return `<div class="tac" data-mid="${M.id}">
    <div class="th"${matchHref(t.lg, M.md, M.id)} title="the match card"><b>MD ${M.md}</b> ${M.h === t.code ? 'vs' : 'at'} ${esc(opp)} <span class="rs" style="background:${RES6[res6(gf, ga)][0]}">${gf}-${ga}</span><em>${esc(T.form || '')}</em></div>
    <div class="tpitch">${xi}</div>
    <div class="tkb">${used}${unused}${!used && !unused ? '<span class="none">no bench in the report</span>' : ''}</div>
  </div>`
}
// the arrows: two games a click, each hidden at its end of the row
function tacArrows(s: HTMLElement) {
  const w = s.parentElement!
  w.querySelector('.tsc.l')!.classList.toggle('off', s.scrollLeft < 4)
  w.querySelector('.tsc.r')!.classList.toggle('off', s.scrollLeft + s.clientWidth > s.scrollWidth - 4)
}
function initTacArrows() {
  // hover a player: him in every game of the club, everyone else faded
  film.addEventListener('mouseover', e => {
    const t = e.target as HTMLElement, tacs = t.closest<HTMLElement>('.tacs')
    film.querySelectorAll('.tacs.pon').forEach(x => { if (x !== tacs) { x.classList.remove('pon'); x.querySelectorAll('.on').forEach(o => o.classList.remove('on')) } })
    if (!tacs) return
    const el = t.closest<HTMLElement>('[data-p]')
    tacs.querySelectorAll('.on').forEach(o => o.classList.remove('on'))
    tacs.classList.toggle('pon', !!el)
    if (el) tacs.querySelectorAll(`[data-p="${el.dataset.p}"]`).forEach(o => o.classList.add('on'))
  })
  film.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.tsc'); if (!b) return
    const s = b.parentElement!.querySelector<HTMLElement>('.tacs')!, step = (s.querySelector<HTMLElement>('.tac')?.offsetWidth || 228) + 14
    s.scrollBy({ left: +b.dataset.dir! * step * 2, behavior: 'smooth' })
  })
  addEventListener('resize', () => film.querySelectorAll<HTMLElement>('.tacs').forEach(tacArrows))
}
let tacBusy = false
async function fillTactics() {
  if (tacBusy) return; tacBusy = true
  const panes = [...film.querySelectorAll<HTMLElement>('.pane-tac')]
  for (const lg of [...new Set(P.map(t => t.lg))]) {
    const recs = await recsOf(lg)
    P.forEach((t, i) => { if (t.lg !== lg || panes[i].dataset.done) return
      const ms = recs.filter(M => M.h === t.code || M.a === t.code).sort((a, b) => b.md - a.md)
      panes[i].innerHTML = ms.length ? `<div class="tacw"><div class="tacs">${ms.map(M => tacPitch(t, M)).join('')}</div>
        <button class="tsc l" data-dir="-1" title="Later games" aria-label="Scroll left">‹</button><button class="tsc r" data-dir="1" title="Earlier games" aria-label="Scroll right">›</button></div>` : '<p class="none">No match reports yet.</p>'
      panes[i].dataset.done = '1'
      const s = panes[i].querySelector<HTMLElement>('.tacs'); if (s) { s.addEventListener('scroll', () => tacArrows(s), { passive: true }); requestAnimationFrame(() => tacArrows(s)) } })
  }
  tacBusy = false
}

// ---------- Goals tab: where the goals went in (the goal, from the shooter's side) over where every shot came from ----------
// scored | conceded, side by side; the shot map comes from FotMob (scripts/update-shots.mjs), loaded when the tab opens
const SHOT_FILES = import.meta.glob('../data/shots-*.js')
const SHOTS: Record<string, Promise<Dict>> = {}
const shotsOf = (lg: string) => SHOTS[lg] ??= (SHOT_FILES[`../data/shots-${lg}-${SEASON}.js`]?.() ?? Promise.resolve({ SHOTS: {} })).then(m => (m as Dict).SHOTS || {})
const SIT: Record<string, string> = { o: 'open play', c: 'counter-attack', s: 'set piece', k: 'corner', f: 'free kick', p: 'penalty', t: 'throw-in' }
const BODY: Record<string, string> = { r: 'right foot', l: 'left foot', h: 'header', x: '' }
const GTIPS = new Map<string, string>()   // a goal's hover card, by its key
// the 15-minute spell of a goal's minute (the shot map writes 45+2 as 45.02): stoppage time is its own spell
const WHEN = ['1–15', '16–30', '31–45', '45+', '46–60', '61–75', '76–90', '90+']
const whenOf = (m: number) => { const base = Math.floor(m), extra = Math.round((m - base) * 100)
  return base >= 90 && extra ? '90+' : base >= 45 && base < 46 && extra ? '45+' : base <= 15 ? '1–15' : base <= 30 ? '16–30' : base <= 45 ? '31–45' : base <= 60 ? '46–60' : base <= 75 ? '61–75' : base <= 90 ? '76–90' : '90+' }
const GROW = new Map<string, string>(), GV = new Map<string, Dict>()   // a grouped goal's row in the list card, and its filter values
// the list card of a group of goals from one spot: every goal (the ones the filters leave), a row each — the first six on
// hover, all of them once pinned (a click), each row opening its match card
function stackTip(el: HTMLElement) {
  const keys = (el.dataset.vis ?? el.dataset.gs!).split(' ').filter(Boolean), pinned = document.getElementById('mtip')?.classList.contains('pinned')
  const rows = pinned ? keys : keys.slice(0, 6)
  return `<div class="mt-top">${keys.length} goals from this spot${el.dataset.sit === 'penalty' ? ' · penalties' : ''}</div><div class="gsl">${rows.map(k => GROW.get(k)).join('')}</div>
    <div class="gsm">${!pinned && keys.length > 6 ? `+${keys.length - 6} more · ` : ''}${pinned ? 'click a goal for its match · Esc or click outside to close' : 'click the dot to keep this open'}</div>`
}
// every squad photo of the clubs in this film, by player: the scorer's cutout on a goal's card (an opponent's too)
let THUMBS: Record<string, string> | null = null
const squadThumb = (id: string) => (THUMBS ??= Object.fromEntries(P.flatMap((t: Dict) => (t.squad || []).filter((p: Dict) => p.thumb).map((p: Dict) => [String(p.espnId), p.thumb]))))[id]
function goalsPane(t: Dict, club: Dict, recs: Dict[], S: Dict) {
  const games: Record<string, Dict> = Object.fromEntries((club.games || []).map((g: Dict) => [g.id, g])), recBy: Record<string, Dict> = Object.fromEntries(recs.map(M => [M.id, M]))
  const F: Dict[] = [], A: Dict[] = []
  // the scorer's role in his club's squad (goals scored: always this club's players)
  const ROLE: Record<string, string> = { G: 'goalkeepers', D: 'defenders', M: 'midfielders', F: 'forwards' }, role: Record<string, string> = Object.fromEntries((t.squad || []).map((p: Dict) => [String(p.espnId), ROLE[p.pos] || '']))
  for (const m of t.matches as Dict[]) {
    const M = recBy[m.id], rows = S[m.id] as any[][] | undefined, g = games[m.id]; if (!M || !rows || !g) continue
    const side = M.h === t.code ? 'h' : 'a'
    rows.forEach((r, i) => { if (r[5] === 'og') return
      const T = r[0] === 'h' ? M.home : M.away, p = (T.players as Dict[]).find(x => String(x.id) === r[8])
      const sh = { pid: String(r[8] || ''), by: p ? (p.st ? 'starters' : 'off the bench') : '', role: role[String(r[8])] || '', key: `${t.code}-${m.id}-${i}`,   // the club in the key: both clubs' tabs draw the same match
         md: g.w, opp: g.opp, ha: g.ha, gf: m.gf, ga: m.ga, mid: m.id, side: r[0], min: r[1], x: r[2], y: r[3], xg: r[4], out: r[5], sit: r[6], body: r[7], name: p?.name || '', gx: r[9], gy: r[10],
        ast: r[5] === 'g' ? (M.goals as Dict[]).find(q => q.s === r[0] && String(q.byId) === r[8] && Math.abs(parseInt(q.min) - Math.floor(r[1])) <= 1)?.ast : null }
      ;(r[0] === side ? F : A).push(sh)
      // the goal's card: the scorer's cutout (his club's squad photo) on the left, then the game, his name, the
      // minute, xG and distance, and how it came
      if (r[5] === 'g') { const ph = squadThumb(r[8]), dist = Math.round(Math.hypot(105 - r[2], 34 - r[3]))
        // the keeper beaten: the other side's starting keeper, or whoever replaced him before that minute
        const D = r[0] === 'h' ? M.away : M.home, gk0 = (D.players as Dict[]).find(x => x.st && x.pos === 'G')
        const swap = gk0 && (M.subs as Dict[]).find(x => String(x.off) === String(gk0.id) && parseInt(x.min) <= r[1])
        const gk = swap ? (D.players as Dict[]).find(x => String(x.id) === String(swap.on)) : gk0, gph = gk && squadThumb(String(gk.id))
        GTIPS.set(sh.key, `<div class="gtip">${ph ? `<img src="${ph}" alt="" onerror="this.style.visibility='hidden'">` : `<i>${esc((sh.name || '?').split(/\s+/).map((w: string) => w[0]).slice(0, 2).join(''))}</i>`}
          <div><div class="mt-top">MD ${g.w} · ${g.ha === 'H' ? 'vs' : 'at'} ${esc(g.opp)} · ${m.gf}-${m.ga}</div><div class="gtn">${esc(sh.name || '?')}</div>
          <div class="gtk"><span><b>${Math.floor(r[1])}′</b>minute</span><span><b>${r[4].toFixed(2)}</b>xG · a ${Math.max(1, Math.round(r[4] * 100))}% chance</span><span><b>${dist} m</b>out</span></div>
          <div class="gts">${[SIT[r[6]], BODY[r[7]], sh.ast && `assist <b>${esc(sh.ast)}</b>`].filter(Boolean).join(' · ')}</div></div>
          ${gk ? `<div class="gtgk">${gph ? `<img src="${gph}" alt="" onerror="this.style.visibility='hidden'">` : ''}<span>${esc(gk.name.split(' ').slice(1).join(' ') || gk.name)}</span><em>in goal</em></div>` : '<span></span>'}</div>`) }
    })
  }
  if (!F.length && !A.length) return '<p class="none">No shot maps yet.</p>'
  const href = (s: Dict) => ` data-href="matches.html?lg=${t.lg}&md=${s.md}&m=${s.mid}"`
  // a goal's three filter values (the side column's bars): how it came, with what, from where
  const inBox = (s: Dict) => s.x >= 88.5 && s.y >= 13.84 && s.y <= 54.16
  // goals from (nearly) one spot: grouped, each group's members within 1.2 m of its first
  const groups = (G: Dict[]) => { const out: Dict[][] = []; for (const g of G) { const k = out.find(o => Math.hypot(o[0].x - g.x, o[0].y - g.y) <= 1.2); k ? k.push(g) : out.push([g]) } return out }
  const fv = (s: Dict) => ` data-how="${SIT[s.sit] || 'other'}" data-with="${BODY[s.body] || ''}" data-from="${inBox(s) ? 'inside the box' : 'outside'}" data-when="${whenOf(s.min)}" data-by="${s.by}" data-role="${s.role}" data-who="${s.pid}"`
  // the half pitch, attacking up (68 wide, the 35 m in front of the goal): ● a goal · ○ saved · × the rest. FotMob's y
  // runs from the shooter's RIGHT (checked against ESPN's "left / right side of the box": 1,453 to 4), so x = 68 − y
  const pitch = (L: Dict[], fill: string) => `<svg class="gp" viewBox="0 -1 68 36"><rect x="0" y="0" width="68" height="35" rx=".8" fill="#e8eee8"/><g fill="none" stroke="#fff" stroke-width=".4"><rect x="13.84" y="0" width="40.32" height="16.5"/><rect x="24.84" y="0" width="18.32" height="5.5"/><path d="M26.7 16.5a9.15 9.15 0 0 0 14.6 0"/></g><rect x="30.34" y="-1" width="7.32" height="1" fill="#15181d"/>
    ${L.filter(s => s.x >= 70 && s.out !== 'g').map(s => s.out === 's' ? `<circle cx="${68 - s.y}" cy="${105 - s.x}" r=".55" fill="#fff" style="stroke:${fill}" stroke-width=".3" opacity=".6"/>` : `<path d="M${68 - s.y - .45} ${105 - s.x - .45}l.9 .9m0-.9l-.9 .9" stroke="#9aa0a8" stroke-width=".25" opacity=".55"/>`).join('')}
    ${groups(L.filter(s => s.out === 'g')).map(G => { const s = G[0], cx = 68 - s.y, cy = Math.min(33.8, Math.max(1.3, 105 - s.x))
      if (G.length === 1) return `<circle class="gm" data-gk="${s.key}"${href(s)}${fv(s)} cx="${cx}" cy="${cy}" r="1.2" style="fill:${fill}" stroke="#fff" stroke-width=".3"/>`
      // several goals from one spot (every penalty, tap-ins): one dot with the count; hover lists them, click pins the list
      for (const g of G) { GV.set(g.key, { how: SIT[g.sit] || 'other', with: BODY[g.body] || '', from: inBox(g) ? 'inside the box' : 'outside', when: whenOf(g.min), by: g.by, role: g.role, who: g.pid })
        GROW.set(g.key, `<a class="gsr" href="matches.html?lg=${t.lg}&md=${g.md}&m=${g.mid}"><b>${Math.floor(g.min)}′</b><span>MD ${g.md} · ${g.ha === 'H' ? 'vs' : 'at'} ${esc(g.opp)} ${g.gf}-${g.ga}</span><span class="nm">${esc(g.name || '?')}</span><em>${g.xg.toFixed(2)} xG</em></a>`) }
      return `<g class="gm gst" data-gs="${G.map(g => g.key).join(' ')}" data-sit="${esc(SIT[s.sit] || '')}"><circle cx="${cx}" cy="${cy}" r="1.6" style="fill:${fill}" stroke="#fff" stroke-width=".3"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="900">${G.length}</text></g>` }).join('')}</svg>`
  // the goal, from the shooter's side: posts at 0 and 2, the bar at .667 from the ground — goals only
  const frame = (L: Dict[], fill: string) => `<svg class="gf" viewBox="0 0 116 40"><rect x="8" y="4" width="100" height="33.3" fill="url(#gnet)"/><path d="M8 37.3V4H108V37.3" fill="none" stroke="#15181d" stroke-width="1.8" stroke-linejoin="round"/><line x1="0" x2="116" y1="37.3" y2="37.3" stroke="#c9ced4" stroke-width=".6"/>
    ${L.filter(s => s.out === 'g' && s.gx != null).map(s => `<circle class="gm" data-gk="${s.key}"${href(s)}${fv(s)} cx="${(8 + s.gx * 50).toFixed(1)}" cy="${(4 + (.6667 - s.gy) * 50).toFixed(1)}" r="2.2" style="fill:${fill}" stroke="#fff" stroke-width=".8"/>`).join('')}</svg>`
  const xg = (L: Dict[]) => L.reduce((a, s) => a + s.xg, 0), gN = (L: Dict[]) => L.filter(s => s.out === 'g').length
  // a side column of numbers: goals, shots, xG and goals minus xG, then small bars — how the goals came, with what,
  // from where (inside / outside the box)
  // each bar is a filter: click to show only those goals in the column's net and pitch (src: the click handler below)
  const bars = (title: string, rows: [string, number][], fill: string) => { const mx = Math.max(1, ...rows.map(r => r[1]))
    return rows.length ? `<div class="gkb"><div class="gkt">${title}</div>${rows.map(([k, n]) => `<div class="gkr" data-g="${title.toLowerCase()}" data-v="${k}" data-n="${n}" data-mx="${mx}" title="Show only these goals (click again to clear)"><span>${k}</span><u class="bw"><s style="width:${Math.round(n / mx * 100)}%;background:${fill}"></s><i style="width:${Math.round(n / mx * 100)}%;background:${fill}"></i></u><b>${n}</b></div>`).join('')}</div>` : '' }
  const count = (L: Dict[], key: (s: Dict) => string) => Object.entries(L.reduce((o: Dict, s) => (o[key(s)] = (o[key(s)] || 0) + 1, o), {})).sort((a: any, b: any) => b[1] - a[1]) as [string, number][]
  const kpis = (lb: string, L: Dict[], fill: string, og: number, help = '', big = false) => { const G = L.filter(s => s.out === 'g'), d = gN(L) - xg(L), sot = L.filter(s => s.out === 'g' || s.out === 's').length
    const nIn = G.filter(inBox).length
    return `<div class="gk" data-side="${lb}"><div class="sec">${lb}${help}</div>
      <div class="gkn"><b data-n="${gN(L)}">${gN(L)}</b><span><i class="gof"></i>goals${og ? ` <em>+${og} own goal${og === 1 ? '' : 's'}</em>` : ''}</span></div>
      <div class="gks"><span><b>${L.length}</b> shots · <b>${sot}</b> on target</span><span>xG <b>${xg(L).toFixed(1)}</b><i class="ghelp xgh" aria-label="What is xG">?</i> · <em class="${(lb === 'Conceded' ? d <= 0 : d >= 0) ? 'up' : 'dn'}"><b>${d >= 0 ? '+' : ''}${d.toFixed(1)}</b> vs xG</em></span></div>
      ${bars('How', count(G, s => SIT[s.sit] || 'other'), fill)}${bars('With', count(G.filter(s => BODY[s.body]), s => BODY[s.body]), fill)}${bars('From', ([['inside the box', nIn], ['outside', G.length - nIn]] as [string, number][]).filter(r => r[1]), fill)}${lb === 'Scored' ? bars('By', (['starters', 'off the bench'].map(k => [k, G.filter(g => g.by === k).length]) as [string, number][]).filter(r => r[1]), fill) : ''}${big ? bars('Role', (Object.values(ROLE).map(k => [k, G.filter(g => g.role === k).length]) as [string, number][]).filter(r => r[1]), fill) : ''}${when(G, fill)}</div>` }
  // When: the goals by 15-minute spell, stoppage time apart (45+, 90+) — eight small columns, each a filter too
  const when = (G: Dict[], fill: string) => { const n = WHEN.map(w => G.filter(g => whenOf(g.min) === w).length), mx = Math.max(1, ...n)
    return `<div class="gkb"><div class="gkt">When</div><div class="gkh">${WHEN.map((w, i) => `<div class="gkr gkc"${n[i] ? ` data-g="when" data-v="${w}" data-n="${n[i]}" title="${w}': ${n[i]} goal${n[i] === 1 ? '' : 's'} — show only these"` : ''}><b${w.endsWith('+') ? ' class="xt"' : ''}>${n[i] || ''}</b><u class="cw" style="height:${Math.max(2, Math.round(n[i] / mx * 34))}px"><s style="background:${fill}"></s><i style="height:100%;background:${fill}"></i></u><span${w.endsWith('+') ? ' class="xt"' : ''}>${w.replace(/^\d+–/, '')}</span></div>`).join('')}</div></div>` }
  const col = (L: Dict[], fill: string, side: string) => `<div class="gcol" data-side="${side}">${frame(L, fill)}${pitch(L, fill)}</div>`
  const ogFor = Math.max(0, t.GF - gN(F)), ogAg = Math.max(0, t.GA - gN(A))
  // the scorers (a filter group too): photo, name, a bar, goals — most first
  const scorers = (G: Dict[], fill: string) => { const by: Record<string, Dict> = {}
    for (const g of G) if (g.pid) { const o = (by[g.pid] ||= { id: g.pid, name: g.name, n: 0, xg: 0 }); o.n++; o.xg += g.xg }
    const L = Object.values(by).sort((a, b) => b.n - a.n || b.xg - a.xg), mx = Math.max(1, ...L.map(x => x.n))
    return `<div class="gk gksc" data-side="Scored"><div class="sec">Scorers<span class="gsum"><b>${L.length}</b> players</span></div><div class="gkb">${L.map(x => { const ph = squadThumb(x.id)
      return `<div class="gkr gkp" data-g="who" data-v="${x.id}" data-n="${x.n}" data-mx="${mx}" title="${esc(x.name)}: ${x.n} goal${x.n === 1 ? '' : 's'}, xG ${x.xg.toFixed(1)} — show only his goals">${ph ? `<img src="${ph}" alt="" loading="lazy">` : '<i class="nop"></i>'}<span>${esc(x.name)}</span><u class="bw"><s style="width:${x.n / mx * 100}%;background:${fill}"></s><i style="width:${x.n / mx * 100}%;background:${fill}"></i></u><b>${x.n}</b></div>` }).join('')}</div></div>` }
  // the takeover (the ⤢ by Scored): the goals scored on the whole card — a one-line club bar, the numbers, the net and
  // pitch as big as the height allows, the scorers on the right
  const clubC = club.primary || '#555', open = '<i class="gto-open" role="button" aria-label="Goals scored, full screen" title="Goals scored — full screen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg></i>'
  const take = `<div class="gto" hidden><div class="gtob" style="background:${clubC};color:${lum(clubC) > 0.55 ? '#15181d' : '#fff'}"><img src="${logo(t.code, t.lg)}" alt=""><b>${esc(club.name || t.code)}</b><span>${LEAGUE_NAME[t.lg]} · ${t.pos ? ord(t.pos) : '–'} · ${t.pts} pts · ${t.W}-${t.D}-${t.L}</span><em>Goals scored</em><button class="gto-x" aria-label="Close" title="Close (Esc)">×</button></div>
    <div class="gt gtbig">${kpis('Scored', F, 'var(--c2)', ogFor, '<i class="ghelp" aria-label="How to read it">?</i>', true)}${col(F, 'var(--c2)', 'Scored')}${scorers(F.filter(s => s.out === 'g'), 'var(--c2)')}</div></div>`
  return `<svg width="0" height="0" style="position:absolute"><defs><pattern id="gnet" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="#dfe3e6" stroke-width=".4"/></pattern></defs></svg>
    <div class="gt">${kpis('Scored', F, 'var(--c2)', ogFor, '<i class="ghelp" aria-label="How to read it">?</i>' + open)}${col(F, 'var(--c2)', 'Scored')}${col(A, '#15181d', 'Conceded')}${kpis('Conceded', A, '#15181d', ogAg)}</div>${take}`
}
// the takeover on a card (open / closed is remembered: a reload brings it back on the same card)
function openTakeover(c: HTMLElement) {
  const g = c.querySelector<HTMLElement>('.gto'); if (!g) return
  if (g.parentElement !== c) c.append(g)   // moved up to the card itself, so it covers the whole card, panel included
  g.hidden = false; document.body.classList.add('gto-on'); requestAnimationFrame(sizeGoalDots)
  try { localStorage.setItem('top5.teams.gto', '1') } catch { }
}
function closeTakeover() {
  film.querySelectorAll<HTMLElement>('.gto:not([hidden])').forEach(g => { g.hidden = true }); document.body.classList.remove('gto-on')
  try { localStorage.removeItem('top5.teams.gto') } catch { }
}
let goalsBusy = false
async function fillGoals() {
  if (goalsBusy) return; goalsBusy = true
  const panes = [...film.querySelectorAll<HTMLElement>('.pane-goals')]
  for (const lg of [...new Set(P.map(t => t.lg))]) {
    const [recs, S] = await Promise.all([recsOf(lg), shotsOf(lg)])
    P.forEach((t, i) => { if (t.lg !== lg || panes[i].dataset.done) return
      panes[i].innerHTML = goalsPane(t, TEAMS_OF[t.lg][t.code] || {}, recs, S); panes[i].dataset.done = '1' })
  }
  goalsBusy = false; sizeGoalDots()
  // reopen the takeover after a reload, on the card on screen
  let reopen = false; try { reopen = localStorage.getItem('top5.teams.gto') === '1' } catch { }
  if (reopen && TAB === 'goals' && !film.querySelector('.gto:not([hidden])')) { const i = +(location.hash.match(/#(\d+)/)?.[1] || 1) - 1, c = film.children[i] as HTMLElement | undefined; if (c?.querySelector('.gto')) openTakeover(c) }
}
// the goal dots keep one size on screen however big the drawings get (a bigger pitch = more room between goals):
// --u = drawing units per screen pixel, the dots' radius is set in pixels × --u
function sizeGoalDots() {
  film.querySelectorAll<SVGSVGElement>('.gt svg').forEach(sv => { const w = sv.clientWidth; if (w) sv.style.setProperty('--u', String(sv.viewBox.baseVal.width / w)) })
}
addEventListener('resize', sizeGoalDots)

// ---------- Rivals tab: the league as a circle in table order, the club at its place; every other club a dot split
// into the two meetings (left half at home, right half away) in the result colour with the score, an arc for each
// meeting played from the club to it (bowed towards the middle, so it never runs under another dot) ----------
const RV_RES = (gf?: number, ga?: number) => gf == null ? '#d9dde1' : gf > ga! ? '#2f9e58' : gf < ga! ? '#dc5c5e' : '#EAB308'
const RVTIPS = new Map<string, string>()
function rivalsPane(t: Dict) {
  const table = [...CARDS_OF[t.lg].teams].sort((a: Dict, b: Dict) => a.pos - b.pos), N = table.length, C = 260, R = 190, rr = 21
  const club = TEAMS_OF[t.lg][t.code] || {}, played: Record<string, Dict> = Object.fromEntries(t.matches.map((m: Dict) => [m.id, m]))
  const by: Record<string, Dict> = {}
  for (const g of club.games || []) (by[g.opp] ||= {})[g.ha] = { ...g, ...(played[g.id] || {}) }
  const at = (i: number) => { const a = -Math.PI / 2 + i / N * 2 * Math.PI; return [C + R * Math.cos(a), C + R * Math.sin(a), a] }
  const me = at(table.findIndex((x: Dict) => x.code === t.code))
  let arcs = '', dots = ''
  table.forEach((o: Dict, i: number) => {
    const [x, y, ang] = at(i)
    if (o.code === t.code) {   // the club: its crest at its place, its code and points outside it (in its colour)
      const lx = C + (R + 44) * Math.cos(ang), ly = C + (R + 44) * Math.sin(ang), cs = Math.cos(ang), an = cs > .25 ? 'start' : cs < -.25 ? 'end' : 'middle', ddy = Math.abs(cs) <= .25 ? (Math.sin(ang) < 0 ? -2 : 10) : 4
      dots += `<circle cx="${x}" cy="${y}" r="27" fill="#fff" stroke="${club.primary || '#555'}" stroke-width="3"/><image href="${logo(t.code, t.lg)}" x="${x - 20}" y="${y - 20}" width="40" height="40"/>
        <text x="${lx}" y="${ly + ddy}" text-anchor="${an}" font-size="11.5" font-weight="900" fill="${club.primary || '#15181d'}">${o.code}<tspan font-weight="700"> · ${o.pts} pts</tspan></text>`; return }
    const h = by[o.code]?.H || {}, a = by[o.code]?.A || {}
    const arc = (k: number) => { const mx = (me[0] + x) / 2, my = (me[1] + y) / 2; return `M${me[0]} ${me[1]}Q${mx + (C - mx) * k} ${my + (C - my) * k} ${x} ${y}` }
    const done = [[h, .82], [a, .62]].filter(([g]) => (g as Dict).gf != null) as [Dict, number][]
    done.forEach(([g, k]) => arcs += `<path d="${arc(k)}" fill="none" stroke="${RV_RES(g.gf, g.ga)}" stroke-width="1.7" opacity=".6"/>`)
    if (!done.length) arcs += `<path d="${arc(.72)}" fill="none" stroke="#c9ced4" stroke-width=".8" stroke-dasharray="3 3" opacity=".7"/>`
    const half = (g: Dict, side: number) => `<text x="${x + side * rr / 2}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="900" fill="${g.gf != null ? '#fff' : '#9aa0a8'}">${g.gf != null ? `${g.gf}-${g.ga}` : side < 0 ? 'H' : 'A'}</text>`
    const name = TEAMS_OF[t.lg][o.code]?.name || o.code
    RVTIPS.set(`${t.code}-${o.code}`, `<div class="mt-top">${esc(name)} · ${ord(o.pos)} · ${o.pts} pts</div>${[h, a].map(g => `<div class="mt-g"><span class="mt-min">MD ${g.w ?? '–'}</span><span>${g.ha === 'H' ? 'at home' : 'away'}${g.gf != null ? ` · <b style="color:${RV_RES(g.gf, g.ga)}">${g.gf}-${g.ga}</b>` : ' · to play'}</span></div>`).join('')}`)
    dots += `<g class="rv" data-rv="${t.code}-${o.code}" data-href="teams.html?lg=${t.lg}&t=${o.code}"><path d="M${x} ${y - rr}A${rr} ${rr} 0 0 0 ${x} ${y + rr}Z" fill="${RV_RES(h.gf, h.ga)}"/><path d="M${x} ${y - rr}A${rr} ${rr} 0 0 1 ${x} ${y + rr}Z" fill="${RV_RES(a.gf, a.ga)}"/>
      <circle cx="${x}" cy="${y}" r="${rr}" fill="none" stroke="#fff" stroke-width="2"/><line x1="${x}" x2="${x}" y1="${y - rr}" y2="${y + rr}" stroke="#fff" stroke-width="1.5"/>${half(h, -1)}${half(a, 1)}</g>`
    // crest and code outside the dot, along its radius
    const cx = C + (R + rr + 14) * Math.cos(ang), cy = C + (R + rr + 14) * Math.sin(ang), tx = C + (R + rr + 30) * Math.cos(ang), ty = C + (R + rr + 30) * Math.sin(ang), cos = Math.cos(ang)
    const anchor = cos > .25 ? 'start' : cos < -.25 ? 'end' : 'middle', dy = Math.abs(cos) <= .25 ? (Math.sin(ang) < 0 ? -2 : 9) : 3.5
    dots += `<circle cx="${cx}" cy="${cy}" r="10.5" fill="#fff"/><image href="${logo(o.code, t.lg)}" x="${cx - 9}" y="${cy - 9}" width="18" height="18"/><text x="${tx + (anchor === 'start' ? -4 : anchor === 'end' ? 4 : 0)}" y="${ty + dy}" text-anchor="${anchor}" font-size="10" font-weight="800" fill="#5b626c">${o.code}<tspan font-weight="600" fill="#8a9099"> · ${o.pts} pts</tspan></text>`
  })
  // beside the circle, the club's games as a list: first half on the left, second on the right (as the league's
  // everyone-vs-everyone view): match day, home/away, opponent, score or date; hover a row to light that club
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const all = [...(club.games || [])].sort((a: Dict, b: Dict) => a.w - b.w), half = Math.ceil(all.length / 2)
  const row = (g: Dict) => { const m = played[g.id], d = typeof g.et === 'string' ? g.et.match(/^\d{4}-(\d{2})-(\d{2})/) : null, o = TEAMS_OF[t.lg][g.opp] || {}
    return `<div class="rvr${m ? '' : ' rvtp'}" data-rv="${t.code}-${g.opp}"${m ? ` data-href="matches.html?lg=${t.lg}&md=${g.w}&m=${g.id}"` : ''}><span class="md">${g.w}</span><span class="ha">${g.ha === 'H' ? 'vs' : '→'}</span><img src="${logo(g.opp, t.lg)}" alt="" loading="lazy"><span class="nm">${esc(o.name || g.opp)}</span>${m ? `<b style="background:${RV_RES(m.gf, m.ga)}">${m.gf}–${m.ga}</b>` : `<em>${d ? `${+d[2]} ${MO[+d[1] - 1]}` : ''}</em>`}</div>` }
  const list = (gs: Dict[], lb: string) => `<div class="rvl"><div class="sec">${lb}</div>${gs.map(row).join('')}</div>`
  return `<div class="rvw">${list(all.slice(0, half), `First half · MD 1–${half}`)}<div class="rvc"><svg class="rvs" viewBox="-60 -10 640 540">${arcs}${dots}</svg>
    <div class="rvleg"><span><i style="background:#2f9e58"></i>won</span><span><i style="background:#EAB308"></i>drew</span><span><i style="background:#dc5c5e"></i>lost</span><span><i style="background:#d9dde1"></i>to play</span><span>each club: left half at home, right half away · the table, 1st at the top · hover a club, click for its card</span></div></div>${list(all.slice(half), `Second half · MD ${half + 1}–${all.length}`)}</div>`
}
function fillRivals() {
  film.querySelectorAll<HTMLElement>('.pane-rivals').forEach((p, i) => { if (!p.dataset.done) { p.innerHTML = rivalsPane(P[i]); p.dataset.done = '1' } })
}

// ---------- the season in two rows; the darker part of each box = the club's possession ----------
const matchHref = (lg: string, md: number, id: string) => SEASON === '2026-27' ? ` data-href="matches.html?lg=${lg}&md=${md}&m=${id}"` : ''
function strip(t: Dict, club: Dict) {
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w)
  const byId: Record<string, Dict> = Object.fromEntries(t.matches.map((m: Dict) => [m.id, m]))
  const half = Math.ceil(all.length / 2)
  const cell = (g: Dict) => {
    const m = byId[g.id], at = g.ha === 'A' ? '@' : ''
    if (!m) return `<div class="c2 tm up" data-gid="${g.id}">${upBox(g)}<div class="op">${at}${esc(g.opp)}</div></div>`
    const [bg, fg] = RES6[res6(m.gf, m.ga)]
    const veil = Math.round(100 - Math.max(0, Math.min(100, m.poss)))
    const keys = [`m${m.id}`, ...m.for.filter((x: Dict) => x.kind !== 'og').map((x: Dict) => `p${slug(x.by)}`)].join(' ')
    return `<div class="c2 tm" data-h="m${m.id}" data-k="${keys}" data-gid="${g.id}"${matchHref(t.lg, g.w, g.id)}>
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
  // a position scale on the left: 1st, 5th, 10th, 15th and last, each with a faint guide across
  const ticks = [...new Set([1, 5, 10, 15, N_OF[t.lg]])].filter(p => p <= N_OF[t.lg])
  const yax = ticks.map(p => `<span class="yt" style="top:${y(p)}%">${ord(p)}</span>`).join('')
  return `<div class="pline"><div class="plot">${yax}
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
      <rect class="zone" x="0" y="0" width="100" height="${y(4.5)}" fill="#177a41"/><rect class="zone" x="0" y="${y(N_OF[t.lg] - 2.5)}" width="100" height="${100 - y(N_OF[t.lg] - 2.5)}" fill="#b3323a"/>
      ${ticks.map(p => `<line x1="0" x2="100" y1="${y(p)}" y2="${y(p)}" stroke="#d5d9de" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`).join('')}
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
    const open = `<a class="pm${p.apps ? '' : ' unused'} has-card" href="player.html?lg=${t.lg}&team=${t.code}&p=${p.espnId}" title="${esc(tip)} — open his card">`
    return `${open}
      <span class="pmshot">${tag}<i class="pmfb">${esc(ini(p.name))}</i>${p.thumb ? `<img src="${p.thumb}" alt="" loading="lazy">` : ''}${p.jersey ? `<b class="pmwm">${esc(p.jersey)}</b>` : ''}${p.inj ? '<i class="inj" title="injured">+</i>' : ''}
        <span class="pmpills">${pills.map(([v, k]) => `<b title="${k}">${v}</b>`).join('')}${p.flag ? `<img class="pmflag" src="flags/${p.flag}.webp" alt="${esc(p.natName || '')}" title="${esc(p.natName || '')}" loading="lazy" onerror="this.remove()">` : ''}</span></span>
      <span class="pmname"><span data-f="${esc(p.name)}" data-s="${esc(initialName(p.name))}">${esc(p.name)}</span>${p.RC ? '<i class="rc"></i>' : p.YC ? '<i class="yc"></i>' : ''}</span></a>`
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
  const href = (s: Dict) => `data-href="player.html?lg=${t.lg}&team=${t.code}&p=${s.espnId}"`
  const top = all.slice(0, 3).map((s: Dict) => `<span class="sc" ${k(s)} ${href(s)}>${thumbOf[s.espnId] ? `<img src="${thumbOf[s.espnId]}" alt="">` : '<i class="nophoto"></i>'}${esc(s.name)} <b>${s.G}</b>${s.A ? ` · ${s.A} ast` : ''}</span>`).join('')
  const rest = all.slice(3).map((s: Dict) => `<span class="sc2" ${k(s)} ${href(s)}>${esc(s.name)} <b>${s.G}</b></span>`).join(' ')   // spaces: the line can wrap
  return top + (rest ? `<div class="rest">${rest}</div>` : '')
}

// ---------- the standard card-film chrome ----------
// one league: its table order. All leagues: points per game, then fewer defeats (0-0-4 ahead of 0-0-5), then goal
// difference, then goals scored
const P: Dict[] = ALL
  ? Object.values(CARDS_OF).flatMap(c => c.teams).sort((a, b) => ppgOf(b) - ppgOf(a) || a.L - b.L || (b.GF - b.GA) - (a.GF - a.GA) || b.GF - a.GF)
  : CARDS_OF[LG].teams
P.forEach((t, i) => t.rank = i + 1)
// ?t=<club code> (the club's name on a match card): open on that club, then drop it from the URL
if (QS.has('t')) {
  const at = P.findIndex(t => t.code === QS.get('t') && (!QS.get('tl') || t.lg === QS.get('tl'))), q = new URLSearchParams(location.search); q.delete('t'); q.delete('tl')
  history.replaceState(null, '', location.pathname + '?' + q.toString() + (at >= 0 ? '#' + (at + 1) : location.hash))
}
const UPDATED = Math.max(...Object.values(CARDS_OF).map(c => +new Date(c.updated)))
const nameOf = (t: Dict) => TEAMS_OF[t.lg][t.code]?.name || t.code
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
// All Leagues: one last card, the whole ranking on one screen (4 columns, read down); a row jumps to its club
// the table's short forms for the long official names (league:code)
const SHORT: Record<string, string> = { 'ENG:BHA': 'Brighton', 'ESP:ESP': 'Espanyol', 'FRA:OM': 'Marseille', 'FRA:PSG': 'Paris SG', 'FRA:RCL': 'Lens',
  'FRA:SR': 'Rennes', 'FRA:STR': 'Strasbourg', 'FRA:OL': 'Lyon', 'FRA:ASM': 'Monaco', 'GER:B04': 'Leverkusen', 'GER:BMG': 'Gladbach', 'GER:SCF': 'Freiburg',
  'GER:SGE': 'Frankfurt', 'GER:FCB': 'Bayern', 'GER:BVB': 'Dortmund' }
// points per game on a scale: 0 red → 1.5 amber → 3 green (the result shades, the amber darkened to read as text)
function ppgColor(v: number) {
  if (v < 0) return '#9aa0a8'
  const stops: [number, number[]][] = [[0, [179, 50, 58]], [1.5, [212, 160, 6]], [3, [23, 122, 65]]]
  const i = v <= 1.5 ? 0 : 1, [a, ca] = stops[i], [b, cb] = stops[i + 1], f = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return `rgb(${ca.map((x, k) => Math.round(x + (cb[k] - x) * f)).join(',')})`
}
// game state: the share of a club's minutes spent leading / level / trailing, 90' a game (a stoppage-time goal counts
// at 45' or 90', so stoppage time itself is not counted)
const clock90 = (s: string) => { const m = String(s).match(/(\d+)'/); return Math.min(90, m ? +m[1] : 0) }
function gameState(t: Dict) {
  let lead = 0, level = 0, trail = 0, n = 0
  for (const m of t.matches) {
    if (m.gf == null) continue; n++
    const ev = [...(m.for || []).map((g: Dict) => [clock90(g.min), 1]), ...(m.against || []).map((g: Dict) => [clock90(g.min), -1])].sort((a, b) => a[0] - b[0])
    let d = 0, last = 0
    const run = (to: number) => { const s = to - last; if (d > 0) lead += s; else if (d < 0) trail += s; else level += s; last = to }
    for (const [mm, s] of ev) { run(mm); d += s }
    run(90)
  }
  const tot = n * 90 || 1
  return { n, lead: lead / tot, level: level / tot, trail: trail / tot }
}
const pc = (v: number) => Math.round(v * 100)
// the closing card: every club ranked by the share of minutes it has led (then the least trailing)
function gameCard() {
  const MINLAB = ALL ? 18 : 10   // a share is written in its segment only when it fits (the 4-column bars are narrow)
  const rows = P.map(t => ({ t, g: gameState(t) })).filter(x => x.g.n).sort((a, b) => b.g.lead - a.g.lead || a.g.trail - b.g.trail)
  const row = ({ t, g }: Dict, i: number) => {
    const c = TEAMS_OF[t.lg][t.code]?.primary || '#555', ink = lum(c) > 0.55 ? '#15181d' : c
    return `<a class="gsr" data-i="${t.rank - 1}" title="${esc(nameOf(t))} · led ${pc(g.lead)}% · level ${pc(g.level)}% · trailed ${pc(g.trail)}% of ${g.n * 90}′"><span class="tr-rk">${i + 1}</span>${ALL ? `<img class="tr-lg" src="leagues/${t.lg}.png" alt="${LEAGUE_NAME[t.lg]}">` : ''}<img class="tr-cr" src="${logo(t.code, t.lg)}" alt="" onerror="this.style.visibility='hidden'"><span class="tr-nm" style="color:${ink}">${esc(SHORT[`${t.lg}:${t.code}`] || nameOf(t))}</span>
      <span class="gsb"><i class="ld" style="width:${g.lead * 100}%">${pc(g.lead) >= MINLAB ? pc(g.lead) + '%' : ''}</i><i class="lv" style="width:${g.level * 100}%"></i><i class="tl" style="width:${g.trail * 100}%">${pc(g.trail) >= MINLAB ? pc(g.trail) + '%' : ''}</i></span></a>`
  }
  const cols = ALL ? 4 : 2
  return `<section class="card tbl" id="t-game"><div class="tb">
    <div class="tb-hd"><h2>Game state</h2><span>the share of its minutes each club has spent <b class="k ld">leading</b> <b class="k lv">level</b> <b class="k tl">trailing</b> · 90′ a game, stoppage time not counted</span></div>
    <div class="tb-grid gs${ALL ? '' : ' nolg'}" style="--rows:${Math.ceil(rows.length / cols)};--cols:${cols}">${rows.map(row).join('')}</div></div></section>`
}
// comebacks & collapses: points won in games the club trailed at some point · points dropped from a winning position
function swings(t: Dict) {
  let won = 0, dropped = 0
  for (const m of t.matches) {
    if (m.gf == null) continue
    const ev = [...(m.for || []).map((g: Dict) => [clock90(g.min), 1]), ...(m.against || []).map((g: Dict) => [clock90(g.min), -1])].sort((a, b) => a[0] - b[0])
    let d = 0, behind = false, ahead = false
    for (const [, s] of ev) { d += s; if (d < 0) behind = true; if (d > 0) ahead = true }
    const pts = m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0
    if (behind) won += pts
    if (ahead) dropped += 3 - pts
  }
  return { won, dropped }
}
function swingCard() {
  const rows = P.map(t => ({ t, s: swings(t) })).sort((a, b) => (b.s.won - b.s.dropped) - (a.s.won - a.s.dropped) || b.s.won - a.s.won)
  const max = Math.max(1, ...rows.map(r => Math.max(r.s.won, r.s.dropped)))
  const row = ({ t, s }: Dict, i: number) => {
    const c = TEAMS_OF[t.lg][t.code]?.primary || '#555', ink = lum(c) > 0.55 ? '#15181d' : c
    return `<a class="gsr sw" data-i="${t.rank - 1}" title="${esc(nameOf(t))} · ${s.won} pts won from losing positions · ${s.dropped} dropped from winning positions"><span class="tr-rk">${i + 1}</span>${ALL ? `<img class="tr-lg" src="leagues/${t.lg}.png" alt="${LEAGUE_NAME[t.lg]}">` : ''}<img class="tr-cr" src="${logo(t.code, t.lg)}" alt="" onerror="this.style.visibility='hidden'"><span class="tr-nm" style="color:${ink}">${esc(SHORT[`${t.lg}:${t.code}`] || nameOf(t))}</span>
      <span class="swb"><span class="sl"><em>${s.dropped ? '−' + s.dropped : ''}</em><i style="width:${(s.dropped / max) * 100}%"></i></span><span class="sr"><i style="width:${(s.won / max) * 100}%"></i><em>${s.won ? '+' + s.won : ''}</em></span></span></a>`
  }
  const cols = ALL ? 4 : 2
  return `<section class="card tbl" id="t-swing"><div class="tb">
    <div class="tb-hd"><h2>Comebacks &amp; collapses</h2><button class="qm" title="How to read this card" onclick="openMod('swmodal')">?</button><span><b class="k tl">dropped</b> points thrown away from a winning position · <b class="k ld">won</b> points won in games they trailed · ranked by the balance</span></div>
    <div class="tb-grid gs${ALL ? '' : ' nolg'}" style="--rows:${Math.ceil(rows.length / cols)};--cols:${cols}">${rows.map(row).join('')}</div></div></section>`
}
// push vs payoff: each club's share of the attacking push in its games (the flow's weights: a shot 1, on target 2, a
// goal 3, a corner .5 — from the match stats, the opponent's from its own record of the game) against its share of the goals
function pushPay(t: Dict) {
  let pf = 0, pa = 0
  const push = (m: Dict) => m.sh + m.sot + (m.for || []).filter((g: Dict) => g.kind !== 'og').length + m.cor * .5
  for (const m of t.matches) {
    if (m.gf == null) continue
    const o = OPP.get(`${m.id}:${t.code}`); if (!o) continue
    pf += push(m); pa += push(o)
  }
  return { push: pf + pa ? pf / (pf + pa) : .5, goals: t.GF + t.GA ? t.GF / (t.GF + t.GA) : .5 }
}
const OPP = new Map<string, Dict>()   // "<match id>:<club>" → the opponent's record of that game
for (const t of P) for (const m of t.matches) if (m.gf != null) for (const u of P) if (u !== t && u.lg === t.lg) { const o = u.matches.find((x: Dict) => x.id === m.id); if (o) { OPP.set(`${m.id}:${t.code}`, o); break } }
function payCard() {
  const lo = .1, hi = .9, at = (v: number) => (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * 100
  const dots = P.map(t => { const p = pushPay(t)
    const club = TEAMS_OF[t.lg][t.code] || {}, dot = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="${club.primary || '#555'}"/><text x="20" y="24.5" font-family="Arial" font-size="12" font-weight="900" fill="#fff" text-anchor="middle">${esc(club.abbr || t.code)}</text></svg>`)
    // a crest that fails to load is tried once more, then drawn as a dot in the club colour with its code
    return `<img class="ppc" data-i="${t.rank - 1}" src="${logo(t.code, t.lg)}" alt="${esc(nameOf(t))}" onerror="if(!this.dataset.r){this.dataset.r=1;this.src=this.src+'?r=1'}else{this.onerror=null;this.src='${dot}'}" style="left:${at(p.push)}%;bottom:${at(p.goals)}%" title="${esc(nameOf(t))} · ${pc(p.push)}% of the push · ${pc(p.goals)}% of the goals (${t.GF}–${t.GA})">` }).join('')
  const grid = [.25, .5, .75].map(v => `<span class="gx" style="left:${at(v)}%"><em>${pc(v)}%</em></span><span class="gy" style="bottom:${at(v)}%"><em>${pc(v)}%</em></span>`).join('')
  return `<section class="card tbl" id="t-pay"><div class="tb">
    <div class="tb-hd"><h2>Push vs payoff</h2><button class="qm" title="How to read this chart" onclick="openMod('ppmodal')">?</button><span>share of the attacking push in its games (shots, shots on target, goals, corners) against share of the goals · above the line: more goals than pressure</span></div>
    <div class="pp${ALL ? '' : ' big'}"><div class="pp-plot">${grid}<i class="pp-diag"></i>
      <b class="pp-q tl">clinical</b><b class="pp-q br">wasteful</b>${dots}</div>
      <div class="pp-ax x">share of the push →</div><div class="pp-ax y">share of the goals →</div></div></div></section>`
}
function tableCard() {
  const row = (t: Dict) => {
    const c = TEAMS_OF[t.lg][t.code]?.primary || '#555', ink = lum(c) > 0.55 ? '#15181d' : c
    return `<a class="tr" data-i="${t.rank - 1}" title="${esc(nameOf(t))} · ${LEAGUE_NAME[t.lg]}"><span class="tr-rk">${t.rank}</span><img class="tr-lg" src="leagues/${t.lg}.png" alt="${LEAGUE_NAME[t.lg]}"><b class="tr-ppg" style="color:${ppgColor(ppgOf(t))}">${ppgOf(t) >= 0 ? ppgOf(t).toFixed(2) : '–'}</b><span class="tr-nm" style="color:${ink}">${esc(SHORT[`${t.lg}:${t.code}`] || nameOf(t))}</span><span class="tr-sub">${t.pos ? ord(t.pos) : '–'} · ${t.pts} pts</span></a>`
  }
  return `<section class="card tbl" id="t-table"><div class="tb">
    <div class="tb-hd"><h2>All ${P.length} clubs</h2><span>by points per game · then fewer defeats, goal difference, goals scored</span></div>
    <div class="tb-grid" style="--rows:${Math.ceil(P.length / 4)}">${P.map(row).join('')}</div></div></section>`
}
// All Leagues: and the same ranking as columns, like the tower's all-leagues view (3-letter codes underneath)
function chartCard() {
  const zone = (t: Dict) => { const n = N_OF[t.lg], r = t.pos; return !r ? '#8b9098' : r <= 4 ? '#0B4DA2' : r === 5 ? '#E8820B' : r === 6 ? '#0B8A3D' : r > n - 3 ? '#C23A2E' : '#8b9098' }
  const col = (t: Dict, i: number) => {
    const club = TEAMS_OF[t.lg][t.code] || {}, v = Math.max(0, ppgOf(t))
    return `<div class="cc" data-i="${t.rank - 1}" title="${t.rank}. ${esc(nameOf(t))} · ${ppgOf(t) >= 0 ? ppgOf(t).toFixed(2) : '–'} a game · ${t.pos ? ord(t.pos) : '–'} in ${LEAGUE_NAME[t.lg]}, ${t.pts} pts">
      <div class="cc-bar"><i style="height:${(v / 3) * 100}%;background:${club.primary || '#555'}${i === 0 ? ';outline:2px solid #0B8A3D;outline-offset:1px' : ''}"></i></div>
      <b class="cc-ab" style="color:${zone(t)}">${esc(club.abbr || t.code)}</b><img class="cc-lg" src="leagues/${t.lg}.png" alt=""></div>`
  }
  return `<section class="card tbl" id="t-chart"><div class="tb">
    <div class="tb-hd"><h2>Points per game</h2><span>all ${P.length} clubs · codes coloured by their place in their own league: top four, 5th, 6th, bottom three</span></div>
    <div class="cc-wrap"><div class="cc-grid">${[3, 2, 1].map(v => `<span style="bottom:${(v / 3) * 100}%"><em>${v.toFixed(1)}</em></span>`).join('')}</div>${P.map(col).join('')}</div></div></section>`
}
film.innerHTML = P.map(card).join('') + (ALL ? tableCard() + chartCard() : '') + gameCard() + swingCard() + payCard()
// the stats cards after the clubs, in film order (the jump list and the top-bar button point at them)
const STATS = [...(ALL ? ['The table', 'The chart'] : []), 'Game state', 'Comebacks & collapses', 'Push vs payoff']
const STATS_SUB: Record<string, string> = { 'The table': 'all clubs by points per game', 'The chart': 'points per game as columns', 'Game state': 'minutes leading · level · trailing',
  'Comebacks & collapses': 'points won from behind · dropped from ahead', 'Push vs payoff': 'share of the pressure vs share of the goals' }
{ // the comebacks explainer's examples, from today's data
  const S = P.map(t => ({ t, s: swings(t) }))
  const top = (k: string) => [...S].sort((a: Dict, b: Dict) => b.s[k] - a.s[k]).slice(0, 3).map((x: Dict) => `<b>${esc(nameOf(x.t))}</b> ${k === 'won' ? '+' : '−'}${x.s[k]}`).join(', ')
  $('swex').innerHTML = `Right now${ALL ? ' across the five leagues' : ` in ${LEAGUE_NAME[LG]}`}, the most points won from behind: ${top('won')}. The most dropped from ahead: ${top('dropped')}.`
}
{ // the explainer's examples, from today's data: the furthest above and below the diagonal
  const gap = P.map(t => { const p = pushPay(t); return { t, p, d: p.goals - p.push } }).sort((a, b) => b.d - a.d)
  const say = (x: Dict) => `<b>${esc(nameOf(x.t))}</b> (${pc(x.p.push)}% of the push, ${pc(x.p.goals)}% of the goals)`
  $('ppex').innerHTML = `Right now${ALL ? ' across the five leagues' : ` in ${LEAGUE_NAME[LG]}`}, the most clinical: ${gap.slice(0, 3).map(say).join(', ')}. The most wasteful: ${gap.slice(-3).reverse().map(say).join(', ')}.`
}
film.addEventListener('click', e => { const c = (e.target as HTMLElement).closest<HTMLElement>('.cc'); if (c) (window as any).go(+c.dataset.i!) })
film.addEventListener('click', e => { const r = (e.target as HTMLElement).closest<HTMLElement>('.tr, .gsr, .ppc'); if (r) (window as any).go(+r.dataset.i!) })
const lgUrl = (lg: string) => { const q = new URLSearchParams(location.search); q.set('lg', lg); return location.pathname + '?' + q.toString() + '#1' }   // a top-bar switch starts at card 1
$('lgs').innerHTML = `<a class="lgb all${ALL ? ' on' : ''}" href="${lgUrl('ALL')}" title="All five leagues in one film, ranked by points per game"><b>All Leagues</b></a>` + LG_ORDER.map(lg => `<a class="lgb${lg === LG ? ' on' : ''}${has(lg) ? '' : ' soon'}" data-lg="${lg}" href="${lgUrl(lg)}" title="${LEAGUE_NAME[lg]}${has(lg) ? ' team cards' : ' — coming soon'}"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"></a>`).join('')
  + `<a class="lgb all stats" id="statsb" href="#" title="The stats cards: ${STATS.join(', ')}" onclick="go(${P.length});return false"><b>Stats</b></a>`
$('cnote').innerHTML = `${ALL ? `All ${P.length} clubs of the five leagues, ranked by points per game (then fewer defeats, goal difference, goals scored), so leagues with fewer games compare fairly. It says nothing about how strong each league is` : `${P.length} clubs of ${LEAGUE_NAME[LG]}, in table order`}. Season ${SEASON.replace('-', '/')}, updated ${new Date(UPDATED).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`

const KEY = 'top5.teams.card.' + LG + (SEASON === '2026-27' ? '' : '.' + SEASON)
function onPaint(i: number) {
  const t = P[i]
  // the goals-scored full view follows the film: open on one club, it opens on the next one too
  let keep = false; try { keep = localStorage.getItem('top5.teams.gto') === '1' } catch { }
  if (keep && TAB === 'goals') { film.querySelectorAll<HTMLElement>('.gto:not([hidden])').forEach(g => { if (g.closest('.card') !== film.children[i]) g.hidden = true })
    const c = film.children[i] as HTMLElement | undefined; if (c?.querySelector('.gto')) openTakeover(c); else document.body.classList.remove('gto-on') }
  $('statsb').classList.toggle('on', !t)
  if (!t) {   // All Leagues: the table card, the column chart; then (every film) the game-state card
    const what = STATS[i - P.length].toLowerCase()
    $('ctx').innerHTML = ALL ? `All Leagues ${SEASON.replace('-', '/')} · ${what.startsWith('the') ? 'by points per game · ' : ''}<b>${what}</b>` : `${LEAGUE_NAME[LG]} ${SEASON.replace('-', '/')} · <b>${what}</b>`
    $('lgs').querySelectorAll<HTMLElement>('.lgb[data-lg]').forEach(b => b.classList.remove('cur'))
    return
  }
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
  const sts = STATS.map((s, k) => ({ i: P.length + k, label: s, sub: STATS_SUB[s] })).filter(x => !qq || /^\d+$/.test(qq) ? x.i === +qq - 1 || !qq : qq.split(/\s+/).every(w => `stats ${x.label} ${x.sub}`.toLowerCase().includes(w)))
  const statsSec = sts.length ? `<div class="jsec"><div class="jsechd">Stats<span>${sts.length}</span></div><div class="jgrid">${sts.map(x =>
    `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` : ''
  return statsSec + (hits.length ? `<div class="jsec"><div class="jsechd">${ALL ? 'All Leagues' : `<img src="leagues/${LG}.png" alt="">${LEAGUE_NAME[LG]}`}<span>${hits.length}</span></div><div class="jgrid">${hits.map(x =>
    `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` : statsSec ? '' : '<p>No club matches.</p>')
}

// Season | Squad | Tactical tab: one choice for every card, remembered
const TABS = SEASON === '2026-27' ? ['season', 'squad', 'tac', 'goals', 'rivals'] : ['season', 'squad', 'rivals']
let TAB = 'season'
try { const s = localStorage.getItem('top5.teams.tab') || ''; if (TABS.includes(s)) TAB = s } catch { }
const setTab = (t: string) => {
  TAB = t; document.body.classList.toggle('tab-squad', t === 'squad'); document.body.classList.toggle('tab-tac', t === 'tac'); document.body.classList.toggle('tab-goals', t === 'goals'); document.body.classList.toggle('tab-rivals', t === 'rivals')
  if (t === 'tac') fillTactics()
  if (t === 'goals') { fillGoals(); requestAnimationFrame(sizeGoalDots) }
  if (t === 'rivals') fillRivals()
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
initTacArrows()
setTab(TAB)
film.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.tab'); if (b) setTab(b.dataset.tab!) })
addEventListener('keydown', e => { if (e.key === 't' && !document.querySelector('.mod.on') && !e.metaKey && !e.ctrlKey) setTab(TABS[(TABS.indexOf(TAB) + 1) % TABS.length]) })

// hover / tap a match, a goal or a scorer: everything sharing its key lights up in the club colour, the rest dims
initHighlight(film, '[data-h]', k => `[data-k~="${k}"]`, el => el.dataset.h!)

// ---------- match card on hover / tap: a match box or a position dot ----------
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
  // each side's goals in its own colour (near-black when too pale to read); when the two are alike, the
  // opponent's go dark grey so the sides stay apart
  const readable = (c: string, dflt: string) => lum(c) > 0.45 ? dflt : c
  const rgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
  const ourInk = readable(club.primary || '#15181d', '#15181d')
  let oppInk = readable(opp.primary || '#5b626c', '#5b626c')
  if (Math.hypot(...rgb(ourInk).map((v, k) => v - rgb(oppInk)[k])) < 90) oppInk = ourInk === '#15181d' ? '#8a9099' : '#5b626c'
  const goal = (x: Dict, ours: boolean) => `<div class="mt-g${ours ? '' : ' ag'}" style="color:${ours ? ourInk : oppInk}"><span class="mt-min">${esc(x.min)}</span><span>${x.kind === 'og' ? (ours ? 'own goal' : `${esc(surname(x.by || ''))} (own goal)`) : esc(x.by)}${x.kind && x.kind !== 'og' ? ` <em>${KIND[x.kind] || x.kind}</em>` : ''}${ours && x.ast ? ` <i>· ${esc(surname(x.ast))}</i>` : ''}</span></div>`
  const goals: [Dict, boolean][] = [...m.for.map((x: Dict) => [x, true]), ...m.against.map((x: Dict) => [x, false])]
  goals.sort((a, b) => { const p = parseMin(a[0].min), q = parseMin(b[0].min); return p.base - q.base || p.extra - q.extra })
  return `${head}
    <div class="mt-score">${side(home[0], home[1], t.lg)}<b class="mt-res" style="background:${bg};color:${fg}">${hs}</b>${side(away[0], away[1], t.lg)}</div>
    ${goals.length ? `<div class="mt-goals">${goals.map(([x, o]) => goal(x, o)).join('')}</div>` : ''}
    <div class="mt-poss"><span>possession</span><div class="mt-bar"><i style="width:${m.poss}%"></i></div><b>${Math.round(m.poss)}%</b></div>
    <div class="mt-stats"><span><b>${m.sh}</b> shots</span><span><b>${m.sot}</b> on target</span><span><b>${m.pass}%</b> passing</span><span><b>${m.cor}</b> corners</span>${m.yc || m.rc ? `<span><b>${m.yc}</b><i class="yc"></i>${m.rc ? ` <b>${m.rc}</b><i class="rc"></i>` : ''}</span>` : ''}</div>`
}
initLinks(film)
initTip(film, '[data-gid]', el => matchTip(P[[...film.children].indexOf(el.closest('.card')!)], el.dataset.gid!, el.dataset.after))
// the Goals tab's help, on its "?" (in place of a legend line under the pitches)
const GOALS_HELP = `<div class="mt-top">How to read it</div><div class="ghl"><p><b>Top</b>: where each goal went in, the goal seen from the shooter's side. <b>Bottom</b>: where every shot was taken from, attacking up.</p>
  <p><b>●</b> a goal · <b>○</b> saved · <b>×</b> off target or blocked. Hover a goal: the same goal lights in the net and on the pitch, with its xG; click it for the match card. A <b>numbered dot</b> is several goals from one spot (every penalty): hover it for the list, click it to keep the list open.</p>
  <p><b>Left</b>: the goals scored — <b>right</b>: conceded. <b>xG</b>: how many goals the chances were worth; "vs xG": goals minus xG. The bars: how the goals came, with what, from where, when (15-minute spells, stoppage time apart) and, for goals scored, by whom (starters or off the bench; in the full view, also their role) — <b>click a bar</b> (or, in the full view — the ⤢ by Scored — a scorer) to show only those goals (several bars: any of a group, all groups at once; click again to clear). Data: FotMob shot map.</p></div>`
// xG, explained where it is used (the "?" by each column's xG)
const XG_HELP = `<div class="mt-top">xG — expected goals</div><div class="ghl"><p>How likely a shot was to go in, judged from many thousands of similar shots: where it was taken, the angle, foot or head, the kind of chance. <b>0.90</b> is a tap-in (a 90% chance); <b>0.03</b> a hopeful shot from 25 metres (3%).</p>
  <p>Add up every shot and you get the goals a team <b>should</b> have scored. <b>vs xG</b> is goals minus that: above zero, finishing better than the chances (or luck); below, worse. For goals conceded, below zero means the keeper and defence did better than the chances allowed.</p></div>`
// the Goals tab's filters: a bar on/off; a goal shows when it matches every group that has a bar on (within a group,
// any of its bars) — the big number then counts what is shown, "of 21"
function applyGoalFilters(gk0: HTMLElement) {
  const side = gk0.dataset.side, gt = gk0.closest('.gt')!, gks = [...gt.querySelectorAll<HTMLElement>(`.gk[data-side="${side}"]`)], gk = gks[0]
  const want: Record<string, string[]> = {}
  gks.forEach(k => k.querySelectorAll<HTMLElement>('.gkr.on').forEach(r => (want[r.dataset.g!] ||= []).push(r.dataset.v!)))
  const any = Object.keys(want).length; gks.forEach(k => k.classList.toggle('filt', !!any))
  const col = gt.querySelector<HTMLElement>(`.gcol[data-side="${side}"]`)!
  const ok = (v: Dict) => Object.entries(want).every(([k, vs]) => vs.includes(v[k] || ''))
  col.querySelectorAll<SVGElement>('.gm[data-gk]').forEach(g => g.classList.toggle('hid', !ok(g.dataset)))
  // a group: the goals that pass, its count redrawn; hidden when none does
  let inGroups = 0
  col.querySelectorAll<SVGElement>('.gst').forEach(g => { const vis = g.dataset.gs!.split(' ').filter(k => ok(GV.get(k) || {}))
    // one goal left of a group: drawn as a plain goal (no number), its own card on hover
    g.dataset.vis = vis.join(' '); g.classList.toggle('hid', !vis.length); g.classList.toggle('one', vis.length === 1)
    g.querySelector('text')!.textContent = vis.length > 1 ? String(vis.length) : ''; inGroups += vis.length })
  const n = gk.querySelector<HTMLElement>('.gkn b')!, shown = col.querySelectorAll('.gp .gm[data-gk]:not(.hid)').length + inGroups
  n.textContent = any ? String(shown) : n.dataset.n!; gk.querySelector('.gof')!.textContent = any ? `of ${n.dataset.n} ` : ''
  // every bar recounted within the OTHER groups' filters (its own group stays whole, so a sibling can still be added);
  // the full-season bar stays behind as a ghost
  const goals: Dict[] = [...col.querySelectorAll<HTMLElement>('.gp .gm[data-gk]')].map(g => g.dataset)
  col.querySelectorAll<HTMLElement>('.gst').forEach(g => g.dataset.gs!.split(' ').forEach(k => goals.push(GV.get(k) || {})))
  gks.flatMap(k => [...k.querySelectorAll<HTMLElement>('.gkr[data-g]')]).forEach(r => {
    const grp = r.dataset.g!, full = +r.dataset.n!
    const cnt = any ? goals.filter(v => v[grp] === r.dataset.v && Object.entries(want).every(([k, vs]) => k === grp || vs.includes(v[k] || ''))).length : full
    r.querySelector('b')!.textContent = cnt || r.classList.contains('gkc') ? String(cnt || '') : '0'
    const bar = r.querySelector<HTMLElement>('u > i')!
    if (r.classList.contains('gkc')) bar.style.height = `${full ? cnt / full * 100 : 0}%`
    else bar.style.width = `${(cnt / +r.dataset.mx!) * 100}%`
    r.classList.toggle('zero', !!any && !cnt)
  })
}
// the goals-scored takeover: open from the ⤢, close with × or Esc
film.addEventListener('click', e => {
  const t = e.target as HTMLElement
  // (moved up to the card itself, so it covers the whole card, panel included)
  if (t.closest('.gto-open')) { openTakeover(t.closest<HTMLElement>('.card')!); e.stopPropagation(); return }
  if (t.closest('.gto-x')) { closeTakeover(); e.stopPropagation() }
}, true)
addEventListener('keydown', e => { if (e.key === 'Escape') closeTakeover() })
film.addEventListener('click', e => {
  const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.gkr[data-g]')
  if (row) { row.classList.toggle('on'); applyGoalFilters(row.closest<HTMLElement>('.gk')!); return }
  // a click anywhere else (not on a goal, which opens its match or its list) clears every filter
  if (t.closest('.gm, .gst')) return
  film.querySelectorAll<HTMLElement>('.gk.filt').forEach(gk => { gk.querySelectorAll('.gkr.on').forEach(r => r.classList.remove('on')); applyGoalFilters(gk) })
})
initTip(film, '.rv[data-rv]', el => RVTIPS.get(el.dataset.rv!) || '')   // a club in the Rivals tab: both meetings
// a row of the Rivals lists (or a dot): that club lit in the circle and in both lists
film.addEventListener('mouseover', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.rvr[data-rv], .rv[data-rv]'), w = (e.target as HTMLElement).closest<HTMLElement>('.rvw')
  film.querySelectorAll('.rvw.lit').forEach(x => { if (x !== w || !el) { x.classList.remove('lit'); x.querySelectorAll('.on').forEach(o => o.classList.remove('on')) } })
  if (!el || !w) return
  w.classList.add('lit'); w.querySelectorAll('.on').forEach(o => o.classList.remove('on')); w.querySelectorAll(`[data-rv="${el.dataset.rv}"]`).forEach(o => o.classList.add('on'))
})
initTip(film, '.ghelp', el => el.classList.contains('xgh') ? XG_HELP : GOALS_HELP)
// a goal in the Goals tab: its card above the column's goal, the same goal lit in the net and on the pitch, the rest faded
// (own class names — .gm, .lit: the film's .gd / .hl styles scale and clear on hover)
const oneOf = (el: HTMLElement) => el.classList.contains('one') ? el.dataset.vis! : null   // a group filtered down to one goal
initTip(film, '.gm[data-gk], .gst', el => el.dataset.gs ? (oneOf(el) ? GTIPS.get(oneOf(el)!) || '' : stackTip(el)) : GTIPS.get(el.dataset.gk!) || '',
  // in the full view: laid on the Scorers column, so the net and pitch stay free to hover and click
  el => el.closest('.gto')?.querySelector<HTMLElement>('.gksc') || el.closest<HTMLElement>('.gcol')?.querySelector<HTMLElement>('.gf') || el, true, el => !!el.dataset.gs && !oneOf(el),
  el => !!el.closest('.gto'))
film.addEventListener('mouseover', e => {
  if (document.getElementById('mtip')?.classList.contains('pinned')) return   // a pinned list keeps its goals lit
  const d = (e.target as Element).closest<SVGElement>('.gm[data-gk], .gst'), gt = (e.target as Element).closest<HTMLElement>('.gt')
  film.querySelectorAll('.gt.lit').forEach(g => { if (g !== gt || !d) { g.classList.remove('lit'); g.querySelectorAll('.gm.on').forEach(x => x.classList.remove('on')) } })
  if (!d || !gt) return
  // the goals to light: the dot's own (a group: all of its visible goals), in the net and on the pitch; a goal inside a
  // group lights the group's dot too
  const keys = d.dataset.gs ? (d.dataset.vis ?? d.dataset.gs).split(' ') : [d.dataset.gk!]
  gt.classList.add('lit'); gt.querySelectorAll('.gm.on').forEach(x => x.classList.remove('on')); d.classList.add('on')
  keys.forEach(k => gt.querySelectorAll(`.gm[data-gk="${k}"]`).forEach(x => x.classList.add('on')))
  gt.querySelectorAll<SVGElement>('.gst').forEach(g => { if (keys.some(k => g.dataset.gs!.split(' ').includes(k))) g.classList.add('on') })
})
initNav('teams', LG, SEASON)
initFilm({ count: P.length + (ALL ? 5 : 3), key: KEY, onPaint, jumpHTML, self: 'teams.html' })
