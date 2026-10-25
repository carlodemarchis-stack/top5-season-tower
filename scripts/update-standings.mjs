/**
 * Fetch the OFFICIAL league table per matchday from football-data.org and store the finishing
 * ORDER (our club codes) so the app never has to re-derive positions itself.
 *
 * Why: league tiebreaks differ per country (Serie A / La Liga use head-to-head mini-leagues) and
 * clubs can carry points deductions — deriving the order ourselves is bug-prone. The official table
 * is authoritative, so we store `{ matchday: [codes in official order] }` and just read it.
 *
 * GOTCHA (verified): `?matchday=N` alone is SILENTLY IGNORED by the API (it returns the current
 * table). The season must be passed too: `?season=YYYY&matchday=N`.
 *
 * Usage: node scripts/update-standings.mjs [--season 2026-27] [--dry-run]
 * Needs FOOTBALL_DATA_API_KEY. Incremental: only fetches matchdays not already stored, plus the
 * current one (which is still changing). Never writes a matchday it could not fully resolve.
 *
 * Checked against our results: football-data's table can trail its own results by hours (24 Oct 2026: Serie A MD8
 * still had Inter top after Lazio's win was in). A table whose games played / goals for / goals against disagree with
 * our results-<LG> file for any club is NOT stored — the order computed from our results (points, goal difference,
 * goals scored: the live-season rule) is stored instead ("STALE"), and the next run replaces it once the API agrees.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dir, '..', 'src', 'data')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27')
const SEASON_START = parseInt(SEASON.slice(0, 4), 10)
const DRY = has('--dry-run')

const COMP = { ITA: 'SA', ENG: 'PL', ESP: 'PD', FRA: 'FL1', GER: 'BL1' }
const OVERRIDES = {
  ITA: {}, ENG: {},
  ESP: { 'Real Racing Club de Santander': 'RAC', 'RC Deportivo La Coruña': 'RCD' },
  FRA: {}, GER: {},
}
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(fc|cf|ac|sc|ssc|as|bc|us|uc|rc|cd|ud|sd|afc|calcio|club|deportivo|real|1\d{3}|e\.?v\.?)\b/g, ' ')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

function resolveCode(TEAMS, ov, team) {
  const cand = [team.name, team.shortName, team.tla].filter(Boolean)
  for (const c of cand) if (ov[c]) return ov[c]
  if (team.tla && TEAMS[team.tla.toUpperCase()]) return team.tla.toUpperCase()
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

const file = (lg) => path.join(DATA, `standings-${lg}-${SEASON}.js`)
function loadStandings(lg) {
  const f = file(lg); if (!fs.existsSync(f)) return {}
  const m = fs.readFileSync(f, 'utf8').match(/export const STANDINGS = (\{[\s\S]*?\})\s*$/m)
  try { return m ? JSON.parse(m[1]) : {} } catch { return {} }
}
function writeStandings(lg, obj) {
  fs.writeFileSync(file(lg), `// OFFICIAL league order per matchday (our club codes), from football-data.org.\n// Auto-updated by scripts/update-standings.mjs — the app reads positions from here instead of\n// re-deriving them (per-country tiebreaks + points deductions are the API's job, not ours).\nexport const STANDINGS = ${JSON.stringify(obj)}\n`)
}

function loadResults(lg) {
  const f = path.join(DATA, `results-${lg}-${SEASON}.js`); if (!fs.existsSync(f)) return {}
  const m = fs.readFileSync(f, 'utf8').match(/export const RESULTS = (\{[\s\S]*?\})\s*$/m)
  try { return m ? JSON.parse(m[1]) : {} } catch { return {} }
}
// each club's record through matchday md, from our results
function ourTable(TEAMS, R, md) {
  const t = {}
  for (const [code, c] of Object.entries(TEAMS)) {
    const o = t[code] = { code, n: 0, gf: 0, ga: 0, pts: 0 }
    for (const g of c.games) { const r = R[g.id]; if (!r || g.w > md) continue
      const f = g.ha === 'H' ? r.hg : r.ag, a = g.ha === 'H' ? r.ag : r.hg
      o.n++; o.gf += f; o.ga += a; o.pts += f > a ? 3 : f === a ? 1 : 0 }
  }
  return t
}
const ourOrder = (t) => Object.values(t).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.code.localeCompare(b.code)).map(o => o.code)

const key = process.env.FOOTBALL_DATA_API_KEY
if (!key) { console.error('FOOTBALL_DATA_API_KEY not set'); process.exit(1) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function api(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { 'X-Auth-Token': key } })
    if (r.status === 429) { console.log('    rate-limited, backing off 65s'); await sleep(65000); continue }
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
    return r.json()
  }
  throw new Error(`rate-limited repeatedly: ${url}`)
}
// pull the ordered club codes out of a standings payload; null if any club can't be resolved
function orderOf(payload, TEAMS, ov, lg, md, ours) {
  const tbl = (payload.standings || []).find(s => s.type === 'TOTAL')
  if (!tbl || !Array.isArray(tbl.table) || !tbl.table.length) return null
  const out = [], off = []
  for (const row of tbl.table) {
    const code = resolveCode(TEAMS, ov, row.team || {})
    if (!code) { console.log(`    UNMATCHED ${lg} MD${md}: "${row.team?.name}" — add to OVERRIDES.${lg}`); return null }
    out.push(code)
    const o = ours[code]
    if (o && (row.playedGames !== o.n || row.goalsFor !== o.gf || row.goalsAgainst !== o.ga)) off.push(`${code} ${row.playedGames}/${row.goalsFor}:${row.goalsAgainst} vs ours ${o.n}/${o.gf}:${o.ga}`)
  }
  // behind our results: our own order instead, until the API catches up
  if (off.length) { console.log(`    STALE ${lg} MD${md}: the API's table disagrees with our results (${off.slice(0, 3).join(' · ')}${off.length > 3 ? ` · +${off.length - 3}` : ''}) — storing the order from our results`); return ourOrder(ours) }
  const n = Object.keys(TEAMS).length
  if (out.length !== n) { console.log(`    SIZE MISMATCH ${lg} MD${md}: got ${out.length}, expected ${n}`); return null }
  if (new Set(out).size !== out.length) { console.log(`    DUPLICATE CODES ${lg} MD${md}`); return null }
  return out
}

let changed = 0
for (const [lg, comp] of Object.entries(COMP)) {
  const schedFile = path.join(DATA, `schedule-${lg}-${SEASON}.js`)
  if (!fs.existsSync(schedFile)) { console.log(`${lg}: no schedule, skipping`); continue }
  const { TEAMS } = await import(schedFile)
  const store = loadStandings(lg), R = loadResults(lg)
  const ov = OVERRIDES[lg] || {}
  let cur
  try { cur = await api(`https://api.football-data.org/v4/competitions/${comp}/standings?season=${SEASON_START}`) }
  catch (e) { console.log(`${lg}: ${e.message}`); continue }
  const currentMd = cur.season?.currentMatchday || 0
  // the current matchday is still changing → always refresh it; older ones are fetched once
  const todo = []
  for (let md = 1; md <= currentMd; md++) if (!store[md] || md === currentMd) todo.push(md)
  let wrote = 0
  for (const md of todo) {
    let p
    // NB: matchday must be paired with season — `?matchday=N` on its own is silently ignored.
    try { p = await api(`https://api.football-data.org/v4/competitions/${comp}/standings?season=${SEASON_START}&matchday=${md}`) }
    catch (e) { console.log(`    ${lg} MD${md}: ${e.message}`); continue }
    const order = orderOf(p, TEAMS, ov, lg, md, ourTable(TEAMS, R, md))
    if (!order) continue
    const prev = JSON.stringify(store[md] || null)
    store[md] = order
    if (JSON.stringify(order) !== prev) wrote++
    await sleep(6500)   // free tier ≈ 10 req/min
  }
  if (wrote && !DRY) { writeStandings(lg, store); changed++ }
  console.log(`${lg}: currentMatchday ${currentMd} · stored ${Object.keys(store).length} matchdays · updated ${wrote}${DRY ? ' (dry-run)' : ''}`)
}
console.log(changed ? `\n${changed} league file(s) updated.` : '\nNo standings changes.')
