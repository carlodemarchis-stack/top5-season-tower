// Squad film: one card per player of one club (?lg=ITA&team=INT), most league minutes first. Outfield players get the scorer card, keepers the goalkeeper card
// (src/film/cards.ts) — one look for every player. Everything is built here from the team card's squad (bio, photo)
// and the league's match cards (who played, minutes, goals, assists, cards, saves, shots faced); Serie A adds the
// Fantacalcio mark under each game. ?p=<espnId> opens on that player (the Squad tab's tiles link here).
import '../film/film.css'
import { initFilm, initHighlight, initTip, initLinks, initNav } from '../film/chrome'
import { scorerCard, keeperCard, matchTip, avgVote, esc, ord, logo, LEAGUE_NAME, type Ctx } from '../film/cards'
import { loadCoaches, coachCard, stints } from '../film/coach'
type Dict = Record<string, any>
const QS = new URLSearchParams(location.search)
const SEASON = QS.get('season') || '2026-27'
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
const LG = LG_ORDER.includes(QS.get('lg') || '') ? QS.get('lg')! : 'ITA'
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }

const MATCH_FILES = import.meta.glob('../data/matches-*-*-md*.js')
const VOTE_FILES = import.meta.glob('../data/votes-*.js')
const mdFiles = Object.keys(MATCH_FILES).filter(f => f.includes(`/matches-${LG}-${SEASON}-md`)).sort()
const [{ TEAMCARDS }, { TEAMS: T1 }, votes, ...MF] = await Promise.all([
  import(`../data/teams-${LG}-${SEASON}.js`), import(`../data/schedule-${LG}-${SEASON}.js`),
  VOTE_FILES[`../data/votes-${LG}-${SEASON}.js`]?.() ?? Promise.resolve(null), ...mdFiles.map(f => MATCH_FILES[f]()),
]) as Dict[]
const TEAMS: Record<string, Dict> = { [LG]: T1 }
const CTX: Ctx = { TEAMS, SEASON, VOTES: (votes as Dict | null)?.VOTES?.v || {} }
const MATCHES: Dict[] = MF.flatMap((f: Dict) => f.MATCHES)
const COACHES = SEASON === '2026-27' ? await loadCoaches(LG, SEASON) : null
const team = TEAMCARDS.teams.find((t: Dict) => t.code === QS.get('team')) || TEAMCARDS.teams[0]
const CODE = team.code, club = T1[CODE] || {}

// ---------- every player's season, from the match cards ----------
const clock = (s: string) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
const games = MATCHES.filter(M => M.h === CODE || M.a === CODE).sort((a, b) => a.md - b.md)
const teamLine = { pos: team.pos, pts: team.pts, W: team.W, D: team.D, L: team.L, GF: team.GF, GA: team.GA }
const side = (M: Dict) => M.h === CODE ? 'h' : 'a'

