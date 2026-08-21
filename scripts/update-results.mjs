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
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

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

async function run() {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) { console.error('Set FOOTBALL_DATA_API_KEY (get a free key at football-data.org/client/register).'); process.exit(1) }
  let wroteAny = false
  for (const [lg, comp] of Object.entries(COMP)) {
    let TEAMS; try { TEAMS = await loadSchedule(lg) } catch { console.log(`  ${lg}: no schedule for ${SEASON}, skip`); continue }
    const url = `https://api.football-data.org/v4/competitions/${comp}/matches?season=${SEASON_START}&status=FINISHED`
    let data
    try {
      const r = await fetch(url, { headers: { 'X-Auth-Token': key } })
      if (!r.ok) { console.log(`  ${lg}: HTTP ${r.status} ${r.statusText}`); continue }
      data = await r.json()
    } catch (e) { console.log(`  ${lg}: fetch failed ${e.message}`); continue }
    const results = loadResults(lg)
    let added = 0, skipped = 0
    for (const m of (data.matches || [])) {
      if (m.status !== 'FINISHED' || m.score?.fullTime?.home == null) continue
      const home = resolveCode(TEAMS, OVERRIDES[lg] || {}, m.homeTeam)
      const away = resolveCode(TEAMS, OVERRIDES[lg] || {}, m.awayTeam)
      if (!home || !away) { skipped++; console.log(`    UNMATCHED ${lg} MD${m.matchday}: "${m.homeTeam?.name}"(${home || '?'}) vs "${m.awayTeam?.name}"(${away || '?'}) — add to OVERRIDES.${lg}`); continue }
      const id = matchIdOf(TEAMS, m.matchday, home, away)
      if (!id) { skipped++; console.log(`    NO FIXTURE ${lg} MD${m.matchday}: ${home} vs ${away}`); continue }
      results[id] = { hg: m.score.fullTime.home, ag: m.score.fullTime.away }; added++
    }
    console.log(`  ${lg}: ${added} results (${skipped} skipped), total ${Object.keys(results).length}`)
    if (!DRY && added) { writeResults(lg, results); wroteAny = true }
  }
  if (PUSH && wroteAny) {
    console.log('git commit + push …')
    execSync(`cd "${path.join(__dir, '..')}" && git add src/data/results-*-${SEASON}.js && git commit -m "Auto: update ${SEASON} results" && git push`, { stdio: 'inherit' })
  } else if (DRY) console.log('(dry-run: nothing written)')
}

if (VALIDATE) validate()
else run()
