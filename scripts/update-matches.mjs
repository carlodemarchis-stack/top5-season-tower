#!/usr/bin/env node
/**
 * Match cards: one record per played league match → src/data/matches-<LG>-<season>-md<NN>.js (one file per matchday).
 *
 *   node scripts/update-matches.mjs --league ITA            # fetch new / recent matches, verify, write
 *   node scripts/update-matches.mjs --league ITA --full     # rebuild every played match
 *   node scripts/update-matches.mjs --league ITA --dry-run
 *
 * From each ESPN match report: both line-ups (formation, slot, role, shirt), every goal / assist / card / substitution on
 * the player, team stats, and the commentary's attempts (zone they came from, outcome, where on goal they went) and
 * corners. The kick-off, venue and attendance from ESPN; the table before / after from OUR standings.
 * Verified per match: ESPN's score = ours, and the goals in the key events = that score. A match that fails is left
 * out (and reported), never published wrong. Files that don't change are not rewritten.
 */
import fs from 'node:fs'
import path from 'node:path'
import { LEAGUES, get, pool, espn, loadLeague, makeCodeFor, DATA, ROOT } from './lib/football.mjs'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27')
const YEAR = parseInt(SEASON.slice(0, 4), 10)
const LG = opt('--league', 'ITA')
const DRY = has('--dry-run'), FULL = has('--full')
if (!LEAGUES[LG]) { console.error(`unknown --league ${LG}`); process.exit(1) }

const errors = [], warns = []
const L = await loadLeague(LG, SEASON)
const codeFor = makeCodeFor({ [LG]: L }, SEASON, errors)
const espnTeams = (await get(espn(LG, '/teams'))).sports[0].leagues[0].teams.map(t => t.team)
espnTeams.forEach(t => codeFor(LG, t))
const fileOf = (md) => path.join(DATA, `matches-${LG}-${SEASON}-md${String(md).padStart(2, '0')}.js`)
const readFile = (f) => { if (!fs.existsSync(f)) return null; const m = fs.readFileSync(f, 'utf8').match(/export const MATCHES = (\[[\s\S]*\])/); return m ? JSON.parse(m[1]) : null }

// ---------- every completed league match: from the clubs' ESPN schedules, mapped to OUR fixture (home side) ----------
const events = new Map()
await pool(espnTeams, 4, async (team) => {
  const sched = await get(espn(LG, `/teams/${team.id}/schedule?season=${YEAR}`))
  for (const e of sched?.events || []) {
    const comp = e.competitions?.[0]; if (!comp?.status?.type?.completed || events.has(e.id)) continue
    const h = comp.competitors.find(c => c.homeAway === 'home'), a = comp.competitors.find(c => c.homeAway === 'away')
    const hc = codeFor(LG, h.team), ac = codeFor(LG, a.team)
    const g = L.TEAMS[hc]?.games.find(x => x.opp === ac && x.ha === 'H')
    if (!g) { errors.push(`no fixture ${hc} v ${ac} (ESPN ${e.id})`); continue }
    events.set(e.id, { ev: e.id, g, hc, ac })
  }
})
const all = [...events.values()]
const mdsPlayed = [...new Set(all.map(x => x.g.w))].sort((a, b) => a - b)
// rebuild the two latest matchdays (late corrections, postponed games) + anything not yet on file; --full = everything
const have = new Map(), recent = new Set(mdsPlayed.slice(-2))
for (const md of mdsPlayed) for (const m of readFile(fileOf(md)) || []) have.set(m.id, m)
const todo = all.filter(x => FULL || recent.has(x.g.w) || !have.has(x.g.id))
console.log(`${LG}: ${all.length} played matches over MD ${mdsPlayed[0]}–${mdsPlayed.at(-1)} · fetching ${todo.length}`)

// ---------- one match report → one record ----------
const ZONES = [['six yard box', 'six'], ['very close range', 'six'], ['centre of the box', 'box-c'], ['left side of the box', 'box-l'], ['right side of the box', 'box-r'],
  ['difficult angle on the left', 'angle-l'], ['difficult angle on the right', 'angle-r'], ['more than 35 yards', 'long'], ['long range', 'long'], ['outside the box', 'out']]
