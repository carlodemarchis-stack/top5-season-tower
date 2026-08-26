#!/usr/bin/env node
/**
 * Highlights fetcher — reads each supported league's OFFICIAL YouTube channel uploads via the
 * YouTube Data API v3 (reliable from any IP, unlike the scraped RSS feed which YouTube 404s from
 * datacenter IPs), maps each match-highlight upload to our fixture matchId, and writes
 * src/data/highlights-<LG>-<season>.js = { matchId: { lang: videoId } }.
 *
 * For Serie A it keeps BOTH cuts (English "… | SERIE A 2026/27" + Italian "… | SERIE A ENILIVE …")
 * because they're reciprocally geo-blocked; the app offers the one that plays in the viewer's country.
 *
 *   YOUTUBE_API_KEY=… node scripts/update-highlights.mjs             # write updates (season 2026-27)
 *   YOUTUBE_API_KEY=… node scripts/update-highlights.mjs --dry-run   # fetch + match, print, don't write
 *   ... --season 2026-27   ... --pages 20   (uploads pages to scan, 50 items each; default 14)
 *
 * Per league, a `parse(title)` picks only the real match highlight (right language / keyword) and its
 * language, returning candidate {home,away} name pairs; the caller resolves BOTH to our codes and
 * finds the matchId by the unique home fixture. Never links a wrong video — unresolved titles skipped.
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
const SEASON_YY = SEASON.replace('-', '/')   // "2026-27" → "2026/27" (as it appears in Serie A titles)
const DRY = has('--dry-run')
const PAGES = parseInt(opt('--pages', '14'), 10)   // uploads pages to scan (50 items each) — covers the season cheaply
const KEY = process.env.YOUTUBE_API_KEY

// ── per-league title parsers (return null → not a match highlight; else { lang, pairs }) ──
// Serie A: BOTH cuts are captured — English "… | HOME-AWAY | HIGHLIGHTS | Serie A 2026/27" AND
// Italian "… | HOME-AWAY | HIGHLIGHTS | SERIE A ENILIVE 2026/27" (they're reciprocally geo-blocked,
// so we keep both and the app offers the one that plays in the viewer's country).
function parseITA(title) {
  if (!/highlights/i.test(title)) return null
  if (!title.includes(SEASON_YY)) return null                       // this season only (avoid last-season clips of the same clubs)
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

// LeagueId -> source (curated `playlists` [best] OR a `channel` whose uploads are scanned) + parser.
// Serie A has official per-language HIGHLIGHTS playlists (English + Italian) — cleanest source.
const FEEDS = {
  ITA: { playlists: ['PLcv0mBdEYNdk', 'PLfS86OfgqpRs'], parse: parseITA, overrides: {}, legacyLang: 'en' },   // @seriea EN + IT highlights playlists
  ESP: { channel: 'UCTv-XvfzLX3i4IGWAm4sbmA', parse: parseESP, overrides: {}, legacyLang: 'es' },              // "LALIGA EA SPORTS" @LaLiga (uploads)
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
function loadResults(lg) {
  const f = path.join(DATA, `results-${lg}-${SEASON}.js`)
  if (!fs.existsSync(f)) return {}
  const t = fs.readFileSync(f, 'utf8'); const m = t.match(/export const RESULTS = (\{[\s\S]*?\})\s*$/m)
  try { return m ? JSON.parse(m[1]) : {} } catch { return {} }
}
function writeHighlights(lg, hl) {
  const f = path.join(DATA, `highlights-${lg}-${SEASON}.js`)
  fs.writeFileSync(f, `// Official YouTube highlights, keyed by matchId -> videoId. Auto-updated by scripts/update-highlights.mjs.\nexport const HIGHLIGHTS = ${JSON.stringify(hl)}\n`)
}

// Page through any playlist via the Data API (1 quota unit / 50 items). A channel's uploads playlist
// is UC…→UU…; a curated highlights playlist is used as-is.
async function fetchPlaylistItems(playlistId) {
  const out = []
  let pageToken = ''
  for (let p = 0; p < PAGES; p++) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${KEY}` + (pageToken ? `&pageToken=${pageToken}` : '')
    const r = await fetch(url)
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`HTTP ${r.status} ${t.slice(0, 120)}`) }
    const j = await r.json()
    for (const it of (j.items || [])) { const id = it.snippet?.resourceId?.videoId, title = it.snippet?.title; if (id && title) out.push({ id, title }) }
    if (!j.nextPageToken) break
    pageToken = j.nextPageToken
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
  if (!KEY) { console.error('Set YOUTUBE_API_KEY (enable "YouTube Data API v3" at console.cloud.google.com → create an API key).'); process.exit(1) }
  let wroteAny = false
  for (const [lg, cfg] of Object.entries(FEEDS)) {
    let TEAMS; try { TEAMS = await loadSchedule(lg) } catch { console.log(`  ${lg}: no schedule for ${SEASON}, skip`); continue }
    const resolve = resolver(TEAMS, cfg.overrides)
    const lists = cfg.playlists || ['UU' + cfg.channel.slice(2)]   // curated highlights playlists, or the channel's uploads
    let items = []
    try { for (const pl of lists) items.push(...await fetchPlaylistItems(pl)) } catch (e) { console.log(`  ${lg}: fetch failed ${e.message}`); continue }

    const HL = loadHighlights(lg), RESULTS = loadResults(lg)
    let added = 0, skipped = 0
    // items come newest-first; keep the first (newest) video seen per match+language, don't flip later.
    for (const { id, title } of items) {
      const parsed = cfg.parse(title); if (!parsed) continue
      const { lang, pairs } = parsed
      let home = null, away = null
      for (const p of pairs) { const h = resolve(p.home), a = resolve(p.away); if (h && a) { home = h; away = a; break } }
      if (!home || !away) { skipped++; continue }
      const mid = homeFixtureId(TEAMS, home, away)
      if (!mid || !(mid in RESULTS)) { skipped++; continue }   // only attach to a match that's actually been played this season
      let cur = HL[mid]
      if (typeof cur === 'string') cur = { [cfg.legacyLang]: cur }   // migrate any legacy plain-string entry
      if (!cur || typeof cur !== 'object') cur = {}
      if (!(lang in cur)) { cur[lang] = id; added++ }
      HL[mid] = cur
    }
    console.log(`  ${lg}: scanned ${items.length} uploads, ${added} new links, total ${Object.keys(HL).length} matches`)
    if (!DRY && added) { writeHighlights(lg, HL); wroteAny = true }
  }
  if (DRY) console.log('(dry-run: nothing written)')
  else if (!wroteAny) console.log('No new highlights.')
}
run()
