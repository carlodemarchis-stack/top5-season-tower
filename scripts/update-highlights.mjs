#!/usr/bin/env node
/**
 * Keyless highlights fetcher — reads each supported league's OFFICIAL YouTube channel RSS feed
 * (latest ~15 uploads, no API key) and maps each match-highlight upload to our fixture matchId,
 * writing src/data/highlights-<LG>-<season>.js = { matchId: videoId }.
 *
 * Designed to run in the same cron as the results updater: each new matchday's highlights appear
 * automatically. The RSS window is small, so it only sees RECENT rounds — fine going forward.
 *
 *   node scripts/update-highlights.mjs                 # write updates (season 2026-27)
 *   node scripts/update-highlights.mjs --dry-run       # fetch + match, print, don't write
 *   node scripts/update-highlights.mjs --season 2026-27
 *
 * Per league, a `parse(title)` picks only the real match highlight (right language / keyword) and
 * returns candidate {home,away} name pairs; the caller resolves BOTH to our codes (normalized-name
 * match against the schedule + a small OVERRIDES map for the ones that don't) and finds the matchId
 * by the unique home fixture. Never links a wrong video — unresolved titles are SKIPPED and logged.
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

// ── per-league title parsers (return null → not a match highlight; else { lang, pairs }) ──
// Serie A: BOTH cuts are captured — English "… | HOME-AWAY | HIGHLIGHTS | Serie A 2026/27" AND
// Italian "… | HOME-AWAY | HIGHLIGHTS | SERIE A ENILIVE 2026/27" (they're reciprocally geo-blocked,
// so we keep both and the app offers the one that plays in the viewer's country).
function parseITA(title) {
  if (!/highlights/i.test(title)) return null
  const lang = /enilive/i.test(title) ? 'it' : (/serie a\s+\d{4}\/\d{2}/i.test(title) ? 'en' : null)
  if (!lang) return null
  const pairs = []
  for (const p of title.split('|').map(s => s.trim())) {
    if (/highlight|serie a|matchday|giornata/i.test(p)) continue
    const m = p.match(/^(.+?)\s*-\s*(.+?)$/); if (m) pairs.push({ home: m[1], away: m[2] })
  }
  return pairs.length ? { lang, pairs } : null
}
// La Liga: "HOME x - y AWAY | RESUMEN LALIGA EA SPORTS" (Spanish; score sits between the two clubs).
function parseESP(title) {
  if (!/resumen/i.test(title)) return null            // the official highlight keyword (skip previa/rueda de prensa/clips)
  if (/rueda|previa|\bvs\b/i.test(title)) return null
  const seg = title.split('|')[0].trim()              // "ELCHE CF 0 - 5 FC BARCELONA"
  const m = seg.match(/^(.+?)\s+\d{1,2}\s*-\s*\d{1,2}\s+(.+?)$/)
  return m ? { lang: 'es', pairs: [{ home: m[1], away: m[2] }] } : null
}

// LeagueId -> { official channel id, title parser, YT-name→code overrides, legacyLang for old string entries }
const FEEDS = {
  ITA: { channel: 'UCBJeMCIeLQos7wacox4hmLQ', parse: parseITA, overrides: {}, legacyLang: 'en' },   // "Serie A" @seriea
  ESP: { channel: 'UCTv-XvfzLX3i4IGWAm4sbmA', parse: parseESP, overrides: {}, legacyLang: 'es' },   // "LALIGA EA SPORTS" @LaLiga
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(fc|cf|ac|sc|ssc|as|bc|us|uc|rc|cd|ud|sd|afc|acf|calcio|club|hellas|real|deportivo|1\d{3})\b/g, ' ')
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

function parseFeed(xml) {
  const out = []
  for (const e of xml.split('<entry>').slice(1)) {
    const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1]
    const title = decode(((e.match(/<media:title>([^<]*)<\/media:title>/) || e.match(/<title>([^<]*)<\/title>/)) || [])[1] || '')
    if (id && title) out.push({ id, title })
  }
  return out
}

function resolver(TEAMS, overrides) {
  const byNorm = {}
  for (const code of Object.keys(TEAMS)) byNorm[norm(TEAMS[code].name)] = code
  const ov = {}
  for (const k of Object.keys(overrides || {})) ov[norm(k)] = overrides[k]
  return (name) => {
    const n = norm(name); if (!n) return null
    if (ov[n]) return ov[n]
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

async function run() {
  let wroteAny = false
  for (const [lg, cfg] of Object.entries(FEEDS)) {
    let TEAMS; try { TEAMS = await loadSchedule(lg) } catch { console.log(`  ${lg}: no schedule for ${SEASON}, skip`); continue }
    const resolve = resolver(TEAMS, cfg.overrides)
    let xml
    try {
      const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${cfg.channel}`)
      if (!r.ok) { console.log(`  ${lg}: HTTP ${r.status}`); continue }
      xml = await r.text()
    } catch (e) { console.log(`  ${lg}: fetch failed ${e.message}`); continue }

    const HL = loadHighlights(lg)
    let added = 0, skipped = 0
    for (const { id, title } of parseFeed(xml)) {
      const parsed = cfg.parse(title); if (!parsed) continue
      const { lang, pairs } = parsed
      let home = null, away = null
      for (const p of pairs) { const h = resolve(p.home), a = resolve(p.away); if (h && a) { home = h; away = a; break } }
      if (!home || !away) { skipped++; console.log(`    UNMATCHED ${lg}: ${title}`); continue }
      const mid = homeFixtureId(TEAMS, home, away)
      if (!mid) { skipped++; console.log(`    NO FIXTURE ${lg}: ${home} vs ${away} — ${title}`); continue }
      // { lang: videoId } map per match; migrate a legacy plain-string entry to its language first
      let cur = HL[mid]
      if (typeof cur === 'string') cur = { [cfg.legacyLang]: cur }
      if (!cur || typeof cur !== 'object') cur = {}
      if (cur[lang] !== id) { cur[lang] = id; added++ }
      HL[mid] = cur
    }
    console.log(`  ${lg}: ${added} highlight links (${skipped} skipped), total ${Object.keys(HL).length}`)
    if (!DRY && added) { writeHighlights(lg, HL); wroteAny = true }
  }
  if (DRY) console.log('(dry-run: nothing written)')
  else if (!wroteAny) console.log('No new highlights.')
}
run()