// a near miss ("is close, but misses the top left corner") first: it went just outside that corner, not into it
const PLACES = [['misses the top left corner', 'ntl'], ['misses the top right corner', 'ntr'], ['bottom left corner', 'bl'], ['bottom right corner', 'br'], ['top left corner', 'tl'], ['top right corner', 'tr'], ['top centre of the goal', 'tc'], ['centre of the goal', 'c'],
  ['bottom centre', 'bc'], ['high and wide to the left', 'xhl'], ['high and wide to the right', 'xhr'], ['too high', 'xh'], ['misses to the left', 'xl'], ['misses to the right', 'xr'],
  ['left post', 'pl'], ['right post', 'pr'], ['crossbar', 'bar'], ['high and wide', 'xh']]
const STATS = ['possessionPct', 'totalShots', 'shotsOnTarget', 'totalPasses', 'accuratePasses', 'wonCorners', 'saves', 'foulsCommitted', 'yellowCards', 'redCards']
const clock = (s) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/) || []; return [+(m[1] || 0), +(m[2] || 0)] }
const sc = (c) => Number(typeof c.score === 'object' ? c.score.value ?? c.score.displayValue : c.score)
const kindOf = (t) => t.includes('own goal') ? 'og' : t.includes('penalty') ? 'pen' : t.includes('header') ? 'head' : t.includes('free') ? 'fk' : ''
const stand = (md, code) => { const s = L.STANDINGS[md]; return s ? s.indexOf(code) + 1 || null : null }
const mdsStand = Object.keys(L.STANDINGS).map(Number).sort((a, b) => a - b)

