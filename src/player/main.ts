// Squad film: one card per player of one club (?lg=ITA&team=INT), most league minutes first. Outfield players get the scorer card, keepers the goalkeeper card
// (src/film/cards.ts) — one look for every player. Everything is built here from the team card's squad (bio, photo)
// and the league's match cards (who played, minutes, goals, assists, cards, saves, shots faced); Serie A adds the
// Fantacalcio mark under each game. ?p=<espnId> opens on that player (the Squad tab's tiles link here).
import '../film/film.css'
import { initStory } from '../film/story'
import { initFilm, initHighlight, initTip, initLinks, initNav, initHScroll } from '../film/chrome'
import { outfieldCard, keeperFilmCard, matchTip, esc, ord, logo, LEAGUE_NAME, type Ctx, fitBios } from '../film/cards'
import { outfieldSeason, keeperSeason, teamLineOf, type Club } from '../film/season'
import { loadCoaches, coachCard, stints, headOf } from '../film/coach'
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

// ---------- every player's season, from the match cards: src/film/season.ts (the same calculation as the scorers and keepers films) ----------
const games = MATCHES.filter(M => M.h === CODE || M.a === CODE).sort((a, b) => a.md - b.md)
const teamLine = teamLineOf(team)
const side = (M: Dict) => M.h === CODE ? 'h' : 'a'
const CLUB: Club = { lg: LG, code: CODE, games, teams: T1, team }

// ---------- the squad, most minutes played first (whatever the role) ----------
const ROLE = ['G', 'D', 'M', 'F', 'C'], TAG: Record<string, string> = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD', C: 'COACH' }
const minsOf = (x: Dict) => x.kind === 'gk' ? x.d.MIN : x.d.min
const P: Dict[] = (team.squad as Dict[]).map(sq => sq.pos === 'G' ? { kind: 'gk', sq, d: keeperSeason(CLUB, sq) } : { kind: 'out', sq, d: outfieldSeason(CLUB, sq) })
  .sort((a, b) => minsOf(b) - minsOf(a) || (+a.sq.jersey || 99) - (+b.sq.jersey || 99))
// the head coach (FotMob, src/film/coach.ts) comes after the players who have played, before those who haven't
const played = games.map(M => { const me = side(M), op = me === 'h' ? 'a' : 'h'; return { id: M.id, md: M.md, opp: M[op], ha: me === 'h' ? 'H' : 'A', gf: M.score[me], ga: M.score[op] } })
const ST = COACHES ? stints(COACHES, CODE, played) : [], HID = COACHES && ST.length ? headOf(COACHES, CODE, ST).id : null, HEAD = HID ? COACHES!.coaches[HID] : null
if (HEAD) P.splice(P.filter(x => minsOf(x) > 0).length, 0, { kind: 'coach', sq: { name: HEAD.name, pos: 'C', nat: HEAD.nat }, d: {} })   // after the last player with league minutes

function card(x: Dict) {
  if (x.kind === 'coach') return coachCard(CTX, COACHES!, LG, CODE, played, teamLine, games, (votes as Dict | null)?.VOTES?.c?.[CODE], { squad: team.squad })
  return x.kind === 'gk' ? keeperFilmCard(CTX, x.d, { story: SEASON === '2026-27' }) : outfieldCard(CTX, x.d, { story: SEASON === '2026-27' })
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
if (SEASON === '2026-27') initStory(film, CTX)
initHScroll(film)
fitBios(film)
initHighlight(film, '[data-mid]', k => `[data-mid="${k}"]`, el => el.dataset.mid!)
initTip(film, '[data-gid]', el => { const x = P[[...film.children].indexOf(el.closest('.card')!)]; return x.kind === 'out' ? matchTip(CTX, x.d, el.dataset.gid!) : '' })
initNav('teams', LG, SEASON)
initFilm({ label: i => P[i].sq.name, count: P.length, key: `top5.squad.${LG}.${CODE}${SEASON === '2026-27' ? '' : '.' + SEASON}`, onPaint, jumpHTML, self: 'player.html' })