// a game he didn't play, as far as the match report knows: 'U' on the bench (not used), 'X' not in the matchday squad,
// '' unknown (a report saved before the bench was kept)
const benchState = (T: Dict, id: string) => !Array.isArray(T.bench) ? '' : T.bench.some((b: string[]) => String(b[0]) === String(id)) ? 'U' : 'X'
// only what the reports can tell: 'X' counts from his first matchday squad on (before it he may not have been at the
// club yet), and an 'X' right after his red card is the ban ('XR'); no other reason is ever guessed
function settle(list: Dict[], key: string, rc: (x: Dict) => boolean) {
  const first = list.findIndex(x => x[key] && x[key] !== 'X')
  list.forEach((x, i) => {
    if (x[key] !== 'X') return
    if (first < 0 || i < first) x[key] = ''
    else if (i > 0 && rc(list[i - 1])) x[key] = 'XR'
  })
}
// the line over the strip: a run of games out of the matchday squad, said as a fact; a run that opens right after a red
// card names the ban (where[i] = "at Como" for game i)
function availNote(states: string[], mds: number[], where: string[]) {
  const known = states.map((s, i) => ({ s, md: mds[i], i })).filter(x => x.s)
  let run = 0; for (let i = known.length - 1; i >= 0 && (known[i].s === 'X' || known[i].s === 'XR'); i--) run++
  const last5 = known.slice(-5), n5 = last5.filter(x => x.s === 'X' || x.s === 'XR').length
  const first = known[known.length - run], ban = run && first.s === 'XR' ? `sent off ${where[first.i - 1]} in MD ${mds[first.i - 1]}` : ''
  if (run === 1 && ban) return `<i></i>Suspended for MD ${first.md}: ${ban}`
  if (run >= 2) return `<i></i>Not in the matchday squad for the last <b>${run}</b> games (since MD ${first.md})${ban ? `, the first a ban: ${ban}` : ''}`
  if (n5 >= 2) return `<i></i>Not in the matchday squad in <b>${n5}</b> of the last ${last5.length} games`
  return ''
}
const WHERE = games.map(M => M.h === CODE ? `vs ${T1[M.a]?.name || M.a}` : `at ${T1[M.h]?.name || M.h}`)

function outfield(sq: Dict) {
  const matches = games.map(M => {
    const me = side(M), op = me === 'h' ? 'a' : 'h', T = me === 'h' ? M.home : M.away
    const base = { id: M.id, w: M.md, ha: me === 'h' ? 'H' : 'A', opp: M[op], gf: M.score[me], ga: M.score[op] }
    const pl = T.players.find((x: Dict) => String(x.id) === String(sq.espnId))
    const on = pl && !pl.st ? M.subs.find((s: Dict) => String(s.on) === String(pl.id)) : null
    if (!pl || (!pl.st && !on)) return { ...base, role: benchState(T, sq.espnId), min: 0, goals: [], G: 0, A: 0 }
    const off = M.subs.find((s: Dict) => String(s.off) === String(pl.id)), red = pl.ev.find((e: string[]) => e[0] === 'rc')
    const start = pl.st ? 0 : clock(on.min), end = Math.min(90, off ? clock(off.min) : red ? clock(red[1]) : 90)
    const goals = M.goals.filter((g: Dict) => String(g.byId) === String(pl.id) && g.s === me && g.kind !== 'og').map((g: Dict) => ({ min: g.min, kind: g.kind, ast: g.ast }))
    const n = (k: string) => pl.ev.filter((e: string[]) => e[0] === k).length
    return { ...base, role: pl.st ? 'S' : 'B', min: Math.max(1, Math.round(end - start)), goals, G: goals.length, A: n('ast'), YC: n('yc'), RC: n('rc') }
  })
  settle(matches, 'role', (m: Dict) => !!m.RC)
  const played = matches.filter(m => m.role === 'S' || m.role === 'B'), sum = (k: string) => played.reduce((a, m: Dict) => a + (m[k] || 0), 0)
  return { ...sq, nat: sq.natName || sq.nat, lg: LG, team: CODE, teamLine, matches, photo: `players/${sq.espnId}.webp`, note: availNote(matches.map(m => m.role === 'S' || m.role === 'B' ? 'P' : m.role), matches.map(m => m.w), WHERE),
    G: sum('G'), A: sum('A'), YC: sum('YC'), RC: sum('RC'), min: sum('min'), apps: played.length, starts: played.filter(m => m.role === 'S').length,
    pens: played.reduce((a, m: Dict) => a + m.goals.filter((g: Dict) => g.kind === 'pen').length, 0) }
}

