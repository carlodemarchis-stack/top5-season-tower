#!/usr/bin/env node
/**
 * Goalkeeper cards: every keeper's season from the match cards → src/data/keepers-TOP5-<season>.js.
 *
 *   node scripts/update-keepers.mjs                # build, write (runs after update-matches.mjs)
 *   node scripts/update-keepers.mjs --dry-run
 *   node scripts/update-keepers.mjs --no-photos
 *
 * Per keeper, from src/data/matches-*.js: each game he started (minutes, saves, goals conceded while he was on,
 * penalties faced / saved), every shot on target he faced (where it went on goal: commentary placement) and the goals
 * against him. Saves = ESPN's team stat when he played the whole match, else the commentary's saves while he was on.
 * Age / nationality / shirt from the team cards' squads; checked against ESPN's season saves there (a warning only:
 * ESPN's season stats trail the match reports on match days). Lists: ALL = the top 25 by saves (ties in); per league =
 * each club's first-choice keeper + anyone with 3+ starts. Photos: the league portraits, as for the scorer cards.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEAGUES, get, pool, squad, matchPlayer, savePhoto, standIns, loadLeague, PHOTOS, DATA } from './lib/football.mjs'

const args = process.argv.slice(2), has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27'), DRY = has('--dry-run'), NO_PHOTOS = has('--no-photos')
const TOP_N = 25, MIN_STARTS = 3
const PHOTO_CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scorers-photo-cache.json')   // shared with the scorer cards
const OUT = path.join(DATA, `keepers-TOP5-${SEASON}.js`)
const clock = (s) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
const readJS = (f, name) => { const m = fs.readFileSync(f, 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`)); return m ? JSON.parse(m[1]) : null }
const warns = []

const K = new Map(), squads = {}, tables = {}, clubGames = {}   // clubGames: every played game of a club → [id, gf, ga]
for (const lg of Object.keys(LEAGUES)) {
  const tf = path.join(DATA, `teams-${lg}-${SEASON}.js`)
  for (const t of fs.existsSync(tf) ? readJS(tf, 'TEAMCARDS').teams : []) for (const p of t.squad || []) squads[p.espnId] = { ...p, team: t.code }
  const L = await loadLeague(lg, SEASON), mds = Object.keys(L.STANDINGS).map(Number).sort((a, b) => a - b)
  tables[lg] = mds.length ? L.STANDINGS[mds[mds.length - 1]] : []
  const files = fs.readdirSync(DATA).filter(f => f.startsWith(`matches-${lg}-${SEASON}-md`)).sort()
  for (const f of files) for (const m of readJS(path.join(DATA, f), 'MATCHES')) for (const [me, op] of [['h', 'a'], ['a', 'h']]) {
    const t = me === 'h' ? m.home : m.away, code = m[me], opp = m[op]
    ;(clubGames[`${lg}-${code}`] ||= []).push([m.id, m.score[me], m.score[op]])
    const gk = t.players.find(p => p.st && p.pos === 'G'); if (!gk) { warns.push(`${m.id} ${code}: no starting keeper in the line-up`); continue }
    const off = gk.ev.find(e => e[0] === 'sub'), until = off ? clock(off[1]) : 999
    const on = (x) => x.min + Math.min(x.ex || 0, 6) * .5 <= until
    const faced = m.shots.filter(x => x.s === op && (x.k === 'on' || x.k === 'goal') && on(x))
    const conc = m.goals.filter(g => g.s === op && clock(g.min) <= until)
    const pens = m.shots.filter(x => x.s === op && x.pen && on(x))
    // one card per keeper per club: a keeper who moved (Robert Sánchez: Chelsea, then Como) gets one for each
    const key = `${gk.id}-${code}`
    const k = K.get(key) || { key, id: gk.id, name: gk.name, n: gk.n, lg, team: code, games: [], shots: [], conceded: [] }
    k.n = gk.n || k.n
    k.games.push({ id: m.id, md: m.md, opp, ha: me === 'h' ? 'H' : 'A', gf: m.score[me], ga: m.score[op], min: Math.round(Math.min(until, 90)),
      sv: off ? faced.filter(x => x.k === 'on').length : (m.stats[me]?.saves ?? faced.filter(x => x.k === 'on').length), conc: conc.length, pf: pens.length, ps: pens.filter(x => x.k === 'on').length })
    k.shots.push(...faced.filter(x => x.p).map(x => [x.p, x.k === 'goal' ? 'g' : 's']))
    k.conceded.push(...conc.map(g => [g.min, g.by, g.kind, m.md, opp]))
    K.set(key, k)
  }
}

// ---------- totals, bio, a check against ESPN's season stat ----------
const keepers = [...K.values()].map(k => {
  const sum = (f) => k.games.reduce((a, g) => a + g[f], 0), SV = sum('sv'), GA = sum('conc'), sq = squads[k.id] || {}
  if (sq.SV != null && sq.SV !== SV && sq.team === k.team) warns.push(`${k.name} (${k.lg}): ${SV} saves from the match reports, ESPN's season stat says ${sq.SV}`)
  k.games.sort((a, b) => a.md - b.md)
  const pos = tables[k.lg].indexOf(k.team) + 1 || null, mine = new Set(k.games.map(g => g.id))
  k.missed = (clubGames[`${k.lg}-${k.team}`] || []).filter(g => !mine.has(g[0]))   // his club's games he didn't start
  return { ...k, age: sq.age ?? null, nat: sq.nat || null, SV, GA, MIN: sum('min'), GP: k.games.length, CS: k.games.filter(g => g.conc === 0 && g.min >= 89).length,
    PF: sum('pf'), PS: sum('ps'), PCT: SV + GA ? Math.round(1000 * SV / (SV + GA)) / 10 : null, tpos: pos }
})
const order = (a, b) => b.SV - a.SV || a.GA - b.GA || b.GP - a.GP
keepers.sort(order)
// lists: the top 25 across the five leagues (ties in) · per league, each club's first choice + anyone with 3+ starts
const lists = {}, rankIn = (L) => L.map(k => [k.key, 1 + L.filter(q => q.SV > k.SV).length])
const cut = keepers[Math.min(TOP_N, keepers.length) - 1]?.SV ?? 0
lists.ALL = rankIn(keepers.filter(k => k.SV >= cut))
for (const lg of Object.keys(LEAGUES)) {
  const mine = keepers.filter(k => k.lg === lg), first = new Set()
  for (const team of new Set(mine.map(k => k.team))) first.add(mine.filter(k => k.team === team).sort((a, b) => b.GP - a.GP || b.MIN - a.MIN)[0].key)
  lists[lg] = rankIn(mine.filter(k => first.has(k.key) || k.GP >= MIN_STARTS))
}
const inAny = new Set(Object.values(lists).flat().map(x => x[0]))
const out = keepers.filter(k => inAny.has(k.key))
out.forEach(k => { k.rank = lists.ALL.find(x => x[0] === k.key)?.[1] ?? null })

// ---------- photos: the league portraits (shared folder + cache with the scorer cards) ----------
const photoCache = fs.existsSync(PHOTO_CACHE) ? JSON.parse(fs.readFileSync(PHOTO_CACHE, 'utf8')) : {}
if (!NO_PHOTOS) {
  if (!DRY) fs.mkdirSync(PHOTOS, { recursive: true })
  await pool(out, 4, async (k) => {
    const hit = matchPlayer(await squad(k.lg, k.team), { name: k.name, jersey: k.n })
    if (!hit?.src) { warns.push(`photo: no official photo for ${k.name} (${k.lg} ${k.team}) → initials`); k.photo = null; return }
    const file = path.join(PHOTOS, `${k.id}.webp`); k.photo = `players/${k.id}.webp`
    if (DRY || (photoCache[k.id] === hit.src && fs.existsSync(file))) return
    const buf = await get(hit.src, { json: false })
    if (!buf) { warns.push(`photo: ${hit.src} unreachable for ${k.name} → initials`); k.photo = null; return }
    await savePhoto(buf, file); photoCache[k.id] = hit.src
  })
  if (!DRY) {
    const si = standIns(PHOTOS, out.filter(k => k.photo).map(k => k.id))
    for (const k of out) if (si.has(k.id)) { fs.rmSync(path.join(PHOTOS, `${k.id}.webp`), { force: true }); delete photoCache[k.id]; k.photo = null; warns.push(`photo: ${k.name} only had the league's stand-in silhouette → initials`) }
  }
}

// ---------- report + write (unchanged → nothing written) ----------
for (const [lg, L] of Object.entries(lists)) console.log(`${lg.padEnd(3)} ${String(L.length).padStart(2)} keepers` + (lg === 'ALL' ? ` (cut ${cut} saves)` : ''))
for (const k of out.slice(0, 10)) console.log(`  ${String(k.rank ?? '–').padStart(2)}. ${k.name.padEnd(24)} ${k.lg} ${k.team.padEnd(4)} ${String(k.SV).padStart(2)} sv ${String(k.GA).padStart(2)} ga ${k.PCT}% ${k.GP} gp  ${k.photo ? 'photo' : 'INITIALS'}`)
if (warns.length) console.log(`\n${warns.length} note(s):\n  ` + [...new Set(warns)].join('\n  '))
const data = { season: SEASON, cut, lists, keepers: Object.fromEntries(out.map(k => [k.key, k])) }
const prev = fs.existsSync(OUT) ? readJS(OUT, 'KEEPERS') : null
if (prev && JSON.stringify({ ...prev, updated: undefined }) === JSON.stringify({ ...data, updated: undefined })) { console.log('\nkeepers unchanged — nothing written'); process.exit(0) }
if (DRY) { console.log('\n(dry run) nothing written'); process.exit(0) }
fs.writeFileSync(PHOTO_CACHE, JSON.stringify(photoCache, null, 1) + '\n')
fs.writeFileSync(OUT, `// Goalkeeper cards: every keeper's season from the match cards. Auto-updated by scripts/update-keepers.mjs.\nexport const KEEPERS = ${JSON.stringify({ ...data, updated: new Date().toISOString() })}\n`)
console.log(`\nwrote ${path.basename(OUT)} · ${out.length} keepers`)
