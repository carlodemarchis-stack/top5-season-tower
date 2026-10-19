#!/usr/bin/env node
/**
 * Head coaches, from FotMob → src/data/coaches-<LEAGUE>-<season>.js (ESPN's coach data stopped around 2016).
 *
 *   node scripts/update-coaches.mjs                 # all five leagues
 *   node scripts/update-coaches.mjs --league ITA    # one league
 *   node scripts/update-coaches.mjs --dry-run
 *
 * Per league: FotMob's league page gives its clubs and fixtures. Each finished match's line-up names both coaches (so a
 * sacking shows from the right game on) — fetched once, kept in scripts/coaches-cache.json; each club page gives the
 * current coach (also one just appointed, before his first game) with nationality and date of birth. The FotMob photo
 * (a 192px head crop) → public/coaches/<fotmobId>.webp. Clubs are matched to our codes by name, then checked against
 * our match reports: every match we have must be a FotMob fixture with the same home side, or nothing is written.
 *
 * Output: COACHES = { updated, coaches: { id: { name, last, nat, natCode, dob, ph } }, teams: { CODE: id }, matches: { 'H-A': [homeId, awayId] } }
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA, ROOT, get, pool, nameKey } from './lib/football.mjs'

const args = process.argv.slice(2), has = (f) => args.includes(f), arg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const SEASON = '2026-27', DRY = has('--dry-run')
const FM_LEAGUE = { ITA: 55, ENG: 47, ESP: 87, FRA: 53, GER: 54 }
const LGS = arg('--league') ? [arg('--league')] : Object.keys(FM_LEAGUE)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.join(HERE, 'coaches-cache.json'), PHOTOS = path.join(ROOT, 'public', 'coaches')
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' }
const fm = (p) => get(`https://www.fotmob.com/api/data/${p}`, { headers: H })
const readJS = (f, name) => { const m = fs.readFileSync(f, 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`)); return m ? JSON.parse(m[1]) : null }
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
const slim = (c) => c?.id ? { id: String(c.id), name: c.name, last: c.lastName || null, nat: c.countryName || c.cname || null, natCode: c.countryCode || c.ccode || null } : null
fs.mkdirSync(PHOTOS, { recursive: true })
let failed = false

for (const lg of LGS) {
  console.log(`== ${lg}`)
  const L = await fm(`leagues?id=${FM_LEAGUE[lg]}`)
  if (L?.details?.selectedSeason !== SEASON.replace('-', '/20')) { console.error(`  ✗ FotMob season is ${L?.details?.selectedSeason}`); failed = true; continue }
  const { TEAMS } = await import(path.join(DATA, `schedule-${lg}-${SEASON}.js`))

  // FotMob club → our code: most shared name words (or word starts), each code used once
  const fmClubs = L.table[0].data.table.all.map(t => ({ id: String(t.id), name: t.name }))
  const pairs = fmClubs.flatMap(f => Object.keys(TEAMS).map(c => {
    const a = new Set(nameKey(f.name).split(' ')), b = nameKey(TEAMS[c].name).split(' ')
    const near = (w) => a.has(w) || (w.length >= 4 && [...a].some(x => x.length >= 4 && (x.startsWith(w) || w.startsWith(x))))   // Lyon ~ Lyonnais
    return { f, c, score: b.filter(near).length + (nameKey(f.name) === nameKey(TEAMS[c].name) ? 5 : 0) }
  })).filter(p => p.score > 0).sort((x, y) => y.score - x.score)
  const CODE = {}, used = new Set()
  for (const p of pairs) if (!CODE[p.f.id] && !used.has(p.c)) { CODE[p.f.id] = p.c; used.add(p.c) }
  const rest = Object.keys(TEAMS).filter(c => !used.has(c)), left = fmClubs.filter(f => !CODE[f.id])
  if (left.length === 1 && rest.length === 1) CODE[left[0].id] = rest[0]   // the last one (Rennes ~ Stade Rennais) — the fixture check below confirms it
  const lost = fmClubs.filter(f => !CODE[f.id])
  if (lost.length) { console.error(`  ✗ unmatched FotMob clubs: ${lost.map(f => f.name).join(', ')}`); failed = true; continue }

  // the check: every match in our reports is a FotMob fixture with the same home side
  const fixtures = L.fixtures.allMatches.map(m => ({ id: String(m.id), h: CODE[m.home.id], a: CODE[m.away.id], done: m.status?.finished && !m.status?.cancelled }))
  const fxKey = new Set(fixtures.map(m => `${m.h}-${m.a}`))
  const ours = fs.readdirSync(DATA).filter(f => f.startsWith(`matches-${lg}-${SEASON}-md`)).flatMap(f => readJS(path.join(DATA, f), 'MATCHES'))
  const wrong = ours.filter(m => !fxKey.has(`${m.h}-${m.a}`))
  if (wrong.length) { console.error(`  ✗ club mapping disagrees with our matches: ${wrong.map(m => `${m.h}-${m.a}`).join(', ')}`); failed = true; continue }

  // both coaches of every finished match (once), and each club's current coach
  const todo = fixtures.filter(m => m.done && !cache[m.id])
  await pool(todo, 3, async (m) => {
    const d = await fm(`matchDetails?matchId=${m.id}`), lu = d?.content?.lineup
    const hc = slim(lu?.homeTeam?.coach), ac = slim(lu?.awayTeam?.coach)
    if (hc && ac) cache[m.id] = [hc, ac]; else console.warn(`  ! no coaches in the line-ups of ${m.h}-${m.a} (${m.id})`)
  })
  const current = await pool(fmClubs, 4, async (f) => {
    const t = await fm(`teams?id=${f.id}`)
    const c = t?.squad?.squad?.find(g => g.title === 'coach')?.members?.[0]
    return c ? { code: CODE[f.id], ...slim(c), dob: c.dateOfBirth || null } : null
  })

  const coaches = {}, teams = {}, matches = {}
  const keep = (c) => { coaches[c.id] = { ...(coaches[c.id] || {}), ...Object.fromEntries(Object.entries({ name: c.name, last: c.last, nat: c.nat, natCode: c.natCode, dob: c.dob }).filter(([, v]) => v)) } }
  for (const m of fixtures) if (cache[m.id]) { const [hc, ac] = cache[m.id]; keep(hc); keep(ac); matches[`${m.h}-${m.a}`] = [hc.id, ac.id] }
  for (const c of current) if (c) { keep(c); teams[c.code] = c.id }
  const noCoach = Object.keys(TEAMS).filter(c => !teams[c]); if (noCoach.length) console.warn(`  ! no current coach for ${noCoach.join(', ')}`)

  // a coach off every club page now (sacked, or a stand-in) has no date of birth from it: his FotMob page, once (cached)
  await pool(Object.keys(coaches).filter(id => !coaches[id].dob), 3, async (id) => {
    if (!(`dob:${id}` in cache)) cache[`dob:${id}`] = (await fm(`playerData?id=${id}`))?.birthDate?.utcTime?.slice(0, 10) || null
    if (cache[`dob:${id}`]) coaches[id].dob = cache[`dob:${id}`]
  })

  // photos: FotMob's head crop, fetched once (a missing one is a 403)
  let got = 0
  await pool(Object.keys(coaches), 4, async (id) => {
    const f = path.join(PHOTOS, `${id}.webp`)
    if (fs.existsSync(f)) { coaches[id].ph = 1; return }
    const buf = await get(`https://images.fotmob.com/image_resources/playerimages/${id}.png`, { json: false, headers: H })
    if (!buf) return
    if (!DRY) await (await import('sharp')).default(buf).webp({ quality: 85, alphaQuality: 90 }).toFile(f)
    coaches[id].ph = 1; got++
  })

  const out = path.join(DATA, `coaches-${lg}-${SEASON}.js`)
  const body = { coaches: Object.fromEntries(Object.entries(coaches).sort()), teams: Object.fromEntries(Object.entries(teams).sort()), matches }
  const prev = fs.existsSync(out) ? readJS(out, 'COACHES') : null
  console.log(`  ${Object.keys(teams).length} clubs · ${Object.keys(coaches).length} coaches · ${Object.keys(matches).length} matches · ${todo.length} new line-ups · ${got} new photos`)
  for (const c of Object.keys(TEAMS)) {   // a club with more than one coach this season = a change on the bench
    const seen = [...new Set(Object.entries(matches).flatMap(([k, [h, a]]) => k.startsWith(c + '-') ? [h] : k.endsWith('-' + c) ? [a] : []))]
    if (seen.length > 1 || (teams[c] && seen.length && !seen.includes(teams[c]))) console.log(`  · ${c}: ${[...seen, teams[c]].filter((x, i, A) => x && A.indexOf(x) === i).map(id => coaches[id].name).join(' → ')}`)
  }
  if (prev && JSON.stringify({ coaches: prev.coaches, teams: prev.teams, matches: prev.matches }) === JSON.stringify(body)) { console.log(`  coaches-${lg} unchanged — nothing written`); continue }
  if (DRY) continue
  fs.writeFileSync(out, `// Head coaches: each club's current coach + both coaches of every match played ('H-A' → [home, away]), from FotMob.\n// Auto-updated by scripts/update-coaches.mjs.\nexport const COACHES = ${JSON.stringify({ updated: new Date().toISOString(), ...body })}\n`)
  console.log(`  wrote src/data/coaches-${lg}-${SEASON}.js`)
}
if (!DRY) fs.writeFileSync(CACHE, JSON.stringify(cache))
if (failed) process.exit(1)
