#!/usr/bin/env node
/**
 * Keyless highlights fetcher — reads a league's OFFICIAL YouTube channel RSS feed
 * (latest ~15 uploads, no API key) and maps each "… | HOME-AWAY | HIGHLIGHTS | Serie A …"
 * upload to our fixture matchId, writing src/data/highlights-<LG>-<season>.js = { matchId: videoId }.
 *
 * Designed to run in the same cron as the results updater: each new matchday's highlights
 * appear automatically. The RSS window is small, so it only sees RECENT rounds — that's fine
 * for going forward; older rounds are backfilled only while they're still in the feed.
 *
 *   node scripts/update-highlights.mjs                 # write updates (season 2026-27)
 *   node scripts/update-highlights.mjs --dry-run       # fetch + match, print, don't write
 *   node scripts/update-highlights.mjs --season 2026-27
 *
 * Prefers the ENGLISH upload ("Serie A 2026/27"); falls back to the Italian sponsor title
 * ("SERIE A ENILIVE") only when no English HIGHLIGHTS upload exists, so we still get the clip.
 * Never writes a wrong link: any title whose two clubs can't both resolve to our codes, or that
 * has no matching home fixture, is SKIPPED and logged.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dir, '..', 'src', 'data')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27')
const DRY = has('--dry-run')

// LeagueId -> official YouTube channel id (RSS: /feeds/videos.xml?channel_id=…). Add others as verified.
const CHANNELS = { ITA: 'UCBJeMCIeLQos7wacox4hmLQ' }   // "Serie A" (@seriea) — posts English + Italian highlights

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(fc|cf|ac|sc|ssc|as|bc|us|uc|rc|cd|ud|sd|afc|acf|calcio|club|hellas|1\d{3})\b/g, ' ')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

async function loadSchedule(lg) {
  const m = await import(path.join(DATA, `schedule-${lg}-${SEASON}.js`))
  return m.TEAMS
}
function loadHighlights(lg) {
  const f = path.join(DATA, `highlights-${lg}-${SEASON}.js`)
  if (!fs.existsSync(f)) return {}
  const t = fs.readFileSync(f, 'utf8'); const m = t.match(/export const HIGHLIGHTS = (\{[\s\S]*?\})\s*$/m)
  try { return m ? JSON.parse(m[1]) : {} } catch { return {} }
}
function writeHighlights(lg, hl) {
  const f = path.join(DATA, `highlights-${lg}-${SEASON}.js`)
  fs.writeFileSync(f, `// Official YouTube highlights, keyed by matchId -> videoId. Auto-updated by scripts/update-highlights.mjs.\nexport const HIGHLIGHTS = ${JSON.stringify(hl)}\n`)
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'")

// pull { videoId, title } out of the channel Atom feed
function parseFeed(xml) {
  const out = []
  const entries = xml.split('<entry>').slice(1)
  for (const e of entries) {
    const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1]
    const title = decode(((e.match(/<media:title>([^<]*)<\/media:title>/) || e.match(/<title>([^<]*)<\/title>/)) || [])[1] || '')
    if (id && title) out.push({ id, title })
  }
  return out
}

// resolve a club name (as written in a YT title) to our code
function resolver(TEAMS) {
  const byNorm = {}
  for (const code of Object.keys(TEAMS)) byNorm[norm(TEAMS[code].name)] = code
  return (name) => {
    const n = norm(name); if (!n) return null
    if (byNorm[n]) return byNorm[n]
    let best = null
    for (const k of Object.keys(byNorm)) {
      if (k === n) return byNorm[k]
      if ((k.includes(n) || n.includes(k)) && Math.min(k.length, n.length) >= 4) best = best || byNorm[k]
    }
    return best
  }
}
const homeFixtureId = (TEAMS, home, away) => (TEAMS[home]?.games || []).find(g => g.ha === 'H' && g.opp === away)?.id || null

// "… | HOME-AWAY | HIGHLIGHTS | Serie A 2026/27" → every "X-Y" candidate pair (the descriptive
// segment can itself contain a hyphen, e.g. "Second-Half Thrill!", so the caller tries each and
// keeps the one whose BOTH sides resolve to clubs).
function titlePairs(title) {
  if (!/highlights/i.test(title)) return []
  const pairs = []
  for (const p of title.split('|').map(s => s.trim())) {
    if (/highlight|serie a|matchday|giornata/i.test(p)) continue
    const m = p.match(/^(.+?)\s*-\s*(.+?)$/)
    if (m) pairs.push({ home: m[1], away: m[2] })
  }
  return pairs
}

async function run() {
  let wroteAny = false
  for (const [lg, channel] of Object.entries(CHANNELS)) {
    let TEAMS; try { TEAMS = await loadSchedule(lg) } catch { console.log(`  ${lg}: no schedule for ${SEASON}, skip`); continue }
    const resolve = resolver(TEAMS)
    let xml
    try {
      const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`)
      if (!r.ok) { console.log(`  ${lg}: HTTP ${r.status}`); continue }
      xml = await r.text()
    } catch (e) { console.log(`  ${lg}: fetch failed ${e.message}`); continue }

    const HL = loadHighlights(lg)
    let added = 0, skipped = 0
    for (const { id, title } of parseFeed(xml)) {
      const pairs = titlePairs(title); if (!pairs.length) continue
      let home = null, away = null
      for (const p of pairs) { const h = resolve(p.home), a = resolve(p.away); if (h && a) { home = h; away = a; break } }
      if (!home || !away) { skipped++; console.log(`    UNMATCHED ${lg}: ${title}`); continue }
      const mid = homeFixtureId(TEAMS, home, away)
      if (!mid) { skipped++; console.log(`    NO FIXTURE ${lg}: ${home} vs ${away}`); continue }
      const isEnglish = /serie a\s+\d{4}\/\d{2}/i.test(title) && !/enilive/i.test(title)
      // prefer English; only overwrite an existing entry when the new one is the English cut
      if (!(mid in HL) || isEnglish) { if (HL[mid] !== id) { HL[mid] = id; added++ } }
    }
    console.log(`  ${lg}: ${added} highlight links (${skipped} skipped), total ${Object.keys(HL).length}`)
    if (!DRY && added) { writeHighlights(lg, HL); wroteAny = true }
  }
  if (DRY) console.log('(dry-run: nothing written)')
  else if (!wroteAny) console.log('No new highlights.')
}
run()
