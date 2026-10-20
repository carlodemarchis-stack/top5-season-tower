// Mockup (not wired into the app): "Match story" — a player's whole season match by match, on the whole card.
//   node mockups/tools/gen-match-story.mjs [ITA] [TOR] ["Nikola Vlasic"] [out.html]
// Outfield: each start = a mini pitch (the XI as small dots, him big); keeper: a mini goal of the shots on target he
// faced. Above each box: opponent + score; below: role + formation, then minutes, goals ●, assists ○, cards, mark.
import fs from 'node:fs'
import path from 'node:path'
import { rowsOf } from '../../src/film/pitch.ts'

const [LG = 'ITA', CODE = 'TOR', NAME = 'Nikola Vlasic', OUTF = 'match-story.html'] = process.argv.slice(2)
const ROOT = path.resolve(import.meta.dirname, '../..'), DATA = path.join(ROOT, 'src/data')
const readJS = (f, name) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`))[1])
const club = readJS(`schedule-${LG}-2026-27.js`, 'TEAMS')[CODE]
const recs = fs.readdirSync(DATA).filter(f => f.startsWith(`matches-${LG}-2026-27-md`)).flatMap(f => readJS(f, 'MATCHES')).filter(M => M.h === CODE || M.a === CODE)
const byId = Object.fromEntries(recs.map(M => [M.id, M]))
const VOTES = LG === 'ITA' && fs.existsSync(path.join(DATA, 'votes-ITA-2026-27.js')) ? readJS('votes-ITA-2026-27.js', 'VOTES').v : {}
const me = recs.flatMap(M => (M.h === CODE ? M.home : M.away).players).find(p => p.name === NAME)
if (!me) throw new Error(`${NAME} not found in ${CODE}`)
const ID = String(me.id), GK = me.pos === 'G', C = club.primary || '#7a1f2b'
const RES = { bigW: '#177a41', W1: '#3a9e62', D: '#EAB308', nil: '#9aa0a8', L1: '#dc5c5e', bigL: '#b3323a' }
const res = (gf, ga) => { const d = gf - ga; return d >= 2 ? 'bigW' : d === 1 ? 'W1' : d === 0 ? (gf ? 'D' : 'nil') : d === -1 ? 'L1' : 'bigL' }
const ROLE = { G: 'goalkeeper', CD: 'centre-back', 'CD-L': 'left centre-back', 'CD-R': 'right centre-back', LB: 'left-back', RB: 'right-back', LWB: 'left wing-back', RWB: 'right wing-back',
  DM: 'defensive mid', CM: 'central mid', 'CM-L': 'left central mid', 'CM-R': 'right central mid', LM: 'left mid', RM: 'right mid', AM: 'attacking mid', 'AM-L': 'left attacking mid', 'AM-R': 'right attacking mid',
  LF: 'left forward', RF: 'right forward', CF: 'striker', 'CF-L': 'left striker', 'CF-R': 'right striker', LW: 'left wing', RW: 'right wing' }
const SHORT = { G: 'GK', CD: 'CB', 'CD-L': 'LCB', 'CD-R': 'RCB', LB: 'LB', RB: 'RB', LWB: 'LWB', RWB: 'RWB', DM: 'DM', CM: 'CM', 'CM-L': 'LCM', 'CM-R': 'RCM',
  LM: 'LM', RM: 'RM', AM: 'AM', 'AM-L': 'LAM', 'AM-R': 'RAM', LF: 'LF', RF: 'RF', CF: 'ST', 'CF-L': 'LS', 'CF-R': 'RS', LW: 'LW', RW: 'RW' }
const clock = (s) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/) || []; return +(m[1] || 0) + Math.min(+(m[2] || 0), 6) * .5 }
const sur = (n) => n.split(' ').slice(1).join(' ') || n

function spots(T) { const rows = rowsOf(T), n = rows.length
  return rows.flatMap((r, i) => r.map((p, j) => ({ p, x: (j + 1) / (r.length + 1) * 100, y: 90 - i * (80 / Math.max(1, n - 1)) }))) }
const pitch = (T) => `<div class="cp">${spots(T).map(({ p, x, y }) => String(p.id) === ID ? `<i class="me" style="left:${x}%;top:${y}%">${p.n}</i>` : `<i style="left:${x}%;top:${y}%"></i>`).join('')}</div>`
// keeper: the shots on target he faced while on, on a small goal (ring = saved, dot = goal)
const PL = { bl: [.17, .74], br: [.83, .74], tl: [.17, .27], tr: [.83, .27], c: [.5, .52], tc: [.5, .25], bc: [.5, .76] }
function goal(M, side, until) {
  const op = side === 'h' ? 'a' : 'h', faced = M.shots.filter(x => x.s === op && (x.k === 'on' || x.k === 'goal') && clock(`${x.min}'`) <= until && PL[x.p])
  const dots = faced.map((x, i) => { const [px, py] = PL[x.p], X = 6 + px * 88 + ((i * 37) % 9 - 4), Y = 8 + py * 30 + ((i * 53) % 7 - 3)
    return x.k === 'goal' ? `<circle cx="${X}" cy="${Y}" r="3.6" fill="#b3323a" stroke="#fff" stroke-width="1"/>` : `<circle cx="${X}" cy="${Y}" r="3" fill="#fff" stroke="${C}" stroke-width="1.6"/>` }).join('')
  return `<svg viewBox="0 0 100 44"><path d="M6 40V8H94V40" fill="none" stroke="#15181d" stroke-width="2.4"/><line x1="0" x2="100" y1="40" y2="40" stroke="#c9ced4"/>${dots}</svg>`
}

