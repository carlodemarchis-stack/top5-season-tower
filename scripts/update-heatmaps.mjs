#!/usr/bin/env node
/**
 * Player heatmaps per match, from FotMob → src/data/heat-<LEAGUE>-<season>.js (the player cards' Heatmaps view).
 *
 *   node scripts/update-heatmaps.mjs                 # all five leagues, only matches not on file yet
 *   node scripts/update-heatmaps.mjs --league ITA    # one league
 *   node scripts/update-heatmaps.mjs --full          # refetch every match
 *
 * FotMob's heatmap of a match lists each player's touches as points on a 105 × 68 pitch, every player attacking the
 * same way (to the right), keyed by his Opta id; the match's player stats give Opta id, shirt and name, which we match
 * to our match card's line-up (shirt first, then name) to get our ESPN id. Clubs and fixtures are matched like the
 * coaches (lib/football.mjs fotmobClubs) and checked against our match cards.
 *
 * Output: HEAT = { <our match id>: { <espnId>: "<points>" } } — each point two base-36 characters, x then y on a 36 × 36
 * grid (x 0 = own goal → 35 = the goal he attacks; y 0 = his left touchline → 35 = his right): about 3 m by 2 m.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DATA, get, pool, fotmobClubs } from './lib/football.mjs'

const args = process.argv.slice(2), has = (f) => args.includes(f), arg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const SEASON = '2026-27', FULL = has('--full')
const FM_LEAGUE = { ITA: 55, ENG: 47, ESP: 87, FRA: 53, GER: 54 }
const LGS = arg('--league') ? [arg('--league')] : Object.keys(FM_LEAGUE)
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' }
const fm = (p) => get(`https://www.fotmob.com/api/data/${p}`, { headers: H })
const readJS = (f, name) => { const m = fs.readFileSync(f, 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`)); return m ? JSON.parse(m[1]) : null }
const plain = (n) => String(n || '').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz'
const pack = (svg) => [...svg.matchAll(/cx="([\d.]+)" cy="([\d.]+)"/g)].map(([, x, y]) =>
  B36[Math.max(0, Math.min(35, Math.round(+x / 105 * 35)))] + B36[Math.max(0, Math.min(35, Math.round(+y / 68 * 35)))]).join('')
let failed = false

for (const lg of LGS) {
  console.log(`== ${lg}`)
  const L = await fm(`leagues?id=${FM_LEAGUE[lg]}`)
  if (L?.details?.selectedSeason !== SEASON.replace('-', '/20')) { console.error(`  ✗ FotMob season is ${L?.details?.selectedSeason}`); failed = true; continue }
  const TEAMS = readJS(path.join(DATA, `schedule-${lg}-${SEASON}.js`), 'TEAMS')
  const { CODE, lost } = fotmobClubs(L, TEAMS)
  if (lost.length) { console.error(`  ✗ unmatched FotMob clubs: ${lost.map(f => f.name).join(', ')}`); failed = true; continue }
  const ours = new Map(fs.readdirSync(DATA).filter(f => f.startsWith(`matches-${lg}-${SEASON}-md`)).flatMap(f => readJS(path.join(DATA, f), 'MATCHES')).map(M => [`${M.h}-${M.a}`, M]))
  const fixtures = L.fixtures.allMatches.filter(m => m.status?.finished && !m.status?.cancelled).map(m => ({ id: String(m.id), key: `${CODE[m.home.id]}-${CODE[m.away.id]}`, homeId: String(m.home.id) }))
  const wrong = fixtures.filter(f => !TEAMS[f.key.split('-')[0]]); if (wrong.length) { console.error(`  ✗ fixtures with an unknown club: ${wrong.length}`); failed = true; continue }

  const OUT = path.join(DATA, `heat-${lg}-${SEASON}.js`)
  const HEAT = !FULL && fs.existsSync(OUT) ? readJS(OUT, 'HEAT') || {} : {}
  const todo = fixtures.filter(f => ours.has(f.key) && !HEAT[ours.get(f.key).id])
  let players = 0, unmatched = 0
  await pool(todo, 3, async (f) => {
    const M = ours.get(f.key)
    const [md, hm] = await Promise.all([fm(`matchDetails?matchId=${f.id}`), fm(`heatmap/match/${f.id}/heatmaps?heatmapUrl=${encodeURIComponent(`https://pub.fotmob.com/prod/db/api/heatmap/match/${f.id}`)}`)])
    if (!md || !hm?.players) { console.warn(`  ! ${f.key}: no heatmap yet`); return }
    const out = {}
    for (const p of Object.values(md.content?.playerStats || {})) {
      const svg = hm.players[`p${p.optaId}`]; if (!svg) continue
      const T = String(p.teamId) === f.homeId ? M.home : M.away
      // our ESPN id: the same shirt in his side's line-up, else the same name (no accents), else the same surname
      const hit = T.players.find(x => String(x.n) === String(p.shirtNumber) && p.shirtNumber != null)
        || T.players.find(x => plain(x.name) === plain(p.name)) || T.players.find(x => plain(x.name).split(' ').pop() === plain(p.name).split(' ').pop())
      if (!hit) { unmatched++; continue }
      const pts = pack(svg); if (pts) { out[hit.id] = pts; players++ }
    }
    HEAT[M.id] = out
  })
  console.log(`  ${todo.length} new matches · ${players} player maps · ${unmatched} unmatched · ${Object.keys(HEAT).length} matches on file`)
  if (todo.length) fs.writeFileSync(OUT, `// Player heatmaps per match (FotMob touches, normalised to attack one way): match id → ESPN player id → packed points,\n// two base-36 characters each (x along the pitch 0–35, y across 0–35). Auto-updated by scripts/update-heatmaps.mjs.\nexport const HEAT = ${JSON.stringify(HEAT)}\n`)
}
if (failed) process.exit(1)
