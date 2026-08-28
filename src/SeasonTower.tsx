import React from 'react'
import { css } from './css'

// ---------------------------------------------------------------------------
// Serie A Season Tower — football sibling of the NFL Season Tower.
//
// Same idea: every club is a column of cells on a shared baseline. But football
// isn't the NFL, so three things differ:
//   • three outcomes — WIN builds a full cell UP, DRAW a short cell up (it is
//     only one point), LOSS hangs a full cell below the line.
//   • the live re-sort is by POINTS (3/1/0), then goal difference, then goals for
//     — so tower height reads as the real Serie A table.
//   • one single table (no divisions); an optional "Zones" view bands the columns
//     into Champions League / Europa / Conference / relegation.
//
// 2026/27 hasn't kicked off, so scores are deterministically simulated from a seed
// (fixtures are the real Lega Serie A calendar). Real results drop into
// data/results-2026-27.js keyed `home:matchday` and override the simulation.
//
// The tower geometry + FLIP re-sort are ported from the NFL sibling; inline styles
// are kept as CSS strings and parsed by css() at render time.
// ---------------------------------------------------------------------------

type Orientation = 'auto' | 'towers' | 'rows'
type Dict = Record<string, any>

type SeasonId = '2025-26' | '2026-27'

interface Props {
  season: SeasonId
  colorMode: 'result' | 'opponent'
  pendingMode: 'ceiling' | 'stack'
  lossReverse: boolean
  orientation: Orientation
  scoreLabels: boolean
  seed: number
}

interface State {
  seasons: Record<SeasonId, { TEAMS: Dict | null; REAL: Dict; md: number; HL: Dict }> | null
  league: LeagueId
  leagueOpen: boolean
  season: SeasonId
  seasonOpen: boolean
  results: Dict         // computed results through the current matchday
  cw: number
  ch: number
  pop: Dict | null      // match-detail modal
  teamPop: string | null
  throughWeek: number | null
  playing: boolean
  groupBy: 'table' | 'zones'
  rankBy: 'points' | 'gd'
  layout: 'towers' | 'rows'   // vertical towers (portrait) vs horizontal rows (landscape)
  helpOpen: boolean
  creditsOpen: boolean
  overview: boolean          // "All 5 leagues" points-board view
  ovData: any[] | null       // per-league standings summary for the overview
}

// order shown in the switcher; `real` gates the simulation + the "simulated" wording.
const SEASONS: { id: SeasonId; label: string; real: boolean }[] = [
  { id: '2025-26', label: '2025/26', real: true },
  { id: '2026-27', label: '2026/27', real: false },
]

type LeagueId = 'ITA' | 'ENG' | 'ESP' | 'FRA' | 'GER' | 'CL' | 'EL' | 'ECL'
const LEAGUES: { id: LeagueId; name: string; country: string; uefa?: boolean }[] = [
  { id: 'ITA', name: 'Serie A', country: 'Italy' },
  { id: 'ENG', name: 'Premier League', country: 'England' },
  { id: 'ESP', name: 'La Liga', country: 'Spain' },
  { id: 'FRA', name: 'Ligue 1', country: 'France' },
  { id: 'GER', name: 'Bundesliga', country: 'Germany' },
  { id: 'CL', name: 'Champions League', country: 'UEFA · Europe', uefa: true },
  { id: 'EL', name: 'Europa League', country: 'UEFA · Europe', uefa: true },
  { id: 'ECL', name: 'Conference League', country: 'UEFA · Europe', uefa: true },
]
const DOMESTIC = LEAGUES.filter(l => !l.uefa)   // the five domestic leagues (used by the "All 5" overview)
const isUefa = (id: LeagueId) => LEAGUES.some(l => l.id === id && l.uefa)
// crest filename for a club: UEFA competitions namespace their crests (CL_/EL_/ECL_) to avoid code
// clashes with the domestic sets (e.g. AJA = Auxerre in Ligue 1 but Ajax in the Champions League).
const logoFile = (league: LeagueId, code: string) => isUefa(league) ? `${league}_${code}` : (league === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code)
// URL state (#league/season/week/layout) so a reload restores exactly where the user was.
function parseHash(): { league?: LeagueId; season?: SeasonId; week?: number; layout?: 'towers' | 'rows'; overview?: boolean } {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '')
  if (!h) return {}
  const [lg, se, wk, ly] = h.split('/')
  const out: any = {}
  if (lg === 'ALL') out.overview = true
  if (LEAGUES.some(l => l.id === lg)) out.league = lg
  if (SEASONS.some(s => s.id === se)) out.season = se
  if (wk != null && /^\d+$/.test(wk)) out.week = parseInt(wk, 10)
  if (ly === 'towers' || ly === 'rows') out.layout = ly
  return out
}

// The 2026/27 SIMULATION (filling unplayed fixtures with projected scores) is private:
// only enabled with the secret ?sim=1 query param. Public sees unplayed matches as "to be played".
const SIM = typeof location !== 'undefined' && new URLSearchParams(location.search).get('sim') === '1'

// Vite statically globs every league/season data file that exists on disk.
const SCHED_MODS = import.meta.glob('./data/schedule-*.js') as Record<string, () => Promise<any>>
const RES_MODS = import.meta.glob('./data/results-*.js') as Record<string, () => Promise<any>>
const HL_MODS = import.meta.glob('./data/highlights-*.js') as Record<string, () => Promise<any>>

// European / relegation bands by finishing position (1-based rank).
function zoneOf(rank: number): { key: string; label: string; color: string } {
  if (rank <= 4) return { key: 'ucl', label: 'Champions L.', color: '#0B4DA2' }
  if (rank === 5) return { key: 'uel', label: 'Europa L.', color: '#E8820B' }
  if (rank === 6) return { key: 'uecl', label: 'Conference L.', color: '#0B8A3D' }
  if (rank >= 18) return { key: 'rel', label: 'Relegation', color: '#C23A2E' }
  return { key: 'mid', label: '', color: '#B0B4BC' }
}
// UEFA league-phase bands (36 teams): top 8 → Round of 16, 9–24 → knockout play-off, 25–36 → out.
function zoneUefa(rank: number): { key: string; label: string; color: string } {
  if (rank <= 8) return { key: 'r16', label: 'Round of 16', color: '#0B4DA2' }
  if (rank <= 24) return { key: 'po', label: 'Knockout play-off', color: '#E8820B' }
  return { key: 'out', label: 'Eliminated', color: '#C23A2E' }
}
const zoneFor = (league: LeagueId) => isUefa(league) ? zoneUefa : zoneOf

export class SeasonTower extends React.Component<Props, State> {
  chartRef = React.createRef<HTMLDivElement>()
  sliderRef = React.createRef<HTMLInputElement>()
  _measure!: () => void
  _ro?: ResizeObserver
  _mt: any = null
  _timer: any = null
  _pinBottom = true   // one-shot: scroll so the team row sits near the bottom (towers) / labels to the left (rows)
  _droppedW = 0       // reserved width left of the team column in rows mode (for the pin scroll)

  _init: ReturnType<typeof parseHash> | null = parseHash()   // URL state to restore on first load
  _wantWeek: number | null = parseHash().week ?? null        // scrub week from the URL; honored on mount, cleared on a user league/season change

  state: State = {
    seasons: null, league: this._init!.league || 'ITA', leagueOpen: false, season: this._init!.season || this.props.season, seasonOpen: false, results: {}, cw: 1280, ch: 600,
    pop: null, teamPop: null, throughWeek: null, playing: false, groupBy: 'table', rankBy: 'points',
    layout: this._init!.layout || 'rows',   // open in the vertical (stacked-rows) view
    helpOpen: false,
    creditsOpen: false,
    overview: !!this._init!.overview,
    ovData: null,
  }

  componentDidMount() {
    this.loadLeague(this.state.league)
    if (this.state.overview) this.loadOverview(this.state.season)

    this._measure = () => {
      const c = this.chartRef.current; if (!c) return
      const w = Math.round(c.clientWidth - 16), h = Math.round(c.clientHeight - 20)
      if (w > 40 && h > 40) this.setState(s => (w === s.cw && h === s.ch) ? null : { cw: w, ch: h } as any)
    }
    const el = this.chartRef.current
    if (el && window.ResizeObserver) { this._ro = new ResizeObserver(() => this._measure()); this._ro.observe(el) }
    let tries = 0
    this._mt = setInterval(() => {
      this._measure()
      if (this.chartRef.current || ++tries > 20) {
        if (this.chartRef.current && !this._ro && window.ResizeObserver) { this._ro = new ResizeObserver(() => this._measure()); this._ro.observe(this.chartRef.current) }
        clearInterval(this._mt); this._mt = null
      }
    }, 60)
    requestAnimationFrame(() => this._measure())
    window.addEventListener('keydown', this.onKey)
  }
  componentWillUnmount() { if (this._ro) this._ro.disconnect(); if (this._mt) clearInterval(this._mt); if (this._timer) clearInterval(this._timer); window.removeEventListener('keydown', this.onKey) }

  // ---- league / season accessors --------------------------------------------
  // Load a league's two seasons via the file globs (missing files → empty season, "no data").
  loadLeague(id: LeagueId) {
    const one = (kind: 'schedule' | 'results' | 'highlights', s: SeasonId) => {
      const key = `./data/${kind}-${id}-${s}.js`
      const mod = (kind === 'schedule' ? SCHED_MODS : kind === 'results' ? RES_MODS : HL_MODS)[key]
      return mod ? mod() : Promise.resolve(null)
    }
    Promise.all([one('schedule', '2025-26'), one('results', '2025-26'), one('schedule', '2026-27'), one('results', '2026-27'), one('highlights', '2025-26'), one('highlights', '2026-27')])
      .then(([s25, r25, s26, r26, h25, h26]: any[]) => {
        const seasons = {
          '2025-26': { TEAMS: s25?.TEAMS || null, REAL: (r25 && r25.RESULTS) || {}, md: s25?.MATCHDAYS || 38, HL: (h25 && h25.HIGHLIGHTS) || {} },
          '2026-27': { TEAMS: s26?.TEAMS || null, REAL: (r26 && r26.RESULTS) || {}, md: s26?.MATCHDAYS || 38, HL: (h26 && h26.HIGHLIGHTS) || {} },
        } as State['seasons']
        // open on a season that actually has data (prefer the current one)
        let season = this.state.season
        if (!seasons![season].TEAMS) season = (SEASONS.find(x => seasons![x.id].TEAMS)?.id) || season
        this._pinBottom = true
        this.setState({ league: id, seasons, season }, () => {
          // honor the URL scrub week on mount (survives StrictMode's double loadLeague); cleared on user nav
          const w = this._wantWeek != null ? Math.min(this._wantWeek, this.maxW()) : this.defaultWeek()
          this.buildThrough(w)
        })
      }).catch(err => console.error('league load failed', err))
  }
  pickLeague(id: LeagueId) {
    this.setState({ leagueOpen: false, overview: false })
    if (id === this.state.league && !this.state.overview) return
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this._wantWeek = null   // user navigation → drop the initial URL week
    if (id === this.state.league) { this.syncUrl(); return }   // drilling from overview into the already-loaded league
    this.setState({ playing: false, pop: null, teamPop: null, seasons: null })
    this.loadLeague(id)
  }

