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
import { LEAGUES, pool, squad, matchPlayer, savePhoto, getPhoto, photoUrls, standIns, clubPhoto, PHOTOS, DATA } from './lib/football.mjs'
import { keeperSeason } from '../src/film/season.ts'

const args = process.argv.slice(2), has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27'), DRY = has('--dry-run'), NO_PHOTOS = has('--no-photos')
const TOP_N = 25, MIN_STARTS = 3
const PHOTO_CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scorers-photo-cache.json')   // shared with the scorer cards
const OUT = path.join(DATA, `keepers-TOP5-${SEASON}.js`)
const readJS = (f, name) => { const m = fs.readFileSync(f, 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`)); return m ? JSON.parse(m[1]) : null }
const warns = []

// ---------- every keeper's season at each club: src/film/season.ts, the same calculation as the squad film ----------
// one card per keeper per club (a keeper who moved has one for each); everyone who started in goal at least once
const keepers = []
for (const lg of Object.keys(LEAGUES)) {
  const tf = path.join(DATA, `teams-${lg}-${SEASON}.js`); if (!fs.existsSync(tf)) continue
  const TEAMS = readJS(path.join(DATA, `schedule-${lg}-${SEASON}.js`), 'TEAMS'), cards = readJS(tf, 'TEAMCARDS').teams
  const recs = fs.readdirSync(DATA).filter(f => f.startsWith(`matches-${lg}-${SEASON}-md`)).flatMap(f => readJS(path.join(DATA, f), 'MATCHES'))
  for (const t of cards) {
    const games = recs.filter(M => M.h === t.code || M.a === t.code).sort((a, b) => a.md - b.md), club = { lg, code: t.code, games, teams: TEAMS, team: t }
    const squadBy = Object.fromEntries((t.squad || []).map(p => [String(p.espnId), p])), starters = new Map()
    for (const M of games) for (const p of (M.h === t.code ? M.home : M.away).players) if (p.st && p.pos === 'G') starters.set(String(p.id), p)
    for (const [id, p] of starters) {
      const sq = squadBy[id] || { espnId: id, name: p.name, jersey: p.n || null, pos: 'G' }
      const k = keeperSeason(club, sq)
      // ESPN's season saves trail the match reports on match days: a note, never a block
      if (sq.SV != null && sq.SV !== k.SV) warns.push(`${k.name} (${lg}): ${k.SV} saves from the match reports, ESPN's season stat says ${sq.SV}`)
      keepers.push(k)
    }
  }
}
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
    const club = clubPhoto(k.id)   // a club-site cut-out wins (scripts/club-photos)
    if (club) { const file = path.join(PHOTOS, `${k.id}.webp`); k.photo = `players/${k.id}.webp`
      if (!DRY && (photoCache[k.id] !== 'club' || !fs.existsSync(file))) { await savePhoto(fs.readFileSync(club), file); photoCache[k.id] = 'club' } return }
    const hit = matchPlayer(await squad(k.lg, k.team), { name: k.name, jersey: k.n })
    if (!hit?.src) { warns.push(`photo: no official photo for ${k.name} (${k.lg} ${k.team}) → initials`); k.photo = null; return }
    const file = path.join(PHOTOS, `${k.id}.webp`); k.photo = `players/${k.id}.webp`
    if (DRY || (photoUrls(hit).includes(photoCache[k.id]) && fs.existsSync(file))) return
    const [buf, url] = await getPhoto(hit)
    if (!buf) { warns.push(`photo: ${hit.src} unreachable for ${k.name} → initials`); k.photo = null; return }
    await savePhoto(buf, file); photoCache[k.id] = url
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
