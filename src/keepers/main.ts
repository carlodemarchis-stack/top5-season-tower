// Goalkeeper card film: one card per keeper (per club), ranked by saves — like the scorer cards.
// ?lg=ITA… = that league's regular keepers; no lg = All Leagues, the top 25 across the five.
// Data: src/data/keepers-TOP5-<season>.js (scripts/update-keepers.mjs, from the match cards); club colours / fixtures
// from the schedules.
import '../film/film.css'
import { initFilm, initHighlight, initLinks } from '../film/chrome'
type Dict = Record<string, any>
const QS = new URLSearchParams(location.search)
const SEASON = QS.get('season') || '2026-27'
const LG_ORDER = ['ITA', 'ENG', 'ESP', 'FRA', 'GER']
const LEAGUE_NAME: Record<string, string> = { ITA: 'Serie A', ENG: 'Premier League', ESP: 'LaLiga', FRA: 'Ligue 1', GER: 'Bundesliga' }
const LG_IG: Record<string, string> = { ITA: 'seriea', ENG: 'premierleague', ESP: 'laliga', FRA: 'ligue1', GER: 'bundesliga' }
const [{ KEEPERS }, ...TL] = await Promise.all([
  import(`../data/keepers-TOP5-${SEASON}.js`),
  ...LG_ORDER.map(lg => import(`../data/schedule-${lg}-${SEASON}.js`)),
]) as Dict[]
const TEAMS: Record<string, Dict> = Object.fromEntries(LG_ORDER.map((lg, i) => [lg, TL[i].TEAMS]))
const PHOTO_H: Record<string, string> = { ESP: '90%', FRA: '88%', ITA: '82%', ENG: '80%', GER: '80%' }

