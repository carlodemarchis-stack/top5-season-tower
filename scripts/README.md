# Auto-updating real results (all 5 leagues)

`scripts/update-results.mjs` fetches finished matches from **football-data.org** and writes them into
`src/data/results-<LG>-<season>.js`, keyed to our fixture **matchIds**. Push the changed files and the
GitHub Pages Action redeploys top5.aguywithascarf.com automatically.

## Usage
```bash
# prove the fixture-keying works (offline, no key)
node scripts/update-results.mjs --validate                 # 2026-27
node scripts/update-results.mjs --validate --season 2025-26

# fetch + match, print what it WOULD write (needs a key)
FOOTBALL_DATA_API_KEY=xxxx node scripts/update-results.mjs --dry-run

# actually write the result files
FOOTBALL_DATA_API_KEY=xxxx node scripts/update-results.mjs

# write AND git commit+push (→ auto-redeploy). Use this in the cron.
FOOTBALL_DATA_API_KEY=xxxx node scripts/update-results.mjs --push
```
Default season is `2026-27`; override with `--season 2025-26`.

## League map
ITA→`SA`, ENG→`PL`, ESP→`PD`, FRA→`FL1`, GER→`BL1` (football-data competition codes). Free key covers all five.

## Team-name mapping — the ONE thing to finalise on first real run
The core matching (proven for every league/season via `--validate`) is: `(matchday, homeCode, awayCode) → matchId`.
The only unproven-until-you-have-a-key piece is mapping **football-data's team names → our 3-letter codes**.
The script auto-matches by `tla` and normalized name, and for anything it can't resolve it prints:

```
UNMATCHED ENG MD3: "Wolverhampton Wanderers FC"(?) vs "..."(WOL) — add to OVERRIDES.ENG
```

It **never writes a wrong result** — unmatched matches are skipped. On the first keyed run, copy any UNMATCHED
team name into the `OVERRIDES` object at the top of the script (e.g. `ENG: { 'Wolverhampton Wanderers FC': 'WOL' }`)
and re-run. After that it's hands-off.

## Railway cron (your setup, later)
- Clone the repo, `npm ci` (only Node stdlib + `fetch` used; no extra deps).
- Env: `FOOTBALL_DATA_API_KEY` (Railway variable). For `--push`, give the container a git remote + token with push rights.
- Cron: e.g. daily. Command: `node scripts/update-results.mjs --push`.
- Rate limit: 5 API calls per run (one per league); free tier is 10/min — fine.
