// The Goals views: a club's (the team card's Goals tab and its full view) and a player's (his card's Goals tab) — where
// each goal went in (the goal, from the shooter's side) over where the shots came from, with side columns of numbers
// and bars that filter the goals. Shot maps from FotMob (scripts/update-shots.mjs), loaded when a view opens.
import './goals.css'
import { esc } from './cards'
import { initTip } from './chrome'
type Dict = Record<string, any>
const SHOT_FILES = import.meta.glob('../data/shots-*.js')
const SHOTS: Record<string, Promise<Dict>> = {}
export const shotsOf = (lg: string, season: string) => SHOTS[lg + season] ??= (SHOT_FILES[`../data/shots-${lg}-${season}.js`]?.() ?? Promise.resolve({ SHOTS: {} })).then(m => (m as Dict).SHOTS || {})
const SIT: Record<string, string> = { o: 'open play', c: 'counter-attack', s: 'set piece', k: 'corner', f: 'free kick', p: 'penalty', t: 'throw-in' }
const BODY: Record<string, string> = { r: 'right foot', l: 'left foot', h: 'header', x: '' }
const GTIPS = new Map<string, string>()   // a goal's hover card, by its key
// the 15-minute spell of a goal's minute (the shot map writes 45+2 as 45.02): stoppage time is its own spell
const WHEN = ['1–15', '16–30', '31–45', '45+', '46–60', '61–75', '76–90', '90+']
const whenOf = (m: number) => { const base = Math.floor(m), extra = Math.round((m - base) * 100)
  return base >= 90 && extra ? '90+' : base >= 45 && base < 46 && extra ? '45+' : base <= 15 ? '1–15' : base <= 30 ? '16–30' : base <= 45 ? '31–45' : base <= 60 ? '46–60' : base <= 75 ? '61–75' : base <= 90 ? '76–90' : '90+' }