const RES6: Record<string, [string, string]> = {
  bigW: ['#177a41', '#fff'], W1: ['#3a9e62', '#0b2414'], D: ['#EAB308', '#3d3000'],
  nil: ['#9aa0a8', '#22262d'], L1: ['#dc5c5e', '#2a0709'], bigL: ['#b3323a', '#fff'],
}
const res6 = (gf: number, ga: number) => { const d = gf - ga; return d >= 2 ? 'bigW' : d === 1 ? 'W1' : d === 0 ? (gf === 0 ? 'nil' : 'D') : d === -1 ? 'L1' : 'bigL' }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
const minOf = (c: string) => { const m = String(c).match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
const rnd = (s: number) => { const x = Math.sin(s * 99.13) * 43758.5453; return x - Math.floor(x) }
const logo = (lg: string, code: string) => `logos/${lg === 'FRA' && code === 'BRE' ? 'FRA_BRE' : code}.png`
function lum(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

// ---------- the season goal: every shot on target he faced (the shooter's view), six zones ----------
const PL: Record<string, number[]> = { bl: [.17, .74], br: [.83, .74], tl: [.17, .27], tr: [.83, .27], c: [.5, .52], tc: [.5, .25], bc: [.5, .76], pl: [0, .5], pr: [1, .5], bar: [.5, 0] }
// goals are red — unless the club's own colour is a red too, then black, so a save and a goal never look alike
const rgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const goalInk = (c: string) => Math.hypot(...rgb(c).map((v, k) => v - rgb('#b3323a')[k])) < 130 ? '#15181d' : '#b3323a'
const zoneOf = (p: string) => p === 'tl' || p === 'tr' || p === 'bl' || p === 'br' || p === 'tc' ? p : 'bc'
function bigGoal(k: Dict, c: string) {
  const W = 300, H = 100, ox = 30, oy = 22, shots = k.shots.filter((s: string[]) => PL[s[0]])
  const Z: Dict = {}; for (const [p, r] of shots) { const z = zoneOf(p); (Z[z] ||= { sv: 0, g: 0 })[r === 'g' ? 'g' : 'sv']++ }
  const ZX: Record<string, number> = { tl: 0, tc: 1, tr: 2, bl: 0, bc: 1, br: 2 }
  const zones = Object.entries(ZX).map(([z, i]) => { const v = Z[z] || { sv: 0, g: 0 }, n = v.sv + v.g, top = z[0] === 't'
    return n ? `<text x="${ox + (i + .5) * W / 3}" y="${top ? oy - 8 : oy + H + 15}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#15181d" opacity=".8">${v.sv}/${n} saved</text>` : '' }).join('')
  const pts = shots.map(([p, r]: string[], i: number) => { const [px, py] = PL[p], x = ox + px * W + (rnd(i + 3) - .5) * 26, y = oy + py * H + (rnd(i + 9) - .5) * 18
    return r === 'g' ? `<circle cx="${x}" cy="${y}" r="6" fill="${goalInk(c)}" stroke="#fff" stroke-width="2"/>` : `<circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="${c}" stroke-width="2.4"/>` }).join('')
  return `<svg viewBox="0 0 360 148" preserveAspectRatio="xMidYMid meet"><defs><pattern id="nt${k.key}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#dfe3e6" stroke-width=".8"/></pattern></defs>
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="url(#nt${k.key})"/>
    <g stroke="#e3e6ea" stroke-width="1" stroke-dasharray="3 3"><line x1="${ox + W / 3}" x2="${ox + W / 3}" y1="${oy}" y2="${oy + H}"/><line x1="${ox + 2 * W / 3}" x2="${ox + 2 * W / 3}" y1="${oy}" y2="${oy + H}"/><line x1="${ox}" x2="${ox + W}" y1="${oy + H / 2}" y2="${oy + H / 2}"/></g>
    <path d="M${ox} ${oy + H}V${oy}H${ox + W}V${oy + H}" fill="none" stroke="#15181d" stroke-width="5" stroke-linejoin="round"/>
    <line x1="6" x2="354" y1="${oy + H}" y2="${oy + H}" stroke="#c9ced4" stroke-width="1.5"/>${zones}${pts}</svg>`
}

// ---------- the season in two rows: one box per fixture of his club — result colour, his saves, goals against above ----------
const matchHref = (lg: string, md: number, id: string) => SEASON === '2026-27' ? ` data-href="matches.html?lg=${lg}&md=${md}&m=${id}"` : ''
function strip(k: Dict, club: Dict) {
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w), byId: Dict = Object.fromEntries(k.games.map((g: Dict) => [g.id, g])), half = Math.ceil(all.length / 2)
  const maxMarks = Math.max(1, ...k.games.map((g: Dict) => g.conc))
  const cell = (g: Dict) => { const m = byId[g.id], at = g.ha === 'A' ? '@' : ''
    const miss = !m && (k.missed || []).find((x: any[]) => x[0] === g.id)
    if (miss) { const [bg] = RES6[res6(miss[1], miss[2])]
      return `<div class="c2 dnp"${matchHref(k.lg, g.w, g.id)} title="MD${g.w} · ${g.ha === 'H' ? 'vs' : 'at'} ${esc(g.opp)} ${miss[1]}-${miss[2]} · he didn't start"><div class="mk"></div><div class="bx" style="background:${bg};color:#15181d"><span class="vl" style="height:100%"></span><b>–</b></div><div class="op">${at}${esc(g.opp)}</div></div>` }
    if (!m) return `<div class="c2 up"><div class="mk"></div><div class="bx"></div><div class="op">${at}${esc(g.opp)}</div></div>`
    const [bg, fg] = RES6[res6(m.gf, m.ga)]
    return `<div class="c2" data-mid="${m.id}"${matchHref(k.lg, g.w, m.id)} title="MD${m.md} · ${m.ha === 'H' ? 'vs' : 'at'} ${esc(m.opp)} ${m.gf}-${m.ga} · ${m.sv} saves · ${m.conc} conceded${m.min < 90 ? ` · ${m.min}'` : ''}">
      <div class="mk">${Array.from({ length: m.conc }, () => '<i class="ga"></i>').join('')}</div>
      <div class="bx" style="background:${bg};color:${fg}"><b>${m.sv}</b></div><div class="op">${at}${esc(m.opp)}</div></div>` }
  const row = (gs: Dict[], lbl: string) => `<div class="row2"><div class="rl">${lbl}</div><div class="cells" style="--n:${half};--mk:${maxMarks}">${gs.map(cell).join('')}</div></div>`
  return `<div class="s2">${row(all.slice(0, half), `MD 1–${half}`)}${row(all.slice(half), `MD ${half + 1}–${all.length}`)}</div>`
}

function card(k: Dict) {
  const club = TEAMS[k.lg][k.team] || {}, c = club.primary || '#555', light = lum(c) > .55
  const hlInk = lum(c) > 0.183 ? '#15181d' : '#fff'
  const ini = k.name.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('')
  const mid = (md: number) => k.games.find((g: Dict) => g.md === md)?.id
  const conceded = [...k.conceded].sort((a, b) => a[3] - b[3] || minOf(a[0]) - minOf(b[0])).map(([min, by, kind, md, opp]: any[]) =>
    `<div class="cg" data-mid="${mid(md)}"><b>${esc(min)}</b>${esc(by)}${kind === 'pen' ? ' <em>PEN</em>' : kind === 'og' ? ' <em>OG</em>' : kind === 'head' ? ' <em>HEAD</em>' : kind === 'fk' ? ' <em>FK</em>' : ''}<small>MD${md} · ${esc(opp)}</small></div>`).join('')
  return `<section class="card" id="k-${k.key}" style="--c:${c};--c2:${light ? '#15181d' : c};--ink:${light ? '#15181d' : '#fff'};--hlink:${hlInk};--ph:${PHOTO_H[k.lg]}">
    <div class="pan">
      <img class="wm" src="${logo(k.lg, k.team)}" alt="" onerror="this.remove()">
      <div class="rk">#${k.rank}</div>
      <div class="gbig"><b>${k.SV}</b><span>save${k.SV === 1 ? '' : 's'}</span></div>
      ${k.photo ? `<img class="ph" src="${k.photo}" alt="${esc(k.name)}">` : `<div class="ini">${esc(ini)}</div>`}
    </div>
    <div class="body">
      <div>
        <h1 style="--len:${[...k.name].length};--word:${Math.max(...k.name.split(/[\s-]+/).map((w: string) => [...w].length))}">${esc(k.name)}</h1>
        <div class="meta" style="margin-top:8px">${['Goalkeeper', k.age != null && `<b>${k.age}</b> yrs`, esc(k.nat), k.n && `#${esc(k.n)}`].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="club"><img src="${logo(k.lg, k.team)}" alt="" onerror="this.remove()">${esc(club.name || k.team)}
        <span class="tl">${LEAGUE_NAME[k.lg]}${k.tpos ? ` · <b>${ord(k.tpos)}</b>` : ''}</span></div>
      <div class="nums">
        <div class="n big"><b>${k.SV}</b><span>Saves${k.PS ? ` · ${k.PS} pen${k.PS > 1 ? 's' : ''}` : ''}</span></div>
        <div class="n"><b>${k.GA}</b><span>Conceded</span></div>
        <div class="n"><b>${k.PCT ?? '–'}%</b><span>Save %</span></div>
        <div class="n"><b>${k.CS}</b><span>Clean sheets</span></div>
        <div class="n"><b>${k.GP}</b><span>Games</span></div>
        <div class="n"><b>${k.PF ? `${k.PS}/${k.PF}` : '–'}</b><span>Pens saved</span></div>
      </div>
      ${strip(k, club)}
      <div class="gwrap">
        <div><div class="sec">Every shot on target he faced</div><div class="gf">${bigGoal(k, c)}</div>
          <div class="gleg"><span><i style="background:#fff;border:2.4px solid ${c}"></i>saved</span><span><i style="background:${goalInk(c)}"></i>goal</span><span style="color:#9aa0a8">· the shooter's view · each zone: saved / faced</span></div></div>
        <div><div class="sec">The goals against him · ${k.GA}</div><div class="clist">${conceded || '<span style="color:#9aa0a8;font-size:12px">none</span>'}</div></div>
      </div>
    </div>
  </section>`
}

// ---------- the lists, the film ----------
const LIST = LG_ORDER.includes(QS.get('lg') || '') ? QS.get('lg')! : 'ALL'
const listOf = (l: string): Dict[] => (KEEPERS.lists[l] || []).map(([key, rank]: [string, number]) => ({ ...KEEPERS.keepers[key], rank }))
const P: Dict[] = listOf(LIST)
const listUrl = (l: string) => { const q = new URLSearchParams(location.search); l === 'ALL' ? q.delete('lg') : q.set('lg', l); const qs = q.toString(); return location.pathname + (qs ? '?' + qs : '') + '#1' }   // a top-bar switch starts at card 1
const $ = (id: string) => document.getElementById(id)!
const film = $('film')
film.innerHTML = P.map(card).join('')
const lsize = (l: string) => listOf(l).length
$('lgs').innerHTML = `<a class="lgb all${LIST === 'ALL' ? ' on' : ''}" href="${listUrl('ALL')}" title="The top 25 keepers by saves across the five leagues · ${lsize('ALL')}"><b>All Leagues</b><span>${lsize('ALL')}</span></a>` +
  LG_ORDER.map(lg => `<a class="lgb${LIST === lg ? ' on' : ''}" data-lg="${lg}" href="${listUrl(lg)}" title="${LEAGUE_NAME[lg]} goalkeepers · ${lsize(lg)}"><img src="leagues/${lg}.png" alt="${LEAGUE_NAME[lg]}"><span>${lsize(lg)}</span></a>`).join('')
const upd = new Date(KEEPERS.updated)
$('cnote').innerHTML = `${P.length} goalkeepers: ${LIST === 'ALL' ? `the top 25 by saves across the five leagues, plus everyone tied on ${KEEPERS.cut}` : `every ${LEAGUE_NAME[LIST]} club's first-choice keeper and anyone with three or more starts`}, ranked by saves. Season ${KEEPERS.season.replace('-', '/')}, updated ${upd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`

function onPaint(i: number) {
  const k = P[i]
  $('ctx').innerHTML = `${LIST === 'ALL' ? 'Goalkeepers' : `${LEAGUE_NAME[LIST]} goalkeepers`} ${SEASON.replace('-', '/')} · by saves · <b>${esc(k.name)}</b> · ${k.SV} saves, ${k.PCT ?? '–'}%`
  if (LIST === 'ALL') $('lgs').querySelectorAll<HTMLElement>('.lgb[data-lg]').forEach(b => b.classList.toggle('cur', b.dataset.lg === k.lg))
  const meta = (n: string, v: string) => document.querySelector(`meta[name="agwas:${n}"]`)?.setAttribute('content', v)
  meta('mentions', LG_IG[k.lg]); meta('title', `${k.name} · ${k.SV} saves · ${LIST === 'ALL' ? 'top-5 leagues' : LEAGUE_NAME[LIST]}`)
}

// search: a keeper or a club; a number jumps to that card
const INDEX = P.map((k, i) => ({ i, label: k.name, sub: `${TEAMS[k.lg][k.team]?.name || k.team} · ${k.SV} saves`,
  key: [k.name, k.team, TEAMS[k.lg][k.team]?.name, LEAGUE_NAME[k.lg]].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }))
function jumpHTML(q: string) {
  const qq = q.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const hits = /^\d+$/.test(qq) ? INDEX.filter(x => x.i === +qq - 1) : INDEX.filter(x => qq.split(/\s+/).every(w => x.key.includes(w)))
  return hits.length ? `<div class="jsec"><div class="jsechd">${LIST === 'ALL' ? 'All Leagues' : `<img src="leagues/${LIST}.png" alt="">${LEAGUE_NAME[LIST]}`}<span>${hits.length}</span></div><div class="jgrid">${hits.map(x =>
    `<div class="jrow" data-i="${x.i}"><span class="jn">${x.i + 1}</span><span class="jl">${esc(x.label)}<span class="jt">${esc(x.sub)}</span></span></div>`).join('')}</div></div>` : '<p>No keeper found.</p>'
}

// hover / tap a game: its goals against light up in the club colour
initLinks(film)
initHighlight(film, '[data-mid]', k => `[data-mid="${k}"]`, el => el.dataset.mid!)
initFilm({ count: P.length, key: 'top5.keepers.card' + (SEASON === '2026-27' ? '' : '.' + SEASON) + (LIST === 'ALL' ? '' : '.' + LIST), onPaint, jumpHTML, self: 'keepers.html' })