// a keeper's season, as scripts/update-keepers.mjs builds it: each game he started, every shot on target he faced
function keeper(sq: Dict) {
  const k: Dict = { key: `${sq.espnId}-${CODE}`, id: sq.espnId, name: sq.name, n: sq.jersey, lg: LG, team: CODE, age: sq.age, nat: sq.natName || sq.nat, heightCm: sq.heightCm, tpos: team.pos,
    photo: `players/${sq.espnId}.webp`, games: [], shots: [], conceded: [], missed: [] }
  for (const M of games) {
    const me = side(M), op = me === 'h' ? 'a' : 'h', T = me === 'h' ? M.home : M.away
    const pl = T.players.find((x: Dict) => String(x.id) === String(sq.espnId))
    if (!pl || !pl.st) { k.missed.push([M.id, M.score[me], M.score[op], pl ? 'P' : benchState(T, sq.espnId), M.md]); continue }
    const off = pl.ev.find((e: string[]) => e[0] === 'sub'), until = off ? clock(off[1]) : 999
    const inTime = (x: Dict) => x.min + Math.min(x.ex || 0, 6) * .5 <= until
    const faced = M.shots.filter((x: Dict) => x.s === op && (x.k === 'on' || x.k === 'goal') && inTime(x))
    const conc = M.goals.filter((g: Dict) => g.s === op && clock(g.min) <= until)
    const pens = M.shots.filter((x: Dict) => x.s === op && x.pen && inTime(x))
    k.games.push({ id: M.id, md: M.md, opp: M[op], ha: me === 'h' ? 'H' : 'A', gf: M.score[me], ga: M.score[op], min: Math.round(Math.min(until, 90)),
      sv: off ? faced.filter((x: Dict) => x.k === 'on').length : (M.stats[me]?.saves ?? faced.filter((x: Dict) => x.k === 'on').length),
      conc: conc.length, pf: pens.length, ps: pens.filter((x: Dict) => x.k === 'on').length,
      yc: pl.ev.filter((e: string[]) => e[0] === 'yc').length, rc: pl.ev.filter((e: string[]) => e[0] === 'rc').length })
    k.shots.push(...faced.filter((x: Dict) => x.p).map((x: Dict) => [x.p, x.k === 'goal' ? 'g' : 's']))
    k.conceded.push(...conc.map((g: Dict) => [g.min, g.by, g.kind, M.md, M[op]]))
  }
  // the same rules as outfield players, over every club game in order (a start counts as being in the squad)
  const seq: Dict[] = games.map(M => { const g = k.games.find((x: Dict) => x.id === M.id), m = k.missed.find((x: any[]) => x[0] === M.id); return { id: M.id, md: M.md, st: g ? 'P' : m ? m[3] : '', rc: g?.rc } })
  settle(seq, 'st', (x: Dict) => !!x.rc)
  for (const x of seq) { const m = k.missed.find((y: any[]) => y[0] === x.id); if (m) m[3] = x.st === 'P' ? '' : x.st }
  k.note = availNote(seq.map(x => x.st), seq.map(x => x.md), WHERE)
  const sum = (f: string) => k.games.reduce((a: number, g: Dict) => a + g[f], 0)
  Object.assign(k, { SV: sum('sv'), GA: sum('conc'), MIN: sum('min'), GP: k.games.length, CS: k.games.filter((g: Dict) => g.conc === 0 && g.min >= 89).length, PF: sum('pf'), PS: sum('ps') })
  k.PCT = k.SV + k.GA ? Math.round(1000 * k.SV / (k.SV + k.GA)) / 10 : null
  return k
}

// ---------- the squad, most minutes played first (whatever the role) ----------
const ROLE = ['G', 'D', 'M', 'F', 'C'], TAG: Record<string, string> = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD', C: 'COACH' }
const minsOf = (x: Dict) => x.kind === 'gk' ? x.d.MIN : x.d.min
const P: Dict[] = (team.squad as Dict[]).map(sq => sq.pos === 'G' ? { kind: 'gk', sq, d: keeper(sq) } : { kind: 'out', sq, d: outfield(sq) })
  .sort((a, b) => minsOf(b) - minsOf(a) || (+a.sq.jersey || 99) - (+b.sq.jersey || 99))
