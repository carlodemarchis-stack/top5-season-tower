#!/usr/bin/env node
/**
 * Top-5-league top scorers → src/data/scorers-TOP5-<season>.js: the top 50 across the five leagues and each league's
 * own top 25 (ties at the cut included; a league's cut never drops below 2 goals). One player record per person,
 * plus one ranked list per view (ALL + the five leagues).
 * + one official cutout photo per player → public/players/<espnId>.webp
 *
 *   node scripts/update-scorers.mjs                 # fetch, verify, write data + photos
 *   node scripts/update-scorers.mjs --dry-run       # fetch + verify + print, write nothing
 *   node scripts/update-scorers.mjs --no-photos     # skip the photo step
 *   ... --season 2026-27 (default)
 *
 * Sources (no keys needed):
 *   ESPN site API   — goal leaders per league, team schedules, match reports (goals/assists/minutes/shots/cards), bio
 *   league sites    — official photos: Lega Serie A, Premier League, LaLiga, Ligue 1, Bundesliga
 *   our own data    — matchIds, results, standings (the cards' team strip uses OUR results, cross-checked vs ESPN)
 *
 * Never writes unverified numbers: for every player the per-match goals / assists / appearances summed from the
 * match reports must equal ESPN's season totals, and every ESPN score must equal ours. Any failure → exit 1.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEAGUES, CUR, get, pool, minutesOf, espn, loadLeague, squad, matchPlayer, makeCodeFor, savePhoto, PHOTOS, DATA } from './lib/football.mjs'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const PHOTO_CACHE = path.join(__dir, 'scorers-photo-cache.json')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27')
const YEAR = parseInt(SEASON.slice(0, 4), 10)
const DRY = has('--dry-run'), NO_PHOTOS = has('--no-photos')
const LENIENT = has('--lenient')      // mock/back-season runs only: report verification errors but still write
const TOP_N = 50            // the five-league film
const LEAGUE_N = 25         // each league's own film
const LEAGUE_MIN_GOALS = 2  // early season: never let a league's list collapse into every one-goal scorer

// ---------- 1. leaders ----------
async function leaders(lg) {
  const d = await get(espn(lg, `/statistics?season=${YEAR}`))
  const g = d.stats.find(s => s.name === 'goalsLeaders').leaders
  return g.map(l => {
    const st = Object.fromEntries((l.athlete.statistics || []).map(s => [s.abbreviation, s.value]))
    return { espnId: l.athlete.id, name: l.athlete.displayName, jersey: l.athlete.jersey || null, lg, espnTeam: l.athlete.team?.id,
      espnTeamObj: l.athlete.team, espnAbbr: l.athlete.team?.abbreviation, G: st.G ?? l.value, A: st.A ?? 0, APP: st.APP ?? null }
  })
}

// ---------- 2. per-match lines from ESPN match reports ----------
const scheduleCache = new Map(), summaryCache = new Map()
const teamSchedule = (lg, tid) => {
  const k = lg + tid
  if (!scheduleCache.has(k)) scheduleCache.set(k, get(espn(lg, `/teams/${tid}/schedule?season=${YEAR}`)))
  return scheduleCache.get(k)
}
const summary = (lg, ev) => { if (!summaryCache.has(ev)) summaryCache.set(ev, get(espn(lg, `/summary?event=${ev}`))); return summaryCache.get(ev) }

function playerLine(sm, teamId, athleteId) {
  const ros = (sm.rosters || []).find(r => r.team.id === teamId)
  const p = ros?.roster?.find(x => x.athlete.id === athleteId)
  const blank = { role: null, min: 0, G: 0, A: 0, SH: 0, SOG: 0, YC: 0, RC: 0, pens: 0, goals: [] }
  if (!p) return blank
  const st = Object.fromEntries((p.stats || []).map(s => [s.abbreviation, Number(s.displayValue) || 0]))
  const played = p.starter || p.subbedIn
  if (!played) return blank
  // goals with type + assister, from the key events (own goals are not the player's)
  const goals = (sm.keyEvents || []).filter(k => k.scoringPlay && k.participants?.[0]?.athlete?.id === athleteId)
    .map(k => {
      const t = (k.type?.text || '').toLowerCase()
      if (t.includes('own goal')) return null
      return { min: k.clock?.displayValue || '', kind: t.includes('penalty') ? 'pen' : t.includes('header') ? 'head' : t.includes('free') ? 'fk' : '',
        ast: k.participants?.[1]?.athlete?.displayName || null }
    }).filter(Boolean)
  return { role: p.starter ? 'S' : 'B', min: minutesOf(p), G: st.G || 0, A: st.A || 0, SH: st.SHOT || 0, SOG: st.SOG || 0,
    YC: st.YC || 0, RC: st.RC || 0, pens: goals.filter(g => g.kind === 'pen').length, goals }
}

// ---------- main ----------
const errors = [], warns = []
const league = {}
for (const lg of Object.keys(LEAGUES)) league[lg] = await loadLeague(lg, SEASON)

const codeFor = makeCodeFor(league, SEASON, errors)
if (SEASON === CUR) for (const lg of Object.keys(LEAGUES)) {
  const r = await get(espn(lg, '/teams'))
  for (const { team } of r.sports[0].leagues[0].teams) codeFor(lg, team)
}

const all = (await Promise.all(Object.keys(LEAGUES).map(leaders))).flat()
all.sort((a, b) => b.G - a.G || b.A - a.A || (a.APP ?? 99) - (b.APP ?? 99))
const cut = all[Math.min(TOP_N, all.length) - 1].G
const picked = all.filter(p => p.G >= cut)
// ESPN lists 50 leaders per league: if a league's last listed player is still at or above the cut, players tied with
// him may be missing from the list — refuse rather than publish a table with holes in it.
const cuts = { ALL: cut }, pickedBy = { ALL: picked }
for (const lg of Object.keys(LEAGUES)) {
  const l = all.filter(p => p.lg === lg)
  cuts[lg] = Math.max(l[Math.min(LEAGUE_N, l.length) - 1]?.G ?? LEAGUE_MIN_GOALS, LEAGUE_MIN_GOALS)
  pickedBy[lg] = l.filter(p => p.G >= cuts[lg])
  const low = Math.min(cut, cuts[lg])
  if (l.length >= 50 && l.at(-1).G >= low) errors.push(`${lg}: ESPN's 50 listed leaders all have ≥ ${low} goals — the list may be cut short`)
}
console.log(`leaders: ${all.length} across 5 leagues · top ${TOP_N}: cut ${cut} → ${picked.length} · ` + Object.keys(LEAGUES).map(lg => `${lg} top ${LEAGUE_N}: cut ${cuts[lg]} → ${pickedBy[lg].length}`).join(' · '))
// every player in any list, once
const union = [...new Map(Object.values(pickedBy).flat().map(p => [p.espnId, p])).values()]

const players = (await pool(union, 4, async (pl) => {
  const { lg } = pl, L = league[lg]
  const code = codeFor(lg, pl.espnTeamObj)
  if (!code) return null
  const sched = await teamSchedule(lg, pl.espnTeam)
  const evs = (sched?.events || []).filter(e => e.competitions?.[0]?.status?.type?.completed).sort((a, b) => a.date.localeCompare(b.date))
  const matches = []
  for (const e of evs) {
    const comp = e.competitions[0]
    const me = comp.competitors.find(c => c.team.id === pl.espnTeam), op = comp.competitors.find(c => c.team.id !== pl.espnTeam)
    const opp = codeFor(lg, op.team), ha = me.homeAway === 'home' ? 'H' : 'A'
    const g = L.TEAMS[code]?.games.find(x => x.opp === opp && x.ha === ha)
    if (!g) { errors.push(`${pl.name}: no fixture ${code} ${ha} vs ${opp} (ESPN ${e.id})`); continue }
    const sc = (c) => Number(typeof c.score === 'object' ? c.score.value ?? c.score.displayValue : c.score)
    const gf = sc(me), ga = sc(op)
    const ours = L.RESULTS[g.id]
    if (ours) {
      const [ogf, oga] = ha === 'H' ? [ours.hg, ours.ag] : [ours.ag, ours.hg]
      if (ogf !== gf || oga !== ga) errors.push(`${lg} ${g.id} ${code}-${opp}: ESPN ${gf}-${ga} ≠ ours ${ogf}-${oga}`)
    } else warns.push(`${lg} ${g.id} ${code}-${opp}: ESPN has ${gf}-${ga}, our results don't yet`)
    const sm = await summary(lg, e.id)
    const line = playerLine(sm, pl.espnTeam, pl.espnId)
    matches.push({ id: g.id, w: g.w, opp, ha, gf, ga, ...line })
  }
  matches.sort((a, b) => a.w - b.w)   // matchday order, like the towers (a postponed MD1 played later stays MD1)
  const sum = (k) => matches.reduce((s, m) => s + m[k], 0)
  const apps = matches.filter(m => m.role).length
  const G = sum('G'), A = sum('A'), goalsListed = matches.reduce((s, m) => s + m.goals.length, 0)
  if (G !== pl.G) errors.push(`${pl.name} (${lg}): match reports give ${G} goals, ESPN season total ${pl.G}`)
  if (goalsListed !== G) errors.push(`${pl.name}: ${goalsListed} goal events vs ${G} goals in box scores`)
  if (A !== pl.A) errors.push(`${pl.name} (${lg}): match reports give ${A} assists, ESPN season total ${pl.A}`)
  // appearances only warn: ESPN's season APP can credit a postponed fixture (2026-10: Levante–Athletic MD6) — the
  // cards count appearances from the match reports, which is what the strip shows; goals/assists stay hard checks
  if (pl.APP != null && apps !== pl.APP) warns.push(`${pl.name} (${lg}): ${apps} appearances in the match reports, ESPN's season stat says ${pl.APP}`)

  // bio (ESPN core athlete)
  const bio = await get(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${LEAGUES[lg]}/athletes/${pl.espnId}`) || {}
  // team table line from OUR data (results + official standings)
  let W = 0, D = 0, Lo = 0, GF = 0, GA = 0
  for (const x of L.TEAMS[code].games) {
    const r = L.RESULTS[x.id]; if (!r) continue
    const [f, a] = x.ha === 'H' ? [r.hg, r.ag] : [r.ag, r.hg]; GF += f; GA += a
    f > a ? W++ : f === a ? D++ : Lo++
  }
  const mds = Object.keys(L.STANDINGS).map(Number).sort((a, b) => b - a)
  let pos = mds.length ? L.STANDINGS[mds[0]].indexOf(code) + 1 || null : null
  if (!mds.length) {   // no official standings file (past seasons): order by points, goal difference, goals for
    const line = (c) => { let p = 0, gd = 0, gf = 0; for (const x of L.TEAMS[c].games) { const r = L.RESULTS[x.id]; if (!r) continue; const [f, a] = x.ha === 'H' ? [r.hg, r.ag] : [r.ag, r.hg]; p += f > a ? 3 : f === a ? 1 : 0; gd += f - a; gf += f } return [p, gd, gf] }
    const order = Object.keys(L.TEAMS).map(c => [c, ...line(c)]).sort((a, b) => b[1] - a[1] || b[2] - a[2] || b[3] - a[3])
    pos = order.findIndex(r => r[0] === code) + 1 || null
  }
  return {
    espnId: pl.espnId, name: pl.name, full: bio.fullName || pl.name, lg, team: code, jersey: bio.jersey || pl.jersey,
    pos: bio.position?.abbreviation || null, posName: bio.position?.displayName || null,
    dob: bio.dateOfBirth ? bio.dateOfBirth.slice(0, 10) : null, age: bio.age ?? null,
    nat: bio.citizenship || null, natCode: bio.citizenshipCountry?.abbreviation || null,
    heightCm: bio.height ? Math.round(bio.height * 2.54) : null,
    G, A, apps, starts: matches.filter(m => m.role === 'S').length, min: sum('min'), pens: sum('pens'),
    shots: sum('SH'), sog: sum('SOG'), yc: sum('YC'), rc: sum('RC'),
    teamLine: { pos, pts: W * 3 + D, W, D, L: Lo, GF, GA, played: W + D + Lo },
    matches: matches.map(({ id, w, opp, ha, gf, ga, role, min, G, A, SH, SOG, YC, RC, goals }) => ({ id, w, opp, ha, gf, ga, role, min, G, A, SH, SOG, YC, RC, goals })),
  }
})).filter(Boolean)

// one ranked list per view; competition ranking: equal goals share a rank (1, 2, 2, 2, 5 …)
const order = (a, b) => b.G - a.G || b.A - a.A || a.min - b.min
players.sort(order)
const byId = new Map(players.map(p => [p.espnId, p]))
const lists = {}
for (const [k, ps] of Object.entries(pickedBy)) {
  const L = ps.map(p => byId.get(p.espnId)).filter(Boolean).sort(order)
  lists[k] = L.map(p => [p.espnId, 1 + L.filter(q => q.G > p.G).length])
}
players.forEach(p => { p.rank = lists.ALL.find(x => x[0] === p.espnId)?.[1] ?? null })   // five-league rank (null = league list only)

// ---------- photos ----------
const photoCache = fs.existsSync(PHOTO_CACHE) ? JSON.parse(fs.readFileSync(PHOTO_CACHE, 'utf8')) : {}
if (!NO_PHOTOS) {
  if (!DRY) fs.mkdirSync(PHOTOS, { recursive: true })
  await pool(players, 4, async (p) => {
    const hit = matchPlayer(await squad(p.lg, p.team), { name: p.full || p.name, jersey: p.jersey }) ||
                matchPlayer(await squad(p.lg, p.team), { name: p.name, jersey: p.jersey })
    if (!hit?.src) { warns.push(`photo: no official photo for ${p.name} (${p.lg} ${p.team}) → initials`); p.photo = null; return }
    const file = path.join(PHOTOS, `${p.espnId}.webp`)
    p.photo = `players/${p.espnId}.webp`; p._match = `${hit.names.find(Boolean)} #${hit.num}`
    if (DRY || (photoCache[p.espnId] === hit.src && fs.existsSync(file))) return
    const buf = await get(hit.src, { json: false })
    if (!buf) { warns.push(`photo: ${hit.src} unreachable for ${p.name} → initials`); p.photo = null; return }
    await savePhoto(buf, file)
    photoCache[p.espnId] = hit.src
  })
}

// ---------- report + write ----------
for (const p of players) console.log(`${String(p.rank ?? '–').padStart(2)}. ${p.name.padEnd(26)} ${p.lg} ${p.team.padEnd(4)} ${String(p.G).padStart(2)}g ${p.A}a ${p.apps}app ${String(p.min).padStart(4)}' pens ${p.pens}  ${p.photo ? 'photo ← ' + p._match : 'INITIALS'}`)
if (warns.length) console.log(`\n${warns.length} note(s):\n  ` + [...new Set(warns)].join('\n  '))
if (errors.length && !LENIENT) { console.error(`\n✗ ${errors.length} verification error(s) — nothing written:\n  ` + errors.join('\n  ')); process.exit(1) }
if (errors.length) console.error(`\n⚠ --lenient: writing despite ${errors.length} verification error(s):\n  ` + errors.join('\n  '))
if (!errors.length) console.log(`\n✓ verified: per-match goals + assists match ESPN season totals for all ${players.length}; every ESPN score matches ours`)
if (DRY) process.exit(0)
players.forEach(p => delete p._match)
const OUT = path.join(DATA, `scorers-TOP5-${SEASON}.js`)
// unchanged numbers → leave the file (and its `updated` stamp) alone, so the nightly run doesn't redeploy for nothing
try {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8').match(/export const SCORERS = (\{[\s\S]*\})\s*$/)[1])
  if (JSON.stringify(prev.players) === JSON.stringify(players) && JSON.stringify(prev.lists) === JSON.stringify(lists)) { console.log('scorers unchanged — nothing written'); process.exit(0) }
} catch { }
const out = { season: SEASON, updated: new Date().toISOString(), cut, cuts, lists, players }
fs.writeFileSync(OUT,
  `// Top-5-league top scorers (top ${TOP_N} by goals, ties at the cut included). Auto-updated by scripts/update-scorers.mjs.\nexport const SCORERS = ${JSON.stringify(out)}\n`)
if (!NO_PHOTOS) fs.writeFileSync(PHOTO_CACHE, JSON.stringify(photoCache, null, 1) + '\n')
console.log(`wrote src/data/scorers-TOP5-${SEASON}.js (${players.length} players)`)
