#!/usr/bin/env node
/**
 * Generate the Champions League LEAGUE-PHASE data files (36 teams · 8 matchdays) from UEFA's public
 * match API — used for 2026/27, whose draw UEFA publishes weeks before football-data.org loads it.
 *
 *   node scripts/gen-ucl-uefa.mjs --season 2026-27   (UEFA seasonYear = end year = 2027)
 *
 * Writes src/data/schedule-CL-<season>.js (TEAMS + MATCHDAYS=8) and results-CL-<season>.js (RESULTS).
 * Matchdays aren't numbered in the feed yet, so they're derived by clustering kickoff dates into 8 rounds.
 * Also writes scripts/ucl-crests-<season>.json (code -> UEFA 700x700 crest URL) for the crest fetcher.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dir, '..', 'src', 'data')
const opt = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d }
const SEASON = opt('--season', '2026-27')
const UEFA_YEAR = parseInt(SEASON.slice(0, 4), 10) + 1   // UEFA labels the season by its END year (2026-27 → 2027)

// brand primary colour per team code (tla). Text ink is derived by contrast() in the app.
const COLORS = {
  AEK: '#FBBA00', ARS: '#EF0107', AVL: '#7A003C', ATM: '#CB3524', BVB: '#FDE100', BAR: '#A50044',
  BAY: '#DC052D', BOD: '#FFC800', BRU: '#0A4EA2', COM: '#005BAC', FEN: '#143C8C', FEY: '#E50019',
  GAL: '#A32638', INT: '#1B2A6B', LAS: '#111111', RBL: '#E4002B', LEN: '#FCD000', LIL: '#D2122E',
  LIV: '#C8102E', MCI: '#6CABDD', MUN: '#DA020E', NAP: '#12A0D7', PSG: '#0A1A44', POR: '#005CAB',
  PSV: '#ED1C24', BET: '#00954C', RMA: '#103A8F', ROM: '#8E1F2F', SLB: '#0055A5', SAB: '#00A0E3',
  SHK: '#FF6600', SLA: '#D3122A', SPO: '#007A3D', STU: '#E30613', VFK: '#003399', VIL: '#FFD500',
}
// short display names (kept tidy for the modal header)
const SHORT = {
  AEK: 'AEK Athens', ATM: 'Atlético Madrid', BVB: 'Dortmund', BAY: 'Bayern München', BRU: 'Club Brugge',
  RBL: 'RB Leipzig', MUN: 'Manchester Utd', MCI: 'Manchester City', PSG: 'Paris Saint-Germain',
  BET: 'Real Betis', SLB: 'Slovan Bratislava', SHK: 'Shakhtar Donetsk', SLA: 'Slavia Praha',
  SPO: 'Sporting CP', LAS: 'LASK', PSV: 'PSV', VIL: 'Villarreal', RMA: 'Real Madrid',
}
// feed teamCode → our code (only where they differ)
const CODE = { LASK: 'LAS' }
const code = (t) => CODE[t.teamCode] || t.teamCode

async function fetchAll() {
  const out = []
  for (let off = 0; off < 400; off += 100) {
    const r = await fetch(`https://match.uefa.com/v5/matches?competitionId=1&seasonYear=${UEFA_YEAR}&offset=${off}&limit=100`, { headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json(); if (!Array.isArray(d) || !d.length) break
    out.push(...d); if (d.length < 100) break
  }
  return out.filter(m => (m.round?.metaData?.name) === 'League Phase')
}

// cluster kickoff dates into 8 matchdays (consecutive days ≤3 apart = same round)
function matchdayMap(lp) {
  const days = [...new Set(lp.map(m => m.kickOffTime.date))].sort()
  const clusters = []; let cur = [days[0]]
  for (let i = 1; i < days.length; i++) {
    const gap = (new Date(days[i]) - new Date(days[i - 1])) / 86400000
    if (gap <= 3) cur.push(days[i]); else { clusters.push(cur); cur = [days[i]] }
  }
  clusters.push(cur)
  const md = {}; clusters.forEach((c, i) => c.forEach(day => { md[day] = i + 1 }))
  return { md, n: clusters.length }
}

// local kickoff "YYYY-MM-DD HH:MM" from the UTC dateTime + utcOffsetInHours
function localKick(k) {
  const off = k.utcOffsetInHours || 0
  const t = new Date(new Date(k.dateTime).getTime() + off * 3600000)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

const lp = await fetchAll()
const { md, n } = matchdayMap(lp)
if (n !== 8) console.warn(`WARNING: derived ${n} matchdays (expected 8)`)

const TEAMS = {}, RESULTS = {}, crests = {}
const ensure = (t) => {
  const c = code(t)
  if (!TEAMS[c]) { TEAMS[c] = { name: SHORT[c] || t.internationalName, abbr: c, primary: COLORS[c] || '#8A8F98', games: [] }; crests[c] = `https://img.uefa.com/imgml/TP/teams/logos/700x700/${t.id}.png` }
  return c
}
for (const m of lp) {
  const h = ensure(m.homeTeam), a = ensure(m.awayTeam)
  const id = String(m.id), w = md[m.kickOffTime.date], et = localKick(m.kickOffTime)
  const venue = m.stadium?.internationalName || m.stadium?.officialName || ''
  const city = m.stadium?.city?.internationalName || ''
  TEAMS[h].games.push({ id, w, opp: a, oppFull: TEAMS[a].name, ha: 'H', venue, city, net: '', et })
  TEAMS[a].games.push({ id, w, opp: h, oppFull: TEAMS[h].name, ha: 'A', venue, city, net: '', et })
  const s = m.score?.total
  if ((m.status?.finished || m.matchStatus === 'FINISHED') && s && s.home != null) RESULTS[id] = { hg: s.home, ag: s.away }
}

fs.writeFileSync(path.join(DATA, `schedule-CL-${SEASON}.js`), `// UEFA Champions League league phase — 36 teams · 8 matchdays. Generated by scripts/gen-ucl-uefa.mjs (UEFA API).\nexport const MATCHDAYS = 8\nexport const SEASON = '${SEASON.replace('-', '/')}'\nexport const TEAMS = ${JSON.stringify(TEAMS)}\n`)
fs.writeFileSync(path.join(DATA, `results-CL-${SEASON}.js`), `// Real results, keyed by unique matchId -> {hg,ag}. Generated by scripts/gen-ucl-uefa.mjs (UEFA API).\nexport const RESULTS = ${JSON.stringify(RESULTS)}\n`)
fs.writeFileSync(path.join(__dir, `ucl-crests-${SEASON}.json`), JSON.stringify(crests, null, 0))

const games = Object.values(TEAMS).map(t => t.games.length)
console.log(`CL ${SEASON}: ${Object.keys(TEAMS).length} teams, ${lp.length} matches, ${Object.keys(RESULTS).length} played · ${n} matchdays`)
console.log(`games per team: min ${Math.min(...games)} max ${Math.max(...games)}`)
console.log(`crest URLs → scripts/ucl-crests-${SEASON}.json`)
