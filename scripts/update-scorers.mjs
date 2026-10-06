#!/usr/bin/env node
/**
 * Top-5-league top scorers (top 25 by goals, ties at the cut included) → src/data/scorers-TOP5-<season>.js
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

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dir, '..')
const DATA = path.join(ROOT, 'src', 'data')
const PHOTOS = path.join(ROOT, 'public', 'players')
const PHOTO_CACHE = path.join(__dir, 'scorers-photo-cache.json')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27')
const YEAR = parseInt(SEASON.slice(0, 4), 10)
const DRY = has('--dry-run'), NO_PHOTOS = has('--no-photos')
const TOP_N = 25

const LEAGUES = { ITA: 'ita.1', ENG: 'eng.1', ESP: 'esp.1', FRA: 'fra.1', GER: 'ger.1' }

// ESPN team abbreviation → our code, where they differ (everything else is identical; unmapped = hard failure)
const ESPN_ABBR = {
  ITA: { ROMA: 'ROM', COMO: 'COM' },
  ENG: { MNC: 'MCI', MAN: 'MUN' },
  ESP: { DEP: 'RCD', MCF: 'MGA' },
  FRA: { AUX: 'AJA', MON: 'ASM', LILL: 'LIL', LOR: 'FCL', LYON: 'OL', OLM: 'OM', NICE: 'OGC', PAR: 'PFC', REN: 'SR', TOU: 'TFC', TRY: 'TRO', MNS: 'LEM' },
  GER: { MUN: 'FCB', DOR: 'BVB' },
}

// ---------- helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function get(url, { json = true, headers = {} } = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers })
      if (r.status === 404 || r.status === 403) return null
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return json ? await r.json() : Buffer.from(await r.arrayBuffer())
    } catch (e) { if (i === 3) throw new Error(`${url}: ${e.message}`); await sleep(800 * (i + 1)) }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i], i) } }))
  return out
}
const toks = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/ł/g, 'l')
  .toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length > 1)
const minuteOf = (clock) => { const m = String(clock || '').match(/^(\d+)/); return m ? Math.min(parseInt(m[1], 10), 90) : null }
const espn = (lg, p) => `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[lg]}${p}`

async function loadLeague(lg) {
  const sch = await import(path.join(DATA, `schedule-${lg}-${SEASON}.js`))
  const read = (f, name) => {
    const file = path.join(DATA, f); if (!fs.existsSync(file)) return {}
    const m = fs.readFileSync(file, 'utf8').match(new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\})\\s*$`, 'm'))
    return m ? JSON.parse(m[1]) : {}
  }
  return { TEAMS: sch.TEAMS, RESULTS: read(`results-${lg}-${SEASON}.js`, 'RESULTS'), STANDINGS: read(`standings-${lg}-${SEASON}.js`, 'STANDINGS') }
}

// ---------- 1. leaders ----------
async function leaders(lg) {
  const d = await get(espn(lg, '/statistics'))
  const g = d.stats.find(s => s.name === 'goalsLeaders').leaders
  return g.map(l => {
    const st = Object.fromEntries((l.athlete.statistics || []).map(s => [s.abbreviation, s.value]))
    return { espnId: l.athlete.id, name: l.athlete.displayName, jersey: l.athlete.jersey || null, lg, espnTeam: l.athlete.team?.id,
      espnAbbr: l.athlete.team?.abbreviation, G: st.G ?? l.value, A: st.A ?? 0, APP: st.APP ?? null }
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
  const plays = p.plays || []
  const subClocks = plays.filter(x => x.substitution).map(x => minuteOf(x.clock?.displayValue))
  const rc = plays.find(x => x.redCard)
  let start = 0, end = 90
  if (!p.starter) start = subClocks[0] ?? 90
  if (p.subbedOut) end = (p.starter ? subClocks[0] : subClocks[1]) ?? 90
  if (rc) end = Math.min(end, minuteOf(rc.clock?.displayValue) ?? end)
  // goals with type + assister, from the key events (own goals are not the player's)
  const goals = (sm.keyEvents || []).filter(k => k.scoringPlay && k.participants?.[0]?.athlete?.id === athleteId)
    .map(k => {
      const t = (k.type?.text || '').toLowerCase()
      if (t.includes('own goal')) return null
      return { min: k.clock?.displayValue || '', kind: t.includes('penalty') ? 'pen' : t.includes('header') ? 'head' : t.includes('free') ? 'fk' : '',
        ast: k.participants?.[1]?.athlete?.displayName || null }
    }).filter(Boolean)
  return { role: p.starter ? 'S' : 'B', min: Math.max(0, end - start), G: st.G || 0, A: st.A || 0, SH: st.SHOT || 0, SOG: st.SOG || 0,
    YC: st.YC || 0, RC: st.RC || 0, pens: goals.filter(g => g.kind === 'pen').length, goals }
}

// ---------- 3. official photos (league sites) ----------
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const LALIGA_SLUG = { ATH: 'athletic-club', ATM: 'atletico-de-madrid', OSA: 'c-a-osasuna', CEL: 'rc-celta', ALA: 'd-alaves', ELC: 'elche-c-f',
  BAR: 'fc-barcelona', GET: 'getafe-cf', LEV: 'levante-ud', MGA: 'malaga-cf', RAC: 'r-racing-club', RAY: 'rayo-vallecano', RCD: 'rc-deportivo',
  ESP: 'rcd-espanyol', BET: 'real-betis', RMA: 'real-madrid', RSO: 'real-sociedad', SEV: 'sevilla-fc', VAL: 'valencia-cf', VIL: 'villarreal-cf' }
const BUNDES_SLUG = { FCB: 'fc-bayern-muenchen', BVB: 'borussia-dortmund', RBL: 'rb-leipzig', VFB: 'vfb-stuttgart', TSG: 'tsg-hoffenheim',
  B04: 'bayer-04-leverkusen', SCF: 'sport-club-freiburg', SGE: 'eintracht-frankfurt', FCA: 'fc-augsburg', BMG: 'borussia-moenchengladbach',
  HSV: 'hamburger-sv', SVW: 'sv-werder-bremen', S04: 'fc-schalke-04', ELV: 'sv-elversberg', SCP: 'sc-paderborn-07', KOE: '1-fc-koeln',
  FCU: '1-fc-union-berlin', M05: '1-fsv-mainz-05' }
const L1_TRIGRAM = { SCO: 'ANG', NIC: 'OGC', REN: 'SR' }
const LEGA_SEASON = { '2026-27': 'serie-a::Football_Season::ed7fdc2a3e7b408b942ec177b7b956b5' }
const LALIGA_KEY = 'c13c3a8e2f6b46da9c5c425cf61fab3e'   // public key the laliga.com page itself sends

// each returns { CODE: [{ num, names:[...], src }] } lazily per club
const squadCache = new Map()
async function squad(lg, code) {
  const k = lg + code
  if (!squadCache.has(k)) squadCache.set(k, SQUAD[lg](code).catch(e => { console.warn(`  ! squad ${lg} ${code}: ${e.message}`); return [] }))
  return squadCache.get(k)
}
let legaTeams = null, plTeams = null, l1Clubs = null
const SQUAD = {
  async ITA(code) {
    const B = 'https://api-sdp.legaseriea.it/v1/serie-a/football', S = encodeURIComponent(LEGA_SEASON[SEASON])
    legaTeams ??= (async () => {
      const st = await get(`${B}/seasons/${S}/standings/overall?locale=it-IT`); const acc = {}
      const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.teamId && o.acronymName) acc[o.acronymName] = o.teamId; Object.values(o).forEach(walk) } }
      walk(st); return acc
    })()
    const tid = (await legaTeams)[code]; if (!tid) return []
    const r = await get(`${B}/teams/${encodeURIComponent(tid)}/roster?locale=it-IT&seasonId=${S}`)
    return (r?.players || []).map(p => ({ num: String(p.bibNumber ?? ''), names: [p.displayName, p.shortName, p.shirtName, `${p.mediaFirstName} ${p.mediaLastName}`],
      src: p.imagery?.playerImage_home_middle ? `https://media-sdp.legaseriea.it/${p.imagery.playerImage_home_middle}` : null }))
  },
  async ENG(code) {
    const A = 'https://sdp-prem-prod.premier-league-prod.pulselive.com/api'
    plTeams ??= get(`${A}/v1/competitions/8/seasons/${YEAR}/teams?_limit=20`).then(d => Object.fromEntries(d.data.map(t => [t.abbr, t.id])))
    const tid = (await plTeams)[code]; if (!tid) return []
    const sq = await get(`${A}/v1/competitions/8/seasons/${YEAR}/teams/${tid}/squad`) || []
    return sq.filter(p => !p.currentTeam?.loan).map(p => ({ num: String(p.shirtNum ?? ''), names: [p.name?.display, `${p.name?.first} ${p.name?.last}`],
      src: `https://resources.premierleague.com/premierleague25/photos/players/500x500/${p.id.playerId}.png` }))
  },
  async ESP(code) {
    const slug = LALIGA_SLUG[code]; if (!slug) return []
    const d = await get(`https://apim.laliga.com/public-service/api/v1/teams/${slug}/squad-manager?limit=80&offset=0&orderField=id&orderType=DESC&seasonYear=${YEAR}&contentLanguage=en&subscription-key=${LALIGA_KEY}`)
    return (d?.squads || []).filter(p => p.role?.slug === 'jugador' && p.current && !p.loan_to).map(p => {
      const v = p.photos?.['001'] || {}; const key = Object.keys(v).find(s => s.startsWith('1024x'))
      return { num: String(p.shirt_number ?? ''), names: [p.person?.name, p.person?.nickname, `${p.person?.firstname} ${p.person?.lastname}`], src: key ? v[key] : null }
    })
  },
  async FRA(code) {
    const M = 'https://ma-api.ligue1.fr'
    l1Clubs ??= get(`${M}/championship-standings/1/general?season=${YEAR}`).then(d => Object.fromEntries(Object.values(d.standings)
      .map(v => [L1_TRIGRAM[v.clubIdentity.trigram] || v.clubIdentity.trigram, v.clubId])))
    const cid = (await l1Clubs)[code]; if (!cid) return []
    const c = await get(`${M}/championship-club/${cid}`)
    const ids = c?.championships?.['1']?.playersIds || []
    return (await pool(ids, 8, async (pid) => {
      const p = await get(`${M}/championship-player/${pid}`); if (!p) return null
      const ch = p.championships?.['1'] || {}; const bust = ch.assets?.bustPictures
      return { num: String(ch.jerseyNumber ?? ''), names: [`${p.firstName} ${p.lastName}`, p.lastName], src: bust?.large || bust?.medium || null }
    })).filter(Boolean)
  },
  async GER(code) {
    const slug = BUNDES_SLUG[code]; if (!slug) return []
    const h = await get(`https://www.bundesliga.com/en/bundesliga/clubs/${slug}/squad`, { json: false, headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html', 'Accept-Language': 'en' } })
    const m = h && h.toString().match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/)
    if (!m) return []
    const t = m[1].replace(/\\u002F/g, '/'), out = [], seen = new Set()
    for (const x of t.matchAll(/"id":"(DFL-OBJ-[A-Z0-9]+)","lastUpdate":[^,]*,"name":\{"alias":(null|"[^"]*"),"first":"([^"]*)","full":"([^"]*)","last":"([^"]*)"[\s\S]{0,700}?"playerImages":\{"FACE_CIRCLE":"([^"]+)"\},"shirtNumber":"?(\d*)/g)) {
      if (seen.has(x[1])) continue; seen.add(x[1])
      out.push({ num: x[7], names: [x[4], `${x[3]} ${x[5]}`, x[2] !== 'null' ? x[2].replace(/"/g, '') : ''], src: x[6].replace('-circle.png', '.png') })
    }
    return out
  },
}
function matchPlayer(list, pl) {
  const want = new Set(toks(pl.name)), last = toks(pl.name).at(-1)
  let best = null, bestS = 0
  for (const c of list) {
    const t = new Set(c.names.flatMap(toks))
    const overlap = [...want].filter(w => t.has(w)).length
    let s = overlap * 2 + (last && t.has(last) ? 2 : 0)
    if (pl.jersey && c.num && c.num === String(pl.jersey)) s += 3
    if (overlap === 0 && !(pl.jersey && c.num === String(pl.jersey))) continue
    if (s > bestS) { best = c; bestS = s }
  }
  // need a name hit, or the shirt number plus a name hit — a lone shirt number is not enough
  return bestS >= 4 ? best : null
}

// ---------- main ----------
const errors = [], warns = []
const league = {}
for (const lg of Object.keys(LEAGUES)) league[lg] = await loadLeague(lg)

// ESPN team id → our code, per league (fail on anything unmapped)
const teamCode = {}
for (const lg of Object.keys(LEAGUES)) {
  const r = await get(espn(lg, '/teams'))
  for (const { team } of r.sports[0].leagues[0].teams) {
    const code = ESPN_ABBR[lg][team.abbreviation] || team.abbreviation
    if (!league[lg].TEAMS[code]) errors.push(`${lg}: ESPN team ${team.displayName} (${team.abbreviation}) has no code in schedule-${lg}`)
    teamCode[lg + team.id] = code
  }
}

const all = (await Promise.all(Object.keys(LEAGUES).map(leaders))).flat()
all.sort((a, b) => b.G - a.G || b.A - a.A || (a.APP ?? 99) - (b.APP ?? 99))
const cut = all[Math.min(TOP_N, all.length) - 1].G
const picked = all.filter(p => p.G >= cut)
console.log(`leaders: ${all.length} across 5 leagues · #${TOP_N} has ${cut} goals → ${picked.length} players (ties included)`)

const players = await pool(picked, 4, async (pl) => {
  const { lg } = pl, L = league[lg]
  const code = teamCode[lg + pl.espnTeam]
  const sched = await teamSchedule(lg, pl.espnTeam)
  const evs = (sched?.events || []).filter(e => e.competitions?.[0]?.status?.type?.completed).sort((a, b) => a.date.localeCompare(b.date))
  const matches = []
  for (const e of evs) {
    const comp = e.competitions[0]
    const me = comp.competitors.find(c => c.team.id === pl.espnTeam), op = comp.competitors.find(c => c.team.id !== pl.espnTeam)
    const opp = teamCode[lg + op.team.id], ha = me.homeAway === 'home' ? 'H' : 'A'
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
  if (pl.APP != null && apps !== pl.APP) errors.push(`${pl.name} (${lg}): ${apps} appearances in reports, ESPN says ${pl.APP}`)

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
  const pos = mds.length ? L.STANDINGS[mds[0]].indexOf(code) + 1 || null : null
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
})

// competition ranking: equal goals share a rank (1, 2, 2, 2, 5 …)
players.sort((a, b) => b.G - a.G || b.A - a.A || a.min - b.min)
players.forEach(p => { p.rank = 1 + players.filter(q => q.G > p.G).length })

// ---------- photos ----------
const photoCache = fs.existsSync(PHOTO_CACHE) ? JSON.parse(fs.readFileSync(PHOTO_CACHE, 'utf8')) : {}
if (!NO_PHOTOS) {
  const sharp = (await import('sharp')).default
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
    await sharp(buf).trim().resize({ height: 720, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toFile(file)
    photoCache[p.espnId] = hit.src
  })
}

// ---------- report + write ----------
for (const p of players) console.log(`${String(p.rank).padStart(2)}. ${p.name.padEnd(26)} ${p.lg} ${p.team.padEnd(4)} ${String(p.G).padStart(2)}g ${p.A}a ${p.apps}app ${String(p.min).padStart(4)}' pens ${p.pens}  ${p.photo ? 'photo ← ' + p._match : 'INITIALS'}`)
if (warns.length) console.log(`\n${warns.length} note(s):\n  ` + [...new Set(warns)].join('\n  '))
if (errors.length) { console.error(`\n✗ ${errors.length} verification error(s) — nothing written:\n  ` + errors.join('\n  ')); process.exit(1) }
console.log(`\n✓ verified: per-match goals/assists/apps match ESPN season totals for all ${players.length}; every ESPN score matches ours`)
if (DRY) process.exit(0)
players.forEach(p => delete p._match)
const OUT = path.join(DATA, `scorers-TOP5-${SEASON}.js`)
// unchanged numbers → leave the file (and its `updated` stamp) alone, so the nightly run doesn't redeploy for nothing
try {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8').match(/export const SCORERS = (\{[\s\S]*\})\s*$/)[1])
  if (JSON.stringify(prev.players) === JSON.stringify(players) && prev.cut === cut) { console.log('scorers unchanged — nothing written'); process.exit(0) }
} catch { }
const out = { season: SEASON, updated: new Date().toISOString(), cut, players }
fs.writeFileSync(OUT,
  `// Top-5-league top scorers (top ${TOP_N} by goals, ties at the cut included). Auto-updated by scripts/update-scorers.mjs.\nexport const SCORERS = ${JSON.stringify(out)}\n`)
if (!NO_PHOTOS) fs.writeFileSync(PHOTO_CACHE, JSON.stringify(photoCache, null, 1) + '\n')
console.log(`wrote src/data/scorers-TOP5-${SEASON}.js (${players.length} players)`)