// the head coach (FotMob, src/film/coach.ts) comes after the players who have played, before those who haven't
const played = games.map(M => { const me = side(M), op = me === 'h' ? 'a' : 'h'; return { id: M.id, md: M.md, opp: M[op], ha: me === 'h' ? 'H' : 'A', gf: M.score[me], ga: M.score[op] } })
const ST = COACHES ? stints(COACHES, CODE, played) : [], HEAD = ST.length ? COACHES!.coaches[ST[ST.length - 1].id] : null
if (HEAD) P.splice(P.filter(x => minsOf(x) > 0).length, 0, { kind: 'coach', sq: { name: HEAD.name, pos: 'C', nat: HEAD.nat }, d: {} })   // after the last player with league minutes

const mark = (id: string) => { const v = avgVote(CTX, id); return v == null ? null : v.toFixed(2) }
const fb = (sq: Dict) => sq.thumb || undefined
function card(x: Dict) {
  if (x.kind === 'coach') return coachCard(CTX, COACHES!, LG, CODE, played, teamLine, games, (votes as Dict | null)?.VOTES?.c?.[CODE])
  const { sq, d } = x, badge = TAG[sq.pos] || '', vm = LG === 'ITA' ? mark(sq.espnId) : null
  const shirt: [string, string] = [sq.jersey || '–', '']   // the panel's big number: his shirt number (no word under it)
  if (x.kind === 'gk') {
    const nums = `
      <div class="n big"><b>${d.SV}</b><span>Saves${d.PS ? ` · ${d.PS} pen${d.PS > 1 ? 's' : ''}` : ''}</span></div>
      <div class="n"><b>${d.GA}</b><span>Conceded</span></div>
      <div class="n"><b>${d.PCT ?? '–'}${d.PCT == null ? '' : '%'}</b><span>Save %</span></div>
      <div class="n"><b>${d.CS}</b><span>Clean sheets</span></div>
      <div class="n"><b>${d.MIN}'</b><span>Minutes${d.GP ? ` · ${d.GP} start${d.GP === 1 ? '' : 's'}` : ''}</span></div>
      ${vm ? `<div class="n"><b>${vm}</b><span>Avg mark</span></div>` : `<div class="n"><b>${d.PF ? `${d.PS}/${d.PF}` : '–'}</b><span>Pens saved</span></div>`}`
    return keeperCard(CTX, d, { badge, nums, photoFallback: fb(sq), big: shirt, noClub: true, note: d.note })
  }
  // the highlighted number: goals for a scorer, minutes for everyone else
  const goalsN = `<b>${d.G}</b><span>Goals${d.pens ? ` · ${d.pens} pen${d.pens > 1 ? 's' : ''}` : ''}</span>`, minsN = `<b>${d.min}'</b><span>Minutes</span>`
  const astN = `<div class="n"><b>${d.A}</b><span>Assists</span></div>`   // no goals but assists: assists come first, then goals
  const nums = `
    <div class="n big">${d.G ? goalsN : minsN}</div>
    ${d.G || !d.A ? `<div class="n">${d.G ? minsN : goalsN}</div>${astN}` : `${astN}<div class="n">${goalsN}</div>`}
    <div class="n"><b>${d.apps}</b><span>Games${d.starts < d.apps ? ` · ${d.starts} starts` : ''}</span></div>
    <div class="n"><b>${d.YC}${d.RC ? `<i class="rcard">/${d.RC}</i>` : ''}</b><span>${d.RC ? 'Yellow / red' : 'Yellow cards'}</span></div>
    <div class="n"><b>${vm ?? (d.G ? Math.round(d.min / d.G) + "'" : '–')}</b><span>${vm ? 'Avg mark' : 'Per goal'}</span></div>`
  return scorerCard(CTX, d, { badge, big: shirt, nums, photoFallback: fb(sq), noGoals: d.apps ? 'No goals yet' : 'No league minutes yet', noClub: true, note: d.note })
}

