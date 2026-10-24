#!/usr/bin/env node
/**
 * Update real results for all 5 leagues from football-data.org, keyed to our schedule matchIds.
 * Designed to run headless (e.g. a Railway cron): fetch → match to fixtures → write results-<LG>-<season>.js.
 *
 *   FOOTBALL_DATA_API_KEY=xxxx node scripts/update-results.mjs            # write updated result files
 *   node scripts/update-results.mjs --validate                            # offline: prove the matchId mapping (no key needed)
 *   FOOTBALL_DATA_API_KEY=xxxx node scripts/update-results.mjs --dry-run  # fetch + match, print, DON'T write
 *   ... --season 2026-27   (default) | --season 2025-26
 *   ... --push             also `git add/commit/push` (the GH Action then redeploys)
 *
 * Never writes a wrong result: any match whose two clubs can't both be resolved to our codes is SKIPPED and logged
 * ("UNMATCHED …") — add the football-data team name to OVERRIDES below and re-run.
 *
 * ESPN fills the gaps: football-data.org can post a final score hours late (24 Oct 2026: 18 games, some 8+ hours), so
 * games ESPN's scoreboard has final over the last few days but football-data hasn't are added from ESPN ("ESPN FILL").
 * football-data stays the source of record: when it posts the game, its score is written over ESPN's on the next run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { get, espn, makeCodeFor } from './lib/football.mjs'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dir, '..', 'src', 'data')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27')                 // our season id
const SEASON_START = parseInt(SEASON.slice(0, 4), 10)     // football-data `season` param = starting year
const DRY = has('--dry-run'), VALIDATE = has('--validate'), PUSH = has('--push')

// our LeagueId -> football-data competition code
const COMP = { ITA: 'SA', ENG: 'PL', ESP: 'PD', FRA: 'FL1', GER: 'BL1' }

// football-data team name (or tla) -> our code, for clubs the auto-matcher can't resolve.
// Fill these in after the first keyed run (the script prints exactly which teams need one).
const OVERRIDES = {
  ITA: {}, ENG: {},
  ESP: { 'Real Racing Club de Santander': 'RAC', 'RC Deportivo La Coruña': 'RCD' },
  FRA: {}, GER: {},
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(fc|cf|ac|sc|ssc|as|bc|us|uc|rc|cd|ud|sd|afc|calcio|club|deportivo|real|1\d{3}|e\.?v\.?)\b/g, ' ')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

async function loadSchedule(lg) {
  const m = await import(path.join(DATA, `schedule-${lg}-${SEASON}.js`))
  return m.TEAMS // { CODE: { name, games:[{id,w,opp,ha,...}] } }
}
function loadResults(lg) {
  const f = path.join(DATA, `results-${lg}-${SEASON}.js`)
  if (!fs.existsSync(f)) return {}
  const t = fs.readFileSync(f, 'utf8'); const m = t.match(/export const RESULTS = (\{[\s\S]*?\})\s*$/m)
  try { return m ? JSON.parse(m[1]) : {} } catch { return {} }
}
function writeResults(lg, results) {
  const f = path.join(DATA, `results-${lg}-${SEASON}.js`)
  fs.writeFileSync(f, `// Real results, keyed by unique matchId -> {hg,ag}. Auto-updated by scripts/update-results.mjs.\nexport const RESULTS = ${JSON.stringify(results)}\n`)
}

// resolve a football-data team object to our code within a league's TEAMS
function resolveCode(TEAMS, ov, team) {
  const cand = [team.name, team.shortName, team.tla].filter(Boolean)
  for (const c of cand) if (ov[c]) return ov[c]                          // manual override
  if (team.tla && TEAMS[team.tla.toUpperCase()]) return team.tla.toUpperCase()  // tla == our code
  const nTeam = cand.map(norm)
  let best = null
  for (const code of Object.keys(TEAMS)) {
    const nOur = norm(TEAMS[code].name)
    for (const nt of nTeam) {
      if (!nt || !nOur) continue
      if (nt === nOur) return code
      if ((nt.includes(nOur) || nOur.includes(nt)) && Math.min(nt.length, nOur.length) >= 4) best = best || code
    }
  }
  return best
}

function matchIdOf(TEAMS, md, homeCode, awayCode) {
  const g = (TEAMS[homeCode]?.games || []).find(x => x.w === md && x.ha === 'H' && x.opp === awayCode)
  return g ? g.id : null
}

async function validate() {
  let allOk = true
  for (const lg of Object.keys(COMP)) {
    let TEAMS; try { TEAMS = await loadSchedule(lg) } catch { console.log(`  ${lg}: no schedule for ${SEASON}, skip`); continue }
    // every home fixture's (md,home,away) must map back to its own id, uniquely
    const seen = new Set(); let bad = 0, n = 0
    for (const code of Object.keys(TEAMS)) for (const g of TEAMS[code].games) {
      if (g.ha !== 'H') continue; n++
      const id = matchIdOf(TEAMS, g.w, code, g.opp)
      if (id !== g.id) bad++
      const k = `${g.w}|${code}|${g.opp}`; if (seen.has(k)) bad++; seen.add(k)
    }
    console.log(`  ${lg}: ${n} fixtures, ${bad ? '❌ ' + bad + ' mapping errors' : '✓ all (md,home,away)→matchId unique & correct'}`)
    allOk = allOk && bad === 0
  }
  console.log(allOk ? '\nMATCH-KEYING VALIDATED ✓ — reconstructs matchIds for every league.' : '\nVALIDATION FAILED')
}

// Score corrections: a result football-data.org has wrong, checked against ESPN and FotMob, keyed by our matchId →
// [home, away]. Each run says whether the source now agrees (then delete the line).
const SCORE_FIX = {
}

// ESPN's finals of the last DAYS days (UTC) → { matchId: {hg, ag} }; a game on our schedule only, by its two clubs
// (each home/away pair is played once a season, so no matchday needed)
const DAYS = 4
async function espnFinals(lg, TEAMS) {
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')
  // one day a request (the soccer scoreboard refuses a date range)
  const days = await Promise.all(Array.from({ length: DAYS }, (_, i) => get(espn(lg, `/scoreboard?dates=${ymd(new Date(Date.now() - i * 864e5))}`))))
  const errors = [], codeFor = makeCodeFor({ [lg]: { TEAMS } }, SEASON, errors), out = {}
  for (const e of days.flatMap(d => d?.events || [])) {
    const st = e.competitions?.[0]?.status?.type || e.status?.type
    if (!st?.completed || /POSTPONED|CANCELED|ABANDONED|SUSPENDED/.test(st.name || '')) continue
    const cs = e.competitions[0].competitors, h = cs.find(c => c.homeAway === 'home'), a = cs.find(c => c.homeAway === 'away')
    const hc = codeFor(lg, h.team), ac = codeFor(lg, a.team)
    const g = hc && ac && (TEAMS[hc]?.games || []).find(x => x.ha === 'H' && x.opp === ac)
    if (!g) { console.log(`    ESPN: no fixture ${lg} ${h.team.displayName} vs ${a.team.displayName} — skipped`); continue }
    const hg = Number(h.score), ag = Number(a.score)
    if (Number.isInteger(hg) && Number.isInteger(ag)) out[g.id] = { hg, ag, name: `${hc} ${hg}-${ag} ${ac}`, w: g.w }
  }
  errors.forEach(x => console.log(`    ESPN: ${x}`))
  return out
}

async function run() {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) { console.error('Set FOOTBALL_DATA_API_KEY (get a free key at football-data.org/client/register).'); process.exit(1) }
  let wroteAny = false
  for (const [lg, comp] of Object.entries(COMP)) {
    let TEAMS; try { TEAMS = await loadSchedule(lg) } catch { console.log(`  ${lg}: no schedule for ${SEASON}, skip`); continue }
    const url = `https://api.football-data.org/v4/competitions/${comp}/matches?season=${SEASON_START}&status=FINISHED`
    let data = {}
    try {
      const r = await fetch(url, { headers: { 'X-Auth-Token': key } })
      if (!r.ok) console.log(`  ${lg}: HTTP ${r.status} ${r.statusText}`)
      else data = await r.json()
    } catch (e) { console.log(`  ${lg}: fetch failed ${e.message}`) }
    const results = loadResults(lg), before = JSON.stringify(results), fd = new Set()
    let added = 0, skipped = 0
    for (const m of (data.matches || [])) {
      if (m.status !== 'FINISHED' || m.score?.fullTime?.home == null) continue
      const home = resolveCode(TEAMS, OVERRIDES[lg] || {}, m.homeTeam)
      const away = resolveCode(TEAMS, OVERRIDES[lg] || {}, m.awayTeam)
      if (!home || !away) { skipped++; console.log(`    UNMATCHED ${lg} MD${m.matchday}: "${m.homeTeam?.name}"(${home || '?'}) vs "${m.awayTeam?.name}"(${away || '?'}) — add to OVERRIDES.${lg}`); continue }
      const id = matchIdOf(TEAMS, m.matchday, home, away)
      if (!id) { skipped++; console.log(`    NO FIXTURE ${lg} MD${m.matchday}: ${home} vs ${away}`); continue }
      const fix = SCORE_FIX[lg]?.[id]
      if (fix) console.log(`    SCORE FIX ${lg} MD${m.matchday} ${home}-${away}: ${fix.join('-')} (football-data says ${m.score.fullTime.home}-${m.score.fullTime.away}${fix[0] === m.score.fullTime.home && fix[1] === m.score.fullTime.away ? ' — now agrees, the fix can go' : ''})`)
      results[id] = fix ? { hg: fix[0], ag: fix[1] } : { hg: m.score.fullTime.home, ag: m.score.fullTime.away }; added++; fd.add(id)
    }
    // the games football-data hasn't posted yet, from ESPN (a failure here never blocks football-data's results)
    let filled = 0
    try {
      for (const [id, r] of Object.entries(await espnFinals(lg, TEAMS))) {
        if (fd.has(id)) { const o = results[id]; if (o.hg !== r.hg || o.ag !== r.ag) console.log(`    ESPN DIFFERS ${lg} MD${r.w} ${r.name} (football-data: ${o.hg}-${o.ag}, kept)`); continue }
        if (!results[id] || results[id].hg !== r.hg || results[id].ag !== r.ag) { results[id] = { hg: r.hg, ag: r.ag }; filled++; console.log(`    ESPN FILL ${lg} MD${r.w} ${r.name}`) }
      }
    } catch (e) { console.log(`    ESPN: ${e.message}`) }
    console.log(`  ${lg}: ${added} results (${skipped} skipped) + ${filled} from ESPN, total ${Object.keys(results).length}`)
    if (!DRY && JSON.stringify(results) !== before) { writeResults(lg, results); wroteAny = true }
  }
  if (PUSH && wroteAny) {
    console.log('git commit + push …')
    execSync(`cd "${path.join(__dir, '..')}" && git add src/data/results-*-${SEASON}.js && git commit -m "Auto: update ${SEASON} results" && git push`, { stdio: 'inherit' })
  } else if (DRY) console.log('(dry-run: nothing written)')
}

if (VALIDATE) validate()
else run()