const cell = (g) => {
  const M = byId[g.id], at = g.ha === 'A' ? '@' : ''
  if (!M) return `<div class="c up"><div class="ct"><span>${at}${g.opp}</span></div><div class="cp"></div></div>`
  const side = M.h === CODE ? 'h' : 'a', op = side === 'h' ? 'a' : 'h', T = side === 'h' ? M.home : M.away, gf = M.score[side], ga = M.score[op]
  const top = `<div class="ct"><span>${at}${g.opp}</span><b class="rs" style="background:${RES[res(gf, ga)]}">${gf}-${ga}</b></div>`
  const p = T.players.find(x => String(x.id) === ID)
  if (!p) { const bench = (T.bench || []).some(b => String(b[0]) === ID)
    return `<div class="c out">${top}<div class="cp ${bench ? 'bn' : 'ns'}">${bench ? 'bench' : ''}</div><div class="cr">&nbsp;</div><div class="cl">&nbsp;</div></div>` }
  const on = p.st ? null : M.subs.find(s => String(s.on) === ID), off = M.subs.find(s => String(s.off) === ID), red = p.ev.find(e => e[0] === 'rc')
  const start = p.st ? 0 : clock(on?.min), end = Math.min(90, off ? clock(off.min) : red ? clock(red[1]) : 90), mins = Math.max(1, Math.round(end - start))
  const G = M.goals.filter(x => String(x.byId) === ID && x.s === side && x.kind !== 'og').length, A = p.ev.filter(e => e[0] === 'ast').length
  const yc = p.ev.some(e => e[0] === 'yc'), mk = VOTES[ID]?.[M.md]
  // the facts line: minutes (↑ came on / ↓ went off), ● goals, ○ assists, cards, the mark
  const minTxt = !p.st ? `↑${on?.min || ''}` : off ? `↓${off.min}` : `${mins}'`
  const facts = `<span class="mn">${minTxt}</span>${'<i class="gl"></i>'.repeat(G)}${'<i class="as"></i>'.repeat(A)}${yc ? '<i class="yc"></i>' : ''}${red ? '<i class="rc"></i>' : ''}${mk != null ? `<b class="mk${mk >= 7 ? ' hi' : mk < 6 ? ' lo' : ''}">${mk}</b>` : ''}`
  if (GK) { const sv = M.stats?.[side]?.saves ?? 0
    const box = p.st ? `<div class="cg">${goal(M, side, end)}<b class="sv">${sv}</b><span>save${sv === 1 ? '' : 's'}</span>${ga === 0 && mins >= 89 ? '<em class="cs">clean sheet</em>' : `<em>${ga} against</em>`}</div>` : `<div class="cp bn">on<b>${on?.min || ''}</b></div>`
    return `<div class="c st">${top}${box}<div class="cr"><b>GK</b> ${T.form}</div><div class="cl">${facts}</div></div>` }
  if (!p.st) return `<div class="c sub">${top}<div class="cp bn">off the bench<b>${on?.min || ''}</b>${on ? `for ${sur(T.players.find(x => String(x.id) === String(on.off))?.name || '')}` : ''}</div><div class="cr"><b>${SHORT[p.pos] || ''}</b> ${T.form}</div><div class="cl">${facts}</div></div>`
  return `<div class="c st">${top}${pitch(T)}<div class="cr"><b>${SHORT[p.pos] || p.pos}</b> ${T.form}</div><div class="cl">${facts}</div></div>`
}

