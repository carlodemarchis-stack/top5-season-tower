#!/usr/bin/env node
/**
 * Generate the LEAGUE-PHASE data files for a UEFA club competition from UEFA's public match API.
 * Works for the Champions League (36·8), Europa League (36·8) and Conference League (36·6) — UEFA
 * publishes these draws weeks before football-data.org loads any fixtures.
 *
 *   node scripts/gen-uefa.mjs --comp CL  --season 2026-27
 *   node scripts/gen-uefa.mjs --comp EL  --season 2026-27
 *   node scripts/gen-uefa.mjs --comp ECL --season 2026-27
 *
 * Writes src/data/schedule-<COMP>-<season>.js (TEAMS + MATCHDAYS) and results-<COMP>-<season>.js.
 * Matchdays aren't numbered in the feed, so they're derived by clustering kickoff dates into rounds.
 * Also writes scripts/uefa-crests-<COMP>-<season>.json (code -> UEFA 700x700 crest URL).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dir, '..', 'src', 'data')
const opt = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d }
const COMP = (opt('--comp', 'CL')).toUpperCase()
const SEASON = opt('--season', '2026-27')
const UEFA_YEAR = parseInt(SEASON.slice(0, 4), 10) + 1   // UEFA labels a season by its END year (2026-27 → 2027)

// competitionId + per-competition brand colours / tidy names / code fixes
const CFG = {
  CL: {
    id: 1, codeFix: { LASK: 'LAS' },
    colors: { AEK: '#FBBA00', ARS: '#EF0107', AVL: '#7A003C', ATM: '#CB3524', BVB: '#FDE100', BAR: '#A50044', BAY: '#DC052D', BOD: '#FFC800', BRU: '#0A4EA2', COM: '#005BAC', FEN: '#143C8C', FEY: '#E50019', GAL: '#A32638', INT: '#1B2A6B', LAS: '#111111', RBL: '#E4002B', LEN: '#FCD000', LIL: '#D2122E', LIV: '#C8102E', MCI: '#6CABDD', MUN: '#DA020E', NAP: '#12A0D7', PSG: '#0A1A44', POR: '#005CAB', PSV: '#ED1C24', BET: '#00954C', RMA: '#103A8F', ROM: '#8E1F2F', SLB: '#0055A5', SAB: '#00A0E3', SHK: '#FF6600', SLA: '#D3122A', SPO: '#007A3D', STU: '#E30613', VFK: '#003399', VIL: '#FFD500' },
    short: { AEK: 'AEK Athens', ATM: 'Atlético Madrid', BVB: 'Dortmund', BAY: 'Bayern München', BRU: 'Club Brugge', RBL: 'RB Leipzig', MUN: 'Manchester Utd', MCI: 'Manchester City', PSG: 'Paris Saint-Germain', BET: 'Real Betis', SLB: 'Slovan Bratislava', SHK: 'Shakhtar Donetsk', SLA: 'Slavia Praha', SPO: 'Sporting CP', LAS: 'LASK', RMA: 'Real Madrid' },
  },
  EL: {
    id: 14, codeFix: {},
    colors: { AND: '#6A2C91', ARA: '#E30613', AZ: '#E30613', BEN: '#E00000', BES: '#111111', BOU: '#DA291C', CLJ: '#F5C400', CLT: '#6AA9DD', CEL: '#018749', CRY: '#1B458F', FER: '#137A3D', DIN: '#0067B1', HBS: '#E30613', HOF: '#1961B5', JAG: '#E30613', JUV: '#111111', LPO: '#0A4EA2', LEV: '#E32219', LSO: '#0A4EA2', LST: '#F0C800', LYO: '#1A4B9B', MAR: '#2FAEE0', MIL: '#DA020E', NEC: '#E30613', OFI: '#1A1A1A', OLY: '#DF1E26', OMO: '#00A550', RSO: '#0067B1', REN: '#E00000', SAL: '#D3122A', SPA: '#920A2E', SGR: '#222222', SUN: '#EB172B', TOR: '#0A7A3D', USG: '#F5C400', PLZ: '#E30613' },
    short: { AND: 'Anderlecht', AZ: 'AZ Alkmaar', BES: 'Beşiktaş', CLT: 'Celta Vigo', CRY: 'Crystal Palace', FER: 'Ferencváros', DIN: 'Dinamo Zagreb', HBS: 'Hapoel Beer-Sheva', LPO: 'Lech Poznań', LEV: 'Leverkusen', LSO: 'Levski Sofia', LST: 'Lillestrøm', SAL: 'RB Salzburg', SPA: 'Sparta Praha', SGR: 'Sturm Graz', USG: 'Union SG', PLZ: 'Viktoria Plzeň', RSO: 'Real Sociedad' },
  },
  ECL: {
    id: 2019, codeFix: {},
    colors: { AGF: '#0A4EA2', AJX: '#D2122E', ATA: '#2A5AA8', BOR: '#E30613', BRA: '#E30613', BRN: '#E30613', BHA: '#0057B8', CPH: '#143C8C', ZVE: '#E30613', CSO: '#E30613', EGN: '#0A4EA2', FRE: '#E2001A', GNT: '#0A8FD6', GET: '#005999', HAJ: '#0A4EA2', HEA: '#7A1120', IBE: '#1A4B9B', IES: '#143C8C', JAB: '#0A7A3D', KAI: '#F5C400', KAU: '#137A3D', KUP: '#F0C800', LRI: '#E30613', LUG: '#1A1A1A', MID: '#E30613', MJA: '#F0C800', MON: '#E51B22', NOR: '#FF6600', PAF: '#0A4EA2', PAN: '#007A3D', RIG: '#6A2C91', STR: '#F5C400', THU: '#E30613', TRA: '#7A0C2E', TWE: '#E30613', UCR: '#0A4EA2' },
    short: { AGF: 'Aarhus', AJX: 'Ajax', ZVE: 'Crvena Zvezda', CSO: 'CSKA Sofia', HAJ: 'Hajduk Split', HEA: 'Hearts', KAI: 'Kairat Almaty', KAU: 'Kauno Žalgiris', LRI: 'Lincoln Red Imps', MID: 'Midtjylland', MON: 'Monaco', NOR: 'Nordsjælland', PAN: 'Panathinaikos', STR: 'Sint-Truiden', TRA: 'Trabzonspor', UCR: 'U. Craiova', CPH: 'Copenhagen' },
  },
}
const cfg = CFG[COMP]
if (!cfg) { console.error(`Unknown --comp "${COMP}" (use CL / EL / ECL)`); process.exit(1) }
const code = (t) => cfg.codeFix[t.teamCode] || t.teamCode

async function fetchLeaguePhase() {
  const out = []
  for (let off = 0; off < 800; off += 100) {
    const r = await fetch(`https://match.uefa.com/v5/matches?competitionId=${cfg.id}&seasonYear=${UEFA_YEAR}&offset=${off}&limit=100`, { headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json(); if (!Array.isArray(d) || !d.length) break
    out.push(...d); if (d.length < 100) break
  }
  return out.filter(m => (m.round?.metaData?.name) === 'League Phase')
}

// cluster kickoff dates into matchdays (consecutive days ≤3 apart = same round)
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

const lp = await fetchLeaguePhase()
if (!lp.length) { console.error(`${COMP} ${SEASON}: no League Phase matches yet — draw not published?`); process.exit(1) }
const { md, n } = matchdayMap(lp)

const TEAMS = {}, RESULTS = {}, crests = {}
const ensure = (t) => {
  const c = code(t)
  if (!TEAMS[c]) { TEAMS[c] = { name: cfg.short[c] || t.internationalName, abbr: c, primary: cfg.colors[c] || '#8A8F98', games: [] }; crests[c] = `https://img.uefa.com/imgml/TP/teams/logos/700x700/${t.id}.png` }
  return c
}
for (const m of lp) {
  const h = ensure(m.homeTeam), a = ensure(m.awayTeam)
  const id = String(m.id), w = md[m.kickOffTime.date], et = localKick(m.kickOffTime)
  const venue = m.stadium?.internationalName || m.stadium?.officialName || '', city = m.stadium?.city?.internationalName || ''
  TEAMS[h].games.push({ id, w, opp: a, oppFull: TEAMS[a].name, ha: 'H', venue, city, net: '', et })
  TEAMS[a].games.push({ id, w, opp: h, oppFull: TEAMS[h].name, ha: 'A', venue, city, net: '', et })
  const s = m.score?.total
  // the v5 API reports a finished match as status:'FINISHED' (a string) — older readings expected
  // status.finished (object) / matchStatus; accept all three so results are actually captured.
  const finished = m.status === 'FINISHED' || m.status?.finished === true || m.matchStatus === 'FINISHED'
  if (finished && s && s.home != null) RESULTS[id] = { hg: s.home, ag: s.away }
}

const CNAME = { CL: 'Champions League', EL: 'Europa League', ECL: 'Conference League' }
fs.writeFileSync(path.join(DATA, `schedule-${COMP}-${SEASON}.js`), `// UEFA ${CNAME[COMP]} league phase — ${Object.keys(TEAMS).length} teams · ${n} matchdays. Generated by scripts/gen-uefa.mjs (UEFA API).\nexport const MATCHDAYS = ${n}\nexport const SEASON = '${SEASON.replace('-', '/')}'\nexport const TEAMS = ${JSON.stringify(TEAMS)}\n`)
fs.writeFileSync(path.join(DATA, `results-${COMP}-${SEASON}.js`), `// Real results, keyed by unique matchId -> {hg,ag}. Generated by scripts/gen-uefa.mjs (UEFA API).\nexport const RESULTS = ${JSON.stringify(RESULTS)}\n`)
fs.writeFileSync(path.join(__dir, `uefa-crests-${COMP}-${SEASON}.json`), JSON.stringify(crests, null, 0))

const uncoloured = Object.keys(TEAMS).filter(c => !cfg.colors[c])
console.log(`${COMP} ${SEASON}: ${Object.keys(TEAMS).length} teams, ${lp.length} matches, ${Object.keys(RESULTS).length} played · ${n} matchdays`)
if (uncoloured.length) console.log(`  (no brand colour, using grey fallback: ${uncoloured.join(', ')})`)
console.log(`  crest URLs → scripts/uefa-crests-${COMP}-${SEASON}.json`)
