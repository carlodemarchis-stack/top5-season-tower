// Top-scorers card film: one full-screen card per player (top 25 by goals across the top 5 leagues, ties included).
// Data: src/data/scorers-TOP5-<season>.js (built + verified by scripts/update-scorers.mjs); club colours/names from the schedules.
import { SCORERS } from '../data/scorers-TOP5-2026-27.js'
import { TEAMS as ITA } from '../data/schedule-ITA-2026-27.js'
import { TEAMS as ENG } from '../data/schedule-ENG-2026-27.js'
import { TEAMS as ESP } from '../data/schedule-ESP-2026-27.js'
import { TEAMS as FRA } from '../data/schedule-FRA-2026-27.js'
import { TEAMS as GER } from '../data/schedule-GER-2026-27.js'

type Dict = Record<string, any>
const TEAMS: Record<string, Dict> = { ITA, ENG, ESP, FRA, GER }
const LEAGUE_NAME: Record<string, string> = { ITA: 'Serie A', ENG: 'Premier League', ESP: 'LaLiga', FRA: 'Ligue 1', GER: 'Bundesliga' }
// the league photo shoots frame differently (LaLiga / Ligue 1 waist-up, the rest chest-up): scale so heads read the same size
const PHOTO_H: Record<string, string> = { ESP: '90%', FRA: '88%', ITA: '82%', ENG: '80%', GER: '80%' }