// the header list: every role he started in (outfield) — the summary pitch is gone, the list stays
const starts = recs.filter(M => (M.h === CODE ? M.home : M.away).players.some(x => String(x.id) === ID && x.st))
const subs = recs.filter(M => (M.h === CODE ? M.home : M.away).players.some(x => String(x.id) === ID && !x.st))
const roles = {}; for (const M of starts) { const p = (M.h === CODE ? M.home : M.away).players.find(x => String(x.id) === ID); (roles[p.pos] ||= []).push(M.md) }
const roleList = GK ? '' : Object.entries(roles).sort((a, b) => b[1].length - a[1].length).map(([pos, mds]) => `<span><b>${ROLE[pos] || pos}</b> ×${mds.length} <em>MD ${mds.join(', ')}</em></span>`).join('')
const all = [...club.games].sort((a, b) => a.w - b.w), half = Math.ceil(all.length / 2)

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mockup · Match story</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--c:${C}}
html,body{height:100%}
body{margin:0;background:#F5F6F4;font-family:Archivo,system-ui,sans-serif;color:#15181d;display:flex;flex-direction:column}
.top{height:52px;border-bottom:1px solid #e3e6ea;background:#fff;display:flex;align-items:center;padding:0 24px;font-size:12px;color:#8a9099}.top b{color:#15181d;margin:0 6px}
.card{flex:1;display:flex;flex-direction:column;padding:18px 24px 14px;min-height:0}
.hd{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}.hd h1{margin:0;font-size:40px;font-weight:900;text-transform:uppercase;letter-spacing:-.02em}
.hd .sm{font-size:13px;color:#6b717a}.hd .sm b{color:#15181d}
.roles{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:12px;color:#4b5058;margin:6px 0 0}.roles em{font-style:normal;color:#9aa0a8;font-size:11px}
.tabs{display:flex;gap:18px;margin:10px 0 12px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8a9099;border-bottom:1px solid #e3e6ea}
.tabs span{padding-bottom:5px}.tabs .on{color:#15181d;border-bottom:2.5px solid var(--c)}
.rows{display:grid;gap:16px}
.row{display:grid;grid-template-columns:40px repeat(${half},1fr);gap:5px}
.rl{font-size:10px;font-weight:800;letter-spacing:.1em;color:#9aa0a8;writing-mode:vertical-rl;transform:rotate(180deg);text-align:center}
.c{display:flex;flex-direction:column;gap:3px;min-width:0}
.ct{display:flex;align-items:center;justify-content:center;gap:4px;font-size:10px;font-weight:800;white-space:nowrap}
.ct span{color:#4b5058}.up .ct span{color:#b0b5bc}
.rs{color:#fff;font-size:10px;padding:1px 4px;border-radius:3px}
.cp{position:relative;aspect-ratio:68/92;border-radius:6px;background:#e8eee8;border:1px solid #fff;box-shadow:inset 0 0 0 1px #d5ddd5;overflow:hidden}
.cp::before{content:'';position:absolute;left:24%;right:24%;bottom:-1px;height:16%;border:1px solid #fff;border-bottom:0}
.cp i{position:absolute;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:var(--c);opacity:.35}
.cp i.me{width:18px;height:18px;margin:-9px 0 0 -9px;opacity:1;color:#fff;font-style:normal;font-size:9px;font-weight:900;display:grid;place-items:center;box-shadow:0 0 0 1.5px #fff,0 1px 4px rgba(0,0,0,.3);z-index:1}
.cp.bn,.cp.ns{background:#fff;box-shadow:inset 0 0 0 1px #e3e6ea;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:9px;color:#8a9099;font-weight:700;text-align:center;line-height:1.2}
.cp.bn::before,.cp.ns::before{display:none}.cp.bn b{font-size:14px;color:#15181d}
.cp.ns{background:repeating-linear-gradient(135deg,#f1f3f5 0 3px,#fff 3px 6px)}
.up .cp{background:transparent;box-shadow:inset 0 0 0 1px #e3e6ea}.up .cp::before{border-color:#e3e6ea}
.cg{aspect-ratio:68/92;border-radius:6px;background:#fff;box-shadow:inset 0 0 0 1px #e3e6ea;display:flex;flex-direction:column;align-items:center;padding:6px 3px 4px;gap:1px}.cg svg{width:100%}
.cg .sv{font-size:24px;font-weight:900;line-height:1;margin-top:4px;color:var(--c)}.cg span{font-size:9px;font-weight:800;color:#8a9099;text-transform:uppercase;letter-spacing:.08em}
.cg em{font-style:normal;font-size:9.5px;font-weight:800;color:#b3323a;margin-top:auto}.cg em.cs{color:#177a41}
.cr{font-size:9.5px;font-weight:700;color:#8a9099;text-align:center;white-space:nowrap;overflow:hidden}.cr b{color:#15181d;font-weight:900}.cr em{font-style:normal;color:#177a41;font-weight:900}
.cl{display:flex;align-items:center;justify-content:center;gap:2px;min-height:14px;font-size:9.5px}
.cl .mn{font-weight:800;color:#4b5058;margin-right:2px}
.cl i{width:6px;height:6px;border-radius:50%}.cl .gl{background:#15181d}.cl .as{box-shadow:inset 0 0 0 1.4px #15181d}
.cl .yc,.cl .rc{width:5px;height:7px;border-radius:1px}.cl .yc{background:#EAB308}.cl .rc{background:#d92d20}
.cl .mk{margin-left:3px;font-weight:900;color:#4b5058}.cl .mk.hi{color:#177a41}.cl .mk.lo{color:#b3323a}
.leg{margin-top:18px;font-size:11px;color:#8a9099;display:flex;gap:16px;flex-wrap:wrap}
</style></head><body>
<div class="top">MOCKUP · squad film · <b>${club.name}</b> · ${NAME} · "Match story" at 1600 × 900</div>
<div class="card"><div class="hd"><h1>${NAME}</h1><span class="sm"><b>${starts.length}</b> starts · <b>${subs.length}</b> off the bench</span></div>
<div class="roles">${roleList}</div>
<div class="tabs"><span>Season</span><span class="on">Match story</span></div>
<div class="rows"><div class="row"><div class="rl">MD 1–${half}</div>${all.slice(0, half).map(cell).join('')}</div><div class="row"><div class="rl">MD ${half + 1}–${all.length}</div>${all.slice(half).map(cell).join('')}</div></div>
<div class="leg"><span>↑ came on · ↓ went off</span><span>● goal · ○ assist</span><span>▮ yellow / red</span>${LG === 'ITA' ? '<span>number = Fantacalcio mark</span>' : ''}${GK ? '<span>goal: ○ saved · ● conceded (shots on target he faced)</span>' : ''}</div></div>
</body></html>`
fs.writeFileSync(path.join(ROOT, 'mockups', OUTF), html)
console.log(`mockups/${OUTF} · ${NAME}${GK ? ' (GK)' : ''} · ${starts.length} starts`)
