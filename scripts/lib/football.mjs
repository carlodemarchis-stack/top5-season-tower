// Shared by update-scorers.mjs and update-teams.mjs: ESPN access, our club codes, league data, and the official
// player photos from the five league sites (+ name/shirt matching and the webp resize).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.join(__dir, '..', '..')
export const DATA = path.join(ROOT, 'src', 'data')
export const PHOTOS = path.join(ROOT, 'public', 'players')
// official photos always come from the CURRENT squads (league sites only publish this season's shoot)
export const CUR = '2026-27', CUR_YEAR = 2026

export const LEAGUES = { ITA: 'ita.1', ENG: 'eng.1', ESP: 'esp.1', FRA: 'fra.1', GER: 'ger.1' }

// ESPN team abbreviation → our code, where they differ (everything else is identical; unmapped = hard failure)
export const ESPN_ABBR = {
  ITA: { ROMA: 'ROM', COMO: 'COM' },
  ENG: { MNC: 'MCI', MAN: 'MUN' },
  ESP: { DEP: 'RCD', MCF: 'MGA' },
  FRA: { AUX: 'AJA', MON: 'ASM', LILL: 'LIL', LOR: 'FCL', LYON: 'OL', OLM: 'OM', NICE: 'OGC', PAR: 'PFC', REN: 'SR', TOU: 'TFC', TRY: 'TRO', MNS: 'LEM' },
  GER: { MUN: 'FCB', DOR: 'BVB' },
}

// ---------- helpers ----------
export const sleep = (ms) => new Promise(r => setTimeout(r, ms))
export async function get(url, { json = true, headers = {} } = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers })
      if (r.status === 404 || r.status === 403) return null
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return json ? await r.json() : Buffer.from(await r.arrayBuffer())
    } catch (e) { if (i === 3) throw new Error(`${url}: ${e.message}`); await sleep(800 * (i + 1)) }
  }
}
export async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i], i) } }))
  return out
}
export const toks = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/ł/g, 'l')
  .toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length > 1)
export const minuteOf = (clock) => { const m = String(clock || '').match(/^(\d+)/); return m ? Math.min(parseInt(m[1], 10), 90) : null }
export const espn = (lg, p) => `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[lg]}${p}`
// minutes a player was on the pitch, from his match-report roster entry (substitution clocks + a red card; 90 = full game)
export function minutesOf(p) {
  if (!(p.starter || p.subbedIn)) return 0
  const plays = p.plays || []
  const subClocks = plays.filter(x => x.substitution).map(x => minuteOf(x.clock?.displayValue))
  const rc = plays.find(x => x.redCard)
  let start = 0, end = 90
  if (!p.starter) start = subClocks[0] ?? 90
  if (p.subbedOut) end = (p.starter ? subClocks[0] : subClocks[1]) ?? 90
  if (rc) end = Math.min(end, minuteOf(rc.clock?.displayValue) ?? end)
  return Math.max(0, end - start)
}