const GROW = new Map<string, string>(), GV = new Map<string, Dict>()   // a grouped goal's row in the list card, and its filter values
// the list card of a group of goals from one spot: every goal (the ones the filters leave), a row each — the first six on
// hover, all of them once pinned (a click), each row opening its match card
function stackTip(el: HTMLElement) {
  const keys = (el.dataset.vis ?? el.dataset.gs!).split(' ').filter(Boolean), pinned = document.getElementById('mtip')?.classList.contains('pinned')
  const rows = pinned ? keys : keys.slice(0, 6)
  return `<div class="mt-top">${keys.length} goals from this spot${el.dataset.sit === 'penalty' ? ' · penalties' : ''}</div><div class="gsl">${rows.map(k => GROW.get(k)).join('')}</div>
    <div class="gsm">${!pinned && keys.length > 6 ? `+${keys.length - 6} more · ` : ''}${pinned ? 'click a goal for its match · Esc or click outside to close' : 'click the dot to keep this open'}</div>`
}
// a club's goals and the shots behind them, from the match records + FotMob's shot maps: F (its shots) and A (the
// opponents'), and the pieces the views are drawn from — kpis (a side column), col (the goal over the half pitch),
// scorers (the full view's list); squad: the club's players (their roles), thumb: a player's squad photo by id
export function goalKit(lg: string, code: string, recs: Dict[], S: Dict, squad: Dict[], thumb: (id: string) => string | undefined) {
  const F: Dict[] = [], A: Dict[] = []
  // the scorer's role in his club's squad (goals scored: always this club's players)
  const ROLE: Record<string, string> = { G: 'goalkeepers', D: 'defenders', M: 'midfielders', F: 'forwards' }, role: Record<string, string> = Object.fromEntries(squad.map((p: Dict) => [String(p.espnId), ROLE[p.pos] || '']))
  for (const M of recs) {
    const rows = S[M.id] as any[][] | undefined; if ((M.h !== code && M.a !== code) || !rows) continue
    const side = M.h === code ? 'h' : 'a', op = side === 'h' ? 'a' : 'h', m = { id: M.id, gf: M.score[side], ga: M.score[op] }, g = { w: M.md, opp: M[op], ha: side === 'h' ? 'H' : 'A' }
    rows.forEach((r, i) => { if (r[5] === 'og') return
      const T = r[0] === 'h' ? M.home : M.away, p = (T.players as Dict[]).find(x => String(x.id) === r[8])
      const sh = { pid: String(r[8] || ''), by: p ? (p.st ? 'starters' : 'off the bench') : '', role: role[String(r[8])] || '', key: `${code}-${m.id}-${i}`,   // the club in the key: both clubs' tabs draw the same match
         md: g.w, opp: g.opp, ha: g.ha, gf: m.gf, ga: m.ga, mid: m.id, side: r[0], min: r[1], x: r[2], y: r[3], xg: r[4], out: r[5], sit: r[6], body: r[7], name: p?.name || '', gx: r[9], gy: r[10],
        ast: r[5] === 'g' ? (M.goals as Dict[]).find(q => q.s === r[0] && String(q.byId) === r[8] && Math.abs(parseInt(q.min) - Math.floor(r[1])) <= 1)?.ast : null }
      ;(r[0] === side ? F : A).push(sh)
      // the goal's card: the scorer's cutout (his club's squad photo) on the left, then the game, his name, the
      // minute, xG and distance, and how it came
      if (r[5] === 'g') { const ph = thumb(r[8]), dist = Math.round(Math.hypot(105 - r[2], 34 - r[3]))
        // the keeper beaten: the other side's starting keeper, or whoever replaced him before that minute
        const D = r[0] === 'h' ? M.away : M.home, gk0 = (D.players as Dict[]).find(x => x.st && x.pos === 'G')
        const swap = gk0 && (M.subs as Dict[]).find(x => String(x.off) === String(gk0.id) && parseInt(x.min) <= r[1])
        const gk = swap ? (D.players as Dict[]).find(x => String(x.id) === String(swap.on)) : gk0, gph = gk && thumb(String(gk.id))
        GTIPS.set(sh.key, `<div class="gtip">${ph ? `<img src="${ph}" alt="" onerror="this.style.visibility='hidden'">` : `<i>${esc((sh.name || '?').split(/\s+/).map((w: string) => w[0]).slice(0, 2).join(''))}</i>`}
          <div><div class="mt-top">MD ${g.w} · ${g.ha === 'H' ? 'vs' : 'at'} ${esc(g.opp)} · ${m.gf}-${m.ga}</div><div class="gtn">${esc(sh.name || '?')}</div>
          <div class="gtk"><span><b>${Math.floor(r[1])}′</b>minute</span><span><b>${r[4].toFixed(2)}</b>xG · a ${Math.max(1, Math.round(r[4] * 100))}% chance</span><span><b>${dist} m</b>out</span></div>
          <div class="gts">${[SIT[r[6]], BODY[r[7]], sh.ast && `assist <b>${esc(sh.ast)}</b>`].filter(Boolean).join(' · ')}</div></div>
          ${gk ? `<div class="gtgk">${gph ? `<img src="${gph}" alt="" onerror="this.style.visibility='hidden'">` : ''}<span>${esc(gk.name.split(' ').slice(1).join(' ') || gk.name)}</span><em>in goal</em></div>` : '<span></span>'}</div>`) }
    })
  }
  const href = (s: Dict) => ` data-href="matches.html?lg=${lg}&md=${s.md}&m=${s.mid}"`
  // a goal's three filter values (the side column's bars): how it came, with what, from where
  const inBox = (s: Dict) => s.x >= 88.5 && s.y >= 13.84 && s.y <= 54.16
  // goals from (nearly) one spot: grouped, each group's members within 1.2 m of its first
  const groups = (G: Dict[]) => { const out: Dict[][] = []; for (const g of G) { const k = out.find(o => Math.hypot(o[0].x - g.x, o[0].y - g.y) <= 1.2); k ? k.push(g) : out.push([g]) } return out }
  const fv = (s: Dict) => ` data-how="${SIT[s.sit] || 'other'}" data-with="${BODY[s.body] || ''}" data-from="${inBox(s) ? 'inside the box' : 'outside'}" data-when="${whenOf(s.min)}" data-by="${s.by}" data-role="${s.role}" data-who="${s.pid}"`
  // the half pitch, attacking up (68 wide, the 35 m in front of the goal): ● a goal · ○ saved · × the rest. FotMob's y
  // runs from the shooter's RIGHT (checked against ESPN's "left / right side of the box": 1,453 to 4), so x = 68 − y
  const pitch = (L: Dict[], fill: string) => `<svg class="gnp" viewBox="0 -1 68 36"><rect x="0" y="0" width="68" height="35" rx=".8" fill="#e8eee8"/><g fill="none" stroke="#fff" stroke-width=".4"><rect x="13.84" y="0" width="40.32" height="16.5"/><rect x="24.84" y="0" width="18.32" height="5.5"/><path d="M26.7 16.5a9.15 9.15 0 0 0 14.6 0"/></g><rect x="30.34" y="-1" width="7.32" height="1" fill="#15181d"/>
    ${L.filter(s => s.x >= 70 && s.out !== 'g').map(s => s.out === 's' ? `<circle cx="${68 - s.y}" cy="${105 - s.x}" r=".55" fill="#fff" style="stroke:${fill}" stroke-width=".3" opacity=".6"/>` : `<path d="M${68 - s.y - .45} ${105 - s.x - .45}l.9 .9m0-.9l-.9 .9" stroke="#9aa0a8" stroke-width=".25" opacity=".55"/>`).join('')}
    ${groups(L.filter(s => s.out === 'g')).map(G => { const s = G[0], cx = 68 - s.y, cy = Math.min(33.8, Math.max(1.3, 105 - s.x))
      if (G.length === 1) return `<circle class="gm" data-gk="${s.key}"${href(s)}${fv(s)} cx="${cx}" cy="${cy}" r="1.2" style="fill:${fill}" stroke="#fff" stroke-width=".3"/>`
      // several goals from one spot (every penalty, tap-ins): one dot with the count; hover lists them, click pins the list
      for (const g of G) { GV.set(g.key, { how: SIT[g.sit] || 'other', with: BODY[g.body] || '', from: inBox(g) ? 'inside the box' : 'outside', when: whenOf(g.min), by: g.by, role: g.role, who: g.pid })
        GROW.set(g.key, `<a class="gsr" href="matches.html?lg=${lg}&md=${g.md}&m=${g.mid}"><b>${Math.floor(g.min)}′</b><span>MD ${g.md} · ${g.ha === 'H' ? 'vs' : 'at'} ${esc(g.opp)} ${g.gf}-${g.ga}</span><span class="nm">${esc(g.name || '?')}</span><em>${g.xg.toFixed(2)} xG</em></a>`) }
      return `<g class="gm gst" data-gs="${G.map(g => g.key).join(' ')}" data-sit="${esc(SIT[s.sit] || '')}"><circle cx="${cx}" cy="${cy}" r="1.6" style="fill:${fill}" stroke="#fff" stroke-width=".3"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="900">${G.length}</text></g>` }).join('')}</svg>`
  // the goal, from the shooter's side: posts at 0 and 2, the bar at .667 from the ground — goals only
  const frame = (L: Dict[], fill: string) => `<svg class="gnf" viewBox="0 0 116 40"><rect x="8" y="4" width="100" height="33.3" fill="url(#gnet)"/><path d="M8 37.3V4H108V37.3" fill="none" stroke="#15181d" stroke-width="1.8" stroke-linejoin="round"/><line x1="0" x2="116" y1="37.3" y2="37.3" stroke="#c9ced4" stroke-width=".6"/>
    ${L.filter(s => s.out === 'g' && s.gx != null).map(s => `<circle class="gm" data-gk="${s.key}"${href(s)}${fv(s)} cx="${(8 + s.gx * 50).toFixed(1)}" cy="${(4 + (.6667 - s.gy) * 50).toFixed(1)}" r="2.2" style="fill:${fill}" stroke="#fff" stroke-width=".8"/>`).join('')}</svg>`
  const xg = (L: Dict[]) => L.reduce((a, s) => a + s.xg, 0), gN = (L: Dict[]) => L.filter(s => s.out === 'g').length
  // a side column of numbers: goals, shots, xG and goals minus xG, then small bars — how the goals came, with what,
  // from where (inside / outside the box)
  // each bar is a filter: click to show only those goals in the column's net and pitch (src: the click handler below)
  const bars = (title: string, rows: [string, number][], fill: string) => { const mx = Math.max(1, ...rows.map(r => r[1]))
    return rows.length ? `<div class="gkb"><div class="gkt">${title}</div>${rows.map(([k, n]) => `<div class="gkr" data-g="${title.toLowerCase()}" data-v="${k}" data-n="${n}" data-mx="${mx}" title="Show only these goals (click again to clear)"><span>${k}</span><u class="bw"><s style="width:${Math.round(n / mx * 100)}%;background:${fill}"></s><i style="width:${Math.round(n / mx * 100)}%;background:${fill}"></i></u><b>${n}</b></div>`).join('')}</div>` : '' }
  const count = (L: Dict[], key: (s: Dict) => string) => Object.entries(L.reduce((o: Dict, s) => (o[key(s)] = (o[key(s)] || 0) + 1, o), {})).sort((a: any, b: any) => b[1] - a[1]) as [string, number][]
  // me: a player's column — the club's goals in the bars, his part solid (a standing filter: data-fix), his own shots and xG
  const kpis = (lb: string, L: Dict[], fill: string, og: number, help = '', big = false, me = '') => { const G = L.filter(s => s.out === 'g')
    const Ls = me ? L.filter(s => s.pid === me) : L, d = gN(Ls) - xg(Ls), sot = Ls.filter(s => s.out === 'g' || s.out === 's').length
    const nIn = G.filter(inBox).length
    return `<div class="gk" data-side="${lb}"${me ? ` data-fix="who=${me}"` : ''}><div class="sec">${me ? 'His goals' : lb}${help}</div>
      <div class="gkn"><b data-n="${gN(L)}">${gN(me ? Ls : L)}</b><span><i class="gof">${me ? `of ${gN(L)} ` : ''}</i>goals${og ? ` <em>+${og} own goal${og === 1 ? '' : 's'}</em>` : ''}</span></div>
      <div class="gks"><span><b>${Ls.length}</b> shots · <b>${sot}</b> on target</span><span>xG <b>${xg(Ls).toFixed(1)}</b><i class="ghelp xgh" aria-label="What is xG">?</i> · <em class="${(lb === 'Conceded' ? d <= 0 : d >= 0) ? 'up' : 'dn'}"><b>${d >= 0 ? '+' : ''}${d.toFixed(1)}</b> vs xG</em></span></div>
      ${bars('How', count(G, s => SIT[s.sit] || 'other'), fill)}${bars('With', count(G.filter(s => BODY[s.body]), s => BODY[s.body]), fill)}${bars('From', ([['inside the box', nIn], ['outside', G.length - nIn]] as [string, number][]).filter(r => r[1]), fill)}${lb === 'Scored' ? bars('By', (['starters', 'off the bench'].map(k => [k, G.filter(g => g.by === k).length]) as [string, number][]).filter(r => r[1]), fill) : ''}${big ? bars('Role', (Object.values(ROLE).map(k => [k, G.filter(g => g.role === k).length]) as [string, number][]).filter(r => r[1]), fill) : ''}${when(G, fill)}</div>` }
  // When: the goals by 15-minute spell, stoppage time apart (45+, 90+) — eight small columns, each a filter too
  const when = (G: Dict[], fill: string) => { const n = WHEN.map(w => G.filter(g => whenOf(g.min) === w).length), mx = Math.max(1, ...n)
    return `<div class="gkb"><div class="gkt">When</div><div class="gkh">${WHEN.map((w, i) => `<div class="gkr gkc"${n[i] ? ` data-g="when" data-v="${w}" data-n="${n[i]}" title="${w}': ${n[i]} goal${n[i] === 1 ? '' : 's'} — show only these"` : ''}><b${w.endsWith('+') ? ' class="xt"' : ''}>${n[i] || ''}</b><u class="cw" style="height:${Math.max(2, Math.round(n[i] / mx * 34))}px"><s style="background:${fill}"></s><i style="height:100%;background:${fill}"></i></u><span${w.endsWith('+') ? ' class="xt"' : ''}>${w.replace(/^\d+–/, '')}</span></div>`).join('')}</div></div>` }
  const col = (L: Dict[], fill: string, side: string) => `<div class="gcol" data-side="${side}">${frame(L, fill)}${pitch(L, fill)}</div>`
  // the scorers (a filter group too): photo, name, a bar, goals — most first
  const scorers = (G: Dict[], fill: string) => { const by: Record<string, Dict> = {}
    for (const g of G) if (g.pid) { const o = (by[g.pid] ||= { id: g.pid, name: g.name, n: 0, xg: 0 }); o.n++; o.xg += g.xg }
    const L = Object.values(by).sort((a, b) => b.n - a.n || b.xg - a.xg), mx = Math.max(1, ...L.map(x => x.n))
    return `<div class="gk gksc" data-side="Scored"><div class="sec">Scorers<span class="gsum"><b>${L.length}</b> players</span></div><div class="gkb">${L.map(x => { const ph = thumb(x.id)
      return `<div class="gkr gkp" data-g="who" data-v="${x.id}" data-n="${x.n}" data-mx="${mx}" title="${esc(x.name)}: ${x.n} goal${x.n === 1 ? '' : 's'}, xG ${x.xg.toFixed(1)} — show only his goals">${ph ? `<img src="${ph}" alt="" loading="lazy">` : '<i class="nop"></i>'}<span>${esc(x.name)}</span><u class="bw"><s style="width:${x.n / mx * 100}%;background:${fill}"></s><i style="width:${x.n / mx * 100}%;background:${fill}"></i></u><b>${x.n}</b></div>` }).join('')}</div></div>` }
  return { F, A, gN, kpis, col, scorers }
}
// the goal net's mesh, once per page (the goal drawings fill with it)
export const GNET = `<svg width="0" height="0" style="position:absolute"><defs><pattern id="gnet" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="#dfe3e6" stroke-width=".4"/></pattern></defs></svg>`
// xG, explained where it is used (the "?" by each column's xG)
export const XG_HELP = `<div class="mt-top">xG — expected goals</div><div class="ghl"><p>How likely a shot was to go in, judged from many thousands of similar shots: where it was taken, the angle, foot or head, the kind of chance. <b>0.90</b> is a tap-in (a 90% chance); <b>0.03</b> a hopeful shot from 25 metres (3%).</p>
  <p>Add up every shot and you get the goals a team <b>should</b> have scored. <b>vs xG</b> is goals minus that: above zero, finishing better than the chances (or luck); below, worse. For goals conceded, below zero means the keeper and defence did better than the chances allowed.</p></div>`