const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map(card).join('')
// top bar: the club, back to its team card
$('lgs').innerHTML = `<a class="lgb on" href="teams.html?lg=${LG}&t=${CODE}" title="Back to the ${esc(club.name || CODE)} team card"><img src="${logo(LG, CODE)}" alt=""><b style="font-size:12px;font-weight:900;white-space:nowrap">${esc(club.name || CODE)}</b><span>${P.length}</span></a>`
const NPL = P.filter(x => x.kind !== 'coach').length
$('cnote').innerHTML = `${NPL} players of ${esc(club.name || CODE)}, ${LEAGUE_NAME[LG]} ${SEASON.replace('-', '/')}, most league minutes first${HEAD ? ', the head coach after the last one who has played' : ''}.`

// ?p=<espnId> (a tile of the Squad tab): open on that player, then drop it from the URL
if (QS.has('p')) {
  const at = P.findIndex(x => QS.get('p') === 'coach' ? x.kind === 'coach' : String(x.sq.espnId) === QS.get('p')), q = new URLSearchParams(location.search); q.delete('p')
  history.replaceState(null, '', location.pathname + '?' + q.toString() + (at >= 0 ? '#' + (at + 1) : location.hash))
}

function onPaint(i: number) {
  const { sq, d } = P[i]
  if (P[i].kind === 'coach') {
    $('ctx').innerHTML = `${esc(club.name || CODE)} · head coach · <b>${esc(sq.name)}</b>`
    document.querySelector('meta[name="agwas:title"]')?.setAttribute('content', `${sq.name} · head coach · ${club.name || CODE}`); return
  }
  $('ctx').innerHTML = `${esc(club.name || CODE)} squad · ${team.pos ? ord(team.pos) : ''} in ${LEAGUE_NAME[LG]} · <b>${esc(sq.name)}</b> · ${TAG[sq.pos] || ''}${sq.jersey ? ` #${esc(sq.jersey)}` : ''} · ${P[i].kind === 'gk' ? `${d.GP} starts` : `${d.apps} games, ${d.min}'`}`
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[LG]); meta('title', `${sq.name} · ${club.name || CODE} · ${LEAGUE_NAME[LG]}`)
}

// search: a player of the squad; a number jumps to that card
const INDEX = P.map((x, i) => ({ i, role: x.sq.pos, label: x.sq.name, sub: x.kind === 'coach' ? 'head coach' : `${TAG[x.sq.pos] || ''}${x.sq.jersey ? ` #${x.sq.jersey}` : ''} · ${x.sq.min || 0}'`,
  key: [x.sq.name, x.sq.nat, TAG[x.sq.pos], x.kind === 'coach' ? 'coach manager' : '', x.sq.jersey].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }))
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  const NAME: Record<string, string> = { G: 'Goalkeepers', D: 'Defenders', M: 'Midfielders', F: 'Forwards', C: 'Coach' }
  return ROLE.map(r => { const rows = hits.filter(x => x.role === r); if (!rows.length) return ''
    return `<div class="jsec"><div class="jsechd">${NAME[r]}<span>${rows.length}</span></div><div class="jgrid">${rows.map(x =>
      `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` }).join('') || '<p>No player matches.</p>'
}

initLinks(film)
initHighlight(film, '[data-mid]', k => `[data-mid="${k}"]`, el => el.dataset.mid!)
initTip(film, '[data-gid]', el => { const x = P[[...film.children].indexOf(el.closest('.card')!)]; return x.kind === 'out' ? matchTip(CTX, x.d, el.dataset.gid!) : '' })
initNav('teams', LG, SEASON)
initFilm({ count: P.length, key: `top5.squad.${LG}.${CODE}${SEASON === '2026-27' ? '' : '.' + SEASON}`, onPaint, jumpHTML, self: 'player.html' })