// same six result shades as the towers / barcode
const RES6: Record<string, [string, string]> = {
  bigW: ['#177a41', '#fff'], W1: ['#3a9e62', '#0b2414'], D: ['#EAB308', '#3d3000'],
  nil: ['#9aa0a8', '#22262d'], L1: ['#dc5c5e', '#2a0709'], bigL: ['#b3323a', '#fff'],
}
const res6 = (gf: number, ga: number) => { const d = gf - ga; return d >= 2 ? 'bigW' : d === 1 ? 'W1' : d === 0 ? (gf === 0 ? 'nil' : 'D') : d === -1 ? 'L1' : 'bigL' }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
const logo = (lg: string, code: string) => `logos/${lg === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code}.png`
function lum(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const POS: Record<string, string> = { F: 'Forward', M: 'Midfielder', D: 'Defender', G: 'Goalkeeper' }

function card(p: Dict) {
  const club = TEAMS[p.lg][p.team] || {}
  const c = club.primary || '#555'
  const light = lum(c) > 0.55
  const ink = light ? '#15181d' : '#fff'
  const c2 = light ? '#15181d' : c                     // the big goals number takes the club colour unless it is too pale to read
  const t = p.teamLine
  const ini = p.name.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('')

  const strip = p.matches.map((m: Dict) => {
    const [bg, fg] = RES6[res6(m.gf, m.ga)]
    const opp = TEAMS[p.lg][m.opp] || {}
    const dots = [
      ...m.goals.map((g: Dict) => `<span class="dot" title="${esc(g.min)} ${g.kind === 'pen' ? 'penalty' : g.kind === 'head' ? 'header' : g.kind === 'fk' ? 'free kick' : 'goal'}">${g.kind === 'pen' ? 'P' : ''}</span>`),
      ...Array.from({ length: m.A }, () => `<span class="dot ast" title="assist"></span>`),
    ].join('')
    const minTxt = !m.role ? 'DNP' : m.role === 'B' ? `sub ${m.min}'` : `${m.min}'`
    return `<div class="m${m.role ? '' : ' dnp'}" title="MD${m.w} · ${m.ha === 'H' ? 'vs' : 'at'} ${esc(opp.name || m.opp)} · ${m.gf}-${m.ga}${m.role ? ` · ${m.min}' · ${m.SH} shots (${m.SOG} on target)` : ' · did not play'}">
      <div class="pts">${dots}</div>
      <div class="box" style="background:${bg};color:${fg}">${m.gf}-${m.ga}</div>
      <div class="opp">${m.ha === 'A' ? '@' : ''}<img src="${logo(p.lg, m.opp)}" alt="" onerror="this.remove()">${esc(m.opp)}</div>
      <div class="min"><div class="bar"><i style="width:${Math.round((m.min / 90) * 100)}%"></i></div><span>${minTxt}</span></div>
      <div class="md">MD${m.w}</div>
    </div>`
  }).join('')

  const goals = p.matches.flatMap((m: Dict) => m.goals.map((g: Dict) => ({ ...g, m })))
    .map((g: Dict) => `<span class="g"><b>${esc(g.min)}</b> ${g.m.ha === 'H' ? 'vs' : 'at'} ${esc(g.m.opp)}${g.kind === 'pen' ? '<em>PEN</em>' : g.kind === 'head' ? '<em>HEAD</em>' : g.kind === 'fk' ? '<em>FK</em>' : ''}${g.ast ? ` · ast ${esc(g.ast)}` : ''}</span>`).join('')

  const minPerGoal = p.G ? Math.round(p.min / p.G) : null
  const age = p.age != null ? `${p.age}` : ''
  return `<section class="card" id="p-${p.espnId}" style="--c:${c};--c2:${c2};--ink:${ink};--ph:${PHOTO_H[p.lg]}">
    <div class="pan">
      <img class="wm" src="${logo(p.lg, p.team)}" alt="" onerror="this.remove()">
      <div class="rk">#${p.rank}</div>
      ${p.photo ? `<img class="ph" src="${p.photo}" alt="${esc(p.name)}">` : `<div class="ini">${esc(ini)}</div>`}
    </div>
    <div class="body">
      <div class="lg"><i></i>${LEAGUE_NAME[p.lg]}</div>
      <div>
        <h1>${esc(p.name)}</h1>
        <div class="meta" style="margin-top:8px">${[POS[p.pos] || p.posName, age && `<b>${age}</b> yrs`, esc(p.nat), p.jersey && `#${esc(p.jersey)}`, p.heightCm && `${p.heightCm} cm`].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="club"><img src="${logo(p.lg, p.team)}" alt="" onerror="this.remove()">${esc(club.name || p.team)}
        <span class="tl"><b>${t.pos ? ord(t.pos) : '–'}</b> · <b>${t.pts}</b> pts · ${t.W}-${t.D}-${t.L} · GD ${t.GF - t.GA >= 0 ? '+' : ''}${t.GF - t.GA}</span></div>
      <div class="nums">
        <div class="n big"><b>${p.G}</b><span>Goals${p.pens ? ` · ${p.pens} pen${p.pens > 1 ? 's' : ''}` : ''}</span></div>
        <div class="n"><b>${p.A}</b><span>Assists</span></div>
        <div class="n"><b>${p.apps}</b><span>Games${p.starts < p.apps ? ` · ${p.starts} starts` : ''}</span></div>
        <div class="n"><b>${p.min}'</b><span>Minutes</span></div>
        <div class="n"><b>${minPerGoal ?? '–'}'</b><span>Per goal</span></div>
        <div class="n"><b>${p.sog}/${p.shots}</b><span>On target / shots</span></div>
      </div>
      <div>
        <div class="sec">${esc(club.name || p.team)} · match by match</div>
        <div class="strip" style="--cols:${p.matches.length}">${strip}</div>
      </div>
      <div>
        <div class="sec">The goals</div>
        <div class="goals">${goals}</div>
      </div>
      <div class="foot">● goal (P = penalty) · ○ assist · box = ${esc(club.name || p.team)} result · bar = minutes played</div>
    </div>
  </section>`
}

// ---------- the standard card-film chrome: top bar (league logos), control bar, search, modals, keys, restore ----------
const P: Dict[] = SCORERS.players
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }
const APPS: [string, string, string, string][] = [
  ['Season Tower', 'This app · the top-5 leagues, a whole season on one screen', '#0B8A3D', './#ALL/2026-27'],
  ['Formula 1', 'A season read lap by lap', '#00d7b6', 'https://f1.aguywithascarf.com/'],
  ['Tennis', 'The season, one player at a time', '#f2c14e', 'https://tennis.aguywithascarf.com/'],
  ['NFL', 'Wins up, losses down', '#4d94e0', 'https://nfl.aguywithascarf.com/'],
  ['NBA', 'Season film and towers', '#e0453f', 'https://nba.aguywithascarf.com/'],
  ['NHL', 'Season film and towers', '#2a9fd8', 'https://nhl.aguywithascarf.com/'],
  ['World Cup', 'Road to the Final', '#3fbe72', 'https://worldcupbracket.aguywithascarf.com/'],
  ['PGA TOUR', 'Season Film', '#57a34a', 'https://golf.aguywithascarf.com/'],
  ['Athletics', 'World Record Film', '#d98a3d', 'https://athletics.aguywithascarf.com/'],
]
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map(card).join('')
const cards = [...film.children] as HTMLElement[]

const firstOf = (lg: string) => P.findIndex(p => p.lg === lg)
$('lgs').innerHTML = LG_ORDER.map(lg => {
  const n = P.filter(p => p.lg === lg).length
  return `<button class="lgb" data-lg="${lg}" title="${LEAGUE_NAME[lg]} · ${n} scorer${n === 1 ? '' : 's'}${n ? ' — jump to the first' : ''}"${n ? '' : ' disabled'}><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"><span>${n}</span></button>`
}).join('')
$('lgs').querySelectorAll<HTMLButtonElement>('.lgb').forEach(b => b.onclick = () => { const i = firstOf(b.dataset.lg!); if (i >= 0) go(i) })
$('applist').innerHTML = APPS.map(([n, k, c, u]) => `<a class="approw" href="${u}"${u.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}><i style="background:${c}"></i><span>${n}<em>${k}</em></span><span>→</span></a>`).join('')
const upd = new Date(SCORERS.updated)
$('cnote').innerHTML = `${P.length} players: the top 25 by goals across the five leagues, plus everyone tied on ${SCORERS.cut} goals. Season ${SCORERS.season.replace('-', '/')}, updated ${upd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`

let cur = 0, playing: number | null = null, target = -1
function paint() {
  const p = P[cur]
  $('ctx').innerHTML = `Top-5 scorers ${SCORERS.season.replace('-', '/')} · <b>${esc(p.name)}</b> · ${p.G} goals`
  $('counter').innerHTML = `<b>${cur + 1}</b> / ${P.length}`
  $('lgs').querySelectorAll<HTMLElement>('.lgb').forEach(b => b.classList.toggle('on', b.dataset.lg === p.lg))
  history.replaceState(null, '', '#' + (cur + 1))
  try { localStorage.setItem('top5.scorers.card', String(cur)) } catch { }
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[p.lg]); meta('title', `${p.name} · ${p.G} goals · top-5 scorers`)
}
function go(i: number, smooth = true) {
  cur = Math.max(0, Math.min(P.length - 1, i)); target = cur
  film.scrollTo({ left: cards[cur].offsetLeft, behavior: smooth ? 'smooth' : 'instant' as ScrollBehavior })
  paint()
}
const step = (d: number) => go(cur + d)
let st: number | undefined
film.addEventListener('scroll', () => {          // keep the counter in step with native swipe / scroll-snap
  clearTimeout(st); st = window.setTimeout(() => {
    const i = Math.round(film.scrollLeft / film.clientWidth)
    if (target >= 0) { if (i === target) target = -1; return }   // a go() still travelling: don't record the cards it passes
    if (i !== cur) { cur = i; paint() }
  }, 90)
})
const userScroll = () => { target = -1 }                          // a swipe / wheel takes over from any go() in flight
film.addEventListener('touchstart', userScroll, { passive: true }); film.addEventListener('wheel', userScroll, { passive: true })
function togglePlay() {
  const b = $('playb')
  if (playing) { clearInterval(playing); playing = null; b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>'; b.title = 'Play'; return }
  playing = window.setInterval(() => { if (cur >= P.length - 1) return togglePlay(); step(1) }, 3200)
  b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>'; b.title = 'Pause'
}
const fs = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { })
const closeMods = () => document.querySelectorAll('.mod.on').forEach(m => m.classList.remove('on'))
const openMod = (id: string) => { closeMods(); $(id).classList.add('on') }

// search: grouped by league, every word must match; a number jumps to that card
const INDEX = P.map((p, i) => {
  const club = TEAMS[p.lg][p.team] || {}
  return { i, lg: p.lg, label: p.name, sub: `${club.name || p.team} · ${p.G} goals`, key: [p.name, p.full, club.name, p.team, LEAGUE_NAME[p.lg], p.nat, p.natCode].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
})
function drawJump(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  $('jlist').innerHTML = LG_ORDER.map(lg => {
    const rows = hits.filter(x => x.lg === lg); if (!rows.length) return ''
    return `<div class="jsec"><div class="jsechd"><img src="leagues/${lg}.png" alt="">${LEAGUE_NAME[lg]}<span>${rows.length}</span></div><div class="jgrid">${rows.map(x =>
      `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>`
  }).join('') || '<p>No player matches.</p>'
  const rows = $('jlist').querySelectorAll<HTMLElement>('.jrow')
  rows.forEach(r => r.onclick = () => { closeMods(); go(+r.dataset.i!) })
  rows[0]?.classList.add('sel')
}
function openJump() { const q = $('jq') as HTMLInputElement; q.value = ''; drawJump(''); openMod('jmodal'); setTimeout(() => q.focus(), 30) }
$('jq').addEventListener('input', e => drawJump((e.target as HTMLInputElement).value))
$('jq').addEventListener('keydown', e => {
  const rows = [...$('jlist').querySelectorAll<HTMLElement>('.jrow')]; if (!rows.length) return
  const k = rows.findIndex(r => r.classList.contains('sel'))
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); rows[k]?.classList.remove('sel')
    const n = (k + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
    rows[n].classList.add('sel'); rows[n].scrollIntoView({ block: 'nearest' })
  }
  if (e.key === 'Enter') (rows[k] || rows[0]).click()
})

addEventListener('keydown', e => {
  if (e.key === 'Escape') return closeMods()
  if (document.querySelector('.mod.on')) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'ArrowRight') step(1)
  else if (e.key === 'ArrowLeft') step(-1)
  else if (e.key === ' ') { e.preventDefault(); togglePlay() }
  else if (e.key === 'Home') go(0)
  else if (e.key === 'End') go(P.length - 1)
  else if (e.key === 'f') fs()
  else if (e.key === 'h' || e.key === '?') openMod('hmodal')
  else if (e.key === 'g' || e.key === '/') { e.preventDefault(); openJump() }
})
Object.assign(window, { go, step, togglePlay, fs, openMod, closeMods, openJump })

// a reload lands where you were, never card 1: #N, else the last card seen
;(function start() {
  let i = 0
  const h = location.hash.replace('#', '')
  if (/^\d+$/.test(h)) i = +h - 1
  else { try { const s = localStorage.getItem('top5.scorers.card'); if (s != null) i = +s } catch { } }
  requestAnimationFrame(() => go(i, false))
  addEventListener('resize', () => go(cur, false))
})()