export async function loadLeague(lg, SEASON) {
  const sch = await import(path.join(DATA, `schedule-${lg}-${SEASON}.js`))
  const read = (f, name) => {
    const file = path.join(DATA, f); if (!fs.existsSync(file)) return {}
    const m = fs.readFileSync(file, 'utf8').match(new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\})\\s*$`, 'm'))
    return m ? JSON.parse(m[1]) : {}
  }
  return { TEAMS: sch.TEAMS, RESULTS: read(`results-${lg}-${SEASON}.js`, 'RESULTS'), STANDINGS: read(`standings-${lg}-${SEASON}.js`, 'STANDINGS') }
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
export async function squad(lg, code) {
  const k = lg + code
  if (!squadCache.has(k)) squadCache.set(k, SQUAD[lg](code).catch(e => { console.warn(`  ! squad ${lg} ${code}: ${e.message}`); return [] }))
  return squadCache.get(k)
}
let legaTeams = null, plTeams = null, l1Clubs = null
const SQUAD = {
  async ITA(code) {
    const B = 'https://api-sdp.legaseriea.it/v1/serie-a/football', S = encodeURIComponent(LEGA_SEASON[CUR])
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
    plTeams ??= get(`${A}/v1/competitions/8/seasons/${CUR_YEAR}/teams?_limit=20`).then(d => Object.fromEntries(d.data.map(t => [t.abbr, t.id])))
    const tid = (await plTeams)[code]; if (!tid) return []
    const sq = await get(`${A}/v1/competitions/8/seasons/${CUR_YEAR}/teams/${tid}/squad`) || []
    return sq.filter(p => !p.currentTeam?.loan).map(p => ({ num: String(p.shirtNum ?? ''), names: [p.name?.display, `${p.name?.first} ${p.name?.last}`],
      src: `https://resources.premierleague.com/premierleague25/photos/players/500x500/${p.id.playerId}.png` }))
  },
  async ESP(code) {
    const slug = LALIGA_SLUG[code]; if (!slug) return []
    const d = await get(`https://apim.laliga.com/public-service/api/v1/teams/${slug}/squad-manager?limit=80&offset=0&orderField=id&orderType=DESC&seasonYear=${CUR_YEAR}&contentLanguage=en&subscription-key=${LALIGA_KEY}`)
    return (d?.squads || []).filter(p => p.role?.slug === 'jugador' && p.current && !p.loan_to).map(p => {
      const v = p.photos?.['001'] || {}; const key = Object.keys(v).find(s => s.startsWith('1024x'))
      return { num: String(p.shirt_number ?? ''), names: [p.person?.name, p.person?.nickname, `${p.person?.firstname} ${p.person?.lastname}`], src: key ? v[key] : null }
    })
  },
  async FRA(code) {
    const M = 'https://ma-api.ligue1.fr'
    l1Clubs ??= get(`${M}/championship-standings/1/general?season=${CUR_YEAR}`).then(d => Object.fromEntries(Object.values(d.standings)
      .map(v => [L1_TRIGRAM[v.clubIdentity.trigram] || v.clubIdentity.trigram, v.clubId])))
    const cid = (await l1Clubs)[code]; if (!cid) return []
    const c = await get(`${M}/championship-club/${cid}`)
    const ids = c?.championships?.['1']?.playersIds || []
    return (await pool(ids, 8, async (pid) => {
      const p = await get(`${M}/championship-player/${pid}`); if (!p) return null
      const ch = p.championships?.['1'] || {}; const bust = ch.assets?.bustPictures
      return { num: String(ch.jerseyNumber ?? ''), names: [`${p.firstName} ${p.lastName}`, p.lastName, p.knownName], src: bust?.large || bust?.medium || null }
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
export function matchPlayer(list, pl) {
  const want = new Set(toks(pl.name)), last = toks(pl.name).at(-1)
  let best = null, bestS = 0
  for (const c of list) {
    const t = new Set(c.names.flatMap(toks))
    // a word counts when it is the same, or one is the start of the other with ≥ 4 letters in common (Rodri / Rodrigo)
    const near = (w) => t.has(w) || [...t].some(x => Math.min(x.length, w.length) >= 4 && (x.startsWith(w) || w.startsWith(x)))
    const overlap = [...want].filter(near).length
    let s = overlap * 2 + (last && t.has(last) ? 2 : 0)
    if (pl.jersey && c.num && c.num === String(pl.jersey)) s += 3
    if (overlap === 0 && !(pl.jersey && c.num === String(pl.jersey))) continue
    if (s > bestS) { best = c; bestS = s }
  }
  // need a name hit, or the shirt number plus a name hit — a lone shirt number is not enough
  if (bestS < 4) return null
  // …and the SURNAME must agree: exactly, within two letters (Oboavwoduo / Oboavwodou), the same letters without the
  // spaces (Del Prato / Delprato), or the official name is a one-word name that is one of ours (Bayo Youssouf / Bayo).
  // Stops a shared first name + shirt number pairing two different players (Joao Victor #17 ≠ João Mário #17).
  const ours = toks(pl.name), theirNames = best.names.filter(Boolean).map(toks)
  const theirs = theirNames.flat()
  const ok = !last || theirs.includes(last) || theirs.some(w => lev(w, last) <= 2) ||
    theirNames.some(n => n.join('') === ours.join('')) || theirNames.some(n => n.length === 1 && ours.includes(n[0]))
  return ok ? best : null
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

// ESPN team → our code, per league. ESPN's /teams list is always the CURRENT season, so for the current season
// every club must map (hard failure otherwise); for a past season clubs are resolved from the match data itself.
export const nameKey = (s) => toks(s).filter(w => !['fc', 'cf', 'ac', 'as', 'ssc', 'us', 'afc', 'sc', 'calcio', 'club', 'de', 'rc', 'cd', 'ud', 'sv', 'vfb', 'vfl', 'tsg'].includes(w)).join(' ')
// returns codeFor(lg, espnTeam) bound to the loaded league data; unresolved clubs are pushed onto `errors`
export function makeCodeFor(league, SEASON, errors) {
  const teamCode = {}
  return function codeFor(lg, team) {
  const k = lg + team.id; if (teamCode[k]) return teamCode[k]
  const T = league[lg].TEAMS, abbr = ESPN_ABBR[lg][team.abbreviation] || team.abbreviation
  let code = T[abbr] ? abbr : null
  if (!code) { const n = nameKey(team.displayName || team.name); code = Object.keys(T).find(c => { const m = nameKey(T[c].name); return m && n && (m.includes(n) || n.includes(m)) }) || null }
  if (!code) errors.push(`${lg}: ESPN team ${team.displayName} (${team.abbreviation}) has no code in schedule-${lg}-${SEASON}`)
  return (teamCode[k] = code)
  }
}

// official cutout → trimmed webp, ≤720px tall by default (squad thumbnails pass a smaller height)
export async function savePhoto(buf, file, height = 720, quality = 82) {
  const sharp = (await import('sharp')).default
  await sharp(buf).trim().resize({ height, withoutEnlargement: true }).webp({ quality, alphaQuality: quality === 82 ? 90 : 80 }).toFile(file)
}

// League sites serve a stand-in (a club-kit silhouette) for players they haven't photographed — LaLiga and Ligue 1
// do it per club. Two players never share a real photo, so any file shared by 2+ players is a stand-in: return
// those ids so the caller can drop them (no file, no cache entry → re-checked next run, picked up once real).
export function standIns(dir, ids) {
  const crypto = require_crypto()
  const byHash = new Map()
  for (const id of ids) {
    const f = path.join(dir, `${id}.webp`); if (!fs.existsSync(f)) continue
    const h = crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')
    byHash.set(h, [...(byHash.get(h) || []), id])
  }
  return new Set([...byHash.values()].filter(a => a.length > 1).flat())
}
import * as nodeCrypto from 'node:crypto'
function require_crypto() { return nodeCrypto }
