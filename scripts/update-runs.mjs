#!/usr/bin/env node
/**
 * Distance run and top speed per player per match → src/data/run-<LEAGUE>-<season>.js (the km in the player cards'
 * Tactical and Heatmaps tables).
 *
 *   node scripts/update-runs.mjs                 # Serie A + Premier League, only matches not on file yet
 *   node scripts/update-runs.mjs --league ITA    # one league
 *   node scripts/update-runs.mjs --full          # refetch every match
 *
 * Serie A: the league's own API (api-sdp.legaseriea.it, match ids = ours), "distance-covered" (km) and "maximum-speed".
 * Premier League: FotMob's match details, "Distance covered" (metres) and "Top speed". LaLiga, Ligue 1 and the
 * Bundesliga have no tracking on either. Players are matched to our match card's line-up by shirt, then name.
 *
 * Output: RUN = { <our match id>: { <espnId>: [km, top speed km/h] } }, one decimal each.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DATA, get, pool, fotmobClubs, LEGA_SEASON as LS } from './lib/football.mjs'

const args = process.argv.slice(2), has = (f) => args.includes(f), arg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const SEASON = '2026-27', FULL = has('--full')
const LGS = arg('--league') ? [arg('--league')] : ['ITA', 'ENG']
const LEGA = 'https://api-sdp.legaseriea.it/v1/serie-a/football', LEGA_SEASON = LS[SEASON]
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' }
const fm = (p) => get(`https://www.fotmob.com/api/data/${p}`, { headers: H })
const readJS = (f, name) => { const m = fs.readFileSync(f, 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`)); return m ? JSON.parse(m[1]) : null }
const plain = (n) => String(n || '').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const r1 = (v) => Math.round(v * 10) / 10
// our ESPN id: the same shirt in his side's line-up, else the same name (no accents), else the same surname
const ours = (T, shirt, names) => T.players.find(x => shirt != null && String(x.n) === String(shirt))
  || T.players.find(x => names.some(n => plain(x.name) === plain(n))) || T.players.find(x => names.some(n => n && plain(x.name).split(' ').pop() === plain(n).split(' ').pop()))
let failed = false

// one league's matches still to fetch → { matchId: { espnId: [km, top] } } (a match without tracking yet is left out)
const FETCH = {
  async ITA(byId, have) {
    const list = (await get(`${LEGA}/seasons/${encodeURIComponent(LEGA_SEASON)}/matches?locale=it-IT`))?.matches || []
    const todo = list.filter(m => m.status === 'FINISHED').map(m => m.matchId.split('::').pop()).filter(id => byId.has(id) && !have[id])
    const out = {}
    await pool(todo, 3, async (id) => {
      const M = byId.get(id)
      const d = await get(`${LEGA}/seasons/${encodeURIComponent(LEGA_SEASON)}/match/${encodeURIComponent(`serie-a::Football_Match::${id}`)}/playerstats?locale=it-IT`)
      const row = {}
      for (const p of d?.players || []) {
        const st = Object.fromEntries((p.stats || []).map(s => [s.statsId, s.statsValue])); if (!(st['distance-covered'] >= .1)) continue   // under 100 m: an unused sub's warm-up
        const T = p.team?.acronymName === M.h ? M.home : p.team?.acronymName === M.a ? M.away : null; if (!T) continue
        const hit = ours(T, p.player?.bibNumber, [p.player?.shortName, p.player?.shirtName, `${p.player?.mediaFirstName} ${p.player?.mediaLastName}`])
        if (hit) row[hit.id] = [r1(st['distance-covered']), r1(st['maximum-speed'] || 0)]; else console.warn(`  ? ${M.h}-${M.a}: ${p.player?.shortName}`)
      }
      if (Object.keys(row).length) out[id] = row; else console.warn(`  ! ${M.h}-${M.a}: no tracking yet`)
    })
    return out
  },
  async ENG(byId, have, lg) {
    const L = await fm('leagues?id=47')
    if (L?.details?.selectedSeason !== SEASON.replace('-', '/20')) throw new Error(`FotMob season is ${L?.details?.selectedSeason}`)
    const TEAMS = readJS(path.join(DATA, `schedule-${lg}-${SEASON}.js`), 'TEAMS'), { CODE, lost } = fotmobClubs(L, TEAMS)
    if (lost.length) throw new Error(`unmatched FotMob clubs: ${lost.map(f => f.name).join(', ')}`)
    const byKey = new Map([...byId.values()].map(M => [`${M.h}-${M.a}`, M]))
    const todo = L.fixtures.allMatches.filter(m => m.status?.finished && !m.status?.cancelled).map(m => ({ id: m.id, M: byKey.get(`${CODE[m.home.id]}-${CODE[m.away.id]}`), homeId: String(m.home.id) })).filter(f => f.M && !have[f.M.id])
    const out = {}
    await pool(todo, 3, async ({ id, M, homeId }) => {
      const md = await fm(`matchDetails?matchId=${id}`), row = {}
      for (const p of Object.values(md?.content?.playerStats || {})) {
        const st = Object.fromEntries((p.stats || []).flatMap(g => Object.values(g.stats || {})).map(s => [s.key, s.stat?.value]))
        if (!(st.physical_metrics_distance_covered > 0)) continue
        const hit = ours(String(p.teamId) === homeId ? M.home : M.away, p.shirtNumber, [p.name])
        if (hit) row[hit.id] = [r1(st.physical_metrics_distance_covered / 1000), r1(st.physical_metrics_topspeed || 0)]; else console.warn(`  ? ${M.h}-${M.a}: ${p.name}`)
      }
      if (Object.keys(row).length) out[M.id] = row; else console.warn(`  ! ${M.h}-${M.a}: no tracking yet`)
    })
    return out
  },
}

for (const lg of LGS) {
  console.log(`== ${lg}`)
  const byId = new Map(fs.readdirSync(DATA).filter(f => f.startsWith(`matches-${lg}-${SEASON}-md`)).flatMap(f => readJS(path.join(DATA, f), 'MATCHES')).map(M => [M.id, M]))
  const OUT = path.join(DATA, `run-${lg}-${SEASON}.js`)
  const RUN = !FULL && fs.existsSync(OUT) ? readJS(OUT, 'RUN') || {} : {}
  let add
  try { add = await FETCH[lg](byId, RUN, lg) } catch (e) { console.error(`  ✗ ${e.message}`); failed = true; continue }
  Object.assign(RUN, add)
  console.log(`  ${Object.keys(add).length} new matches · ${Object.values(add).reduce((a, r) => a + Object.keys(r).length, 0)} players · ${Object.keys(RUN).length} matches on file`)
  if (Object.keys(add).length) fs.writeFileSync(OUT, `// Distance run (km) and top speed (km/h) per player per match: match id → ESPN player id → [km, km/h].\n// Serie A from the league's API, Premier League from FotMob. Auto-updated by scripts/update-runs.mjs.\nexport const RUN = ${JSON.stringify(RUN)}\n`)
}
if (failed) process.exit(1)
