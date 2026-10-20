#!/usr/bin/env node
/**
 * Top-5-league top scorers for the CURRENT season, built from our own match cards → src/data/scorers-TOP5-<season>.js:
 * the top 50 across the five leagues and each league's own top 25 (ties at the cut included; a league's cut never drops
 * below 2 goals). One player record per person, plus one ranked list per view (ALL + the five leagues).
 * + one official cutout photo per player → public/players/<espnId>.webp
 *
 *   node scripts/update-scorers.mjs                 # build, check, write data + photos
 *   node scripts/update-scorers.mjs --dry-run       # build + check + print, write nothing
 *   node scripts/update-scorers.mjs --no-photos     # skip the photo step
 * Back seasons (no match cards of ours): scripts/update-scorers-espn.mjs --season 2025-26
 *
 * Sources:
 *   our match cards (src/data/matches-*, scripts/update-matches.mjs — every goal already checked against the score,
 *     every score against our results): goals (type, assister), assists, minutes, shots (box-score totals + the
 *     commentary's placements), cards
 *   our team cards (src/data/teams-*): bio (position, age, nationality, height, shirt) and the club's table line
 *   league sites: official photos (as before) · ESPN's season goal leaders: a cross-check only (they lag a day)
 *
 * A player who changed clubs counts at his latest club only (each card is one club's season). Checks: every goal
 * belongs to a player of its side's line-up; a goal-scorer missing from the team card's squad → a note.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEAGUES, CUR, get, pool, standIns, espn, squad, matchPlayer, savePhoto, getPhoto, photoUrls, clubPhoto, PHOTOS, DATA } from './lib/football.mjs'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const PHOTO_CACHE = path.join(__dir, 'scorers-photo-cache.json')
const args = process.argv.slice(2), has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', CUR), YEAR = parseInt(SEASON.slice(0, 4), 10)
const DRY = has('--dry-run'), NO_PHOTOS = has('--no-photos')
if (SEASON !== CUR) { console.error(`${SEASON}: no match cards of our own — use scripts/update-scorers-espn.mjs --season ${SEASON}`); process.exit(1) }

const TOP_N = 50            // the five-league film
const LEAGUE_N = 25         // each league's own film
const LEAGUE_MIN_GOALS = 2  // early season: never let a league's list collapse into every one-goal scorer
const errors = [], warns = []
const readJS = (f, name) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`))[1])
const clock = (s) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
// names compared without accents or case: the commentary has "Estéban Lepaul", the roster "Esteban Lepaul"
const plain = (n) => String(n || '').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const lastWord = (n) => plain(n).split(/\s+/).pop()

// ---------- 1. every player's season at each club, from the match cards ----------
const lines = new Map()   // `${lg}:${code}:${espnId}` → { lg, code, id, name, matches: [] }
const squadOf = {}, teamOf = {}
for (const lg of Object.keys(LEAGUES)) {
  for (const t of readJS(`teams-${lg}-${SEASON}.js`, 'TEAMCARDS').teams) { teamOf[`${lg}:${t.code}`] = t; for (const p of t.squad || []) squadOf[`${lg}:${t.code}:${p.espnId}`] = p }
  const files = fs.readdirSync(DATA).filter(f => f.startsWith(`matches-${lg}-${SEASON}-md`)).sort()
  for (const f of files) for (const M of readJS(f, 'MATCHES')) for (const side of ['h', 'a']) {
    const T = side === 'h' ? M.home : M.away, code = M[side], op = side === 'h' ? 'a' : 'h'
    for (const g of M.goals) if (g.s === side && g.kind !== 'og' && !T.players.some(p => String(p.id) === String(g.byId)))
      errors.push(`${lg} MD${M.md} ${M.h}-${M.a}: goal by ${g.by} (${g.byId}) — not in ${code}'s line-up`)
    for (const p of T.players) {
      const on = p.st ? null : M.subs.find(s => String(s.on) === String(p.id)); if (!p.st && !on) continue
      const off = M.subs.find(s => String(s.off) === String(p.id)), red = p.ev.find(e => e[0] === 'rc')
      const start = p.st ? 0 : clock(on.min), end = Math.min(90, off ? clock(off.min) : red ? clock(red[1]) : 90)
      const goals = M.goals.filter(g => String(g.byId) === String(p.id) && g.s === side && g.kind !== 'og').map(g => ({ min: g.min, kind: g.kind || '', ast: g.ast || null }))
      // his shots: filed under his name in the commentary; else (a game with none) his surname, when only one shooter
      // of his side has it ("Francesco Pio Esposito")
      let sh = M.shots.filter(x => x.s === side && plain(x.who) === plain(p.name))
      if (!sh.length) { const L = M.shots.filter(x => x.s === side && lastWord(x.who) === lastWord(p.name)); if (new Set(L.map(x => x.who)).size === 1) sh = L }
      const n = (k) => p.ev.filter(e => e[0] === k).length
      const key = `${lg}:${code}:${p.id}`
      const L = lines.get(key) || { lg, code, id: String(p.id), name: p.name, matches: [], at: [] }
      L.matches.push({ id: M.id, w: M.md, opp: M[op], ha: side === 'h' ? 'H' : 'A', gf: M.score[side], ga: M.score[op], role: p.st ? 'S' : 'B',
        min: Math.max(1, Math.round(end - start)), G: goals.length, A: n('ast'),
        // shots: the box score's totals (when the match card has them); the goal's dots come from the commentary
        SH: p.sh ? p.sh[0] : sh.length, SOG: p.sh ? p.sh[1] : sh.filter(x => x.k === 'on' || x.k === 'goal').length,
        YC: n('yc'), RC: n('rc'), goals, kick: M.kick || '' })
      L.at.push(...sh.map(x => [x.p || '', x.k === 'goal' ? 'g' : x.k]))
      lines.set(key, L)
    }
  }
}

// ---------- 2. one record per person: his latest club (a transfer's goals elsewhere stay on that club's cards) ----------
const latest = new Map()
for (const L of lines.values()) { const k = L.id, last = L.matches.reduce((a, m) => m.kick > a ? m.kick : a, '')
  const cur = latest.get(k); if (!cur || last > cur.last) latest.set(k, { L, last }) }
const sum = (ms, k) => ms.reduce((s, m) => s + m[k], 0)
const all = [...latest.values()].map(({ L }) => {
  const ms = [...L.matches].sort((a, b) => a.w - b.w), sq = squadOf[`${L.lg}:${L.code}:${L.id}`] || {}, t = teamOf[`${L.lg}:${L.code}`] || {}
  return {
    espnId: L.id, name: sq.name || L.name, full: sq.name || L.name, lg: L.lg, team: L.code, jersey: sq.jersey || null,
    pos: sq.pos || null, posName: null, age: sq.age ?? null, nat: sq.natName || null, natCode: sq.nat || null, heightCm: sq.heightCm ?? null,
    G: sum(ms, 'G'), A: sum(ms, 'A'), apps: ms.length, starts: ms.filter(m => m.role === 'S').length, min: sum(ms, 'min'),
    pens: ms.reduce((s, m) => s + m.goals.filter(g => g.kind === 'pen').length, 0),
    shots: sum(ms, 'SH'), sog: sum(ms, 'SOG'), yc: sum(ms, 'YC'), rc: sum(ms, 'RC'), at: L.at,
    teamLine: { pos: t.pos ?? null, pts: t.pts ?? 0, W: t.W ?? 0, D: t.D ?? 0, L: t.L ?? 0, GF: t.GF ?? 0, GA: t.GA ?? 0, played: (t.W ?? 0) + (t.D ?? 0) + (t.L ?? 0) },
    matches: ms.map(({ kick, ...m }) => m),
    _squad: !!sq.espnId,
  }
}).filter(p => p.G > 0)

// ---------- 3. the lists: top 50 across the five, each league's top 25 (ties at the cut included) ----------
const order = (a, b) => b.G - a.G || b.A - a.A || a.min - b.min
all.sort(order)
const cut = all[Math.min(TOP_N, all.length) - 1]?.G ?? 1
const cuts = { ALL: cut }, pickedBy = { ALL: all.filter(p => p.G >= cut) }
for (const lg of Object.keys(LEAGUES)) {
  const l = all.filter(p => p.lg === lg)
  cuts[lg] = Math.max(l[Math.min(LEAGUE_N, l.length) - 1]?.G ?? LEAGUE_MIN_GOALS, LEAGUE_MIN_GOALS)
  pickedBy[lg] = l.filter(p => p.G >= cuts[lg])
}
const players = [...new Map(Object.values(pickedBy).flat().map(p => [p.espnId, p])).values()].sort(order)
for (const p of players) { if (!p._squad) warns.push(`${p.name} (${p.lg} ${p.team}): not in the team card's squad — bio from the match cards only`); delete p._squad }
const lists = {}
for (const [k, ps] of Object.entries(pickedBy)) lists[k] = ps.sort(order).map(p => [p.espnId, 1 + ps.filter(q => q.G > p.G).length])
players.forEach(p => { p.rank = lists.ALL.find(x => x[0] === p.espnId)?.[1] ?? null })   // five-league rank (null = league list only)
console.log(`scorers from the match cards: ${all.length} · top ${TOP_N}: cut ${cut} → ${lists.ALL.length} · ` + Object.keys(LEAGUES).map(lg => `${lg} cut ${cuts[lg]} → ${lists[lg].length}`).join(' · '))

// ---------- 4. cross-check (a note, never a block): ESPN's season goal leaders, which run a day or so behind ----------
for (const lg of Object.keys(LEAGUES)) {
  const d = await get(espn(lg, `/statistics?season=${YEAR}`)).catch(() => null)
  for (const l of d?.stats?.find(s => s.name === 'goalsLeaders')?.leaders || []) {
    const p = players.find(x => x.espnId === String(l.athlete.id)), espnG = Number(l.value) || 0
    if (p && espnG > p.G) warns.push(`${p.name} (${lg}): ESPN's season total says ${espnG} goals, the match cards ${p.G} — a missing match card, or goals at another club`)
  }
}

// ---------- 5. photos (official league portraits; unchanged) ----------
const photoCache = fs.existsSync(PHOTO_CACHE) ? JSON.parse(fs.readFileSync(PHOTO_CACHE, 'utf8')) : {}
if (!NO_PHOTOS) {
  if (!DRY) fs.mkdirSync(PHOTOS, { recursive: true })
  await pool(players, 4, async (p) => {
    const club = clubPhoto(p.espnId)   // a club-site cut-out wins (scripts/club-photos)
    if (club) { const file = path.join(PHOTOS, `${p.espnId}.webp`); p.photo = `players/${p.espnId}.webp`; p._match = 'club site'
      if (!DRY && (photoCache[p.espnId] !== 'club' || !fs.existsSync(file))) { await savePhoto(fs.readFileSync(club), file); photoCache[p.espnId] = 'club' } return }
    const hit = matchPlayer(await squad(p.lg, p.team), { name: p.full || p.name, jersey: p.jersey })
    if (!hit?.src) { warns.push(`photo: no official photo for ${p.name} (${p.lg} ${p.team}) → initials`); p.photo = null; return }
    const file = path.join(PHOTOS, `${p.espnId}.webp`)
    p.photo = `players/${p.espnId}.webp`; p._match = `${hit.names.find(Boolean)} #${hit.num}`
    if (DRY || (photoUrls(hit).includes(photoCache[p.espnId]) && fs.existsSync(file))) return
    const [buf, url] = await getPhoto(hit)
    if (!buf) { warns.push(`photo: ${hit.src} unreachable for ${p.name} → initials`); p.photo = null; return }
    await savePhoto(buf, file)
    photoCache[p.espnId] = url
  })
}
// drop stand-in silhouettes (one picture shared by several players): initials instead, re-checked next run
if (!NO_PHOTOS && !DRY) {
  const si = standIns(PHOTOS, players.filter(p => p.photo).map(p => p.espnId))
  for (const p of players) if (si.has(p.espnId)) { fs.rmSync(path.join(PHOTOS, `${p.espnId}.webp`), { force: true }); delete photoCache[p.espnId]; p.photo = null; warns.push(`photo: ${p.name} only had the league's stand-in silhouette → initials`) }
}

// ---------- 6. report + write ----------
for (const p of players) console.log(`${String(p.rank ?? '–').padStart(2)}. ${p.name.padEnd(26)} ${p.lg} ${p.team.padEnd(4)} ${String(p.G).padStart(2)}g ${p.A}a ${p.apps}app ${String(p.min).padStart(4)}' pens ${p.pens} shots ${p.sog}/${p.shots}  ${p.photo ? 'photo ← ' + p._match : 'INITIALS'}`)
if (warns.length) console.log(`\n${warns.length} note(s):\n  ` + [...new Set(warns)].join('\n  '))
if (errors.length) { console.error(`\n✗ ${errors.length} error(s) — nothing written:\n  ` + errors.join('\n  ')); process.exit(1) }
console.log(`\n✓ built from the match cards: ${players.length} players, every goal tied to a player of its side's line-up`)
if (DRY) process.exit(0)
players.forEach(p => delete p._match)
const OUT = path.join(DATA, `scorers-TOP5-${SEASON}.js`)
// unchanged numbers → leave the file (and its `updated` stamp) alone, so the nightly run doesn't redeploy for nothing
try {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8').match(/export const SCORERS = (\{[\s\S]*\})\s*$/)[1])
  if (JSON.stringify(prev.players) === JSON.stringify(players) && JSON.stringify(prev.lists) === JSON.stringify(lists)) { console.log('scorers unchanged — nothing written'); process.exit(0) }
} catch { }
const out = { season: SEASON, updated: new Date().toISOString(), cut, cuts, lists, players }
fs.writeFileSync(OUT, `// Top-5-league top scorers (top ${TOP_N} by goals, ties at the cut included), from our match cards. Auto-updated by scripts/update-scorers.mjs.\nexport const SCORERS = ${JSON.stringify(out)}\n`)
if (!NO_PHOTOS) fs.writeFileSync(PHOTO_CACHE, JSON.stringify(photoCache, null, 1) + '\n')
console.log(`wrote src/data/scorers-TOP5-${SEASON}.js (${players.length} players)`)
