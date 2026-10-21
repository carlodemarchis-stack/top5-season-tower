#!/usr/bin/env node
/**
 * Every shot of every match, from FotMob's shot map → src/data/shots-<LEAGUE>-<season>.js (the team cards' Goals tab).
 *
 *   node scripts/update-shots.mjs                 # all five leagues, only matches not on file yet
 *   node scripts/update-shots.mjs --league ITA    # one league
 *   node scripts/update-shots.mjs --full          # refetch every match
 *
 * The shot map gives each shot's spot (x 0–105 towards the goal attacked, y 0–68 from the shooter's left), its xG,
 * outcome, situation and body part, and for a goal where it crossed the line (x 0–2 between the posts, y 0–.667 from
 * the ground to the bar). Shooters are matched to our match card's line-up like the heatmaps (shirt, then name).
 * Checked per match: as many goals as our match card (own goals included), or the match is skipped.
 *
 * Output: SHOTS = { <our match id>: [[side 'h'|'a', minute, x, y, xG, outcome, situation, body, espnId, goalX, goalY]] }
 *   outcome: g goal · s saved · o off target · p post · b blocked; situation: o open play · c counter · s set piece ·
 *   k corner · f free kick · p penalty · t throw-in; body: r right foot · l left foot · h header · x other
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
const SIT = { RegularPlay: 'o', FastBreak: 'c', SetPiece: 's', FromCorner: 'k', FreeKick: 'f', Penalty: 'p', ThrowInSetPiece: 't' }
const BODY = { RightFoot: 'r', LeftFoot: 'l', Header: 'h' }
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100
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

  const OUT = path.join(DATA, `shots-${lg}-${SEASON}.js`)
  const SHOTS = !FULL && fs.existsSync(OUT) ? readJS(OUT, 'SHOTS') || {} : {}
  const todo = fixtures.filter(f => ours.has(f.key) && !SHOTS[ours.get(f.key).id])
  let n = 0, unmatched = 0, skipped = 0
  await pool(todo, 3, async (f) => {
    const M = ours.get(f.key), md = await fm(`matchDetails?matchId=${f.id}`), sm = md?.content?.shotmap?.shots
    if (!sm?.length) { console.warn(`  ! ${f.key}: no shot map yet`); return }
    const stats = Object.values(md.content?.playerStats || {}), byFm = Object.fromEntries(stats.map(p => [String(p.id), p]))
    const rows = []
    for (const s of sm) {
      const side = String(s.teamId) === f.homeId ? 'h' : 'a', T = side === 'h' ? M.home : M.away, p = byFm[String(s.playerId)]
      const hit = (p && p.shirtNumber != null && T.players.find(x => String(x.n) === String(p.shirtNumber)))
        || T.players.find(x => plain(x.name) === plain(s.playerName)) || T.players.find(x => plain(x.name).split(' ').pop() === plain(s.lastName || s.playerName).split(' ').pop())
      if (!hit) unmatched++
      const out = s.eventType === 'Goal' ? 'g' : s.isBlocked ? 'b' : s.eventType === 'Post' ? 'p' : s.isOnTarget ? 's' : 'o'
      const row = [side, s.min + (s.minAdded ? s.minAdded / 100 : 0), r1(s.x), r1(s.y), r2(s.expectedGoals || 0), s.isOwnGoal ? 'og' : out, SIT[s.situation] || 'o', BODY[s.shotType] || 'x', hit ? String(hit.id) : '']
      if (out === 'g' && s.onGoalShot) row.push(r2(s.onGoalShot.x), r2(s.onGoalShot.y))
      rows.push(row)
    }
    // the check: as many goals as our match card, own goals included (ESPN and FotMob sometimes disagree on which
    // goal was an own goal — the shot map's call stands for the Goals tab)
    const total = rows.filter(r => r[5] === 'g' || r[5] === 'og').length
    if (total !== M.goals.length) { console.warn(`  ! ${f.key}: shot map has ${total} goals, our match card ${M.goals.length} — skipped`); skipped++; return }
    SHOTS[M.id] = rows; n += rows.length
  })
  console.log(`  ${todo.length - skipped} new matches · ${n} shots · ${unmatched} shooters unmatched · ${skipped} skipped · ${Object.keys(SHOTS).length} matches on file`)
  if (todo.length > skipped) fs.writeFileSync(OUT, `// Every shot per match (FotMob shot map): match id → [side, minute, x, y, xG, outcome, situation, body, ESPN id, goal x, goal y].\n// See scripts/update-shots.mjs for the codes. Auto-updated by it.\nexport const SHOTS = ${JSON.stringify(SHOTS)}\n`)
}
if (failed) process.exit(1)