async function build({ ev, g, hc, ac }) {
  const d = await get(espn(LG, `/summary?event=${ev}`))
  if (!d?.rosters?.length) { warns.push(`${g.id} ${hc}-${ac}: no match report yet`); return null }
  const comp = d.header.competitions[0], side = {}
  for (const c of comp.competitors) side[c.team.id] = c.homeAway
  const score = { h: sc(comp.competitors.find(c => c.homeAway === 'home')), a: sc(comp.competitors.find(c => c.homeAway === 'away')) }
  const ours = L.RESULTS[g.id]
  if (!ours) { warns.push(`${g.id} ${hc}-${ac}: ESPN has ${score.h}-${score.a}, our results don't yet`); return null }
  if (ours.hg !== score.h || ours.ag !== score.a) { errors.push(`${g.id} ${hc}-${ac}: ESPN ${score.h}-${score.a} ≠ ours ${ours.hg}-${ours.ag}`); return null }

  const team = (r) => ({
    form: r.formation || '',
    players: r.roster.filter(p => p.starter || p.subbedIn).map(p => ({
      id: p.athlete.id, name: p.athlete.displayName, n: p.jersey || '', pos: p.position?.abbreviation || '', fp: +(p.formationPlace || 0), st: p.starter ? 1 : 0,
      ph: fs.existsSync(path.join(ROOT, 'public', 'squad', `${p.athlete.id}.webp`)) ? 1 : 0,
      ev: (p.plays || []).map(x => [x.didScore ? 'goal' : x.didAssist ? 'ast' : x.redCard ? 'rc' : x.yellowCard ? 'yc' : x.substitution ? 'sub' : '', x.clock?.displayValue || '']).filter(e => e[0]),
    })),
    // the unused substitutes [id, name]: with them the squad cards can tell "on the bench" from "not in the matchday squad"
    bench: r.roster.filter(p => !p.starter && !p.subbedIn).map(p => [p.athlete.id, p.athlete.displayName]),
  })
  const rosters = Object.fromEntries(d.rosters.map(r => [r.homeAway, team(r)]))
  // goals: the key events credit each goal to the team it counts for (own goals included)
  const goals = (d.keyEvents || []).filter(k => k.scoringPlay && !/shootout/i.test(k.type?.text || '')).map(k => ({
    s: side[k.team?.id] === 'home' ? 'h' : 'a', min: k.clock?.displayValue || '', kind: kindOf((k.type?.text || '').toLowerCase()),
    by: k.participants?.[0]?.athlete?.displayName || '', byId: k.participants?.[0]?.athlete?.id || null, ast: k.participants?.[1]?.athlete?.displayName || null,
  }))
  const gh = goals.filter(x => x.s === 'h').length, ga = goals.filter(x => x.s === 'a').length
  if (gh !== score.h || ga !== score.a) { errors.push(`${g.id} ${hc}-${ac}: key-event goals ${gh}-${ga} ≠ score ${score.h}-${score.a}`); return null }
  const subs = (d.keyEvents || []).filter(k => k.type?.text === 'Substitution').map(k => ({ min: k.clock?.displayValue || '', on: k.participants?.[0]?.athlete?.id || null, off: k.participants?.[1]?.athlete?.id || null }))
  const stats = Object.fromEntries((d.boxscore?.teams || []).map(t => [t.homeAway === 'home' ? 'h' : 'a', Object.fromEntries(t.statistics.filter(s => STATS.includes(s.name)).map(s => [s.name, +s.displayValue || 0]))]))
  // the commentary: every attempt (zone, outcome, placement) and every corner, by side and minute
  const shots = [], corners = []
  for (const c of d.commentary || []) {
    const t = c.play?.type?.text || '', txt = c.text || '', hs = side[d.rosters.find(r => r.team.displayName === c.play?.team?.displayName)?.team.id]
    if (!hs) continue
    const [mm, ex] = clock(c.time?.displayValue), s = hs === 'home' ? 'h' : 'a'
    if (t === 'Corner Awarded') { corners.push([s, mm]); continue }
    if (!/Shot|Goal|Penalty/.test(t)) continue
    const own = /own goal/i.test(t + ' ' + txt), pen = /penalty/i.test(txt)
    const k = /^Goal|Penalty - Scored|Own Goal/i.test(t) ? 'goal' : /Shot On Target|Penalty - Saved/.test(t) ? 'on' : t === 'Shot Blocked' ? 'blk' : 'off'
    const ownWho = (txt.match(/Own Goal by ([^,]+),/i) || [])[1]
    const who = ownWho ? `${ownWho} (og)` : ((txt.match(/(?:Goal!.*?\.|Attempt (?:saved|missed|blocked)\.|Penalty (?:saved|missed)!.*?\.)\s*([^()]+?)\s*\(/) || [])[1] || '')
    shots.push({ s, min: mm, ex, k, z: pen ? 'pen' : ZONES.find(z => txt.includes(z[0]))?.[1] || 'box-c', p: k === 'blk' ? null : PLACES.find(p => txt.includes(p[0]))?.[1] || null, who, pen: pen ? 1 : 0 })
  }
  // a commentary goal takes its side from the key-event goal at the same minute (the commentary files own goals
  // under either team, the key events always under the team the goal counts for)
  const left = [...goals]
  for (const x of shots.filter(y => y.k === 'goal')) { const i = left.findIndex(kg => clock(kg.min)[0] === x.min); if (i >= 0) { x.s = left[i].s; left.splice(i, 1) } }
  const cg = shots.filter(x => x.k === 'goal')
  if (cg.filter(x => x.s === 'h').length !== score.h || cg.filter(x => x.s === 'a').length !== score.a) warns.push(`${g.id} ${hc}-${ac}: the commentary's goals don't add up to the score — its shot map may be short`)
  const before = mdsStand.filter(m => m < g.w).at(-1), after = mdsStand.filter(m => m >= g.w).at(-1)
  return {
    id: g.id, md: g.w, ev, kick: comp.date || null, venue: d.gameInfo?.venue?.fullName || '', att: d.gameInfo?.attendance || null,
    h: hc, a: ac, score, home: rosters.home, away: rosters.away, goals, subs, stats, shots, corners,
    table: { h: [stand(before, hc), stand(after, hc)], a: [stand(before, ac), stand(after, ac)] },
  }
}

const built = (await pool(todo, 4, build)).filter(Boolean)
for (const m of built) have.set(m.id, m)
if (errors.length) console.error(`\n⚠ ${errors.length} match(es) left out:\n  ` + errors.join('\n  '))
if (warns.length) console.log(`\n${warns.length} note(s):\n  ` + warns.join('\n  '))

// ---------- one file per matchday, in kick-off order; unchanged files are not rewritten ----------
let wrote = 0
for (const md of mdsPlayed) {
  const list = [...have.values()].filter(m => m.md === md).sort((a, b) => String(a.kick).localeCompare(String(b.kick)) || a.id.localeCompare(b.id))
  if (!list.length) continue
  const f = fileOf(md), prev = readFile(f)
  if (prev && JSON.stringify(prev) === JSON.stringify(list)) continue
  if (DRY) { console.log(`(dry run) would write ${path.basename(f)} · ${list.length} matches`); continue }
  fs.writeFileSync(f, `// Match cards, matchday ${md}: line-ups, goals, cards, subs, team stats, attempts — from ESPN match reports, checked\n// against our results. Auto-updated by scripts/update-matches.mjs.\nexport const MATCHES = ${JSON.stringify(list)}\n`)
  wrote++; console.log(`wrote ${path.basename(f)} · ${list.length} matches`)
}
console.log(`\n✓ ${have.size} matches on file${wrote ? ` · ${wrote} file(s) written` : ' · nothing changed'}`)
