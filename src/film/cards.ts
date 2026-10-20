// The player cards, shared by three films: the scorer card (scorers.html), the goalkeeper card (keepers.html) and the
// squad film (player.html), which uses the scorer card for outfield players and the keeper card for keepers — one look
// for every player. Page context (club schedules, season, Serie A marks) comes in as `ctx`; `opt` adapts the panel and
// the numbers to the film.
type Dict = Record<string, any>
export type Ctx = { TEAMS: Record<string, Dict>; SEASON: string; VOTES: Dict }
export type CardOpt = {
  badge?: string                         // the panel's corner (default: #rank)
  big?: [number | string, string]        // the panel's big number and its word (default: goals / saves)
  nums?: string                          // the numbers row (default: the film's own)
  photoFallback?: string                 // a second photo to try (the squad thumbnail) before the initials
  noGoals?: string                       // outfield, no goal yet: what the goal section says
  noClub?: boolean                       // no club line under the name (the squad film is one club, named in its top bar)
  href?: string                          // the player's card in his squad film: the name and the photo open it
  note?: string                          // a line over the season strip (the squad film: a run of games out of the matchday squad)
  story?: boolean                        // the Season | Tactical switch + the Tactical pane (src/film/story.ts)
}
// a game he didn't play, when the match report says why it can (squad film): on the bench and not used, or not in the
// matchday squad at all — never a guessed reason; 'XR' = not in the squad right after a red card: the ban, the one reason we can know
const OUT_TITLE: Record<string, string> = { U: 'on the bench, not used', X: 'not in the matchday squad', XR: 'suspended — sent off the game before' }

export const LEAGUE_NAME: Record<string, string> = { ITA: 'Serie A', ENG: 'Premier League', ESP: 'LaLiga', FRA: 'Ligue 1', GER: 'Bundesliga' }
// the league photo shoots frame differently (LaLiga / Ligue 1 waist-up, the rest chest-up): scale so heads read the same size
export const PHOTO_H: Record<string, string> = { ESP: '90%', FRA: '88%', ITA: '82%', ENG: '80%', GER: '80%' }
// same six result shades as the towers / barcode — white scores on every shade (one look across the app)
export const RES6: Record<string, [string, string]> = {
  bigW: ['#177a41', '#fff'], W1: ['#3a9e62', '#fff'], D: ['#EAB308', '#fff'],
  nil: ['#9aa0a8', '#fff'], L1: ['#dc5c5e', '#fff'], bigL: ['#b3323a', '#fff'],
}
export const res6 = (gf: number, ga: number) => { const d = gf - ga; return d >= 2 ? 'bigW' : d === 1 ? 'W1' : d === 0 ? (gf === 0 ? 'nil' : 'D') : d === -1 ? 'L1' : 'bigL' }
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
export const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
export const logo = (lg: string, code: string) => `logos/${lg === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code}.png`
// a two-number figure (games / started, yellow / red …): the second number smaller, after the slash
export const n2 = (v: unknown, cls = '') => `<i class="n2${cls ? ' ' + cls : ''}">/${v}</i>`
// club games / his games / his starts (7/6/6): only his games big, the label tight so the figure stays narrow
export const gamesN = (team: number, apps: number, starts: number) =>
  `<div class="n tri" title="${team} club games · played ${apps} · started ${starts}"><b><i class="n0">${team}/</i>${apps}${n2(starts)}</b><span>Club/played/started</span></div>`
