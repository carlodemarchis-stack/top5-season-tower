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

// his substitutions, from the match records of the games he was on the bench for: a summary, the players he sends on
// most, takes off most, the change he repeats, and each recent game's changes (minute, who came on for whom; ● a goal / ○ an assist by the sub)
const short = (n: string) => /\s/.test(n) ? n.replace(/^\S+\s+/, '') : n
const minute = (m: string) => parseInt(m, 10) || 0
function subsHTML(C: Dict, code: string, id: string, recs: Dict[]) {
  const mine = recs.filter(M => coachOf(C, code, M.h === code ? M.a : M.h, M.h === code ? 'H' : 'A') === id).sort((a, b) => b.md - a.md)
  if (!mine.length) return ''
  const used: Record<string, { name: string; n: number }> = {}, outs: typeof used = {}, swap: typeof used = {}
  let total = 0, firsts: number[] = [], ht = 0, G = 0, A = 0
  const games = mine.map(M => {
    const me = M.h === code ? 'h' : 'a', T = me === 'h' ? M.home : M.away, ha = me === 'h' ? 'H' : 'A'
    const P: Record<string, Dict> = Object.fromEntries(T.players.map((p: Dict) => [String(p.id), p]))
    const subs = M.subs.filter((x: Dict) => P[String(x.on)]).sort((a: Dict, b: Dict) => minute(a.min) - minute(b.min))
    if (subs.length) firsts.push(minute(subs[0].min))
    const rows = subs.map((x: Dict) => {
      const on = P[String(x.on)], off = P[String(x.off)], g = M.goals.filter((q: Dict) => String(q.byId) === String(x.on) && q.s === me && q.kind !== 'og').length
      const a = on.ev.filter((e: string[]) => e[0] === 'ast').length
      total++; if (minute(x.min) <= 46) ht++; G += g; A += a
      ;(used[on.id] ||= { name: on.name, n: 0 }).n++
      if (off) { (outs[off.id] ||= { name: off.name, n: 0 }).n++; (swap[`${on.id}-${off.id}`] ||= { name: `${short(on.name)} for ${short(off.name)}`, n: 0 }).n++ }
      return `<div class="sr"><b>${esc(x.min)}</b><span class="on">${esc(short(on.name))}${'<i class="gl"></i>'.repeat(g)}${'<i class="as"></i>'.repeat(a)}</span><span class="off">for ${esc(short(off?.name || '?'))}</span></div>`
    }).join('')
    return `<div class="sg" data-mid="${M.id}"><div class="sh">MD ${M.md} · ${ha === 'H' ? 'vs' : 'at'} ${esc(M[me === 'h' ? 'a' : 'h'])} <b>${M.score[me]}-${M.score[me === 'h' ? 'a' : 'h']}</b></div>${rows || '<div class="sr none">no changes</div>'}</div>`
  })
  const avgFirst = firsts.length ? Math.round(firsts.reduce((a, b) => a + b, 0) / firsts.length) : null
  const rank = (o: typeof used, min = 1) => Object.values(o).filter(x => x.n >= min).sort((a, b) => b.n - a.n).slice(0, 5)
  const top = rank(used), offs = rank(outs), swaps = rank(swap, 2)   // a swap counts once it has happened twice
  const chips = (lb: string, L: { name: string; n: number }[]) => L.length ? `<div class="sub-top"><span class="lb">${lb}</span>${L.map(x => `<span class="g">${esc(x.name)} <b>×${x.n}</b></span>`).join('')}</div>` : ''
  return `<div class="subs"><div class="sec">Substitutions<span class="gsum">${[`<b>${total}</b> changes in ${mine.length} game${mine.length === 1 ? '' : 's'}`, avgFirst != null && `first change at <b>${avgFirst}'</b> on average`,
      ht && `<b>${ht}</b> at half-time`, `subs scored <b>${G}</b>, assisted <b>${A}</b>`].filter(Boolean).map(c => `<span class="nw">${c}</span>`).join(' · ')}</span></div>
    ${chips('Most used off the bench', top)}${chips('Most taken off', offs)}${chips('Most repeated change', swaps)}
    <div class="sgs">${games.slice(0, 8).join('')}</div></div>`
}

// a Fantacalcio mark under a box, as the player cards show it (green ≥ 7, red < 6)
const markHTML = (v?: number) => v == null ? '' : `<div class="vt${v >= 7 ? ' hi' : v < 6 ? ' lo' : ''}" title="Fantacalcio mark for the coach (Redazione)">${Number.isInteger(v) ? v : v.toFixed(1)}</div>`

// ================= the coach card (closes the squad film) =================
// games = the club's played match records ({ id, md, opp, ha, gf, ga }); club = its schedule entry (every fixture)
// recs = the club's full match records (src/data/matches-*): his substitutions come from them
// marks = Serie A: the coach's Fantacalcio mark per match day (votes-ITA `c`, the club's bench that day)
export function coachCard(ctx: Ctx, C: Dict, lg: string, code: string, games: Dict[], teamLine: Dict, recs: Dict[] = [], marks?: Record<string, number>) {
  const S = stints(C, code, games), cur = S[S.length - 1], k = C.coaches[cur.id]
  const club = ctx.TEAMS[lg][code] || {}
  const c = club.primary || '#555', light = lum(c) > 0.55, ink = light ? '#15181d' : '#fff', c2 = light ? '#15181d' : c, hlInk = lum(c) > 0.183 ? '#15181d' : '#fff'
  const mine = S.filter(s => s.id === cur.id), n = (f: keyof Stint) => mine.reduce((a, s) => a + (s[f] as number), 0)
  const G = n('W') + n('D') + n('L'), P = 3 * n('W') + n('D'), ppg = G ? (P / G).toFixed(2) : '–'
  const byId: Record<string, Dict> = Object.fromEntries(games.map(g => [g.id, g]))
  const myMarks = games.filter(g => coachOf(C, code, g.opp, g.ha) === cur.id && marks?.[g.md] != null).map(g => marks![g.md])
  const avgMark = myMarks.length ? myMarks.reduce((a, b) => a + b, 0) / myMarks.length : null
  const all: Dict[] = [...(club.games || [])].sort((a, b) => a.w - b.w), half = Math.ceil(all.length / 2)
  // the club's formation in each game (the match report's line-up), over its box
  const FORM: Record<string, string> = Object.fromEntries(recs.map(M => [M.id, (M.h === code ? M.home : M.away)?.form || '']))
  const fcount: Record<string, number> = {}
  for (const M of recs) if (FORM[M.id] && coachOf(C, code, M.h === code ? M.a : M.h, M.h === code ? 'H' : 'A') === cur.id) fcount[FORM[M.id]] = (fcount[FORM[M.id]] || 0) + 1
  const forms = Object.entries(fcount).sort((a, b) => b[1] - a[1]).map(([f, n]) => `<b>${esc(f)}</b> ×${n}`).join(', ')
  const cell = (g: Dict) => {
    const m = byId[g.id], at = g.ha === 'A' ? '@' : ''
    if (!m) return `<div class="c2 up"><div class="mk"></div><div class="bx"></div><div class="op">${at}${esc(g.opp)}</div></div>`
    const who = coachOf(C, code, g.opp, g.ha), his = who === cur.id, [bg, fg] = RES6[res6(m.gf, m.ga)]
    const title = `MD${g.w} · ${g.ha === 'H' ? 'vs' : 'at'} ${g.opp} ${m.gf}-${m.ga}${who && !his ? ` · ${C.coaches[who]?.name} on the bench` : ''}`
    return `<div class="c2${his ? '' : ' dnp'}" data-mid="${g.id}"${matchHrefOf(ctx, lg, g.w, g.id)} title="${esc(title)}${FORM[g.id] ? ` · ${FORM[g.id]}` : ''}"><div class="mk">${FORM[g.id] ? `<span class="fm">${esc(FORM[g.id])}</span>` : ''}</div>
      <div class="bx" style="background:${bg};color:${his ? fg : '#15181d'}"><span class="vl" style="height:${his ? 0 : 100}%"></span><b>${m.gf}-${m.ga}</b></div>
      <div class="op">${at}${esc(g.opp)}</div>${his ? markHTML(marks?.[g.w]) : `<div class="vt">${esc(tag(C.coaches[who!]))}</div>`}</div>`
  }
  const row = (gs: Dict[], lbl: string) => `<div class="row2"><div class="rl">${lbl}</div><div class="cells" style="--n:${half};--mk:1.4">${gs.map(cell).join('')}</div></div>`
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
        ${avgMark != null ? `<div class="n"><b>${avgMark.toFixed(2)}</b><span>Avg mark</span></div>` : `<div class="n"><b>${P}</b><span>Points</span></div>`}
        <div class="n"><b>${n('GF')}–${n('GA')}</b><span>For–against</span></div>
        <div class="n"><b>${n('CS')}</b><span>Clean sheets</span></div>
        <div class="n"><b>${teamLine.pos ? ord(teamLine.pos) : '–'}</b><span>Table now</span></div>
      </div>
      ${forms || S.length > 1 ? `<div class="avail"><span>${[forms && `His formations: ${forms}`, S.length > 1 && `greyed: games under ${S.length > 2 ? 'the coaches' : 'the coach'} before him, tagged under the box`].filter(Boolean).join(' · ')}</span></div>` : ''}
      <div class="s2">${row(all.slice(0, half), `MD 1–${half}`)}${row(all.slice(half), `MD ${half + 1}–${all.length}`)}</div>
      ${list}
      ${subsHTML(C, code, cur.id, recs)}
    </div>
  </section>`
}
