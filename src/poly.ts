// "Everyone vs everyone": a league as a polygon — ported from the 2015 site's poly.js (same drawing).
// Clubs sit on the vertices in standings order (1st at the top, clockwise), each a win/draw/loss pie sized by
// points. Every played match is a line split in half, each half coloured by the result for the club it starts
// from, thicker for bigger margins. A double round robin gives two parallel lines per pair (first and second
// leg); a pair with neither leg played yet is one faint dashed line. The tower's side columns drive it:
// focus(i) keeps only club i's lines, pair(i, j) only the lines between i and j.
export type PolyTeam = { n: string; pts: number; code: string }
export type PolyMatch = { i: number; j: number; md: number; gi?: number; gj?: number }   // i = home, j = away
export type PolyApi = { focus: (i: number | null) => void; pair: (i: number | null, j: number | null) => void }

const C = { w: '#2f9a4f', d: '#d8b03a', l: '#c0453b' }, NS = 'http://www.w3.org/2000/svg'
const el = (n: string, a: Record<string, string | number>) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, String(a[k])); return e }
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function pie(g: SVGElement, x: number, y: number, r: number, rec: { w: number; d: number; l: number }) {
  const tot = rec.w + rec.d + rec.l
  if (!tot) { g.append(el('circle', { cx: x, cy: y, r, fill: '#fff', stroke: '#9aa0a8', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' })); return }
  let a0 = -Math.PI / 2
  for (const k of ['w', 'd', 'l'] as const) {
    const v = rec[k]; if (!v) continue
    const a1 = a0 + 2 * Math.PI * v / tot
    if (v === tot) g.append(el('circle', { cx: x, cy: y, r, fill: C[k] }))
    else g.append(el('path', { d: `M${x},${y}L${x + r * Math.cos(a0)},${y + r * Math.sin(a0)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x + r * Math.cos(a1)},${y + r * Math.sin(a1)}Z`, fill: C[k], stroke: '#fff', 'stroke-width': 1 }))
    a0 = a1
  }
}

export function polyChart(box: HTMLElement, data: { teams: PolyTeam[]; ms: PolyMatch[] },
  on: { enter?: (i: number) => void; leave?: (i: number) => void; click?: (i: number) => void } = {}): PolyApi {
  const T = data.teams, N = T.length, narrow = box.clientWidth < 600
  const W = 760, H = narrow ? 660 : 640, cx = W / 2, cy = H / 2 - 2, R = narrow ? 280 : 240
  const fs = Math.max(11, Math.round(11 * W / Math.max(300, box.clientWidth)))
  box.innerHTML = `<div class="poly-leg"><span><i style="background:${C.w}"></i>win</span><span><i style="background:${C.d}"></i>draw</span><span><i style="background:${C.l}"></i>loss</span><span><i class="dash"></i>to play</span></div><div class="poly-wrap"><div class="poly-tip" hidden></div></div>`
  const wrap = box.querySelector<HTMLElement>('.poly-wrap')!, tip = box.querySelector<HTMLElement>('.poly-tip')!
  const sv = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Every match of the league: each club a vertex, each match a line' }) as SVGSVGElement
  wrap.prepend(sv)
  const P = T.map((_, i) => { const a = -Math.PI / 2 + 2 * Math.PI * i / N; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a } })
  const REC = T.map(() => ({ w: 0, d: 0, l: 0 }))
  for (const m of data.ms) if (m.gi != null) { const { i, j, gi, gj } = m; if (gi > gj!) { REC[i].w++; REC[j].l++ } else if (gi < gj!) { REC[i].l++; REC[j].w++ } else { REC[i].d++; REC[j].d++ } }
  const gL = el('g', {}), gN = el('g', {}); sv.append(gL, gN)
  const pairs: Record<string, PolyMatch[]> = {}; for (const m of data.ms) (pairs[Math.min(m.i, m.j) + '-' + Math.max(m.i, m.j)] ||= []).push(m)
  const lines: { ln: Element[]; t: number[] }[] = []
  const showTip = (e: MouseEvent, h: string) => { const r = wrap.getBoundingClientRect(); tip.innerHTML = h; tip.hidden = false; tip.style.left = Math.min(e.clientX - r.left + 12, r.width - tip.offsetWidth - 4) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px' }
  for (const ms of Object.values(pairs)) {
    const played = ms.filter(m => m.gi != null).sort((a, b) => a.md - b.md), show = played.length ? played : [ms[0]]
    show.forEach((m, k) => {
      const A = P[m.i], B = P[m.j], dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, off = show.length > 1 ? (k ? 2.2 : -2.2) : 0
      const ox = -dy / len * off, oy = dx / len * off, a = { x: A.x + ox, y: A.y + oy }, b = { x: B.x + ox, y: B.y + oy }, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (m.gi == null) { const ln = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#9aa0a8', 'stroke-width': 1, 'stroke-dasharray': '3 4', 'stroke-opacity': .28 }); gL.append(ln); lines.push({ ln: [ln], t: [m.i, m.j] }); return }
      const x = m.gi, y = m.gj!, kA = x > y ? 'w' : x < y ? 'l' : 'd', kB = x > y ? 'l' : x < y ? 'w' : 'd', w = 1.6 + Math.min(Math.abs(x - y), 6) * .55
      const l1 = el('line', { x1: a.x, y1: a.y, x2: mid.x, y2: mid.y, stroke: C[kA], 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-opacity': .85 })
      const l2 = el('line', { x1: mid.x, y1: mid.y, x2: b.x, y2: b.y, stroke: C[kB], 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-opacity': .85 })
      gL.append(l1, l2); lines.push({ ln: [l1, l2], t: [m.i, m.j] })
      for (const l of [l1, l2]) { l.addEventListener('mousemove', e => showTip(e as MouseEvent, `${esc(T[m.i].n)} <b>${x}–${y}</b> ${esc(T[m.j].n)} · MD ${m.md}`)); l.addEventListener('mouseleave', () => { tip.hidden = true }) }
    })
  }
  const dim = (on: (t: number[]) => boolean) => { for (const o of lines) { const v = on(o.t); for (const x of o.ln) x.setAttribute('opacity', v ? '1' : '.06') } }
  const api: PolyApi = {
    focus: i => { dim(t => i == null || t.includes(i)); gN.querySelectorAll('.poly-team').forEach((g, k) => g.classList.toggle('on', k === i)) },
    pair: (i, j) => dim(t => i == null || (t.includes(i) && t.includes(j!))),
  }
  T.forEach((t, i) => {
    const p = P[i], r = 9 + Math.sqrt(t.pts) * 2.4, g = el('g', { class: 'poly-team' })
    g.append(el('circle', { class: 'ring', cx: p.x, cy: p.y, r: r + 4, fill: '#fff', stroke: '#15181d', 'stroke-width': 0 }))
    pie(g, p.x, p.y, r, REC[i])
    const lr = R + r + 10, c = Math.cos(p.a)
    const tx = el('text', { x: cx + lr * Math.cos(p.a), y: cy + lr * Math.sin(p.a), 'text-anchor': narrow || Math.abs(c) < .25 ? 'middle' : c > 0 ? 'start' : 'end', 'dominant-baseline': 'central', 'font-size': fs, fill: '#15181d' })
    tx.textContent = narrow ? `${i + 1}` : `${i + 1}. ${t.n} · ${t.pts}`
    g.append(tx)
    g.addEventListener('mouseenter', () => on.enter?.(i))
    g.addEventListener('mouseleave', () => on.leave?.(i))
    g.addEventListener('click', () => on.click?.(i))
    gN.append(g)
  })
  // long names on the sides: shrink the labels until none leaves the drawing
  const texts = [...sv.querySelectorAll('text')]
  for (let f = fs; f > 9 && texts.some(t => { const b = t.getBBox(); return b.x < 2 || b.x + b.width > W - 2 });) { f--; for (const t of texts) t.setAttribute('font-size', String(f)) }
  return api
}
