#!/usr/bin/env node
/**
 * Serie A player marks per match day, from fantacalcio.it → src/data/votes-ITA-<season>.js.
 *
 *   node scripts/update-votes.mjs              # last two played match days + any missing, write if changed
 *   node scripts/update-votes.mjs --full       # every played match day
 *   node scripts/update-votes.mjs --dry-run
 *
 * Each match day page (/voti-fantacalcio-serie-a/<season>/<md>) has one table per club with three marks per player;
 * (and one for the coach) — we keep one, the first, "Redazione Fantacalcio" ("s.v." = not rated → skipped). Players are matched to the club's
 * squad + everyone who appeared for it in our match reports (squad lists lag summer transfers), by name; a Fantacalcio
 * player id, once matched, is remembered in scripts/votes-ids-ITA.json. Unmatched names are reported.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA } from './lib/football.mjs'

const args = process.argv.slice(2), has = (f) => args.includes(f)
const SEASON = '2026-27', FULL = has('--full'), DRY = has('--dry-run')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(DATA, `votes-ITA-${SEASON}.js`), IDS = path.join(HERE, 'votes-ids-ITA.json')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const readJS = (f, name) => { const m = fs.readFileSync(f, 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`)); return m ? JSON.parse(m[1]) : null }
const TR = { 'ø': 'o', 'Ø': 'o', 'æ': 'ae', 'Æ': 'ae', 'ł': 'l', 'Ł': 'l', 'đ': 'd', 'Đ': 'd', 'ß': 'ss', 'ı': 'i', 'ð': 'd', 'þ': 'th' }
const norm = (s) => String(s || '').replace(/['’]/g, '').replace(/[øØæÆłŁđĐßıðþ]/g, c => TR[c]).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
// a mark as the page writes it: "6", "5,5" — and sometimes "55" for 5,5 (a slip on fantacalcio.it: marks run 0–10)
const markOf = (g) => !g || !/^\d+(,\d+)?$/.test(g) ? null : /^\d\d$/.test(g) && +g > 10 ? +g / 10 : +g.replace(',', '.')
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')

// our clubs (schedule names) + per club the squad and everyone who appeared for it in our match reports
const { TEAMS } = await import(path.join(DATA, `schedule-ITA-${SEASON}.js`))
const { RESULTS } = await import(path.join(DATA, `results-ITA-${SEASON}.js`))
const pool = {}
const add = (code, id, name) => { const L = (pool[code] ||= []); if (!L.some(q => String(q.espnId) === String(id))) L.push({ espnId: String(id), name }) }
for (const t of readJS(path.join(DATA, `teams-ITA-${SEASON}.js`), 'TEAMCARDS').teams) for (const p of t.squad || []) add(t.code, p.espnId, p.name)
for (const f of fs.readdirSync(DATA).filter(f => f.startsWith(`matches-ITA-${SEASON}-md`))) for (const m of readJS(path.join(DATA, f), 'MATCHES'))
  for (const [code, side] of [[m.h, m.home], [m.a, m.away]]) for (const p of side.players) add(code, p.id, p.name)
const clubOf = (fcName) => { const n = norm(fcName); return Object.keys(TEAMS).find(c => { const m = norm(TEAMS[c].name); return m === n || m.includes(n) || n.includes(m) || m.split(' ').includes(n) }) }

// played match days: any with a result
const playedMd = new Set(); for (const t of Object.values(TEAMS)) for (const g of t.games) if (RESULTS[g.id]) playedMd.add(g.w)
const mds = [...playedMd].sort((a, b) => a - b)
const prev = fs.existsSync(OUT) ? readJS(OUT, 'VOTES') : null
const v = prev?.v ? structuredClone(prev.v) : {}
const c = prev?.c ? structuredClone(prev.c) : {}   // the coach's mark: club code → matchday → mark (who was on the bench: coaches-ITA)
const have = new Set(Object.values(v).flatMap(o => Object.keys(o).map(Number)))
const todo = FULL ? mds : mds.filter(md => md >= mds[mds.length - 1] - 1 || !have.has(md))
const ids = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, 'utf8')) : {}
const unmatched = new Set()

// a Fantacalcio name ("Lautaro", "Martinez Jo.", "Esposito F.P.", "Zambo Anguissa") → one player of the club's pool
function matchPlayer(code, fcName) {
  const sq = pool[code] || []
  const toks = fcName.trim().split(/\s+/), ini = norm((toks.find(t => /\.$/.test(t)) || '').split('.')[0]), base = norm(toks.filter(t => !/\.$/.test(t)).join(' '))
  const long = base.split(' ').filter(w => w.length >= 4)
  const tiers = [
    (n) => n === base,
    (n) => n.split(' ').includes(base) || n.endsWith(' ' + base) || (base.includes(' ') && n.includes(base)),
    (n) => long.length > 0 && long.some(w => n.split(' ').includes(w)),   // "Zambo Anguissa" ~ "Frank Anguissa"
  ]
  for (const ok of tiers) {
    const hits = sq.filter(p => ok(norm(p.name))), pick = ini ? hits.filter(p => norm(p.name).startsWith(ini)) : hits
    if (pick.length === 1) return pick[0]
    if (hits.length === 1 && (!ini || !pick.length)) return hits[0]   // an initial that doesn't fit ("Esposito F.P." = Pio Esposito) but the only one
  }
  return null
}

for (const md of todo) {
  const url = `https://www.fantacalcio.it/voti-fantacalcio-serie-a/${SEASON}/${md}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT' } })
  if (!res.ok) { console.log(`MD${md}: HTTP ${res.status} — skipped`); continue }
  const html = await res.text()
  let n = 0
  for (const block of html.split('<li id="team-').slice(1)) {
    const team = decode((block.match(/<span class="current">([^<]*[A-Za-z][^<]*)<\/span>/) || [])[1] || '').trim()
    const code = clubOf(team); if (!code) { unmatched.add(`club "${team}"`); continue }
    for (const row of block.split('class="player-name player-link"').slice(1)) {
      const id = (row.match(/\/(\d+)"/) || [])[1], name = decode((row.match(/<span>([^<]+)<\/span>/) || [])[1] || '').trim()
      const grade = (row.match(/class="player-grade[^"]*" data-value="([^"]*)"/) || [])[1]
      const vote = markOf(grade)
      if (vote == null) continue   // s.v. — not rated (too few minutes)
      let espnId = ids[id]
      if (!espnId) { const p = matchPlayer(code, name); if (p) { espnId = p.espnId; ids[id] = espnId } }
      if (!espnId) { unmatched.add(`${code} ${name}`); continue }
      ;(v[espnId] ||= {})[md] = vote; n++
    }
    // the coach's row (role "all", no player link): one mark per club and match day
    for (const part of block.split('class="role" data-value="all"').slice(1)) {
      const row = part.split('</tr>')[0], grade = (row.match(/class="player-grade[^"]*" data-value="([^"]*)"/) || [])[1]
      if (markOf(grade) != null) { (c[code] ||= {})[md] = markOf(grade); n++ }
    }
  }
  console.log(`MD${md}: ${n} marks`)
  await new Promise(r => setTimeout(r, 400))   // polite
}

const data = { season: SEASON, source: 'Fantacalcio · Redazione', v, c }
if (unmatched.size) console.log(`\n${unmatched.size} not matched:\n  ` + [...unmatched].join('\n  '))
if (prev && JSON.stringify(prev.v) === JSON.stringify(v) && JSON.stringify(prev.c || {}) === JSON.stringify(c)) { console.log('\nvotes unchanged — nothing written'); process.exit(0) }
if (DRY) { console.log('\n(dry run) nothing written'); process.exit(0) }
fs.writeFileSync(IDS, JSON.stringify(ids, null, 1) + '\n')
fs.writeFileSync(OUT, `// Serie A player marks per match day (Fantacalcio · Redazione), keyed espnId → matchday → mark (v), coaches club → matchday → mark (c). Auto-updated by scripts/update-votes.mjs.\nexport const VOTES = ${JSON.stringify({ ...data, updated: new Date().toISOString() })}\n`)
console.log(`\nwrote ${path.basename(OUT)} · ${Object.keys(v).length} players`)