export const minOf = (c: string) => { const m = String(c).match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
const rnd = (s: number) => { const x = Math.sin(s * 99.13) * 43758.5453; return x - Math.floor(x) }
export function lum(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const POS: Record<string, string> = { F: 'Forward', M: 'Midfielder', D: 'Defender', G: 'Goalkeeper' }
const initials = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('')
// a booking in a game, in the box's top-right corner (beside the result, not stacked with the goals)
export const cardsHTML = (yc?: number, rc?: number) => (yc ? '<i class="cd y" title="yellow card"></i>' : '') + (rc ? `<i class="cd r${yc ? ' two' : ''}" title="red card"></i>` : '')
const matchHref = (ctx: Ctx, lg: string, md: number, id: string) => ctx.SEASON === '2026-27' ? ` data-href="matches.html?lg=${lg}&md=${md}&m=${id}"` : ''
export const matchHrefOf = matchHref
// the panel photo: the portrait, then (squad film) the thumbnail, then the initials
function photo(src: string | null, name: string, fb?: string, href?: string) {
  if (!src) return `<div class="ini">${esc(initials(name))}</div>`
  const link = href ? ` data-href="${href}" title="${esc(name)} · his card in the squad"` : ''
  const toIni = `this.outerHTML='<div class=&quot;ini&quot;>${esc(initials(name)).replace(/'/g, '')}</div>'`
  return `<img class="ph"${link} src="${src}" alt="${esc(name)}" onerror="${fb ? `this.onerror=function(){${toIni}};this.src='${fb}'` : toIni}">`
}

// the player's bio as a lower third on the photo: label over value, one cell each (role · age · nation · height)
export function bio(cells: [string, unknown][]) {
  const c = cells.filter(([, v]) => v != null && v !== '')
  return c.length ? `<div class="bio">${c.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''
}

// the bio's values shrink together (one size for the row) until every one shows whole — never an ellipsis. Refit only
// when the box's WIDTH changes: a smaller font makes it shorter, and refitting on that would loop
const bioRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => es.forEach(e => fitBio(e.target as HTMLElement))) : null
function fitBio(bio: HTMLElement) {
  const w = bio.clientWidth; if (!w || bio.dataset.w === String(w)) return
  bio.dataset.w = String(w); bio.style.removeProperty('--bf')
  const bs = [...bio.querySelectorAll<HTMLElement>('b')]; if (!bs.length) return
  let fs = parseFloat(getComputedStyle(bs[0]).fontSize)
  while (fs > 9 && bs.some(b => b.scrollWidth > b.clientWidth + .5)) { fs -= .5; bio.style.setProperty('--bf', fs + 'px') }
}
export function fitBios(root: ParentNode) { root.querySelectorAll<HTMLElement>('.bio').forEach(b => bioRO?.observe(b)) }

// Serie A: each game's Fantacalcio mark (Redazione) under its box — scripts/update-votes.mjs; other leagues have none
export function voteHTML(ctx: Ctx, lg: string, id: string, md: number) {
  if (lg !== 'ITA') return ''
  const v = ctx.VOTES[String(id)]?.[md]
  return v == null ? '<div class="vt">&nbsp;</div>' : `<div class="vt${v >= 7 ? ' hi' : v < 6 ? ' lo' : ''}" title="Fantacalcio mark (Redazione)">${Number.isInteger(v) ? v : v.toFixed(1)}</div>`
}
// a player's average Serie A mark (null when unrated)
export function avgVote(ctx: Ctx, id: string) {
  const v = Object.values(ctx.VOTES[String(id)] || {}) as number[]
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100 : null
}

// the Season | Tactical | Heatmaps switch on a player card (no height taken from the card); src/film/story.ts fills the
// pane — every game of his club: where he lined up (or, Heatmaps, where he touched the ball), role + formation,
// minutes, goals, assists, cards
// on the club line, right-aligned (it stays in both views); a card without a club line (squad film) floats it top right
export const tacSwitch = (corner = false, heat = true) => `<div class="tacsw${corner ? ' corner' : ''}" role="tablist"><button data-view="season" role="tab">Season</button><button data-view="tac" role="tab">Tactical</button>${heat ? '<button data-view="heat" role="tab">Heatmaps</button>' : ''}</div>`

// ================= the scorer card (outfield players) =================
export function scorerCard(ctx: Ctx, p: Dict, opt: CardOpt = {}) {
  const club = ctx.TEAMS[p.lg][p.team] || {}
  const c = club.primary || '#555'
  const light = lum(c) > 0.55
  const ink = light ? '#15181d' : '#fff'
  const c2 = light ? '#15181d' : c                     // the big goals number takes the club colour unless it is too pale to read
  const hlInk = lum(c) > 0.183 ? '#15181d' : '#fff'     // text on the club-colour highlight: white only where it reaches 4.5:1
  const t = p.teamLine
  const goals = p.matches.flatMap((m: Dict) => m.goals.map((g: Dict) => ({ ...g, m })))
    .map((g: Dict) => `<span class="g" data-mid="${g.m.id}"><b>${esc(g.min)}</b> ${g.m.ha === 'H' ? 'vs' : 'at'} ${esc(g.m.opp)}${g.kind === 'pen' ? '<em>PEN</em>' : g.kind === 'head' ? '<em>HEAD</em>' : g.kind === 'fk' ? '<em>FK</em>' : ''}${g.ast ? ` · ast ${esc(g.ast)}` : ''}</span>`).join('')
  // his assists — minute, opponent, who scored: under the goals, or on their own when he has none yet (squad film)
  const assists = p.matches.flatMap((m: Dict) => (m.assists || []).map((a: Dict) =>
    `<span class="g" data-mid="${m.id}"><b>${esc(a.min)}</b> ${m.ha === 'H' ? 'vs' : 'at'} ${esc(m.opp)}${a.to ? ` · for ${esc(a.to)}` : ''}</span>`)).join('')
  const minPerGoal = p.G ? Math.round(p.min / p.G) : null
  const [bigN, bigW] = opt.big || [p.G, `goal${p.G === 1 ? '' : 's'}`]
  return `<section class="card" id="p-${p.espnId}" style="--c:${c};--c2:${c2};--ink:${ink};--hlink:${hlInk};--ph:${PHOTO_H[p.lg]}">
    <div class="pan">
      <img class="wm" src="${logo(p.lg, p.team)}" alt="" onerror="this.remove()">
      <div class="rk">${opt.badge ?? `#${p.rank}`}</div>
      <div class="gbig"><b>${bigN}</b><span>${bigW}</span></div>
      ${photo(p.photo, p.name, opt.photoFallback, opt.href)}
      ${bio([['Role', POS[p.pos] || p.posName], ['Age', p.age], ['Nation', p.nat], ['Height', p.heightCm ? `${p.heightCm} cm` : null]])}
    </div>
    <div class="body">
      <div>
        <h1 style="--len:${[...p.name].length};--word:${Math.max(...p.name.split(/[\s-]+/).map((w: string) => [...w].length))}"${opt.href ? ` class="plink" data-href="${opt.href}" title="${esc(p.name)} · his card in the squad"` : ''}>${esc(p.name)}</h1>
      </div>
      ${opt.noClub ? (opt.story ? tacSwitch(true) : '') : `<div class="club"><img src="${logo(p.lg, p.team)}" alt="" onerror="this.remove()">${esc(club.name || p.team)}
        <span class="tl"><b>${t.pos ? ord(t.pos) : '–'}</b> · <b>${t.pts}</b> pts · ${t.W}-${t.D}-${t.L} · GD ${t.GF - t.GA >= 0 ? '+' : ''}${t.GF - t.GA}</span>${opt.story ? tacSwitch() : ''}</div>`}${opt.story ? '<div class="pane-season">' : ''}
      <div class="nums">${opt.nums ?? `
        <div class="n big"><b>${p.G}</b><span>Goals${p.pens ? ` · ${p.pens} pen${p.pens > 1 ? 's' : ''}` : ''}</span></div>
        <div class="n"><b>${p.A}</b><span>Assists</span></div>
        ${gamesN(t.W + t.D + t.L, p.apps, p.starts)}
        <div class="n"><b>${p.min}'</b><span>Minutes</span></div>
        <div class="n"><b>${minPerGoal ?? '–'}'</b><span>Per goal</span></div>
        <div class="n"><b>${p.sog}${n2(p.shots)}</b><span>On target / shots</span></div>`}
      </div>
      ${opt.note ? `<div class="avail">${opt.note}</div>` : ''}
      ${strip2(ctx, p, club, !goals && opt.noGoals != null)}
      ${(() => { const list = goals || opt.noGoals == null ? `<div class="glist">
        <div class="sec">The goals</div>
        <div class="goals">${goals}</div>${goals && assists ? `
        <div class="sec">The assists</div>
        <div class="goals">${assists}</div>` : ''}
      </div>` : assists ? `<div class="glist"><div class="sec">The assists</div><div class="goals">${assists}</div></div>`
        : `<div class="glist"><div class="sec">The goals</div><div class="goals"><span style="color:#9aa0a8;font-size:12px">${opt.noGoals}</span></div></div>`
        // his shots on one goal, at the bottom right — when the match reports have them
        return p.at?.length ? `<div class="gsplit">${list}<div class="shotg"><div class="sec">His shots${shotLegend(p.at)}</div>${shotGoal(p.at, c2, p.espnId)}</div></div>` : list })()}
      ${opt.story ? `</div><div class="pane-story" data-story="${p.lg}|${p.team}|${p.espnId}"></div>` : ''}
    </div>
  </section>`
}

// the season in two rows — matchdays 1–19 over 20–38, unplayed fixtures included — plus the goals on a 0–90' line
const kindName = (k: string) => k === 'pen' ? 'penalty' : k === 'head' ? 'header' : k === 'fk' ? 'free kick' : 'goal'
function strip2(ctx: Ctx, p: Dict, club: Dict, noLine = false) {
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w)
  const byId: Record<string, Dict> = Object.fromEntries(p.matches.map((m: Dict) => [m.id, m]))
  const half = Math.ceil(all.length / 2)
  const maxMarks = Math.max(1, ...p.matches.map((m: Dict) => m.goals.length + m.A))
  const cell = (g: Dict) => {
    const m = byId[g.id]
    const at = g.ha === 'A' ? '@' : ''
    if (!m) return `<div class="c2 up" data-gid="${g.id}"><div class="mk"></div><div class="bx"></div><div class="op">${at}${esc(g.opp)}</div>${voteHTML(ctx, p.lg, '', 0)}</div>`
    const [bg, fg] = RES6[res6(m.gf, m.ga)]
    const marks = [...m.goals.map((x: Dict) => `<i class="gl${x.kind === 'pen' ? ' pen' : ''}"></i>`), ...Array.from({ length: m.A }, () => '<i class="as"></i>')].reverse().join('')
    // the box reads bottom-up as the 90': the unplayed share is veiled — at the top for a starter (he played the start),
    // at the bottom for a sub (he played the end), so the darker part sits where his minutes were
    const played = m.role === 'S' || m.role === 'B', out = m.role === 'X' || m.role === 'XR'
    const veil = played ? Math.round((1 - Math.min(m.min, 90) / 90) * 100) : 100
    const ink = !played || m.min < 45 ? '#15181d' : fg
    return `<div class="c2${played ? (m.role === 'B' ? ' sub' : '') : ' dnp'}${out ? ' out' : ''}${m.role === 'XR' ? ' sus' : ''}" data-mid="${g.id}" data-gid="${g.id}"${matchHref(ctx, p.lg, g.w, g.id)}${OUT_TITLE[m.role] ? ` title="MD${g.w}: ${OUT_TITLE[m.role]}"` : ''}>
      <div class="mk">${marks}</div>
      <div class="bx" style="background:${bg};color:${ink}"><span class="vl" style="height:${veil}%"></span><b>${m.gf}-${m.ga}</b>${cardsHTML(m.YC, m.RC)}</div>
      <div class="op">${at}${esc(g.opp)}</div>${voteHTML(ctx, p.lg, p.espnId, g.w)}</div>`
  }
  const row = (gs: Dict[], lbl: string) => `<div class="row2"><div class="rl">${lbl}</div><div class="cells" style="--n:${half};--mk:${maxMarks}">${gs.map(cell).join('')}</div></div>`
  return `<div class="s2">
    ${row(all.slice(0, half), `MD 1–${half}`)}${row(all.slice(half), `MD ${half + 1}–${all.length}`)}
  </div>${noLine ? '' : `
  <div class="s2">
    <div class="sec">When he scores${goalLegend(p)}</div>${goalLine(p)}
  </div>`}`
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

// the match card on hover / tap of a season box: the game, and his part in it
const KIND: Record<string, string> = { pen: 'pen', head: 'header', fk: 'free kick' }
export function matchTip(ctx: Ctx, p: Dict, gid: string) {
  const club = ctx.TEAMS[p.lg][p.team] || {}, g = (club.games || []).find((x: Dict) => x.id === gid), m = p.matches.find((x: Dict) => x.id === gid)
  if (!g) return ''
  const opp = ctx.TEAMS[p.lg][g.opp] || {}, when = g.et ? new Date(g.et.replace(' ', 'T')) : null
  const hh = g.et ? g.et.slice(11, 16) : '', tbc = !hh || +hh.slice(0, 2) < 6   // CET, as in the tower; a small-hours time = not fixed yet
  const date = when ? when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + (m || tbc ? '' : ` · ${hh} CET`) : ''
  const side = (code: string, name: string) => `<span class="mt-team"><img src="${logo(p.lg, code)}" alt="">${esc(name)}</span>`
  const us: [string, string] = [p.team, club.name || p.team], them: [string, string] = [g.opp, opp.name || g.oppFull || g.opp]
  const [home, away] = g.ha === 'H' ? [us, them] : [them, us]
  const head = `<div class="mt-top">MD ${g.w}${date ? ` · ${date}` : ''} · ${g.ha === 'H' ? 'home' : 'away'}</div>`
  if (!m) return `${head}<div class="mt-score">${side(...home)}<b class="mt-vs">vs</b>${side(...away)}</div><div class="mt-foot">to play</div>`
  const [bg, fg] = RES6[res6(m.gf, m.ga)], hs = g.ha === 'H' ? `${m.gf}–${m.ga}` : `${m.ga}–${m.gf}`
  const nm = p.name, stat = (n: number | undefined, w: string) => n == null ? '' : `<span><b>${n}</b> ${w}</span>`
  const part = !(m.role === 'S' || m.role === 'B') ? `<div class="mt-foot">${esc(nm)} ${OUT_TITLE[m.role] ? OUT_TITLE[m.role].replace(/^not/, 'was not').replace(/^on the bench/, 'was on the bench').replace(/^suspended/, 'was suspended') : 'did not play'}</div>`
    : `<div class="mt-me"><b>${esc(nm)}</b> · ${m.role === 'B' ? `off the bench${m.sub ? ` for ${esc(m.sub.who)} at ${esc(m.sub.min)}` : ''}` : `started${m.RC ? ' · sent off' : ''}`}${m.role === 'S' && m.sub ? ` · replaced by <b>${esc(m.sub.who)}</b> at <b>${esc(m.sub.min)}</b>` : ` · <b>${m.min}′</b>`}</div>
      ${m.goals.length ? `<div class="mt-goals">${m.goals.map((x: Dict) => `<div class="mt-g"><span class="mt-min">${esc(x.min)}</span><span>goal${x.kind ? ` <em>${KIND[x.kind] || x.kind}</em>` : ''}${x.ast ? ` <i>· ${esc(x.ast)}</i>` : ''}</span></div>`).join('')}</div>` : ''}
      <div class="mt-stats">${stat(m.G, `goal${m.G === 1 ? '' : 's'}`)}${stat(m.A, `assist${m.A === 1 ? '' : 's'}`)}${stat(m.SH, 'shots')}${stat(m.SOG, 'on target')}${m.YC || m.RC ? `<span><b>${m.YC || m.RC}</b><i class="${m.RC ? 'rc' : 'yc'}"></i></span>` : ''}</div>`
  return `${head}<div class="mt-score">${side(...home)}<b class="mt-res" style="background:${bg};color:${fg}">${hs}</b>${side(...away)}</div>${part}`
}

// ================= the goalkeeper card =================
// the season goal: every shot on target he faced (the shooter's view), six zones
const PL: Record<string, number[]> = { bl: [.17, .74], br: [.83, .74], tl: [.17, .27], tr: [.83, .27], c: [.5, .52], tc: [.5, .25], bc: [.5, .76], pl: [0, .5], pr: [1, .5], bar: [.5, 0] }
// goals are red — unless the club's own colour is a red too, then black, so a save and a goal never look alike
const rgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const goalInk = (c: string) => Math.hypot(...rgb(c).map((v, k) => v - rgb('#b3323a')[k])) < 130 ? '#15181d' : '#b3323a'
const zoneOf = (p: string) => p === 'tl' || p === 'tr' || p === 'bl' || p === 'br' || p === 'tc' ? p : 'bc'
function bigGoal(k: Dict, c: string) {
  const W = 300, H = 100, ox = 30, oy = 22, shots = k.shots.filter((s: string[]) => PL[s[0]])
  const Z: Dict = {}; for (const [p, r] of shots) { const z = zoneOf(p); (Z[z] ||= { sv: 0, g: 0 })[r === 'g' ? 'g' : 'sv']++ }
  const ZX: Record<string, number> = { tl: 0, tc: 1, tr: 2, bl: 0, bc: 1, br: 2 }
  const zones = Object.entries(ZX).map(([z, i]) => { const v = Z[z] || { sv: 0, g: 0 }, n = v.sv + v.g, top = z[0] === 't'
    return n ? `<text x="${ox + (i + .5) * W / 3}" y="${top ? oy - 8 : oy + H + 15}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#15181d" opacity=".8">${v.sv}/${n} saved</text>` : '' }).join('')
  const pts = shots.map(([p, r]: string[], i: number) => { const [px, py] = PL[p], x = ox + px * W + (rnd(i + 3) - .5) * 26, y = oy + py * H + (rnd(i + 9) - .5) * 18
    return r === 'g' ? `<circle cx="${x}" cy="${y}" r="6" fill="${goalInk(c)}" stroke="#fff" stroke-width="2"/>` : `<circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="${c}" stroke-width="2.4"/>` }).join('')
  return `<svg viewBox="0 0 360 148" preserveAspectRatio="xMidYMid meet"><defs><pattern id="nt${k.key}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#dfe3e6" stroke-width=".8"/></pattern></defs>
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="url(#nt${k.key})"/>
    <g stroke="#e3e6ea" stroke-width="1" stroke-dasharray="3 3"><line x1="${ox + W / 3}" x2="${ox + W / 3}" y1="${oy}" y2="${oy + H}"/><line x1="${ox + 2 * W / 3}" x2="${ox + 2 * W / 3}" y1="${oy}" y2="${oy + H}"/><line x1="${ox}" x2="${ox + W}" y1="${oy + H / 2}" y2="${oy + H / 2}"/></g>
    <path d="M${ox} ${oy + H}V${oy}H${ox + W}V${oy + H}" fill="none" stroke="#15181d" stroke-width="5" stroke-linejoin="round"/>
    <line x1="6" x2="354" y1="${oy + H}" y2="${oy + H}" stroke="#c9ced4" stroke-width="1.5"/>${zones}${pts}</svg>`
}
// ================= a scorer's shots on one goal (the shooter's view, like the keeper card's) =================
// at = [[placement, g | on | off | blk]] from the match reports' commentary; off target lands round the frame
const PLS: Record<string, number[]> = { ...PL, xl: [-.14, .62], xr: [1.14, .62], xh: [.5, -.24], xhl: [.14, -.24], xhr: [.86, -.24], ntl: [.05, -.1], ntr: [.95, -.1] }
function shotLegend(at: string[][]) {
  const n = (k: string) => at.filter(s => s[1] === k).length
  return `<span class="gsum">● <b>${n('g')}</b> scored · ○ <b>${n('on')}</b> saved · × <b>${n('off')}</b> off target${n('blk') ? ` · <b>${n('blk')}</b> blocked` : ''}</span>`
}
export function shotGoal(at: string[][], c: string, key: string) {
  const W = 260, H = 86, ox = 50, oy = 34
  const pts = at.filter(([p, k]) => PLS[p] && k !== 'blk').map(([p, k], i) => {
    const [px, py] = PLS[p], x = ox + px * W + (rnd(i + 3) - .5) * 22, y = oy + py * H + (rnd(i + 9) - .5) * 14
    return k === 'g' ? `<circle cx="${x}" cy="${y}" r="6" fill="${c}" stroke="#fff" stroke-width="2"/>`
      : k === 'on' ? `<circle cx="${x}" cy="${y}" r="4.6" fill="#fff" stroke="${c}" stroke-width="2.2"/>`
      : `<path d="M${x - 3.5} ${y - 3.5}l7 7M${x + 3.5} ${y - 3.5}l-7 7" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity=".7"/>` }).join('')   // ● goal · ○ saved · × off target, as on every shot graphic
  return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid meet"><defs><pattern id="ns${key}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#dfe3e6" stroke-width=".8"/></pattern></defs>
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="url(#ns${key})"/>
    <path d="M${ox} ${oy + H}V${oy}H${ox + W}V${oy + H}" fill="none" stroke="#15181d" stroke-width="5" stroke-linejoin="round"/>
    <line x1="4" x2="356" y1="${oy + H}" y2="${oy + H}" stroke="#c9ced4" stroke-width="1.5"/>${pts}</svg>`
}

// the season in two rows: one box per fixture of his club — result colour, his saves, goals against above
function strip(ctx: Ctx, k: Dict, club: Dict) {
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w), byId: Dict = Object.fromEntries(k.games.map((g: Dict) => [g.id, g])), half = Math.ceil(all.length / 2)
  const maxMarks = Math.max(1, ...k.games.map((g: Dict) => g.conc))
  const cell = (g: Dict) => { const m = byId[g.id], at = g.ha === 'A' ? '@' : ''
    const miss = !m && (k.missed || []).find((x: any[]) => x[0] === g.id)
    if (miss) { const [bg] = RES6[res6(miss[1], miss[2])], st = miss[3], out = st === 'X' || st === 'XR'
      return `<div class="c2 dnp${out ? ' out' : ''}${st === 'XR' ? ' sus' : ''}"${matchHref(ctx, k.lg, g.w, g.id)} title="MD${g.w} · ${g.ha === 'H' ? 'vs' : 'at'} ${esc(g.opp)} ${miss[1]}-${miss[2]} · ${OUT_TITLE[st] || "he didn't start"}"><div class="mk"></div><div class="bx" style="background:${bg};color:#15181d"><span class="vl" style="height:100%"></span><b>–</b></div><div class="op">${at}${esc(g.opp)}</div>${voteHTML(ctx, k.lg, '', 0)}</div>` }
    if (!m) return `<div class="c2 up"><div class="mk"></div><div class="bx"></div><div class="op">${at}${esc(g.opp)}</div>${voteHTML(ctx, k.lg, '', 0)}</div>`
    const [bg, fg] = RES6[res6(m.gf, m.ga)]
    return `<div class="c2" data-mid="${m.id}"${matchHref(ctx, k.lg, g.w, m.id)} title="MD${m.md} · ${m.ha === 'H' ? 'vs' : 'at'} ${esc(m.opp)} ${m.gf}-${m.ga} · ${m.sv} saves · ${m.conc} conceded${m.min < 90 ? ` · ${m.min}'` : ''}">
      <div class="mk">${Array.from({ length: m.conc }, () => '<i class="ga"></i>').join('')}</div>
      <div class="bx" style="background:${bg};color:${fg}"><b>${m.sv}</b>${cardsHTML(m.yc, m.rc)}</div><div class="op">${at}${esc(m.opp)}</div>${voteHTML(ctx, k.lg, k.id, m.md)}</div>` }
  const row = (gs: Dict[], lbl: string) => `<div class="row2"><div class="rl">${lbl}</div><div class="cells" style="--n:${half};--mk:${maxMarks}">${gs.map(cell).join('')}</div></div>`
  return `<div class="s2">${row(all.slice(0, half), `MD 1–${half}`)}${row(all.slice(half), `MD ${half + 1}–${all.length}`)}</div>`
}
export function keeperCard(ctx: Ctx, k: Dict, opt: CardOpt = {}) {
  const club = ctx.TEAMS[k.lg][k.team] || {}, c = club.primary || '#555', light = lum(c) > .55
  const hlInk = lum(c) > 0.183 ? '#15181d' : '#fff'
  const mid = (md: number) => k.games.find((g: Dict) => g.md === md)?.id
  const conceded = [...k.conceded].sort((a, b) => a[3] - b[3] || minOf(a[0]) - minOf(b[0])).map(([min, by, kind, md, opp]: any[]) =>
    `<div class="cg" data-mid="${mid(md)}"><b>${esc(min)}</b>${esc(by)}${kind === 'pen' ? ' <em>PEN</em>' : kind === 'og' ? ' <em>OG</em>' : kind === 'head' ? ' <em>HEAD</em>' : kind === 'fk' ? ' <em>FK</em>' : ''}<small>MD${md} · ${esc(opp)}</small></div>`).join('')
  const [bigN, bigW] = opt.big || [k.SV, `save${k.SV === 1 ? '' : 's'}`]
  return `<section class="card" id="k-${k.key}" style="--c:${c};--c2:${light ? '#15181d' : c};--ink:${light ? '#15181d' : '#fff'};--hlink:${hlInk};--ph:${PHOTO_H[k.lg]}">
    <div class="pan">
      <img class="wm" src="${logo(k.lg, k.team)}" alt="" onerror="this.remove()">
      <div class="rk">${opt.badge ?? `#${k.rank}`}</div>
      <div class="gbig"><b>${bigN}</b><span>${bigW}</span></div>
      ${photo(k.photo, k.name, opt.photoFallback, opt.href)}
      ${bio([['Role', 'Goalkeeper'], ['Age', k.age], ['Nation', k.nat], ['Height', k.heightCm ? `${k.heightCm} cm` : null]])}
    </div>
    <div class="body">
      <div>
        <h1 style="--len:${[...k.name].length};--word:${Math.max(...k.name.split(/[\s-]+/).map((w: string) => [...w].length))}"${opt.href ? ` class="plink" data-href="${opt.href}" title="${esc(k.name)} · his card in the squad"` : ''}>${esc(k.name)}</h1>
      </div>
      ${opt.noClub ? (opt.story ? tacSwitch(true) : '') : `<div class="club"><img src="${logo(k.lg, k.team)}" alt="" onerror="this.remove()">${esc(club.name || k.team)}
        <span class="tl">${LEAGUE_NAME[k.lg]}${k.tpos ? ` · <b>${ord(k.tpos)}</b>` : ''}</span>${opt.story ? tacSwitch() : ''}</div>`}${opt.story ? '<div class="pane-season">' : ''}
      <div class="nums">${opt.nums ?? `
        <div class="n big"><b>${k.SV}</b><span>Saves${k.PS ? ` · ${k.PS} pen${k.PS > 1 ? 's' : ''}` : ''}</span></div>
        <div class="n"><b>${k.GA}</b><span>Conceded</span></div>
        <div class="n"><b>${k.PCT ?? '–'}%</b><span>Save %</span></div>
        <div class="n"><b>${k.CS}</b><span>Clean sheets</span></div>
        ${gamesN(k.GP + k.missed.length, k.APPS ?? k.GP, k.GP)}
        <div class="n"><b>${k.PF ? `${k.PS}${n2(k.PF)}` : '–'}</b><span>Pens saved</span></div>`}
      </div>
      ${opt.note ? `<div class="avail">${opt.note}</div>` : ''}
      ${strip(ctx, k, club)}
      <div class="gwrap">
        <div><div class="sec">Every shot on target he faced</div><div class="gf">${bigGoal(k, c)}</div>
          <div class="gleg"><span><i style="background:#fff;border:2.4px solid ${c}"></i>saved</span><span><i style="background:${goalInk(c)}"></i>goal</span><span style="color:#9aa0a8">· the shooter's view · each zone: saved / faced</span></div></div>
        <div><div class="sec">The goals against him · ${k.GA}</div><div class="clist">${conceded || '<span style="color:#9aa0a8;font-size:12px">none</span>'}</div></div>
      </div>
      ${opt.story ? `</div><div class="pane-story" data-story="${k.lg}|${k.team}|${k.id}"></div>` : ''}
    </div>
  </section>`
}

// ================= THE player card: one card for every film (squad, scorers, keepers) =================
// The panel's big number is his shirt; the corner his role (+ his rank in a ranked film); the club line always, with
// the Season | Tactical switch on it; one rule for the numbers. The season itself comes from src/film/season.ts.
const TAG: Record<string, string> = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' }
export const roleBadge = (pos: string | null, rank?: number | null) => `${TAG[pos || ''] || ''}${rank ? `<small>#${rank}</small>` : ''}`
export type PlayerOpt = { rank?: number | null; href?: string; story?: boolean }
const markOf = (ctx: Ctx, id: string) => { const v = avgVote(ctx, id); return v == null ? null : v.toFixed(2) }
// outfield numbers: the highlighted one is his goals, else his assists, else his minutes; then the other two of those,
// club / played / started, on target / shots, and the Serie A mark (elsewhere: per goal for a scorer, else his cards)
export function outfieldCard(ctx: Ctx, d: Dict, o: PlayerOpt = {}) {
  const goalsN = `<b>${d.G}</b><span>Goals${d.pens ? ` · ${d.pens} pen${d.pens > 1 ? 's' : ''}` : ''}</span>`, astN = `<b>${d.A}</b><span>Assists</span>`, minsN = `<b>${d.min}'</b><span>Minutes</span>`
  const order = d.G ? [goalsN, astN, minsN] : d.A ? [astN, goalsN, minsN] : [minsN, goalsN, astN]
  const vm = d.lg === 'ITA' ? markOf(ctx, d.espnId) : null
  const last = vm ? `<b>${vm}</b><span>Avg mark</span>` : d.G ? `<b>${Math.round(d.min / d.G)}'</b><span>Per goal</span>` : `<b>${d.YC}${d.RC ? n2(d.RC, 'r') : ''}</b><span>${d.RC ? 'Yellow / red' : 'Yellow cards'}</span>`
  const nums = `<div class="n big">${order[0]}</div><div class="n">${order[1]}</div>${gamesN(d.matches.length, d.apps, d.starts)}
    <div class="n">${order[2]}</div><div class="n"><b>${d.sog}${n2(d.shots)}</b><span>On target / shots</span></div><div class="n">${last}</div>`
  return scorerCard(ctx, d, { badge: roleBadge(d.pos, o.rank), big: [d.jersey || '–', ''], nums, photoFallback: d.thumb || undefined, note: d.note,
    noGoals: d.apps ? 'No goals yet' : 'No league minutes yet', href: o.href, story: o.story })
}
// keeper numbers: saves (highlighted), conceded, save %, clean sheets, minutes, club / played / started, the Serie A
// mark (elsewhere: penalties saved)
export function keeperFilmCard(ctx: Ctx, k: Dict, o: PlayerOpt = {}) {
  const vm = k.lg === 'ITA' ? markOf(ctx, k.id) : null
  const nums = `<div class="n big"><b>${k.SV}</b><span>Saves${k.PS ? ` · ${k.PS} pen${k.PS > 1 ? 's' : ''}` : ''}</span></div>
    <div class="n"><b>${k.GA}</b><span>Conceded</span></div><div class="n"><b>${k.PCT ?? '–'}${k.PCT == null ? '' : '%'}</b><span>Save %</span></div>
    <div class="n"><b>${k.CS}</b><span>Clean sheets</span></div><div class="n"><b>${k.MIN}'</b><span>Minutes</span></div>${gamesN(k.games.length + k.missed.length, k.APPS ?? k.GP, k.GP)}
    ${vm ? `<div class="n"><b>${vm}</b><span>Avg mark</span></div>` : `<div class="n"><b>${k.PF ? `${k.PS}${n2(k.PF)}` : '–'}</b><span>Pens saved</span></div>`}`
  return keeperCard(ctx, k, { badge: roleBadge('G', o.rank), big: [k.n || '–', ''], nums, photoFallback: k.thumb || undefined, note: k.note, href: o.href, story: o.story })
}