  // ---- overview ("All 5 leagues") --------------------------------------------
  enterOverview() {
    this.setState({ leagueOpen: false, overview: true, pop: null, teamPop: null, playing: false }, () => this.syncUrl())
    this.loadOverview(this.state.season)
  }
  // Load every league's schedule + results for one season and reduce to a standings summary each.
  loadOverview(season: SeasonId) {
    const jobs = DOMESTIC.map(lg => {
      const sm = SCHED_MODS[`./data/schedule-${lg.id}-${season}.js`]
      const rm = RES_MODS[`./data/results-${lg.id}-${season}.js`]
      return Promise.all([sm ? sm() : Promise.resolve(null), rm ? rm() : Promise.resolve(null)])
        .then(([s, r]: any[]) => this.summarizeLeague(lg, s?.TEAMS || null, (r && r.RESULTS) || {}, s?.MATCHDAYS || 38))
    })
    Promise.all(jobs).then(ovData => { if (this.state.overview) this.setState({ ovData }) })
  }
  summarizeLeague(lg: { id: LeagueId; name: string }, TEAMS: Dict | null, REAL: Dict, totalMd: number) {
    if (!TEAMS) return { id: lg.id, name: lg.name, empty: true, clubs: [], leader: null, mw: 0, totalMd, played: 0, goals: 0, wSum: 0, dSum: 0, lSum: 0 }
    const rows: Dict = {}
    for (const code of Object.keys(TEAMS)) { const t = TEAMS[code]; rows[code] = { code, abbr: t.abbr || code, name: t.name || code, primary: t.primary || '#8A8F98', W: 0, D: 0, L: 0, GF: 0, GA: 0 } }
    let matches = 0, goals = 0, mw = 0
    for (const code of Object.keys(TEAMS)) for (const g of TEAMS[code].games) {
      if (g.ha !== 'H') continue
      const real = REAL[g.id]; if (!real) continue
      const hg = real.hg, ag = real.ag, H = rows[code], A = rows[g.opp]; if (!H || !A) continue
      matches++; goals += hg + ag; if (g.w > mw) mw = g.w
      H.GF += hg; H.GA += ag; A.GF += ag; A.GA += hg
      if (hg > ag) { H.W++; A.L++ } else if (hg < ag) { H.L++; A.W++ } else { H.D++; A.D++ }
    }
    const clubs = Object.keys(rows).map(k => rows[k]).map((r: any) => ({ ...r, Pts: r.W * 3 + r.D, GD: r.GF - r.GA, played: r.W + r.D + r.L }))
    clubs.sort((x: any, y: any) => (y.Pts - x.Pts) || (y.GD - x.GD) || (y.GF - x.GF) || (x.code < y.code ? -1 : 1))
    const wSum = clubs.reduce((a: number, c: any) => a + c.W, 0)
    const dSum = clubs.reduce((a: number, c: any) => a + c.D, 0)
    const lSum = clubs.reduce((a: number, c: any) => a + c.L, 0)
    return { id: lg.id, name: lg.name, empty: matches === 0, clubs, leader: clubs[0], mw, totalMd, played: matches, goals, wSum, dSum, lSum }
  }
  activeTeams(): Dict | null { const s = this.state.seasons; return s ? s[this.state.season].TEAMS : null }
  activeReal(): Dict { const s = this.state.seasons; return s ? s[this.state.season].REAL : {} }
  maxW(): number { const s = this.state.seasons; return (s && s[this.state.season].md) || 38 }
  seasonHasData(id: SeasonId): boolean { const s = this.state.seasons; return !!(s && s[id].TEAMS) }
  seasonIsReal() { return (SEASONS.find(x => x.id === this.state.season) || SEASONS[0]).real }
  latestPlayedWeek() { const R = this.activeReal(), T = this.activeTeams(); if (!T) return 0; let mx = 0; for (const c of Object.keys(T)) for (const g of T[c].games) if (R[g.id] && g.w > mx) mx = g.w; return mx }
  scrubMax() { return (this.seasonIsReal() || SIM) ? this.maxW() : this.latestPlayedWeek() } // scrubber ceiling: full for completed/sim; live season stops at the last matchday with a game played
  defaultWeek() { return this.scrubMax() } // open at the ceiling (full season, or the current matchday on the live one)
  syncUrl() { const s = this.state; try { const hash = s.overview ? `#ALL/${s.season}` : `#${s.league}/${s.season}/${s.throughWeek == null ? 0 : s.throughWeek}/${s.layout}`; history.replaceState(null, '', hash) } catch { /* ignore */ } }
  setLayout(l: 'towers' | 'rows') { if (l === this.state.layout) return; this._pinBottom = true; this.setState({ layout: l, pop: null, teamPop: null }, () => this.syncUrl()) }
  pickSeason(id: SeasonId) {
    if (id === this.state.season) { this.setState({ seasonOpen: false }); return }
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this._pinBottom = true; this._wantWeek = null
    if (this.state.overview) { this.setState({ season: id, seasonOpen: false, ovData: null }, () => { this.syncUrl(); this.loadOverview(id) }); return }
    this.setState({ season: id, seasonOpen: false, playing: false, pop: null, teamPop: null },
      () => this.buildThrough(this.defaultWeek()))
  }

