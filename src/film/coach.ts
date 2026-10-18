// Head coaches (scripts/update-coaches.mjs, from FotMob — ESPN has none): who was on the bench in each game, each
// club's coaches this season in order, the chip the team and match cards show, and the coach card that closes each
// squad film (player.html). Photos are FotMob's 192px head crops → a round portrait, never stretched to a full panel.
import { RES6, res6, esc, ord, logo, lum, bio, matchHrefOf, type Ctx } from './cards'
type Dict = Record<string, any>
export type Stint = { id: string; from: number | null; to: number | null; W: number; D: number; L: number; GF: number; GA: number; CS: number }

const FILES = import.meta.glob('../data/coaches-*.js')
export async function loadCoaches(lg: string, season: string): Promise<Dict | null> {
  const f = FILES[`../data/coaches-${lg}-${season}.js`]
  return f ? ((await f()) as Dict).COACHES : null
}
export const coachPhoto = (id: string) => `coaches/${id}.webp`
export const coachHref = (lg: string, code: string) => `player.html?lg=${lg}&team=${code}&p=coach`
// the line-up's last name (Gian Piero Gasperini → Gasperini); the name minus its first word when FotMob has none
export const surname = (k: Dict | undefined) => k?.last || (/\s/.test(k?.name || '') ? k!.name.replace(/^\S+\s+/, '') : k?.name || '')
export const ageOf = (dob?: string) => { if (!dob) return null; const d = new Date(dob), n = new Date(); return n.getFullYear() - d.getFullYear() - (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0) }

// the coach of `code` in a game against `opp` (ha 'H' | 'A'), as the line-up names him
export function coachOf(C: Dict | null, code: string, opp: string, ha: string): string | null {
  const m = C?.matches[ha === 'H' ? `${code}-${opp}` : `${opp}-${code}`]
  return m ? m[ha === 'H' ? 0 : 1] : null
}
// a club's coaches this season, in order, from its played games ({ md, opp, ha, gf, ga }); a coach appointed since the
// last game (the club page's current coach) closes the list with no games yet
export function stints(C: Dict | null, code: string, played: Dict[]): Stint[] {
  const out: Stint[] = []
  for (const g of [...played].sort((a, b) => a.md - b.md)) {
    const id = coachOf(C, code, g.opp, g.ha); if (!id) continue
    let s = out[out.length - 1]
    if (!s || s.id !== id) out.push(s = { id, from: g.md, to: g.md, W: 0, D: 0, L: 0, GF: 0, GA: 0, CS: 0 })
    s.to = g.md; s[g.gf > g.ga ? 'W' : g.gf < g.ga ? 'L' : 'D']++; s.GF += g.gf; s.GA += g.ga; if (!g.ga) s.CS++
  }
  const cur = C?.teams[code]
  if (cur && out[out.length - 1]?.id !== cur) out.push({ id: cur, from: null, to: null, W: 0, D: 0, L: 0, GF: 0, GA: 0, CS: 0 })
  return out
}
const span = (s: Stint) => s.from == null ? 'no game yet' : s.from === s.to ? `MD ${s.from}` : `MD ${s.from}–${s.to}`
const pts = (s: Stint) => 3 * s.W + s.D
// under a greyed box: the coach then, in three letters (TED) — the full names are in the list below the strip
const tag = (k: Dict | undefined) => surname(k).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()

// the team card's line under the club name: the current coach, and who came before him this season
export function coachChip(C: Dict | null, lg: string, code: string, played: Dict[]) {
  const S = stints(C, code, played), cur = S[S.length - 1]; if (!cur) return ''
  const k = C!.coaches[cur.id], age = ageOf(k.dob), before = S.slice(0, -1)
  return `<div class="coach" data-href="${coachHref(lg, code)}" title="${esc(k.name)} · his card">
    ${k.ph ? `<img src="${coachPhoto(cur.id)}" alt="">` : ''}<span class="cl">Coach</span><b>${esc(k.name)}</b>
    <span class="cm">${[k.nat, age && `${age}`, before.length ? (cur.from == null ? 'just appointed' : `since MD ${cur.from}`) : ''].filter(Boolean).map(esc).join(' · ')}</span>
    ${before.length ? `<span class="cb">before: ${before.map(s => `${esc(surname(C!.coaches[s.id]))} ${span(s)}`).join(', ')}</span>` : ''}</div>`
}

