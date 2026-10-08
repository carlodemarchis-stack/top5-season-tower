#!/usr/bin/env node
/**
 * Team cards: one record per club → src/data/teams-<LG>-<season>.js, + the club's top-3 scorers' official photos.
 *
 *   node scripts/update-teams.mjs --league ITA          # fetch, verify, write
 *   node scripts/update-teams.mjs --league ITA --dry-run
 *
 * Per club, from ESPN match reports: every league match (score, possession, shots, passes, corners, cards), every goal
 * scored and conceded with its minute + scorer, and the club's scorers (goals/assists). Table line + position per
 * matchday come from OUR results/standings. Verified: goals in the key events = the score of every match, and every
 * ESPN score = ours. Any failure → nothing written.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEAGUES, CUR, get, pool, espn, loadLeague, squad, matchPlayer, makeCodeFor, savePhoto, minutesOf, standIns, PHOTOS, DATA, ROOT } from './lib/football.mjs'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27')
const YEAR = parseInt(SEASON.slice(0, 4), 10)
const LG = opt('--league', 'ITA')
const DRY = has('--dry-run')
const PHOTO_CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scorers-photo-cache.json')   // shared with the scorers film
const SQUAD_DIR = path.join(ROOT, 'public', 'squad')                                                   // roster thumbnails (200px, ~6 KB)
const SQUAD_CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'squad-photo-cache.json')
if (!LEAGUES[LG]) { console.error(`unknown --league ${LG}`); process.exit(1) }

const errors = [], warns = []
const L = await loadLeague(LG, SEASON)
const codeFor = makeCodeFor({ [LG]: L }, SEASON, errors)
const espnTeams = (await get(espn(LG, '/teams'))).sports[0].leagues[0].teams.map(t => t.team)
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
const kindOf = (t) => t.includes('own goal') ? 'og' : t.includes('penalty') ? 'pen' : t.includes('header') ? 'head' : t.includes('free') ? 'fk' : ''

const summaries = new Map()
const summary = (id) => { if (!summaries.has(id)) summaries.set(id, get(espn(LG, `/summary?event=${id}`))); return summaries.get(id) }

const clubs = await pool(espnTeams, 4, async (team) => {
  const code = codeFor(LG, team); if (!code) return null
  const sched = await get(espn(LG, `/teams/${team.id}/schedule?season=${YEAR}`))
  const evs = (sched?.events || []).filter(e => e.competitions?.[0]?.status?.type?.completed)
  const matches = [], scorers = new Map()
  for (const e of evs) {
    const comp = e.competitions[0]
    const me = comp.competitors.find(c => c.team.id === team.id), op = comp.competitors.find(c => c.team.id !== team.id)
    const opp = codeFor(LG, op.team), ha = me.homeAway === 'home' ? 'H' : 'A'
    const g = L.TEAMS[code]?.games.find(x => x.opp === opp && x.ha === ha)
    if (!g) { errors.push(`${code}: no fixture ${ha} vs ${opp} (ESPN ${e.id})`); continue }
    const sc = (c) => Number(typeof c.score === 'object' ? c.score.value ?? c.score.displayValue : c.score)
    const gf = sc(me), ga = sc(op)
    const ours = L.RESULTS[g.id]
    if (ours) { const [f, a] = ha === 'H' ? [ours.hg, ours.ag] : [ours.ag, ours.hg]; if (f !== gf || a !== ga) errors.push(`${g.id} ${code}-${opp}: ESPN ${gf}-${ga} ≠ ours ${f}-${a}`) }
    const sm = await summary(e.id)
    const st = Object.fromEntries((sm.boxscore?.teams?.find(t => t.team.id === team.id)?.statistics || []).map(s => [s.name, s.displayValue]))
    // goals for / against, from the key events (the event's team = the team credited with the goal, own goals included)
    const goals = (sm.keyEvents || []).filter(k => k.scoringPlay && !(k.type?.text || '').toLowerCase().includes('shootout')).map(k => {
      const t = (k.type?.text || '').toLowerCase(), who = k.participants?.[0]?.athlete
      return { min: k.clock?.displayValue || '', kind: kindOf(t), by: who?.displayName || '', byId: who?.id || null, ast: k.participants?.[1]?.athlete?.displayName || null, for: k.team?.id === team.id }
    })
    const gFor = goals.filter(x => x.for), gAg = goals.filter(x => !x.for)
    if (gFor.length !== gf || gAg.length !== ga) errors.push(`${code} MD${g.w} vs ${opp}: key events ${gFor.length}-${gAg.length} ≠ score ${gf}-${ga}`)
    for (const x of gFor) if (x.kind !== 'og' && x.byId) { const s = scorers.get(x.byId) || { espnId: x.byId, name: x.by, G: 0, A: 0 }; s.G++; scorers.set(x.byId, s) }
    for (const x of gFor) if (x.ast) { const s = [...scorers.values()].find(v => v.name === x.ast) || { espnId: null, name: x.ast, G: 0, A: 0 }; s.A++; if (!s.espnId) scorers.set('a:' + x.ast, s) }
    matches.push({ id: g.id, w: g.w, opp, ha, gf, ga,
      poss: num(st.possessionPct), sh: num(st.totalShots), sot: num(st.shotsOnTarget), pass: Math.round(num(st.passPct) * 100), passes: num(st.totalPasses),
      cor: num(st.wonCorners), fouls: num(st.foulsCommitted), yc: num(st.yellowCards), rc: num(st.redCards),
      for: gFor.map(({ min, kind, by, ast }) => ({ min, kind, by, ast })), against: gAg.map(({ min, kind, by }) => ({ min, kind, by })) })
  }
  matches.sort((a, b) => a.w - b.w)
  // the squad: ESPN's roster (position, number, age, nationality, injuries, goals/assists/cards/saves) + appearances,
  // starts and minutes counted from the match reports themselves
  const onPitch = new Map()
  for (const e of evs) {
    const sm = await summary(e.id)
    for (const p of sm.rosters?.find(r => r.team.id === team.id)?.roster || []) {
      if (!(p.starter || p.subbedIn)) continue
      const x = onPitch.get(p.athlete.id) || { apps: 0, starts: 0, min: 0 }; x.apps++; if (p.starter) x.starts++; x.min += minutesOf(p); onPitch.set(p.athlete.id, x)
    }
  }
  const ros = await get(espn(LG, `/teams/${team.id}/roster`))
  const squadList = (ros?.athletes || []).map(a => {
    const st = Object.fromEntries((a.statistics?.splits?.categories || []).flatMap(c => c.stats.map(x => [x.abbreviation, num(x.displayValue)])))
    const o = onPitch.get(a.id) || { apps: 0, starts: 0, min: 0 }
    const inj = a.injuries?.[0]
    return { espnId: a.id, name: a.displayName, jersey: a.jersey || null, pos: a.position?.abbreviation || '?', age: a.age ?? null,
      nat: a.citizenshipCountry?.abbreviation || null, inj: inj ? (inj.status || inj.type?.description || 'injured') : null,
      apps: o.apps, starts: o.starts, min: o.min, G: st.G || 0, A: st.A || 0, YC: st.YC || 0, RC: st.RC || 0,
      ...(a.position?.abbreviation === 'G' ? { SV: st.SV || 0, GA: st.GA || 0 } : {}) }
  })
  const rosterGoals = squadList.reduce((s, p) => s + p.G, 0), ownGoalsFor = matches.reduce((s, m) => s + m.for.filter(x => x.kind === 'og').length, 0)
  if (rosterGoals !== GFsum(matches) - ownGoalsFor) warns.push(`${code}: squad goals ${rosterGoals} vs ${GFsum(matches) - ownGoalsFor} scored by its players (a scorer may have left the roster)`)
  // a scorer's shirt number (for the photo match) from any of his rosters
  const list = [...scorers.values()].filter(s => s.G || s.A).sort((a, b) => b.G - a.G || b.A - a.A)
  for (const s of list.filter(s => s.espnId && !s.espnId.startsWith?.('a:')).slice(0, 3)) {
    for (const e of evs) { const sm = await summary(e.id); const r = sm.rosters?.find(r => r.team.id === team.id)?.roster?.find(p => p.athlete.id === s.espnId); if (r?.jersey) { s.jersey = r.jersey; break } }
  }
  // table line + position after each matchday, from OUR data
  let W = 0, D = 0, Lo = 0, GF = 0, GA = 0, cs = 0
  for (const x of L.TEAMS[code].games) { const r = L.RESULTS[x.id]; if (!r) continue; const [f, a] = x.ha === 'H' ? [r.hg, r.ag] : [r.ag, r.hg]; GF += f; GA += a; if (!a) cs++; f > a ? W++ : f === a ? D++ : Lo++ }
  const mds = Object.keys(L.STANDINGS).map(Number).sort((a, b) => a - b)
  const posPath = mds.map(md => [md, L.STANDINGS[md].indexOf(code) + 1]).filter(([, p]) => p > 0)
  const avg = (k) => matches.length ? Math.round(matches.reduce((s, m) => s + m[k], 0) / matches.length * 10) / 10 : null
  return { code, name: L.TEAMS[code].name, espnTeam: team.id, squad: squadList, pos: posPath.at(-1)?.[1] ?? null, pts: W * 3 + D, W, D, L: Lo, GF, GA, cs, played: W + D + Lo,
    posPath, avg: { poss: avg('poss'), sh: avg('sh'), sot: avg('sot'), pass: avg('pass'), cor: avg('cor') },
    scorers: list.map(({ espnId, name, G, A, jersey }) => ({ espnId: espnId?.startsWith?.('a:') ? null : espnId, name, G, A, jersey: jersey || null })), matches }
})
const teams = clubs.filter(Boolean).sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99))
function GFsum(ms) { return ms.reduce((s, m) => s + m.gf, 0) }

// large photos (shared folder + cache with the scorers film) — used for the panel's three players, chosen below
const photoCache = fs.existsSync(PHOTO_CACHE) ? JSON.parse(fs.readFileSync(PHOTO_CACHE, 'utf8')) : {}
if (!DRY) fs.mkdirSync(PHOTOS, { recursive: true })

// squad thumbnails (every rostered player, 240px, own folder + cache)
const squadCache = fs.existsSync(SQUAD_CACHE) ? JSON.parse(fs.readFileSync(SQUAD_CACHE, 'utf8')) : {}
if (!DRY) fs.mkdirSync(SQUAD_DIR, { recursive: true })
let thumbs = 0, noThumb = 0
await pool(teams, 3, async (t) => {
  const official = await squad(LG, t.code)
  await pool(t.squad, 4, async (p) => {
    const hit = matchPlayer(official, { name: p.name, jersey: p.jersey })
    if (!hit?.src) { noThumb++; return }
    const file = path.join(SQUAD_DIR, `${p.espnId}.webp`)
    p.thumb = `squad/${p.espnId}.webp`; p._src = hit.src; thumbs++
    if (DRY || (squadCache[p.espnId] === hit.src && fs.existsSync(file))) return
    const buf = await get(hit.src, { json: false })
    if (!buf) { delete p.thumb; delete p._src; thumbs--; noThumb++; return }
    await savePhoto(buf, file, 200, 72); squadCache[p.espnId] = hit.src
  })
})
// drop the league's stand-in silhouettes (one picture shared by several players) — squad thumbs and scorer photos
if (!DRY) {
  const sq = standIns(SQUAD_DIR, teams.flatMap(t => t.squad.filter(p => p.thumb).map(p => p.espnId)))
  for (const t of teams) for (const p of t.squad) if (sq.has(p.espnId)) { fs.rmSync(path.join(SQUAD_DIR, `${p.espnId}.webp`), { force: true }); delete squadCache[p.espnId]; delete p.thumb; delete p._src; thumbs--; noThumb++ }
  if (sq.size) console.log(`stand-in silhouettes dropped: ${sq.size} squad thumbnails`)
}
console.log(`squads: ${teams.reduce((s, t) => s + t.squad.length, 0)} players · ${thumbs} thumbnails · ${noThumb} without (initials)`)

// the panel always shows three players with a real photo: goals first, then assists, then minutes
await pool(teams, 3, async (t) => {
  const pick = t.squad.filter(p => p.thumb && p._src).sort((a, b) => b.G - a.G || b.A - a.A || b.min - a.min).slice(0, 3)
  t.panel = []
  for (const p of pick) {
    const file = path.join(PHOTOS, `${p.espnId}.webp`)
    if (!DRY && !(photoCache[p.espnId] === p._src && fs.existsSync(file))) {
      const buf = await get(p._src, { json: false })
      if (!buf) { warns.push(`photo: ${p._src} unreachable for ${p.name}`); continue }
      await savePhoto(buf, file); photoCache[p.espnId] = p._src
    }
    t.panel.push({ espnId: p.espnId, name: p.name, G: p.G, A: p.A, photo: `players/${p.espnId}.webp` })
  }
  if (t.panel.length < 3) warns.push(`${t.code}: only ${t.panel.length} panel player(s) with a real photo`)
})
for (const t of teams) for (const p of t.squad) delete p._src
for (const t of teams) console.log(`${String(t.pos).padStart(2)}. ${t.code.padEnd(4)} ${String(t.pts).padStart(2)} pts ${t.W}-${t.D}-${t.L} ${t.GF}:${t.GA} · poss ${t.avg.poss}% · ${t.matches.length} reports · panel: ${t.panel.map(p => `${p.name} ${p.G}g ${p.A}a`).join(', ')}`)
if (warns.length) console.log(`\n${warns.length} note(s):\n  ` + warns.join('\n  '))
if (errors.length) { console.error(`\n✗ ${errors.length} verification error(s) — nothing written:\n  ` + errors.join('\n  ')); process.exit(1) }
console.log(`\n✓ verified: every match's key-event goals equal its score, every ESPN score equals ours (${teams.length} clubs)`)
if (DRY) process.exit(0)
const OUT = path.join(DATA, `teams-${LG}-${SEASON}.js`)
// unchanged numbers → leave the file (and its `updated` stamp) alone, so the nightly run doesn't redeploy for nothing
try {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8').match(/export const TEAMCARDS = (\{[\s\S]*\})\s*$/)[1])
  if (JSON.stringify(prev.teams) === JSON.stringify(teams)) { fs.writeFileSync(PHOTO_CACHE, JSON.stringify(photoCache, null, 1) + '\n'); fs.writeFileSync(SQUAD_CACHE, JSON.stringify(squadCache, null, 1) + '\n'); console.log(`teams-${LG} unchanged — nothing written`); process.exit(0) }
} catch { }
fs.writeFileSync(OUT,
  `// ${LG} team cards, one per club in table order. Auto-updated by scripts/update-teams.mjs.\nexport const TEAMCARDS = ${JSON.stringify({ league: LG, season: SEASON, updated: new Date().toISOString(), teams })}\n`)
fs.writeFileSync(PHOTO_CACHE, JSON.stringify(photoCache, null, 1) + '\n')
fs.writeFileSync(SQUAD_CACHE, JSON.stringify(squadCache, null, 1) + '\n')
console.log(`wrote src/data/teams-${LG}-${SEASON}.js`)