  // ---- deterministic score simulation ---------------------------------------
  hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
  mulberry32(a: number) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
  poisson(rng: () => number, lambda: number) { const L = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= rng() } while (p > L); return Math.min(7, k - 1) }
  // Rough club-strength ratings (1.00 = league average). Purely a *simulation* input so the
  // generated 2026/27 table is plausible — favourites cluster near the top. Delete this and the
  // ratio below to get a strength-blind sim; real results (results-2026-27.js) ignore it entirely.
  static STR: Record<string, number> = {
    INT: 1.30, NAP: 1.26, ATA: 1.20, JUV: 1.19, MIL: 1.17, ROM: 1.11, LAZ: 1.07, BOL: 1.06,
    FIO: 1.04, TOR: 0.98, COM: 0.95, GEN: 0.94, UDI: 0.93, CAG: 0.90, MON: 0.88, LEC: 0.86,
    SAS: 0.86, PAR: 0.85, VEN: 0.84, FRO: 0.82,
  }
  simulate(home: string, away: string, w: number): { hg: number; ag: number } {
    const rng = this.mulberry32(this.hashStr(w + '|' + home + '|' + away + ':' + this.props.seed))
    const S = SeasonTower.STR, sh = S[home] || 1, sa = S[away] || 1
    const hg = this.poisson(rng, Math.max(0.25, 1.35 * (sh / sa)))   // home advantage + relative strength
    const ag = this.poisson(rng, Math.max(0.20, 1.02 * (sa / sh)))
    return { hg, ag }
  }

  keyOf(a: string, w: number) { return a + ':' + w }
  getRes(a: string, w: number) { return this.state.results[this.keyOf(a, w)] || null }
  outcome(gf: number, ga: number) { return gf > ga ? 'W' : gf < ga ? 'L' : 'D' }

  // Reveal results through matchday n (real where available, else simulated).
  buildThrough(n: number) {
    const T = this.activeTeams(); if (!T) return
    n = Math.max(0, Math.min(this.scrubMax(), n))
    const REAL = this.activeReal()
    const r: Dict = {}
    for (const code of Object.keys(T)) {
      for (const g of T[code].games) {
        if (g.ha !== 'H' || g.w > n) continue
        const home = code, away = g.opp
        const real = REAL[g.id]   // real results are keyed by unique matchId
        if (!real && !SIM) continue   // simulation is private (?sim=1); public sees unplayed games as "to be played"
        const hg = real ? real.hg : this.simulate(home, away, g.w).hg
        const ag = real ? real.ag : this.simulate(home, away, g.w).ag
        r[this.keyOf(home, g.id)] = { gf: hg, ga: ag, res: this.outcome(hg, ag) }
        r[this.keyOf(away, g.id)] = { gf: ag, ga: hg, res: this.outcome(ag, hg) }
      }
    }
    this.setState({ results: r, throughWeek: n, pop: null }, () => this.syncUrl())
  }

  playAvailable() { return SIM || this.seasonIsReal() }  // no auto-play on the live current season (2026/27)
  toggleFullscreen() { const d: any = document; if (d.fullscreenElement) { d.exitFullscreen && d.exitFullscreen() } else { d.documentElement.requestFullscreen && d.documentElement.requestFullscreen() } }
  togglePlay() {
    if (!this.playAvailable()) return
    if (this._timer) { clearInterval(this._timer); this._timer = null; this.setState({ playing: false }); return }
    const mx = this.maxW()
    if ((this.state.throughWeek || 0) >= mx) this.buildThrough(0)
    this.setState({ playing: true })
    this._timer = setInterval(() => {
      const n = Math.min(mx, (this.state.throughWeek || 0) + 1); this.buildThrough(n)
      if (n >= mx) { clearInterval(this._timer); this._timer = null; this.setState({ playing: false }) }
    }, 800)
  }
  stepWeek(delta: number) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; this.setState({ playing: false }) }
    const cur = this.state.throughWeek == null ? 0 : this.state.throughWeek
    this.buildThrough(cur + delta)
  }
  reset() { if (this._timer) { clearInterval(this._timer); this._timer = null } this.buildThrough(0); this.setState({ playing: false, pop: null, teamPop: null }) }
  // cycle through the overview + the leagues (wraps around), following the dropdown order
  stepLeague(delta: number) {
    const seq = ['ALL', ...LEAGUES.map(l => l.id)]
    const cur = this.state.overview ? 'ALL' : this.state.league
    const next = seq[(seq.indexOf(cur) + delta + seq.length) % seq.length]
    if (next === 'ALL') { if (!this.state.overview) this.enterOverview() }
    else this.pickLeague(next as LeagueId)
  }
  // ← / → change league · ↑ / ↓ step the matchweek (↑ forward)
  onKey = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const t = e.target as HTMLElement | null; const tag = t && t.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return
    if (this.state.pop || this.state.teamPop) return
    e.preventDefault()
    if (e.key === 'ArrowLeft') this.stepLeague(-1)
    else if (e.key === 'ArrowRight') this.stepLeague(1)
    else if (this.state.overview) return              // no single matchweek in the overview
    else this.stepWeek(e.key === 'ArrowUp' ? 1 : -1)
  }

  // ---- FLIP re-sort (unchanged from the NFL sibling) ------------------------
  getSnapshotBeforeUpdate() {
    const root = this.chartRef.current; if (!root) return null
    const m: Dict = {}; root.querySelectorAll('[data-team]').forEach(el => { const r = (el as HTMLElement).getBoundingClientRect(); m[el.getAttribute('data-team')!] = { x: r.left, y: r.top } })
    return m
  }
  componentDidUpdate(_pp: Props, ps: State, snap: Dict | null) {
    // keep the range thumb pinned to the (clamped) matchday even when React skips the controlled update
    if (this.sliderRef.current) this.sliderRef.current.value = String(this.state.throughWeek ?? 0)
    const layoutChanged = ps.layout !== this.state.layout
    // one-shot after load / season / layout change: towers → team row near the bottom;
    // rows → team column flush left (dropped games hidden off to the left).
    if (this._pinBottom) {
      const c = this.chartRef.current
      if (c) {
        if (this.state.layout === 'rows') { if (this._droppedW > 100 && c.scrollWidth > c.clientWidth) { this._pinBottom = false; c.scrollLeft = this._droppedW } }
        else if (c.scrollHeight > c.clientHeight + 20) { this._pinBottom = false; c.scrollTop = c.scrollHeight }
      }
    }
    if (layoutChanged) return   // no FLIP across a whole-layout switch — it would fly every row
    if (!snap) return; const root = this.chartRef.current; if (!root) return
    root.querySelectorAll('[data-team]').forEach(el => {
      const ab = el.getAttribute('data-team')!; const prev = snap[ab]; if (!prev) return
      const node = el as HTMLElement
      const r = node.getBoundingClientRect(); const dx = prev.x - r.left, dy = prev.y - r.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      node.style.transition = 'none'; node.style.transform = `translate(${dx}px,${dy}px)`
      requestAnimationFrame(() => { node.style.transition = 'transform .55s cubic-bezier(.22,1,.36,1)'; node.style.transform = '' })
    })
  }

  // ---- small colour helpers -------------------------------------------------
  mix(hex: string, to: string, t: number) { const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; const a = p(hex), b = p(to); const c = a.map((v, i) => Math.round(v + (b[i] - v) * t)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('') }
  contrast(hex: string) { const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return ((r * 299 + g * 587 + b * 114) / 1000) > 150 ? '#16181d' : '#ffffff' }
  // readable version of a club colour for text on a white box (darken pale colours like yellow / sky-blue)
  ink(hex: string) { const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); const lum = (r * 299 + g * 587 + b * 114) / 1000; return lum > 150 ? this.mix(hex, '#000000', 0.45) : hex }
  fmtKick(et: string) {
    if (!et) return ''
    const m = et.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/); if (!m) return et
    const [, Y, Mo, D, H, Mi] = m; const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const date = `${+D} ${MON[(+Mo) - 1]} ${Y}`
    return H ? `${date} · ${H}:${Mi} CET` : date
  }

  openPop(code: string, id: string) {
    const t = this.activeTeams()![code]; const g = t.games.find((x: any) => x.id === id); if (!g) return
    this.setState({ pop: { code, id, w: g.w, opp: g.opp, oppFull: g.oppFull, ha: g.ha, venue: g.venue, city: g.city, net: g.net, et: g.et } })
  }
  closePop() { this.setState({ pop: null }) }
  openTeam(code: string) { this.setState({ teamPop: code }) }
  closeTeam() { this.setState({ teamPop: null }) }

  // Aggregate one club's table line through the current matchday.
  tableLine(code: string) {
    const t = this.activeTeams()![code]; let W = 0, D = 0, L = 0, GF = 0, GA = 0
    for (const g of t.games) { const r = this.getRes(code, g.id); if (!r) continue; GF += r.gf; GA += r.ga; if (r.res === 'W') W++; else if (r.res === 'D') D++; else L++ }
    const played = W + D + L, pts = W * 3 + D, gd = GF - GA
    return { W, D, L, GF, GA, GD: gd, Pts: pts, played }
  }

  // Normalize a highlights entry (legacy string OR { lang: videoId }) into an ordered link list;
  // the viewer's browser language floats to the front, but every available language is kept.
  normHighlights(raw: any): { lang: string; id: string; label: string; flag: string }[] {
    const META: Record<string, { label: string; flag: string }> = { en: { label: 'English', flag: '🇬🇧' }, it: { label: 'Italiano', flag: '🇮🇹' }, es: { label: 'Español', flag: '🇪🇸' }, fr: { label: 'Français', flag: '🇫🇷' } }
    if (typeof raw === 'string' && raw) return [{ lang: '', id: raw, label: 'Watch highlights', flag: '▶' }]
    if (raw && typeof raw === 'object') {
      const vlang = (typeof navigator !== 'undefined' ? (navigator.language || '') : '').slice(0, 2).toLowerCase()
      const order = ['en', 'it', 'es', 'fr']
      const rk = (k: string) => order.indexOf(k) < 0 ? 99 : order.indexOf(k)
      return Object.keys(raw).filter(k => raw[k])
        .sort((a, b) => a === vlang ? -1 : b === vlang ? 1 : rk(a) - rk(b))
        .map(k => ({ lang: k, id: raw[k], label: (META[k] || { label: k.toUpperCase() }).label, flag: (META[k] || { flag: '▶' }).flag }))
    }
    return []
  }

  // "All 5 leagues" points board — one comparable column per league.
  renderOverview(v: Dict) {
    const data: any[] = v.ovData
    if (!data) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9298a1', fontSize: '14px', minHeight: '200px' }}>Loading all five leagues…</div>
    const maxP = Math.max(10, ...data.map(d => (d.leader ? d.leader.Pts : 0)))
    // qualification zones by finishing position (indicative): top-4 CL, 5 EL, 6 Conference, bottom-3 relegation.
    const zoneCol = (rank: number, n: number) => rank <= 4 ? '#0B4DA2' : rank === 5 ? '#E8820B' : rank === 6 ? '#0B8A3D' : rank > n - 3 ? '#C23A2E' : '#8b9098'
    return (
      <div style={{ display: 'flex', gap: '10px', height: '100%', minHeight: '420px', alignItems: 'stretch' }}>
        {data.map(lg => {
          const relFrom = lg.clubs.length - 3   // bottom 3 = relegation (basic zone hint)
          const leaderCrest = lg.leader ? logoFile(lg.id, lg.leader.code) : ''
          const chip: React.CSSProperties = { fontSize: '9.5px', fontWeight: 800, color: '#9298a1', background: '#F1F2F4', borderRadius: '6px', padding: '3px 6px', whiteSpace: 'nowrap' }
          return (
            <div key={lg.id} onClick={() => this.pickLeague(lg.id)} title={`Open ${lg.name}`} style={{ flex: '1 1 0', minWidth: '176px', display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #E7E9EC', borderRadius: '14px', padding: '12px 12px 10px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '-.2px', color: '#15181d' }}>{lg.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 800, color: '#9298a1', background: '#F1F2F4', borderRadius: '6px', padding: '3px 6px', whiteSpace: 'nowrap' }}>{lg.empty ? 'not started' : `MD ${lg.mw}/${lg.totalMd}`}</span>
              </div>
              {lg.empty ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B0B4BC', fontSize: '12px', fontWeight: 700, textAlign: 'center', minHeight: '160px' }}>Season not started yet</div>
              ) : (
                <>
                  {/* line 2: leader (left) · matches played (right) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 800, flex: '0 0 auto' }}>
                      <span style={{ flex: '0 0 auto', width: '22px', height: '22px', borderRadius: '50%', background: '#DEE3E8', border: '1px solid #CBD1D8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <img src={`logos/${leaderCrest}.png`} alt="" aria-hidden onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                      </span>
                      <span style={{ color: '#15181d' }}>{lg.leader.code}</span>
                      <span style={{ color: '#0B8A3D' }}>{lg.leader.Pts} pts</span>
                    </div>
                    <span style={{ ...chip, marginLeft: 'auto' }}>Played <b style={{ color: '#15181d' }}>{lg.played}/{Math.round(lg.totalMd * lg.clubs.length / 2)}</b></span>
                  </div>
                  {/* line 3: goals · avg · W-D */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '11px' }}>
                    <span style={chip}>Goals <b style={{ color: '#15181d' }}>{lg.goals}</b></span>
                    <span style={chip}>Avg <b style={{ color: '#15181d' }}>{lg.played ? (lg.goals / lg.played).toFixed(2) : '—'}</b></span>
                    <span style={chip}>W‑D <b style={{ color: '#15181d' }}>{lg.wSum}·{lg.dSum}</b> {(() => { const t = lg.wSum + lg.dSum; return t ? `(${Math.round(100 * lg.wSum / t)}%/${100 - Math.round(100 * lg.wSum / t)}%)` : '' })()}</span>
                  </div>
                  <div style={{ flex: '1 1 0', minHeight: '120px', display: 'flex', alignItems: 'flex-end', gap: '2px', borderBottom: '1px solid #E7E9EC' }}>
                    {lg.clubs.map((c: any, i: number) => (
                      <div key={c.code} style={{ flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} title={`${c.abbr} · ${c.Pts} pts · ${c.W}W-${c.D}D-${c.L}L`}>
                        <div style={{ width: '100%', height: `${100 * c.Pts / maxP}%`, minHeight: '2px', borderRadius: '3px 3px 0 0', background: c.primary, opacity: i >= relFrom ? 0.4 : 1, outline: i === 0 ? '2px solid #0B8A3D' : 'none', outlineOffset: '1px' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '2px', marginTop: '3px' }}>
                    {lg.clubs.map((c: any, i: number) => (
                      <div key={c.code} style={{ flex: '1 1 0', minWidth: 0, height: '26px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                        <span style={{ fontSize: '8.5px', fontWeight: 900, letterSpacing: '.3px', color: zoneCol(i + 1, lg.clubs.length), writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{c.abbr}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  render() {
    const v = this.renderVals()
    const mStop = (e: React.MouseEvent) => e.stopPropagation()
    const stepBtn = (disabled: boolean): React.CSSProperties => ({ width: '20px', height: '26px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#22262d', fontSize: '16px', fontWeight: 700, lineHeight: 1, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.28 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit' })
    const seg = (on: boolean): React.CSSProperties => ({ padding: '7px 11px', border: 'none', background: on ? '#15181d' : '#fff', color: on ? '#fff' : '#727781', fontSize: '12px', fontWeight: 700, cursor: 'pointer' })
    const iconBtn: React.CSSProperties = { width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #D7DAE0', background: '#fff', color: '#22262d', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit', lineHeight: 1 }
    const showPlay = this.playAvailable()   // hide auto-play on the live current season
    // faded club crest bleeding off the right edge of each team box — identity without stealing space
    const crestWatermark: React.CSSProperties = { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', height: '128%', width: 'auto', opacity: 0.26, objectFit: 'contain', pointerEvents: 'none', zIndex: 0, userSelect: 'none' }
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F5F6F4' }}>

        {/* ---------- minimized top bar: league · season · controls · match count ---------- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 14px', flexWrap: 'nowrap', borderBottom: '1px solid #E7E9EC' }}>
          {/* league + season selector */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '19px', fontWeight: 900, letterSpacing: '-.3px', color: '#15181d' }}>
            {/* league dropdown */}
            <button onClick={v.onToggleLeague} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '19px', fontWeight: 900, letterSpacing: '-.3px', color: '#15181d', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
              <span>{v.leagueName}</span><span style={{ fontSize: '17px', color: '#15181d', lineHeight: 1, display: 'inline-block', transform: `rotate(${v.leagueOpen ? 180 : 0}deg)` }}>▾</span>
            </button>
            {v.leagueOpen && (
              <>
                <div onClick={v.onToggleLeague} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 7px)', left: '0', zIndex: 80, minWidth: '210px', background: '#fff', border: '1px solid #E4E7EB', borderRadius: '12px', boxShadow: '0 14px 36px rgba(20,22,28,.17)', padding: '5px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#9298a1', padding: '5px 10px 7px' }}>League</div>
                  <button onClick={v.onOverview} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '9px 12px', border: 'none', borderRadius: '8px', background: v.overviewActive ? '#F1F3F5' : '#fff', color: '#15181d', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: v.overviewActive ? 800 : 700 }}>🏆 All 5 leagues</span>
                      <span style={{ fontSize: '10px', color: '#9298a1', fontWeight: 600 }}>Season progress · points board</span>
                    </span>
                    <span style={{ color: '#0B8A3D', fontWeight: 900, fontSize: '13px' }}>{v.overviewActive ? '✓' : ''}</span>
                  </button>
                  <div style={{ height: '1px', background: '#EDEFF2', margin: '5px 8px' }} />
                  {v.leagueList.map((l: any, i: number) => (
                    <React.Fragment key={l.id}>
                      {l.uefa && !v.leagueList[i - 1]?.uefa && <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px 4px' }}><span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#9298a1' }}>UEFA clubs</span><span style={{ flex: 1, height: '1px', background: '#EDEFF2' }} /></div>}
                      <button onClick={l.onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '9px 12px', border: 'none', borderRadius: '8px', background: l.active ? '#F1F3F5' : '#fff', color: '#15181d', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: l.active ? 800 : 600 }}>{l.name}{!l.has && <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, color: '#C0A020' }}>soon</span>}</span>
                          <span style={{ fontSize: '10px', color: '#9298a1', fontWeight: 600 }}>{l.country}</span>
                        </span>
                        <span style={{ color: '#0B8A3D', fontWeight: 900, fontSize: '13px' }}>{l.active ? '✓' : ''}</span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </>
            )}
            {/* season dropdown */}
            <button onClick={v.onToggleSeason} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 800, color: '#fff', background: '#0B8A3D', border: 'none', borderRadius: '7px', padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span>{v.seasonLabel}</span><span style={{ fontSize: '14px', opacity: 1, lineHeight: 1, display: 'inline-block', transform: `rotate(${v.seasonOpen ? 180 : 0}deg)` }}>▾</span>
            </button>
            {v.seasonOpen && (
              <>
                <div onClick={v.onToggleSeason} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 7px)', left: '78px', zIndex: 80, minWidth: '188px', background: '#fff', border: '1px solid #E4E7EB', borderRadius: '12px', boxShadow: '0 14px 36px rgba(20,22,28,.17)', padding: '5px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#9298a1', padding: '5px 10px 7px' }}>Season</div>
                  {v.seasonList.map((s: any) => (
                    <button key={s.id} onClick={s.onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '9px 12px', border: 'none', borderRadius: '8px', background: s.active ? '#F1F3F5' : '#fff', color: '#15181d', fontSize: '13.5px', fontWeight: s.active ? 800 : 600, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}>
                      <span>{s.label}<span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, color: !s.has ? '#C0A020' : s.tag === 'Real' ? '#0B8A3D' : '#9298a1' }}>{s.has ? s.tag : 'soon'}</span></span>
                      <span style={{ color: '#0B8A3D', fontWeight: 900, fontSize: '13px' }}>{s.active ? '✓' : ''}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* control bar: restart · prev · play · next · scrubber (matchday number in the dot) */}
          {!v.overview && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', border: '1px solid #D7DAE0', borderRadius: '10px', background: '#fff' }}>
            <button onClick={() => this.reset()} title="Restart" aria-label="Restart" style={{ ...stepBtn(false), fontSize: '15px' }}>↺</button>
            <button onClick={() => this.stepWeek(-1)} disabled={v.stepBackDisabled} title="Previous matchday (↓)" style={stepBtn(v.stepBackDisabled)}>‹</button>
            {showPlay && <button onClick={() => this.togglePlay()} title="Play / pause" style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid #15181d', background: '#15181d', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{v.playLabel}</button>}
            <button onClick={() => this.stepWeek(1)} disabled={v.stepFwdDisabled} title="Next matchday (↑)" style={stepBtn(v.stepFwdDisabled)}>›</button>
            <div style={{ position: 'relative', width: '170px', height: '24px', display: 'flex', alignItems: 'center' }}>
              <input ref={this.sliderRef} className="mdslider" type="range" min={0} max={v.sliderMax} step={1} value={v.throughWeek} onChange={(e: any) => { const n = Math.min(this.scrubMax(), parseInt(e.target.value, 10) || 0); e.target.value = String(n); this.buildThrough(n) }} />
              <span style={{ position: 'absolute', left: `${12 + (v.throughWeek / (v.sliderMax || 1)) * (170 - 24)}px`, top: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', fontSize: '10px', fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{v.throughWeek}</span>
            </div>
          </div>}

          {/* help + fullscreen */}
          <button onClick={() => this.setState({ helpOpen: true })} title="How to read this" aria-label="Help" style={{ ...iconBtn, marginLeft: 'auto', fontSize: '17px', fontWeight: 800 }}>?</button>
          <button onClick={() => this.toggleFullscreen()} title="Fullscreen" aria-label="Fullscreen" style={iconBtn}>⛶</button>

          {/* layout toggle: vertical towers ↔ landscape rows */}
          {!v.overview && <div style={{ display: 'flex', border: '1px solid #D7DAE0', borderRadius: '8px', overflow: 'hidden' }}>
            <button onClick={() => this.setLayout('towers')} title="Vertical towers" style={{ padding: '6px 10px', border: 'none', background: v.layout === 'towers' ? '#15181d' : '#fff', color: v.layout === 'towers' ? '#fff' : '#727781', fontSize: '13px', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>⊤</button>
            <button onClick={() => this.setLayout('rows')} title="Landscape rows" style={{ padding: '6px 10px', border: 'none', background: v.layout === 'rows' ? '#15181d' : '#fff', color: v.layout === 'rows' ? '#fff' : '#727781', fontSize: '13px', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>⊢</button>
          </div>}

          {/* match count */}
          {!v.overview && <span style={{ fontSize: '13px', fontWeight: 700, color: '#22262d', fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>{v.playedStr}</span>}
        </div>

        {!v.overview && v.loading && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', justifyContent: 'center', color: '#9298a1', fontSize: '14px' }}>
          {v.noData
            ? <><div style={{ fontSize: '15px', fontWeight: 700, color: '#5c616b' }}>No data yet for {v.leagueName} · {v.seasonLabel}</div><div>Drop the JSON in ~/Downloads and re-run the generator.</div></>
            : <div>Loading {v.leagueName}…</div>}
        </div>}

        {/* ---------- chart ---------- */}
        <div ref={this.chartRef} style={{ position: 'relative', flex: '1 1 0', minHeight: 0, overflow: 'auto', padding: '6px 8px 14px' }}>
          {v.overview ? this.renderOverview(v) : v.layout === 'rows' ? (
            <div style={css(v.rowsWrapStyle)}>
              {v.teamsSorted.map((t: any) => (
                <div key={t.abbr} data-team={t.abbr} style={css(t.rowStyle)}>
                  <div style={css(t.droppedStyle)}>{t.dropped.map((c: any) => <Cell key={c.key} c={c} />)}</div>
                  <div style={css(t.labelStyle)} onClick={t.onLabel} title={t.labelTitle}>
                    <img src={`logos/${t.crest}.png`} alt="" aria-hidden onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={crestWatermark} />
                    <div style={css(t.lblRowStyle)}>
                      <span style={css(t.rankStyle)}>{t.rank}</span>
                      <span style={css(t.teamStyle)}>{t.abbr}</span>
                    </div>
                    <div style={css(t.lblRowStyle)}>
                      <span style={css(t.wdlStyle)}>{t.wdlStr}</span>
                      <span style={css(t.ptsStyle)}>{t.ptsStr}</span>
                    </div>
                  </div>
                  <div style={css(t.wonStyle)}>{t.won.map((c: any) => <Cell key={c.key} c={c} />)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={css(v.colsWrapStyle)}>
              {v.teamsSorted.map((t: any) => (
                <div key={t.abbr} data-team={t.abbr} style={css(t.colStyle)}>
                  <div style={css(t.aboveStyle)}>{t.above.map((c: any) => <Cell key={c.key} c={c} />)}</div>
                  <div style={css(t.labelStyle)} onClick={t.onLabel} title={t.labelTitle}>
                    <img src={`logos/${t.crest}.png`} alt="" aria-hidden onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={crestWatermark} />
                    {/* 4 stacked lines: rank · team · points · W-D-L */}
                    <span style={{ ...css(t.rankStyle), position: 'relative', zIndex: 1, textAlign: 'center', width: '100%' }}>{t.rank}</span>
                    <span style={{ ...css(t.teamStyle), position: 'relative', zIndex: 1, textAlign: 'center', width: '100%' }}>{t.abbr}</span>
                    <span style={{ ...css(t.ptsStyle), position: 'relative', zIndex: 1, textAlign: 'center', width: '100%' }}>{t.ptsStr}</span>
                    <span style={{ ...css(t.wdlStyle), position: 'relative', zIndex: 1, textAlign: 'center', width: '100%' }}>{t.wdlStr}</span>
                  </div>
                  <div style={css(t.belowStyle)}>{t.below.map((c: any) => <Cell key={c.key} c={c} />)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ---------- match-detail modal ---------- */}
          {v.pop && (
            <div onClick={() => this.closePop()} style={{ position: 'fixed', inset: 0, background: 'rgba(16,18,22,.42)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div onClick={mStop} style={{ width: 'min(440px,94vw)', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(16,18,22,.32)' }}>
                <div style={css(v.popAccentStyle)} />
                <div style={{ padding: '16px 18px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', color: '#9298a1' }}>{v.popWeek}</span>
                    <span style={{ ...v.popResStyleObj, fontSize: '11px', fontWeight: 800, borderRadius: '6px', padding: '3px 9px' }}>{v.popResBadge}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ height: '42px', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={`logos/${v.popHomeCode}.png`} alt="" onError={(e: any) => { e.currentTarget.style.display = 'none'; const s = e.currentTarget.nextElementSibling; if (s) s.style.display = 'block' }} style={{ maxWidth: '42px', maxHeight: '42px', objectFit: 'contain' }} />
                        <div style={{ display: 'none', width: '34px', height: '34px', borderRadius: '9px', background: v.popHomeColor }} />
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#15181d' }}>{v.popHomeName}</div>
                      <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#9298a1', textTransform: 'uppercase', letterSpacing: '.4px' }}>Home</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '30px', fontWeight: 900, color: '#15181d', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={v.popHomeDim}>{v.popScoreA}</span><span style={{ color: '#C7CBD1', fontSize: '20px' }}>–</span><span style={v.popAwayDim}>{v.popScoreB}</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ height: '42px', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={`logos/${v.popAwayCode}.png`} alt="" onError={(e: any) => { e.currentTarget.style.display = 'none'; const s = e.currentTarget.nextElementSibling; if (s) s.style.display = 'block' }} style={{ maxWidth: '42px', maxHeight: '42px', objectFit: 'contain' }} />
                        <div style={{ display: 'none', width: '34px', height: '34px', borderRadius: '9px', background: v.popAwayColor }} />
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#15181d' }}>{v.popAwayName}</div>
                      <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#9298a1', textTransform: 'uppercase', letterSpacing: '.4px' }}>Away</div>
                    </div>
                  </div>
                  {v.popChips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginTop: '16px' }}>
                      {v.popChips.map((c: any, i: number) => <span key={i} style={{ fontSize: '11px', fontWeight: 600, color: '#5c616b', background: '#F1F2F4', borderRadius: '7px', padding: '5px 10px' }}>{c.v}</span>)}
                    </div>
                  )}
                  {v.popHighlights.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      {/* one clickable thumbnail per available language — both cuts shown side by side */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {v.popHighlights.map((h: any, i: number) => (
                          <a key={h.lang || i} href={`https://www.youtube.com/watch?v=${h.id}`} target="_blank" rel="noopener noreferrer" title={`Watch highlights — ${h.label}`} style={{ flex: '1 1 0', minWidth: 0, display: 'block', textDecoration: 'none', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${i === 0 ? '#FF0033' : '#E7E9EC'}` }}>
                            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
                              <img src={`https://i.ytimg.com/vi/${h.id}/hqdefault.jpg`} alt={`${h.label} highlights`} onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.background = '#15181d' }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '48px', height: '34px', borderRadius: '9px', background: 'rgba(0,0,0,.62)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '7px 0 7px 13px', borderColor: 'transparent transparent transparent #fff', marginLeft: '3px' }} />
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '6px 8px', fontSize: '11px', fontWeight: 800, background: '#fff', color: i === 0 ? '#FF0033' : '#3a3f47' }}>
                              <span>{h.flag}</span>{h.label}
                            </div>
                          </a>
                        ))}
                      </div>
                      {v.popHighlights.length > 1 && <div style={{ marginTop: '6px', fontSize: '10px', color: '#9298a1', textAlign: 'center' }}>Versions are region‑locked — open the one available where you are.</div>}
                    </div>
                  )}
                  {v.popIsSim && <div style={{ marginTop: '12px', fontSize: '10.5px', color: '#B0B4BC', textAlign: 'center' }}>Simulated scoreline — 2026/27 not yet played.</div>}
                </div>
              </div>
            </div>
          )}

          {/* ---------- club modal ---------- */}
          {v.tm && (
            <div onClick={() => this.closeTeam()} style={{ position: 'fixed', inset: 0, background: 'rgba(16,18,22,.42)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div onClick={mStop} style={{ width: 'min(460px,94vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(16,18,22,.32)' }}>
                <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px', ...v.tm.headStyleObj }}>
                  <img src={`logos/${v.tm.crest}.png`} alt="" aria-hidden onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={{ flex: '0 0 auto', width: '46px', height: '46px', objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.35))' }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 900 }}>{v.tm.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, opacity: .82 }}>{v.tm.rankLine}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '14px', marginTop: '9px', fontSize: '12px', fontWeight: 700 }}>
                      <span>{v.tm.Pts} pts</span><span style={{ opacity: .8 }}>{v.tm.rec}</span><span style={{ opacity: .8 }}>{v.tm.goals}</span>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '6px 10px 12px', overflowY: 'auto' }}>
                  {v.tm.rows.map((row: any) => (
                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', borderRadius: '8px' }}>
                      <button onClick={row.onClick} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#B0B4BC', width: '26px', flex: '0 0 26px', fontVariantNumeric: 'tabular-nums' }}>{row.w}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#9298a1', width: '20px', flex: '0 0 20px' }}>{row.ha}</span>
                        <span style={{ flex: '0 0 auto', width: '24px', height: '24px', borderRadius: '50%', background: '#DEE3E8', border: '1px solid #CBD1D8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          <img src={`logos/${row.oppCrest}.png`} alt="" aria-hidden onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#15181d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.opp}</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#3a3f47', fontVariantNumeric: 'tabular-nums', width: '44px', textAlign: 'right' }}>{row.score}</span>
                        <span style={{ ...row.badgeStyleObj, flex: '0 0 24px', textAlign: 'center', fontSize: '10px', fontWeight: 800, borderRadius: '6px', padding: '3px 0' }}>{row.badge}</span>
                      </button>
                      {row.highlights.length > 0 && (
                        <span style={{ display: 'flex', gap: '4px', flex: '0 0 auto' }}>
                          {row.highlights.map((h: any, i: number) => (
                            <a key={h.lang || i} href={`https://www.youtube.com/watch?v=${h.id}`} target="_blank" rel="noopener noreferrer" title={`Watch highlights — ${h.label}`} style={{ display: 'inline-flex', width: '23px', height: '23px', borderRadius: '6px', alignItems: 'center', justifyContent: 'center', fontSize: '12px', textDecoration: 'none', background: i === 0 ? '#FFEAED' : '#F1F2F4', border: `1px solid ${i === 0 ? '#FFC4CD' : '#E3E6EA'}` }}>{h.flag}</a>
                          ))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---------- help ---------- */}
          {v.helpOpen && (
            <div onClick={() => this.setState({ helpOpen: false })} style={{ position: 'fixed', inset: 0, background: 'rgba(16,18,22,.42)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div onClick={mStop} style={{ width: 'min(440px,94vw)', maxHeight: '86vh', overflow: 'auto', background: '#fff', borderRadius: '16px', boxShadow: '0 24px 60px rgba(16,18,22,.32)', padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '17px', fontWeight: 900, color: '#15181d' }}>How to read the tower</span>
                  <button onClick={() => this.setState({ helpOpen: false })} aria-label="Close" style={{ border: 'none', background: '#F1F2F4', borderRadius: '8px', width: '28px', height: '28px', fontSize: '15px', cursor: 'pointer', color: '#5c616b' }}>✕</button>
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.55, color: '#3a3f47', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  <div>Each team is a <b>bar sized by its points</b>. From the team's baseline, <b>points won</b> grow one way (wins, then draws) and <b>points dropped</b> the other (losses, plus the draws again).</div>
                  <div>Every cell is <b>one match, coloured by the opponent</b>. Wins &amp; won‑side ties sit on a <b>light opponent tint</b>; losses are <b>outlined on white</b> (the reverse side).</div>
                  <div>A <b>draw is deliberately shown twice</b> — once above the baseline and once below. It's the honest picture of a tie: <b>+1 point earned</b> (better than a loss), but also <b>2 points dropped</b> versus the win it could have been. Showing both sides is the whole idea — the tower isn't just where you stand, it's <b>the points you gathered and the points you let slip</b>. That's why the negatives are drawn at all: a team can sit on the same total from very different seasons, and only the down‑side reveals how many wins turned into draws or losses along the way.</div>
                  <div>Drag the <b>matchday slider</b> (or <kbd style={{ background: '#F1F2F4', borderRadius: '4px', padding: '1px 5px', fontFamily: 'inherit', fontWeight: 700 }}>‹</kbd> <kbd style={{ background: '#F1F2F4', borderRadius: '4px', padding: '1px 5px', fontFamily: 'inherit', fontWeight: 700 }}>›</kbd>) to move through the season — it stops at the <b>last played matchday</b>.</div>
                  <div>Switch <b>league &amp; season</b> with the dropdowns, flip <b>vertical towers / landscape rows</b> with ⊤ / ⊢, and go <b>fullscreen</b> with ⛶.</div>
                  <div><b>Keyboard:</b> <kbd style={{ background: '#F1F2F4', borderRadius: '4px', padding: '1px 5px', fontFamily: 'inherit', fontWeight: 700 }}>←</kbd> <kbd style={{ background: '#F1F2F4', borderRadius: '4px', padding: '1px 5px', fontFamily: 'inherit', fontWeight: 700 }}>→</kbd> change league, <kbd style={{ background: '#F1F2F4', borderRadius: '4px', padding: '1px 5px', fontFamily: 'inherit', fontWeight: 700 }}>↑</kbd> <kbd style={{ background: '#F1F2F4', borderRadius: '4px', padding: '1px 5px', fontFamily: 'inherit', fontWeight: 700 }}>↓</kbd> step the matchday.</div>
                  <div><b>Click a match</b> for the scoreline &amp; details, or a <b>team's label</b> for its full record.</div>
                </div>
              </div>
            </div>
          )}

          {/* ---------- credits modal ---------- */}
          {v.creditsOpen && (
            <div onClick={() => this.setState({ creditsOpen: false })} style={{ position: 'fixed', inset: 0, background: 'rgba(16,18,22,.42)', zIndex: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div onClick={mStop} style={{ width: 'min(460px,94vw)', maxHeight: '86vh', overflow: 'auto', background: '#fff', borderRadius: '16px', boxShadow: '0 24px 60px rgba(16,18,22,.32)', padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '17px', fontWeight: 900, color: '#15181d' }}>Credits &amp; how it's built</span>
                  <button onClick={() => this.setState({ creditsOpen: false })} aria-label="Close" style={{ border: 'none', background: '#F1F2F4', borderRadius: '8px', width: '28px', height: '28px', fontSize: '15px', cursor: 'pointer', color: '#5c616b' }}>✕</button>
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#3a3f47', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>Made with passion by <a href="https://dataviz.aguywithascarf.com" target="_blank" rel="noopener noreferrer" style={{ color: '#0B8A3D', fontWeight: 700, textDecoration: 'none' }}>A Guy With A Scarf</a> — <a href="https://www.linkedin.com/in/carlodemarchis" target="_blank" rel="noopener noreferrer" style={{ color: '#0B8A3D', fontWeight: 700, textDecoration: 'none' }}>Carlo De Marchis</a>.</div>
                  <div><b>The idea.</b> A league table tells you <i>where</i> a team stands. This tower tells you <i>how it got there</i>. It gives the <b>W‑D‑L shape of a season more prominence than the usual views</b> — every match is a coloured block, wins and won‑side draws stacking up, losses and dropped draws pulling down — so two teams on the same points can look completely different.</div>
                  <div><b>Why draws sit on both sides.</b> A tie is <b>+1 point earned</b> yet <b>2 points let slip</b>, so it's drawn above <i>and</i> below the baseline — the honest cost of a result that's neither win nor loss.</div>
                  <div><b>Data.</b> Final scores for all five leagues come from{' '}
                    <a href="https://www.football-data.org" target="_blank" rel="noopener noreferrer" style={{ color: '#0B8A3D', fontWeight: 700, textDecoration: 'none' }}>football-data.org</a>, refreshed automatically as matches finish. Club crests via TheSportsDB. The 2026/27 season shows only matches already played.</div>
                  <div><b>Built with</b> React, TypeScript &amp; Vite — a single hand‑drawn view, no charting library.</div>
                </div>
              </div>
            </div>
          )}

          {/* ---------- credit ---------- */}
          <div style={{ position: 'fixed', right: '14px', bottom: '9px', zIndex: 30, fontSize: '10px', fontWeight: 600, color: '#9298a1', letterSpacing: '.2px' }}>
            Produced with passion by{' '}
            <a href="https://dataviz.aguywithascarf.com" target="_blank" rel="noopener noreferrer" style={{ color: '#0B8A3D', fontWeight: 700, textDecoration: 'none' }}>A Guy With A Scarf</a>
            {' · '}
            <a href="https://www.linkedin.com/in/carlodemarchis" target="_blank" rel="noopener noreferrer" style={{ color: '#0B8A3D', fontWeight: 700, textDecoration: 'none' }}>Carlo De Marchis</a>
            {' · '}
            <button onClick={() => this.setState({ creditsOpen: true })} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: '#9298a1', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '2px', cursor: 'pointer' }}>Credits</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- the big layout computation -------------------------------------------
  renderVals(): Dict {
    const S = this.state, T = this.activeTeams()
    const isReal = this.seasonIsReal()
    const colorMode = this.props.colorMode === 'opponent' ? 'opponent' : 'result'
    const lossReverse = this.props.lossReverse !== false
    const pendCeiling = this.props.pendingMode !== 'stack'
    const orientProp = this.props.orientation || 'auto'
    const showScore = this.props.scoreLabels !== false
    const zonesOn = S.groupBy === 'zones'
    const layout = S.layout
    const tw = S.throughWeek == null ? 0 : S.throughWeek
    const orient = orientProp === 'towers' ? 'v' : orientProp === 'rows' ? 'h' : ((S.cw || 1280) < 820 ? 'h' : 'v')

    const mx = this.maxW()
    const smax = this.scrubMax()   // scrubber ceiling — stops at the last played matchday on the live season
    const leagueName = S.overview ? 'All 5 leagues' : (LEAGUES.find(x => x.id === S.league) || LEAGUES[0]).name
    const base: Dict = {
      helpOpen: S.helpOpen,
      creditsOpen: S.creditsOpen,
      overview: S.overview, ovData: S.ovData,
      playLabel: S.playing ? '❘❘' : '▶',
      stepBackDisabled: tw <= 0, stepFwdDisabled: tw >= smax, sliderMax: mx, scrubMax: smax,   // bar spans the FULL season; navigation is capped at the last played matchday
      throughWeek: tw, weekLabel: tw === 0 ? 'Pre-season' : (tw >= mx ? 'Full season' : ('Through MD ' + tw)),
      resultMode: colorMode !== 'opponent', oppMode: colorMode === 'opponent', zonesOn,
      leagueName, leagueOpen: S.leagueOpen,
      onToggleLeague: () => this.setState(s => ({ leagueOpen: !s.leagueOpen, seasonOpen: false })),
      overviewActive: S.overview, onOverview: () => this.enterOverview(),
      leagueList: LEAGUES.map(x => ({ id: x.id, name: x.name, country: x.country, uefa: !!x.uefa, active: !S.overview && x.id === S.league, has: SEASONS.some(s => !!SCHED_MODS[`./data/schedule-${x.id}-${s.id}.js`]), onClick: () => this.pickLeague(x.id) })),
      seasonLabel: (SEASONS.find(x => x.id === S.season) || SEASONS[0]).label,
      seasonTag: isReal ? 'Real' : 'Simulated', seasonOpen: S.seasonOpen,
      onToggleSeason: () => this.setState(s => ({ seasonOpen: !s.seasonOpen, leagueOpen: false })),
      seasonList: SEASONS.map(x => ({ id: x.id, label: x.label, tag: x.real ? 'Real' : (SIM ? 'Simulated' : 'Upcoming'), active: x.id === S.season, has: this.seasonHasData(x.id), onClick: () => this.pickSeason(x.id) })),
    }
    if (!T) return { ...base, loading: true, teamsSorted: [], layout, colsWrapStyle: '', rowsWrapStyle: '', playedStr: '', leaderAbbr: '', leaderPts: '', pop: null, tm: null, noData: !!S.seasons }

    // per-club aggregation
    const list = Object.keys(T).map(code => {
      const t = T[code]
      const wins: any[] = [], draws: any[] = [], losses: any[] = [], pend: any[] = []
      let GF = 0, GA = 0
      for (const g of t.games) {
        if (g.w > tw) { pend.push(g); continue }
        const r = this.getRes(code, g.id); if (!r) { pend.push(g); continue }
        GF += r.gf; GA += r.ga
        if (r.res === 'W') wins.push(g); else if (r.res === 'D') draws.push(g); else losses.push(g)
      }
      const W = wins.length, D = draws.length, L = losses.length, played = W + D + L
      return { t, code, wins, draws, losses, pend, W, D, L, GF, GA, GD: GF - GA, Pts: W * 3 + D, played }
    })
    const rankBy = S.rankBy
    list.sort((x, y) => {
      if (rankBy === 'gd') { if (y.GD !== x.GD) return y.GD - x.GD; if (y.Pts !== x.Pts) return y.Pts - x.Pts }
      else { if (y.Pts !== x.Pts) return y.Pts - x.Pts; if (y.GD !== x.GD) return y.GD - x.GD }
      if (y.GF !== x.GF) return y.GF - x.GF
      return x.code < y.code ? -1 : 1
    })
    // Serie A & La Liga break ties by HEAD-TO-HEAD first (mini-league among the tied teams:
    // h2h points → h2h GD → h2h GF), then overall GD/GF. (PL/Bundesliga/Ligue 1 use overall GD — done above.)
    if ((S.league === 'ITA' || S.league === 'ESP') && rankBy !== 'gd') {
      for (let i = 0; i < list.length;) {
        let j = i; while (j < list.length && list[j].Pts === list[i].Pts) j++
        if (j - i > 1) {
          const group = list.slice(i, j), codes = new Set(group.map(e => e.code))
          const h: Dict = {}
          for (const e of group) {
            const s = { pts: 0, gd: 0, gf: 0 }
            for (const g of e.t.games) {
              if (!codes.has(g.opp)) continue
              const r = this.getRes(e.code, g.id); if (!r) continue
              s.pts += r.gf > r.ga ? 3 : r.gf === r.ga ? 1 : 0; s.gd += r.gf - r.ga; s.gf += r.gf
            }
            h[e.code] = s
          }
          group.sort((x, y) => (h[y.code].pts - h[x.code].pts) || (h[y.code].gd - h[x.code].gd) || (h[y.code].gf - h[x.code].gf) || (y.GD - x.GD) || (y.GF - x.GF) || (x.code < y.code ? -1 : 1))
          for (let k = 0; k < group.length; k++) list[i + k] = group[k]
        }
        i = j
      }
    }

    // Fixed cell sizes — the tower no longer squeezes to fit; it grows as tall as the games
    // need and the canvas scrolls. Win and loss are 3× the height of a draw (per request).
    const chartW = S.cw || 1200
    const liveH = this.chartRef.current ? Math.round(this.chartRef.current.clientHeight - 20) : 0
    const chartH = liveH > 40 ? liveH : (S.ch || 600)
    const labelH = 54   // 4 stacked lines: rank · team · points · W-D-L
    const nTeams = T ? Object.keys(T).length : 20   // 20 domestic, 36 for the UEFA league phase
    const colW = Math.max(28, Math.min(82, (chartW - 2) / nTeams - 1))   // all teams fit the width (tight 1px gap)
    // HORIZONTAL view (teams ranked left→right): fixed, legible cell sizes — 1× tie box at a
    // minimum legible height, 2× and 3× scaled from it. The canvas scrolls vertically if needed.
    const DRAWH = 15                // 1× tie (minimum legible) — full win/loss box = 45px fits 3 stacked lines
    const DECH = DRAWH * 3          // 3× win / loss / pending
    const PENDH = DECH
    const DLOSTH = DRAWH * 2        // 2× tie shown in the loss tower
    let maxBelow = DECH; for (const e of list) { const px = e.L * DECH + e.D * DLOSTH; if (px > maxBelow) maxBelow = px }
    const belowH = maxBelow + 2
    this._droppedW = belowH   // rows mode overwrites this below
    const rowH = Math.max(15, Math.min(50, (chartH - 40) / nTeams))   // all rows fit the viewport height
    const rowLabelW = 80
    // Landscape uses a much bigger px-per-point so the 1-pt tie boxes are wide enough to read.
    const ROW_U = 16                                  // px per point in rows mode
    const WLW = 3 * ROW_U                             // win / loss box = 48 (3×)
    const TIE1 = ROW_U                                // tie box = 16 (1×), stacked into 4 rows
    const TIE2 = 2 * ROW_U                            // tie shown below (points dropped) = 32 (2×)
    // "to play" boxes carry no points → size them so a full fixture row (pre-season) fits the width.
    const pendW = Math.max(20, Math.min(WLW, (chartW - rowLabelW - 24) / mx))
    let maxDropPx = WLW; for (const e of list) { const px = e.L * WLW + e.D * TIE2; if (px > maxDropPx) maxDropPx = px }
    const rowsDroppedW = maxDropPx + 2
    if (layout === 'rows') this._droppedW = rowsDroppedW

    const mkCell = (e: any, g: any, type: string): Dict => {
      const t = e.t
      const r = this.getRes(t.abbr, g.id); const arrow = g.ha === 'A' ? '→' : ''   // away = small right arrow (was @)
      const oppPrim = (T[g.opp] && T[g.opp].primary) || '#8A8F98'
      // Every box carries the OPPONENT's colour. Wins fill it; losses (below the line) use the
      // reverse — white with the opponent colour as outline + text. A green/red/amber left stripe
      // marks win/loss/draw; upcoming games are a faint outline.
      let bg: string, color: string, border: string, chipBg = '', chipText = ''
      if (type === 'pend') { bg = '#ffffff'; color = this.mix(oppPrim, '#ffffff', 0.15); border = '1px solid ' + this.mix(oppPrim, '#ffffff', 0.6) }
      else if (type === 'draw') { bg = this.mix(oppPrim, '#ffffff', 0.90); color = this.ink(oppPrim); border = '1.5px solid ' + oppPrim; chipBg = oppPrim; chipText = this.contrast(oppPrim) }   // won-side tie — very light opponent tint
      else if (type === 'loss' || type === 'drawlost') { bg = '#ffffff'; color = this.ink(oppPrim); border = '1.5px solid ' + oppPrim }   // reverse (below the line) — stays white
      else { bg = this.mix(oppPrim, '#ffffff', 0.90); color = this.ink(oppPrim); border = '1.5px solid ' + oppPrim; chipBg = oppPrim; chipText = this.contrast(oppPrim) }   // win — opponent on colour chip, score on a very light opponent tint

      const h = type === 'draw' ? DRAWH : type === 'drawlost' ? DLOSTH : type === 'pend' ? PENDH : DECH
      const fs = type === 'draw' ? 8 : Math.max(9, Math.min(12, h * 0.30))
      // one line: "TOR: 2-1" (home) / "@JUV: 3-1" (away); pending shows the opponent only.
      let sA = '', sMid = '', sB = '', sAStyle = '', sBStyle = ''
      if (r && type !== 'pend') {
        sA = String(r.gf); sB = String(r.ga); sMid = '-'
        const win = r.gf > r.ga, lose = r.gf < r.ga
        sAStyle = win ? 'font-weight:800;' : ''; sBStyle = lose ? 'font-weight:800;' : ''
      }
      const hasScore = sA !== ''
      const oppLab = arrow + g.opp + (hasScore ? ':' : '')   // opponent shown on every box, draws included
      // No margin between boxes: with box-sizing:border-box and win=3×draw, the stack height is
      // then exactly proportional to points (5W and 4W+3D — both 15 pts — reach the same height).
      const fade = type === 'drawlost' ? 'opacity:.55;' : ''   // tied-as-dropped boxes sit back a bit
      const resTxt = r ? (` · ${r.res} ${r.gf}-${r.ga}`) : ' · to play'
      const title = `MD ${g.w} · ${g.ha === 'A' ? '@ ' : 'vs '}${g.oppFull}${resTxt}`
      if (layout === 'rows') {
        // landscape ledger: width = points × ROW_U (bigger so ties read); two stacked lines —
        // opponent on top, score below (e.g. "TOR" / "2-0").
        const w = type === 'draw' ? TIE1 : type === 'drawlost' ? TIE2 : type === 'pend' ? pendW : WLW
        const oppTxt = arrow + g.opp
        const scoreTxt = (r && type !== 'pend') ? `${r.gf}-${r.ga}` : ''
        // positive tie (won side): narrow → arrow / opponent 3 letters STACKED vertically / score "1-1"
        const vTie = type === 'draw' && !!r
        // dropped tie: 4 stacked rows: home/away (arrow or blank), opponent, team goals, opp goals
        const tieRows = type === 'drawlost' && !!r
        // unplayed → 3 rows: matchday number, opponent, arrow (if away); aligned to the top
        const pendRows = type === 'pend'
        const fs2 = vTie ? Math.max(6, Math.min(w * 0.62, (rowH - 2) / 5.4))
          : tieRows ? Math.max(5, Math.min(w / 3.2, (rowH - 3) / 4.2))
          : Math.max(5, Math.min(11, w / 3.2))
        const align = pendRows ? 'flex-start' : 'center'
        const rstyle = `flex:0 0 ${w}px;width:${w}px;min-width:${w}px;height:${rowH}px;background:${bg};color:${color};border:${border};${fade}display:flex;flex-direction:column;align-items:center;justify-content:${align};overflow:hidden;cursor:pointer;font-size:${fs2}px;font-weight:700;line-height:1.05;letter-spacing:-.3px;padding:1px 0;`
        return { key: t.abbr + '-' + g.id, twoLine: true, vTie, tieRows, pendRows, chip: !!chipBg, chipBg, chipText, mdNum: String(g.w), arrowTxt: arrow, oppCode: g.opp, oppLetters: g.opp.split(''), oppTxt, scoreTxt, gf: r ? String(r.gf) : '', ga: r ? String(r.ga) : '', style: rstyle, title, onClick: () => this.openPop(t.abbr, g.id) }
      }
      if (type === 'pend') {
        // horizontal view, upcoming game → two lines: matchday number (dim) over the opponent
        const pfs = Math.max(6.5, Math.min(9, h * 0.4))
        const pstyle = `width:100%;height:${h}px;min-height:${h}px;margin:0;background:${bg};color:${color};border:${border};display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.02;overflow:hidden;cursor:pointer;font-size:${pfs}px;font-weight:700;padding:0 2px;`
        return { key: t.abbr + '-' + g.id, towerPend: true, mdNum: String(g.w), oppCode: arrow + g.opp, style: pstyle, title, onClick: () => this.openPop(t.abbr, g.id) }
      }
      // towers (columns): tall boxes stack 3 lines — opponent · score · home/away — so columns can be
      // narrow enough to fit all 36 teams; the short 1× draw box stays one line.
      const tall = h >= 28
      const style = `width:100%;height:${h}px;min-height:${h}px;margin:0;border-radius:0;background:${bg};color:${color};border:${border};${fade}display:flex;flex-direction:${tall ? 'column' : 'row'};align-items:center;justify-content:center;gap:0;overflow:hidden;cursor:pointer;font-size:${fs}px;line-height:1.02;padding:0 2px;`
      return { key: t.abbr + '-' + g.id, tower3: tall, oppLab, arrowTxt: arrow, oppCode: g.opp, sA, sMid, sB, sAStyle, sBStyle, chip: !!chipBg, chipBg, chipText, style, title, onClick: () => this.openPop(t.abbr, g.id) }
    }

    const teamsSorted = list.map((e, i) => {
      const t = e.t, prim = t.primary
      const rank = i + 1
      const zf = zoneFor(S.league)
      const z = zf(rank)
      const isZoneStart = zonesOn && i > 0 && zf(i).key !== z.key
      const wdlStr = `${e.W}-${e.D}-${e.L}`
      const ptsStr = `${e.Pts} pts`
      const labelTitle = `${t.name} · ${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} · ${e.Pts} pts · ${e.W}W-${e.D}D-${e.L}L · GD ${e.GD >= 0 ? '+' : ''}${e.GD}`
      const zoneBar = zonesOn ? z.color : prim
      // team box = SOLID club colour, 2×2: [rank · team] / [W-D-L smaller · pts], all in contrast ink
      const ink = this.contrast(prim)
      const narrowLbl = layout === 'towers' && colW < 60
      const rankStyle = `font-size:${narrowLbl ? 12 : 14}px;font-weight:900;color:${ink};line-height:1;font-variant-numeric:tabular-nums;`
      const teamStyle = `font-size:${narrowLbl ? 10 : 12}px;font-weight:900;color:${ink};letter-spacing:.2px;line-height:1;white-space:nowrap;`
      const wdlStyle = `font-size:${narrowLbl ? 6.5 : 7.5}px;font-weight:800;color:${ink};opacity:.78;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;`
      const ptsStyle = `font-size:${narrowLbl ? 8 : 9}px;font-weight:800;color:${ink};line-height:1;white-space:nowrap;`
      const lblRowStyle = `position:relative;z-index:1;display:flex;flex-direction:row;align-items:baseline;justify-content:space-between;width:100%;gap:3px;overflow:hidden;`
      const crest = logoFile(S.league, t.abbr)
      const base: Dict = { abbr: t.abbr, rank, wdlStr, ptsStr, labelTitle, crest, onLabel: () => this.openTeam(t.abbr), rankStyle, teamStyle, wdlStyle, ptsStyle, lblRowStyle }

      if (layout === 'rows') {
        // LANDSCAPE: team box in the middle. RIGHT of it = points won (wins 3u nearest the box →
        // draws 1u → upcoming). LEFT of it = points dropped (draws 2u far left → losses 3u nearest).
        const wins = [...e.wins].sort((a, b) => a.w - b.w).map(g => mkCell(e, g, 'win'))
        const d1 = [...e.draws].sort((a, b) => a.w - b.w).map(g => mkCell(e, g, 'draw'))
        const pend = [...e.pend].sort((a, b) => a.w - b.w).map(g => mkCell(e, g, 'pend'))
        const won = [...wins, ...d1, ...pend]
        const d2 = [...e.draws].sort((a, b) => a.w - b.w).map(g => mkCell(e, g, 'drawlost'))
        const losses = [...e.losses].sort((a, b) => a.w - b.w).map(g => mkCell(e, g, 'loss'))
        const dropped = [...d2, ...losses]   // flex-end → losses land nearest the team box
        const rowStyle = `flex:0 0 ${rowH}px;height:${rowH}px;min-height:0;display:flex;flex-direction:row;align-items:stretch;${isZoneStart ? 'margin-top:10px;' : ''}`
        const droppedStyle = `flex:0 0 ${rowsDroppedW}px;height:${rowH}px;display:flex;flex-direction:row;justify-content:flex-end;align-items:stretch;overflow:hidden;`
        const wonStyle = `flex:0 0 auto;height:${rowH}px;display:flex;flex-direction:row;justify-content:flex-start;align-items:stretch;overflow:hidden;`
        // sticky horizontally so the team column never disappears when scrolling left/right
        const labelStyle = `position:sticky;left:2px;right:2px;z-index:5;flex:0 0 ${rowLabelW}px;height:${rowH}px;display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:2px;padding:2px 5px;overflow:hidden;background:${prim};border:1px solid ${this.mix(prim, '#000000', 0.22)};border-right:3px solid ${zoneBar};border-radius:4px;box-shadow:0 0 6px rgba(20,22,28,.18);cursor:pointer;`
        return { ...base, won, dropped, rowStyle, droppedStyle, wonStyle, labelStyle }
      }

      // TOWERS (vertical). ABOVE (bottom→top): wins 3u → draws 1u → upcoming. BELOW: losses 3u → draws 2u.
      const winC = [...e.wins].sort((a, b) => b.w - a.w).map(g => mkCell(e, g, 'win'))
      const drawUp = [...e.draws].sort((a, b) => b.w - a.w).map(g => mkCell(e, g, 'draw'))
      const pendC = [...e.pend].sort((a, b) => b.w - a.w).map(g => mkCell(e, g, 'pend'))
      const above = [...pendC, ...drawUp, ...winC]
      const lossC = [...e.losses].sort((a, b) => a.w - b.w).map(g => mkCell(e, g, 'loss'))
      const drawDn = [...e.draws].sort((a, b) => a.w - b.w).map(g => mkCell(e, g, 'drawlost'))
      const below = [...lossC, ...drawDn]
      const colStyle = `flex:0 0 ${colW}px;width:${colW}px;min-width:0;max-width:${colW}px;display:flex;flex-direction:column;align-items:stretch;${isZoneStart ? 'margin-left:14px;' : ''}`
      const aboveStyle = `display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;`
      const belowStyle = `flex:0 0 ${belowH}px;display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;padding-top:2px;`
      // sticky vertically (both edges) so the team row never disappears when scrolling up/down
      const labelStyle = `position:sticky;top:2px;bottom:2px;z-index:5;margin-top:2px;height:${labelH}px;display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:1px;padding:2px 1px;overflow:hidden;background:${prim};border:1px solid ${this.mix(prim, '#000000', 0.22)};border-top:3px solid ${zoneBar};border-radius:4px;box-shadow:0 0 6px rgba(20,22,28,.18);cursor:pointer;`
      return { ...base, above, below, aboveStyle, belowStyle, colStyle, labelStyle }
    })

    const decided = list.reduce((a, e) => a + e.played, 0) / 2
    const leader = list[0]

    // match-detail modal
    const pop = S.pop
    let popWeek = '', popResBadge = '', popResStyleObj: React.CSSProperties = {}, popChips: Dict[] = []
    let popHomeColor = '#8A8F98', popAwayColor = '#8A8F98', popHomeName = '', popAwayName = '', popHomeCode = '', popAwayCode = ''
    let popScoreA = '—', popScoreB = '—', popHomeDim: React.CSSProperties = {}, popAwayDim: React.CSSProperties = {}, popAccentStyle = '', popIsSim = false
    let popHighlights: { lang: string; id: string; label: string; flag: string }[] = []
    if (pop) {
      popHighlights = this.normHighlights(S.seasons && S.seasons[S.season].HL && S.seasons[S.season].HL[pop.id])
      const home = pop.ha === 'H' ? pop.code : pop.opp
      const away = pop.ha === 'H' ? pop.opp : pop.code
      const logoName = (c: string) => logoFile(S.league, c)
      popHomeCode = logoName(home); popAwayCode = logoName(away)
      const hp = (T[home] && T[home].primary) || '#8A8F98', ap = (T[away] && T[away].primary) || '#8A8F98'
      popHomeColor = hp; popAwayColor = ap
      popHomeName = (T[home] && T[home].name) || home; popAwayName = (T[away] && T[away].name) || away
      popWeek = `Matchday ${pop.w}`
      popAccentStyle = `height:5px;background:linear-gradient(90deg,${hp} 0%,${hp} 46%,${ap} 54%,${ap} 100%);`
      const rHome = this.getRes(home, pop.id)
      if (rHome) {
        popScoreA = String(rHome.gf); popScoreB = String(rHome.ga)
        const res = rHome.res // from home perspective
        if (res === 'W') { popAwayDim = { opacity: .4 } } else if (res === 'L') { popHomeDim = { opacity: .4 } }
        const lbl = res === 'W' ? `${home} WIN` : res === 'L' ? `${away} WIN` : 'DRAW'
        const c = res === 'D' ? ['#F2E4BC', '#7C6320'] : ['#E7F4EC', '#1F8A4C']
        popResBadge = lbl; popResStyleObj = { background: c[0], color: c[1] }
        popIsSim = !isReal && !this.activeReal()[pop.id]
      } else { popResBadge = 'TO PLAY'; popResStyleObj = { background: '#EDEFF2', color: '#727781' } }
      const bits: string[] = []
      const kk = this.fmtKick(pop.et); if (kk) bits.push(kk)
      if (pop.venue) bits.push(pop.venue)
      if (pop.city && pop.city !== pop.venue) bits.push(pop.city)
      if (pop.net) bits.push(pop.net)
      popChips = bits.map(v => ({ v }))
    }

    // club modal
    let tm: Dict | null = null
    if (S.teamPop && T[S.teamPop]) {
      const code = S.teamPop, t = T[code]
      const idx = list.findIndex(e => e.code === code); const e = list[idx]; const rank = idx + 1
      const prim = t.primary, txt = this.contrast(prim)
      const crestOf = (c: string) => logoFile(S.league, c)
      const HL = (S.seasons && S.seasons[S.season].HL) || {}
      const rows = t.games.slice().sort((a: any, b: any) => a.w - b.w).map((g: any) => {
        const r = this.getRes(code, g.id); const res = r ? r.res : null
        const c = res === 'W' ? ['#E7F4EC', '#1F8A4C'] : res === 'L' ? ['#FBEAE9', '#C23A2E'] : res === 'D' ? ['#F2E4BC', '#7C6320'] : ['#F1F2F4', '#9298a1']
        return {
          id: g.id, w: g.w, ha: g.ha === 'H' ? 'vs' : '→', opp: g.oppFull, oppCrest: crestOf(g.opp), highlights: this.normHighlights(HL[g.id]),
          score: r ? `${r.gf}–${r.ga}` : '—', badge: res || '·',
          badgeStyleObj: { color: c[1], background: c[0] } as React.CSSProperties,
          onClick: () => this.setState({ teamPop: null, pop: { code, id: g.id, w: g.w, opp: g.opp, oppFull: g.oppFull, ha: g.ha, venue: g.venue, city: g.city, net: g.net, et: g.et } }),
        }
      })
      tm = {
        name: t.name, crest: crestOf(code), rankLine: `${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} · ${zoneFor(S.league)(rank).label || 'Mid-table'}`,
        Pts: e.Pts, rec: `${e.W}W · ${e.D}D · ${e.L}L`, goals: `${e.GF}:${e.GA} (${e.GD >= 0 ? '+' : ''}${e.GD})`,
        headStyleObj: { background: `linear-gradient(135deg,${prim} 0%,${this.mix(prim, '#000000', .25)} 100%)`, color: txt } as React.CSSProperties,
        rows,
      }
    }

    return {
      ...base, loading: false, orient, teamsSorted, layout,
      colsWrapStyle: 'display:flex;flex-direction:row;gap:1px;align-items:flex-end;min-width:100%;min-height:100%;',
      rowsWrapStyle: `display:flex;flex-direction:column;gap:2px;width:max-content;min-width:100%;padding-right:${chartW}px;`,
      playedStr: `${decided} / ${mx * Math.floor(list.length / 2)}`, leaderAbbr: leader.code, leaderPts: leader.Pts,
      pop, popWeek, popResBadge, popResStyleObj, popChips, popHomeColor, popAwayColor, popHomeName, popAwayName, popHomeCode, popAwayCode,
      popScoreA, popScoreB, popHomeDim, popAwayDim, popAccentStyle, popIsSim, popHighlights,
      tm,
    }
  }
}

// One tower cell, single line: "TOR: 2-1" / "@JUV: 3-1" (opponent + score), score on its own
// for very short cells, opponent only for pending fixtures.
function Cell({ c }: { c: Dict }) {
  if (c.towerPend) return (
    <div style={css(c.style)} title={c.title} onClick={c.onClick}>
      <span style={{ opacity: .5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{c.mdNum}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{c.oppCode}</span>
    </div>
  )
  if (c.pendRows) return (
    <div style={css(c.style)} title={c.title} onClick={c.onClick}>
      <span style={{ whiteSpace: 'nowrap', opacity: .6, fontWeight: 800 }}>{c.mdNum}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{c.oppCode}</span>
      <span style={{ whiteSpace: 'nowrap', opacity: .8 }}>{c.arrowTxt || ' '}</span>
    </div>
  )
  if (c.vTie) return (
    <div style={css(c.style)} title={c.title} onClick={c.onClick}>
      <span style={{ whiteSpace: 'nowrap', opacity: .8, lineHeight: 1 }}>{c.arrowTxt || ' '}</span>
      {c.oppLetters.map((ch: string, i: number) => <span key={i} style={{ fontWeight: 800, lineHeight: 1 }}>{ch}</span>)}
      <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 'auto' }}>{c.scoreTxt}</span>
    </div>
  )
  if (c.tieRows) return (
    <div style={css(c.style)} title={c.title} onClick={c.onClick}>
      <span style={{ whiteSpace: 'nowrap', opacity: .8 }}>{c.arrowTxt || ' '}</span>
      {c.chip
        ? <span style={{ background: c.chipBg, color: c.chipText, borderRadius: '2px', padding: '0', whiteSpace: 'nowrap', letterSpacing: '-0.3px', width: '100%', textAlign: 'center' }}>{c.oppCode}</span>
        : <span style={{ whiteSpace: 'nowrap' }}>{c.oppCode}</span>}
      <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{c.gf}</span>
      <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{c.ga}</span>
    </div>
  )
  if (c.twoLine) {
    // win chip: opponent on the colour chip (contrast text), score in colour on white below
    const score = c.scoreTxt && <span style={{ whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{c.scoreTxt}</span>
    return (
      <div style={css(c.style)} title={c.title} onClick={c.onClick}>
        {c.chip
          ? <><span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px', maxWidth: '100%' }}>{c.arrowTxt && <span style={{ whiteSpace: 'nowrap' }}>{c.arrowTxt}</span>}<span style={{ background: c.chipBg, color: c.chipText, borderRadius: '2px', padding: '0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.oppCode}</span></span>{score}</>
          : <><span style={{ whiteSpace: 'nowrap' }}>{c.oppTxt}</span>{score}</>}
      </div>
    )
  }
  const score = c.sA !== '' && (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>
      <span style={css(c.sAStyle)}>{c.sA}</span>{c.sMid && <span style={{ opacity: .6 }}>{c.sMid}</span>}<span style={css(c.sBStyle)}>{c.sB}</span>
    </span>
  )
  // towers tall box → 3 stacked lines: opponent · score · home/away arrow
  if (c.tower3) return (
    <div style={css(c.style)} title={c.title} onClick={c.onClick}>
      {c.chip
        ? <span style={{ background: c.chipBg, color: c.chipText, borderRadius: '2px', padding: '0 3px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{c.oppCode}</span>
        : <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{c.oppCode}</span>}
      {score && <span style={{ fontWeight: 800 }}>{score}</span>}
      <span style={{ opacity: .7, fontWeight: 700, fontSize: '.82em' }}>{c.arrowTxt ? '→ away' : 'home'}</span>
    </div>
  )
  const opp = c.oppLab !== '' && <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.oppLab}</span>
  return (
    <div style={css(c.style)} title={c.title} onClick={c.onClick}>
      {c.chip
        ? <><span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px', maxWidth: '100%', flex: '0 0 auto' }}>{c.arrowTxt && <span style={{ whiteSpace: 'nowrap' }}>{c.arrowTxt}</span>}<span style={{ background: c.chipBg, color: c.chipText, borderRadius: '2px', padding: '0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.oppCode}</span></span>{score}</>
        : <>{opp}{score}</>}
    </div>
  )
}