// ================= the coach card (closes the squad film) =================
// games = the club's played match records ({ id, md, opp, ha, gf, ga }); club = its schedule entry (every fixture)
export function coachCard(ctx: Ctx, C: Dict, lg: string, code: string, games: Dict[], teamLine: Dict) {
  const S = stints(C, code, games), cur = S[S.length - 1], k = C.coaches[cur.id]
  const club = ctx.TEAMS[lg][code] || {}
  const c = club.primary || '#555', light = lum(c) > 0.55, ink = light ? '#15181d' : '#fff', c2 = light ? '#15181d' : c, hlInk = lum(c) > 0.183 ? '#15181d' : '#fff'
  const mine = S.filter(s => s.id === cur.id), n = (f: keyof Stint) => mine.reduce((a, s) => a + (s[f] as number), 0)
  const G = n('W') + n('D') + n('L'), P = 3 * n('W') + n('D'), ppg = G ? (P / G).toFixed(2) : '–'
  const byId: Record<string, Dict> = Object.fromEntries(games.map(g => [g.id, g]))
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w), half = Math.ceil(all.length / 2)
  const cell = (g: Dict) => {
    const m = byId[g.id], at = g.ha === 'A' ? '@' : ''
    if (!m) return `<div class="c2 up"><div class="mk"></div><div class="bx"></div><div class="op">${at}${esc(g.opp)}</div></div>`
    const who = coachOf(C, code, g.opp, g.ha), his = who === cur.id, [bg, fg] = RES6[res6(m.gf, m.ga)]
    const title = `MD${g.w} · ${g.ha === 'H' ? 'vs' : 'at'} ${g.opp} ${m.gf}-${m.ga}${who && !his ? ` · ${C.coaches[who]?.name} on the bench` : ''}`
    return `<div class="c2${his ? '' : ' dnp'}" data-mid="${g.id}"${matchHrefOf(ctx, lg, g.w, g.id)} title="${esc(title)}"><div class="mk"></div>
      <div class="bx" style="background:${bg};color:${his ? fg : '#15181d'}"><span class="vl" style="height:${his ? 0 : 100}%"></span><b>${m.gf}-${m.ga}</b></div>
      <div class="op">${at}${esc(g.opp)}</div>${his ? '' : `<div class="vt">${esc(tag(C.coaches[who!]))}</div>`}</div>`
  }
  const row = (gs: Dict[], lbl: string) => `<div class="row2"><div class="rl">${lbl}</div><div class="cells" style="--n:${half};--mk:0">${gs.map(cell).join('')}</div></div>`
  const list = S.length > 1 ? `<div class="glist"><div class="sec">The bench this season</div><div class="goals">${S.map(s => { const x = C.coaches[s.id]
    return `<span class="g${s.id === cur.id ? ' on' : ''}">${x.ph ? `<img class="cf" src="${coachPhoto(s.id)}" alt="">` : ''}<b>${esc(x.name)}</b> ${span(s)}${s.from == null ? '' : ` · ${s.W}-${s.D}-${s.L} · ${pts(s)} pts`}</span>` }).join('')}</div></div>` : ''
  return `<section class="card coachc" id="coach" style="--c:${c};--c2:${c2};--ink:${ink};--hlink:${hlInk}">
    <div class="pan">
      <img class="wm" src="${logo(lg, code)}" alt="" onerror="this.remove()">
      <div class="rk">COACH</div>
      <div class="gbig"><b>${G}</b><span>game${G === 1 ? '' : 's'} in charge</span></div>
      ${k.ph ? `<img class="cph" src="${coachPhoto(cur.id)}" alt="${esc(k.name)}">` : ''}
      ${bio([['Role', 'Head coach'], ['Age', ageOf(k.dob)], ['Nation', k.nat], ['Since', cur.from == null ? 'just appointed' : S.length > 1 ? `MD ${cur.from}` : 'season start']])}
    </div>
    <div class="body">
      <div><h1 style="--len:${[...k.name].length};--word:${Math.max(...k.name.split(/[\s-]+/).map((w: string) => [...w].length))}">${esc(k.name)}</h1></div>
      <div class="nums">
        <div class="n big"><b>${ppg}</b><span>Points per game</span></div>
        <div class="n"><b>${n('W')}-${n('D')}-${n('L')}</b><span>W-D-L</span></div>
        <div class="n"><b>${P}</b><span>Points</span></div>
        <div class="n"><b>${n('GF')}–${n('GA')}</b><span>For–against</span></div>
        <div class="n"><b>${n('CS')}</b><span>Clean sheets</span></div>
        <div class="n"><b>${teamLine.pos ? ord(teamLine.pos) : '–'}</b><span>Table now</span></div>
      </div>
      ${S.length > 1 ? `<div class="avail">Greyed: games under ${S.length > 2 ? 'the coaches' : 'the coach'} before him, tagged under the box</div>` : ''}
      <div class="s2">${row(all.slice(0, half), `MD 1–${half}`)}${row(all.slice(half), `MD ${half + 1}–${all.length}`)}</div>
      ${list}
    </div>
  </section>`
}
