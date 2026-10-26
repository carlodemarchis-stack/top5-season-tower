#!/usr/bin/env node
/**
 * Kickoff dates and times for the five leagues, from ESPN's scoreboard, into schedule-<LG>-<season>.js (each game's `et`).
 *
 * The schedules came from calendar drops whose dates and times go stale: the leagues set the real day and time a few
 * weeks ahead (a round spreads Friday to Monday), and the drops wrote an unknown time three ways — "2026-11-01 None"
 * (Serie A, Bundesliga, Ligue 1), midnight UTC shown as 01:00 / 02:00 (LaLiga), the UK default 15:00 (Premier League).
 *
 * For every game ESPN lists in the window (yesterday … +8 weeks; --from YYYY-MM-DD to go back, e.g. to the season start):
 *   ESPN's time fixed (timeValid) → "YYYY-MM-DD HH:MM" in Central European time (as the app labels it), etv: 1
 *   not fixed yet                  → "YYYY-MM-DD" (the date only)
 * Every other game not confirmed by ESPN (no etv): a game still to come shows its date only (any time there is a guess),
 * a past one loses an unknown time. Games are found by their two clubs (home, away — once a season each), so a game
 * moved to another day is still matched.
 *
 *   node scripts/update-kickoffs.mjs [--season 2026-27] [--from 2026-08-01] [--dry-run]
 */
import fs from 'node:fs'
import path from 'node:path'
import { get, espn, makeCodeFor, DATA } from './lib/football.mjs'

const args = process.argv.slice(2)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SEASON = opt('--season', '2026-27'), DRY = args.includes('--dry-run'), DAY = 864e5
const FROM = opt('--from', null), from = FROM ? Date.parse(FROM) : Date.now() - DAY, to = Date.now() + 56 * DAY
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '')
const cet = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
// an unknown time as the calendar drops wrote it: "None", LaLiga's midnight UTC (01:00 / 02:00), the Premier League's 15:00
const UNKNOWN = { ESP: /^(01|02):00$/, ENG: /^15:00$/ }

for (const lg of ['ITA', 'ENG', 'ESP', 'FRA', 'GER']) {
  const file = path.join(DATA, `schedule-${lg}-${SEASON}.js`); if (!fs.existsSync(file)) continue
  const src = fs.readFileSync(file, 'utf8'), m = src.match(/export const TEAMS = (\{[\s\S]*?\})\n/)
  if (!m) { console.log(`${lg}: TEAMS not found, skipped`); continue }
  const TEAMS = JSON.parse(m[1]), errs = [], codeFor = makeCodeFor({ [lg]: { TEAMS } }, SEASON, errs)
  const byId = {}; for (const t of Object.values(TEAMS)) for (const g of t.games) (byId[g.id] ||= []).push(g)
  const set = (id, et, etv) => { let ch = 0; for (const g of byId[id] || []) { if (g.et !== et || !!g.etv !== !!etv) ch = 1; g.et = et; if (etv) g.etv = 1; else delete g.etv } return ch }
  // ESPN, a day a request (the soccer scoreboard refuses a date range)
  const days = []; for (let t = from; t <= to; t += DAY) days.push(ymd(t))
  const boards = []; for (let i = 0; i < days.length; i += 8) boards.push(...await Promise.all(days.slice(i, i + 8).map(d => get(espn(lg, `/scoreboard?dates=${d}`)).catch(() => null))))
  let timed = 0, dated = 0, changed = 0, missing = 0
  for (const e of boards.flatMap(b => b?.events || [])) {
    const c = e.competitions?.[0]; if (!c || /POSTPONED|CANCELED/.test(c.status?.type?.name || '')) continue
    const h = c.competitors.find(x => x.homeAway === 'home'), a = c.competitors.find(x => x.homeAway === 'away')
    const hc = codeFor(lg, h.team), ac = codeFor(lg, a.team), g = hc && ac && TEAMS[hc]?.games.find(x => x.ha === 'H' && x.opp === ac)
    if (!g) { missing++; continue }
    const loc = cet.format(new Date(e.date)).replace(',', '')
    if (c.timeValid === false) { dated++; changed += set(g.id, loc.slice(0, 10), false) } else { timed++; changed += set(g.id, loc, true) }
  }
  // the rest not confirmed by ESPN: a game to come → the date only; a past one → the date only when its time is unknown
  let cleaned = 0; const today = new Date().toISOString().slice(0, 10)
  for (const [id, gs] of Object.entries(byId)) { const g = gs[0]; if (g.etv || typeof g.et !== 'string') continue
    const [d, t] = g.et.split(' '); if (t && (d >= today || t === 'None' || UNKNOWN[lg]?.test(t))) cleaned += set(id, d, false) }
  console.log(`${lg}: ESPN ${timed} timed + ${dated} date only${missing ? ` · ${missing} not on our schedule` : ''} · ${changed} changed · ${cleaned} unknown times → date only${errs.length ? ' · ' + errs.join('; ') : ''}`)
  if (!DRY && (changed || cleaned)) fs.writeFileSync(file, src.replace(m[1], () => JSON.stringify(TEAMS)))
}
if (DRY) console.log('(dry-run: nothing written)')