// the Goals tab's filters: a bar on/off; a goal shows when it matches every group that has a bar on (within a group,
// any of its bars) — the big number then counts what is shown, "of 21"
export function applyGoalFilters(gk0: HTMLElement) {
  const side = gk0.dataset.side, gt = gk0.closest('.gt')!, gks = [...gt.querySelectorAll<HTMLElement>(`.gk[data-side="${side}"]`)], gk = gks[0]
  const want: Record<string, string[]> = {}
  const fix = gk.dataset.fix?.split('='); if (fix) want[fix[0]] = [fix[1]]   // a player's column: his goals, always
  gks.forEach(k => k.querySelectorAll<HTMLElement>('.gkr.on').forEach(r => (want[r.dataset.g!] ||= []).push(r.dataset.v!)))
  const any = Object.keys(want).length; gks.forEach(k => k.classList.toggle('filt', !!any))
  const col = gt.querySelector<HTMLElement>(`.gcol[data-side="${side}"]`)!
  const ok = (v: Dict) => Object.entries(want).every(([k, vs]) => vs.includes(v[k] || ''))
  // a player's column keeps the club's other goals on show, faded (dim) — elsewhere a goal left out is hidden
  const soft = !!fix, off = soft ? 'dim' : 'hid'
  col.querySelectorAll<SVGElement>('.gm[data-gk]').forEach(g => g.classList.toggle(off, !ok(g.dataset)))
  // a group: the goals that pass, its count redrawn; hidden (faded) when none does
  let inGroups = 0
  col.querySelectorAll<SVGElement>('.gst').forEach(g => { const all = g.dataset.gs!.split(' '), vis = all.filter(k => ok(GV.get(k) || {}))
    // one goal left of a group: drawn as a plain goal (no number), its own card on hover
    g.dataset.vis = (vis.length || !soft ? vis : all).join(' '); g.classList.toggle(off, !vis.length); g.classList.toggle('one', vis.length === 1)
    g.querySelector('text')!.textContent = vis.length > 1 ? String(vis.length) : !vis.length && soft ? String(all.length) : ''; inGroups += vis.length })
  const n = gk.querySelector<HTMLElement>('.gkn b')!, shown = col.querySelectorAll(`.gnp .gm[data-gk]:not(.${off})`).length + inGroups
  n.textContent = any ? String(shown) : n.dataset.n!; gk.querySelector('.gof')!.textContent = any ? `of ${n.dataset.n} ` : ''
  // every bar recounted within the OTHER groups' filters (its own group stays whole, so a sibling can still be added);
  // the full-season bar stays behind as a ghost
  const goals: Dict[] = [...col.querySelectorAll<HTMLElement>('.gnp .gm[data-gk]')].map(g => g.dataset)
  col.querySelectorAll<HTMLElement>('.gst').forEach(g => g.dataset.gs!.split(' ').forEach(k => goals.push(GV.get(k) || {})))
  gks.flatMap(k => [...k.querySelectorAll<HTMLElement>('.gkr[data-g]')]).forEach(r => {
    const grp = r.dataset.g!, full = +r.dataset.n!
    const cnt = any ? goals.filter(v => v[grp] === r.dataset.v && Object.entries(want).every(([k, vs]) => k === grp || vs.includes(v[k] || ''))).length : full
    r.querySelector('b')!.textContent = cnt || r.classList.contains('gkc') ? String(cnt || '') : '0'
    const bar = r.querySelector<HTMLElement>('u > i')!
    if (r.classList.contains('gkc')) bar.style.height = `${full ? cnt / full * 100 : 0}%`
    else bar.style.width = `${(cnt / +r.dataset.mx!) * 100}%`
    r.classList.toggle('zero', !!any && !cnt)
  })
}
// the goal dots keep one size on screen however big the drawings get (a bigger pitch = more room between goals):
// --u = drawing units per screen pixel, the dots' radius is set in pixels × --u
export function sizeGoalDots() {
  document.querySelectorAll<SVGSVGElement>('.gt svg').forEach(sv => { const w = sv.clientWidth; if (w) sv.style.setProperty('--u', String(sv.viewBox.baseVal.width / w)) })
}
addEventListener('resize', sizeGoalDots)
// the handlers, once per film: the bars as filters (a click elsewhere clears them), the "?" help (help: the card's own
// text; the xG "?" explains xG), a goal's hover card and the goal lit in the net and on the pitch
export function initGoals(film: HTMLElement, help: (el: HTMLElement) => string) {
  film.addEventListener('click', e => {
    const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.gkr[data-g]')
    if (row) { row.classList.toggle('on'); applyGoalFilters(row.closest<HTMLElement>('.gk')!); return }
    // a click anywhere else (not on a goal, which opens its match or its list) clears every filter
    if (t.closest('.gm, .gst')) return
    film.querySelectorAll<HTMLElement>('.gk.filt').forEach(gk => { gk.querySelectorAll('.gkr.on').forEach(r => r.classList.remove('on')); applyGoalFilters(gk) })
  })
  initTip(film, '.ghelp', el => el.classList.contains('xgh') ? XG_HELP : help(el))
  // a goal in the Goals tab: its card above the column's goal, the same goal lit in the net and on the pitch, the rest faded
  // (own class names — .gm, .lit: the film's .gd / .hl styles scale and clear on hover)
  const oneOf = (el: HTMLElement) => el.classList.contains('one') ? el.dataset.vis! : null   // a group filtered down to one goal
  initTip(film, '.gm[data-gk], .gst', el => el.dataset.gs ? (oneOf(el) ? GTIPS.get(oneOf(el)!) || '' : stackTip(el)) : GTIPS.get(el.dataset.gk!) || '',
    // in the full view: laid on the Scorers column, its foot level with the pitch's, so the net and pitch stay free to
    // hover and click
    el => el.closest('.gto')?.querySelector<HTMLElement>('.gksc') || el.closest<HTMLElement>('.gcol')?.querySelector<HTMLElement>('.gnf') || el, true, el => !!el.dataset.gs && !oneOf(el),
    el => el.closest('.gto')?.querySelector<HTMLElement>('.gnp'))
  film.addEventListener('mouseover', e => {
    if (document.getElementById('mtip')?.classList.contains('pinned')) return   // a pinned list keeps its goals lit
    const d = (e.target as Element).closest<SVGElement>('.gm[data-gk], .gst'), gt = (e.target as Element).closest<HTMLElement>('.gt')
    film.querySelectorAll('.gt.lit').forEach(g => { if (g !== gt || !d) { g.classList.remove('lit'); g.querySelectorAll('.gm.on').forEach(x => x.classList.remove('on')) } })
    if (!d || !gt) return
    // the goals to light: the dot's own (a group: all of its visible goals), in the net and on the pitch; a goal inside a
    // group lights the group's dot too
    const keys = d.dataset.gs ? (d.dataset.vis ?? d.dataset.gs).split(' ') : [d.dataset.gk!]
    gt.classList.add('lit'); gt.querySelectorAll('.gm.on').forEach(x => x.classList.remove('on')); d.classList.add('on')
    keys.forEach(k => gt.querySelectorAll(`.gm[data-gk="${k}"]`).forEach(x => x.classList.add('on')))
    gt.querySelectorAll<SVGElement>('.gst').forEach(g => { if (keys.some(k => g.dataset.gs!.split(' ').includes(k))) g.classList.add('on') })
  })
}
