// Mockup (not wired into the app): where a player lined up in each game, from the match reports.
//   node mockups/tools/gen-player-tactical.mjs [ITA] [TOR] ["Nikola Vlasic"]  →  mockups/player-tactical.html
// Option A: the season strip with bigger boxes — a start shows the XI as small dots and him as a big one; off the bench
// is a plain box (no pitch); not used / not in the squad as today. Option B: one pitch, every spot he started in.
import fs from 'node:fs'
import path from 'node:path'
import { rowsOf } from '../../src/film/pitch.ts'

const [LG = 'ITA', CODE = 'TOR', NAME = 'Nikola Vlasic'] = process.argv.slice(2)
const ROOT = path.resolve(import.meta.dirname, '../..'), DATA = path.join(ROOT, 'src/data')
const readJS = (f, name) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*[\\]}])`))[1])
const TEAMS = readJS(`schedule-${LG}-2026-27.js`, 'TEAMS'), club = TEAMS[CODE]
const recs = fs.readdirSync(DATA).filter(f => f.startsWith(`matches-${LG}-2026-27-md`)).flatMap(f => readJS(f, 'MATCHES')).filter(M => M.h === CODE || M.a === CODE)
const byId = Object.fromEntries(recs.map(M => [M.id, M]))
const me = recs.flatMap(M => (M.h === CODE ? M.home : M.away).players).find(p => p.name === NAME)
if (!me) throw new Error(`${NAME} not found in ${CODE}`)
const ID = String(me.id), C = club.primary || '#7a1f2b'
const RES = { bigW: '#177a41', W1: '#3a9e62', D: '#EAB308', nil: '#9aa0a8', L1: '#dc5c5e', bigL: '#b3323a' }
const res = (gf, ga) => { const d = gf - ga; return d >= 2 ? 'bigW' : d === 1 ? 'W1' : d === 0 ? (gf ? 'D' : 'nil') : d === -1 ? 'L1' : 'bigL' }
const ROLE = { G: 'goalkeeper', CD: 'centre-back', 'CD-L': 'left centre-back', 'CD-R': 'right centre-back', LB: 'left-back', RB: 'right-back', LWB: 'left wing-back', RWB: 'right wing-back',
  DM: 'defensive mid', CM: 'central mid', 'CM-L': 'left central mid', 'CM-R': 'right central mid', LM: 'left mid', RM: 'right mid', AM: 'attacking mid', 'AM-L': 'left attacking mid', 'AM-R': 'right attacking mid',
  LF: 'left forward', RF: 'right forward', CF: 'striker', 'CF-L': 'left striker', 'CF-R': 'right striker', LW: 'left wing', RW: 'right wing' }
const role = (p) => ROLE[p] || p
const sur = (n) => n.split(' ').slice(1).join(' ') || n

// every spot of a starting XI, x/y in % of a vertical half pitch (attacking up)
function spots(T) {
  const rows = rowsOf(T), n = rows.length
  return rows.flatMap((r, i) => r.map((p, j) => ({ p, x: (j + 1) / (r.length + 1) * 100, y: 90 - i * (80 / Math.max(1, n - 1)) })))
}
const pitch = (T, big = false) => spots(T).map(({ p, x, y }) => String(p.id) === ID
  ? `<i class="me" style="left:${x}%;top:${y}%">${p.n}</i>` : `<i style="left:${x}%;top:${y}%"></i>`).join('')

// ---------- option A: the strip ----------
const all = [...club.games].sort((a, b) => a.w - b.w)
const cell = (g) => {
  const M = byId[g.id], at = g.ha === 'A' ? '@' : ''
  if (!M) return `<div class="g up"><div class="box"></div><div class="op">${at}${g.opp}</div></div>`
  const side = M.h === CODE ? 'h' : 'a', T = side === 'h' ? M.home : M.away, gf = M.score[side], ga = M.score[side === 'h' ? 'a' : 'h']
  const p = T.players.find(x => String(x.id) === ID), chip = `<b class="rs" style="background:${RES[res(gf, ga)]}">${gf}-${ga}</b>`
  if (p?.st) return `<div class="g st"><div class="hd">${chip}<span>${at}${g.opp}</span></div><div class="mp">${pitch(T)}</div><div class="rl"><b>${role(p.pos)}</b><span>${T.form}</span></div></div>`
  if (p) { const s = M.subs.find(x => String(x.on) === ID), off = T.players.find(x => String(x.id) === String(s?.off))
    return `<div class="g sub"><div class="hd">${chip}<span>${at}${g.opp}</span></div><div class="bench">off the bench<b>${s?.min || ''}</b>${off ? `for ${sur(off.name)}` : ''}</div><div class="rl"><span>${T.form}</span></div></div>` }
  const onBench = (T.bench || []).some(b => String(b[0]) === ID)
  return `<div class="g out"><div class="hd">${chip}<span>${at}${g.opp}</span></div><div class="bench">${onBench ? 'on the bench,<br>not used' : 'not in the<br>matchday squad'}</div></div>`
}
const played = all.filter(g => byId[g.id]), rest = all.filter(g => !byId[g.id])

// ---------- option B: one pitch, every start ----------
const starts = recs.filter(M => (M.h === CODE ? M.home : M.away).players.some(x => String(x.id) === ID && x.st))
const where = {}
for (const M of starts) { const T = M.h === CODE ? M.home : M.away, s = spots(T).find(s => String(s.p.id) === ID)
  const k = `${Math.round(s.x / 5) * 5}:${Math.round(s.y / 5) * 5}`; (where[k] ||= { x: s.x, y: s.y, n: 0, pos: s.p.pos, mds: [] }); where[k].n++; where[k].mds.push(M.md) }
const heat = Object.values(where).map(w => `<i class="hm" style="left:${w.x}%;top:${w.y}%;--s:${16 + w.n * 9}px" title="MD ${w.mds.join(', ')}">${w.n}</i>`).join('')   // roles in the list beside it (labels on the pitch collide)

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mockup · where he played</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--c:${C}}
body{margin:0;background:#F5F6F4;font-family:Archivo,system-ui,sans-serif;color:#15181d;padding:28px 36px}
h1{font-size:44px;font-weight:900;text-transform:uppercase;letter-spacing:-.02em;margin:0 0 4px}
.note{font-size:13px;color:#6b717a;margin:0 0 22px}.note b{color:#15181d}
h2{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#6a717b;margin:26px 0 10px}
h2 span{font-weight:600;letter-spacing:0;text-transform:none;color:#8a9099;margin-left:10px}
.strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}
.g{flex:0 0 112px;display:flex;flex-direction:column;gap:5px}
.hd{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800}
.rs{color:#fff;font-size:11px;padding:2px 6px;border-radius:4px}
.mp,.bench,.box{position:relative;height:120px;border-radius:8px}
.mp{background:#e8eee8;border:1.5px solid #fff;box-shadow:inset 0 0 0 1px #d5ddd5;overflow:hidden}
.mp::before{content:'';position:absolute;left:24%;right:24%;bottom:-1px;height:18%;border:1.2px solid #fff;border-bottom:0}
.mp i{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:var(--c);opacity:.35}
.mp i.me{width:24px;height:24px;margin:-12px 0 0 -12px;opacity:1;color:#fff;font-style:normal;font-size:11px;font-weight:900;display:grid;place-items:center;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.3);z-index:1}
.rl{display:flex;flex-direction:column;font-size:10.5px;line-height:1.25}.rl b{font-weight:900}.rl span{color:#8a9099;font-weight:700}
.bench{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:2px;font-size:11px;color:#6b717a;font-weight:600;background:#fff;border:1px dashed #cfd4da}
.bench b{font-size:18px;color:#15181d;font-weight:900}
.out .bench{background:repeating-linear-gradient(135deg,#f1f3f5 0 4px,#fff 4px 8px);border-style:solid;border-color:#e3e6ea}
.up{flex-basis:46px}.up .box{height:120px;border:1px solid #dfe2e6;background:transparent}.op{font-size:10px;font-weight:700;color:#b0b5bc;text-align:center}
.opt-b{display:flex;gap:28px;align-items:flex-start}
.bp{position:relative;width:300px;aspect-ratio:68/74;border-radius:10px;background:#e8eee8;border:2px solid #fff;box-shadow:inset 0 0 0 1px #d5ddd5}
.bp::before{content:'';position:absolute;left:24%;right:24%;bottom:-2px;height:18%;border:1.5px solid #fff;border-bottom:0}
.hm{position:absolute;width:var(--s);height:var(--s);transform:translate(-50%,-50%);border-radius:50%;background:var(--c);color:#fff;font-style:normal;font-weight:900;font-size:12px;display:grid;place-items:center;box-shadow:0 0 0 2px #fff}
.hl{position:absolute;transform:translate(-50%,calc(var(--o,16px)));font-size:10px;font-weight:800;white-space:nowrap;margin-top:6px;text-shadow:0 0 3px #e8eee8}
.leg{font-size:12.5px;color:#4b5058;line-height:1.6;max-width:420px}
</style></head><body>
<h1>${NAME}</h1>
<p class="note">MOCKUP · ${club.name} · ${starts.length} starts, ${recs.filter(M => (M.h === CODE ? M.home : M.away).players.some(x => String(x.id) === ID && !x.st)).length} off the bench — from the match reports' line-ups (position + formation slot)</p>
<h2>Option A · the season strip, bigger boxes<span>a start = the XI as small dots, him big with his number · off the bench = no pitch · unplayed fixtures stay narrow</span></h2>
<div class="strip">${played.map(cell).join('')}${rest.slice(0, 6).map(cell).join('')}</div>
<h2>Option B · one pitch, every start<span>compact: a dot per spot he started in, bigger the more often, the roles listed beside it</span></h2>
<div class="opt-b"><div class="bp">${heat}</div>
<div class="leg">${Object.values(where).sort((a, b) => b.n - a.n).map(w => `<b>${role(w.pos)}</b> × ${w.n} — MD ${w.mds.join(', ')}`).join('<br>')}<br><br>Fits in the card as-is (next to "when he scores"), no change to the strip.</div></div>
</body></html>`
fs.writeFileSync(path.join(ROOT, 'mockups/player-tactical.html'), html)

// ---------- option C: the whole card, all 38 games (2 rows of 19, like the strip: MD 1–19 over 20–38) ----------
const SHORT = { G: 'GK', CD: 'CB', 'CD-L': 'LCB', 'CD-R': 'RCB', LB: 'LB', RB: 'RB', LWB: 'LWB', RWB: 'RWB', DM: 'DM', CM: 'CM', 'CM-L': 'LCM', 'CM-R': 'RCM',
  LM: 'LM', RM: 'RM', AM: 'AM', 'AM-L': 'LAM', 'AM-R': 'RAM', LF: 'LF', RF: 'RF', CF: 'ST', 'CF-L': 'LS', 'CF-R': 'RS', LW: 'LW', RW: 'RW' }
const cellC = (g) => {
  const M = byId[g.id], at = g.ha === 'A' ? '@' : ''
  if (!M) return `<div class="c up"><div class="cp"></div><div class="co">${at}${g.opp}</div></div>`
  const side = M.h === CODE ? 'h' : 'a', T = side === 'h' ? M.home : M.away, gf = M.score[side], ga = M.score[side === 'h' ? 'a' : 'h']
  const p = T.players.find(x => String(x.id) === ID), chip = `<b class="rs" style="background:${RES[res(gf, ga)]}">${gf}-${ga}</b>`
  if (p?.st) return `<div class="c st" title="MD${g.w} ${at}${g.opp} ${gf}-${ga} · ${role(p.pos)} · ${T.form}">${chip}<div class="cp">${pitch(T)}</div><div class="co"><b>${SHORT[p.pos] || p.pos}</b> ${at}${g.opp}</div><div class="cf">${T.form}</div></div>`
  if (p) { const s = M.subs.find(x => String(x.on) === ID)
    return `<div class="c sub">${chip}<div class="cp bn">on<b>${s?.min || ''}</b></div><div class="co">${at}${g.opp}</div><div class="cf">&nbsp;</div></div>` }
  const onBench = (T.bench || []).some(b => String(b[0]) === ID)
  return `<div class="c out">${chip}<div class="cp ${onBench ? 'bn' : 'ns'}">${onBench ? 'bench' : ''}</div><div class="co">${at}${g.opp}</div><div class="cf">&nbsp;</div></div>`
}
const half = Math.ceil(all.length / 2)
const htmlC = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mockup · the whole card</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--c:${C}}
html,body{height:100%}
body{margin:0;background:#F5F6F4;font-family:Archivo,system-ui,sans-serif;color:#15181d;display:flex;flex-direction:column}
.top{height:52px;border-bottom:1px solid #e3e6ea;background:#fff;display:flex;align-items:center;padding:0 24px;font-size:12px;color:#8a9099}.top b{color:#15181d;margin:0 6px}
.card{flex:1;display:flex;flex-direction:column;padding:18px 24px 14px;min-height:0}
.hd{display:flex;align-items:baseline;gap:16px}.hd h1{margin:0;font-size:40px;font-weight:900;text-transform:uppercase;letter-spacing:-.02em}
.hd span{font-size:13px;color:#6b717a}.hd span b{color:#15181d}
.tabs{display:flex;gap:18px;margin:8px 0 12px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8a9099;border-bottom:1px solid #e3e6ea}
.tabs span{padding-bottom:5px}.tabs .on{color:#15181d;border-bottom:2.5px solid var(--c)}
.rows{display:grid;gap:14px}
.row{display:grid;grid-template-columns:44px repeat(${half},1fr);gap:5px;min-height:0}
.rl{font-size:10px;font-weight:800;letter-spacing:.1em;color:#9aa0a8;writing-mode:vertical-rl;transform:rotate(180deg);text-align:center}
.c{display:flex;flex-direction:column;gap:3px;min-width:0;min-height:0}
.rs{align-self:center;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px}
.cp{position:relative;aspect-ratio:68/92;border-radius:6px;background:#e8eee8;border:1px solid #fff;box-shadow:inset 0 0 0 1px #d5ddd5;overflow:hidden}
.cp::before{content:'';position:absolute;left:24%;right:24%;bottom:-1px;height:16%;border:1px solid #fff;border-bottom:0}
.cp i{position:absolute;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:var(--c);opacity:.35}
.cp i.me{width:18px;height:18px;margin:-9px 0 0 -9px;opacity:1;color:#fff;font-style:normal;font-size:9px;font-weight:900;display:grid;place-items:center;box-shadow:0 0 0 1.5px #fff,0 1px 4px rgba(0,0,0,.3);z-index:1}
.cp.bn,.cp.ns{background:#fff;box-shadow:inset 0 0 0 1px #e3e6ea;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:9.5px;color:#8a9099;font-weight:700}
.cp.bn::before,.cp.ns::before{display:none}.cp.bn b{font-size:14px;color:#15181d}
.cp.ns{background:repeating-linear-gradient(135deg,#f1f3f5 0 3px,#fff 3px 6px)}
.up .cp{background:transparent;box-shadow:inset 0 0 0 1px #e3e6ea}.up .cp::before{border-color:#e3e6ea}
.co{font-size:10px;font-weight:700;color:#6b717a;text-align:center;white-space:nowrap;overflow:hidden}.co b{color:#15181d;font-weight:900}
.cf{font-size:9px;color:#9aa0a8;text-align:center;font-weight:700}
.up .co{color:#b0b5bc}.up{padding-top:16px}
.sum{display:flex;gap:28px;align-items:flex-start;margin-top:18px}.sum h3{margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6a717b}
.bp{position:relative;width:190px;aspect-ratio:68/74;border-radius:8px;background:#e8eee8;border:2px solid #fff;box-shadow:inset 0 0 0 1px #d5ddd5}
.bp::before{content:'';position:absolute;left:24%;right:24%;bottom:-2px;height:18%;border:1.5px solid #fff;border-bottom:0}
.hm{position:absolute;width:var(--s);height:var(--s);transform:translate(-50%,-50%);border-radius:50%;background:var(--c);color:#fff;font-style:normal;font-weight:900;font-size:11px;display:grid;place-items:center;box-shadow:0 0 0 2px #fff}
.leg{font-size:12.5px;color:#4b5058;line-height:1.7}
.ctl{height:56px}
</style></head><body>
<div class="top">MOCKUP · squad film · <b>${club.name}</b> · ${NAME} · the whole card for 38 games at 1600 × 900</div>
<div class="card"><div class="hd"><h1>${NAME}</h1><span><b>${starts.length}</b> starts · <b>${recs.filter(M => (M.h === CODE ? M.home : M.away).players.some(x => String(x.id) === ID && !x.st)).length}</b> off the bench · ${Object.values(where).sort((a, b) => b.n - a.n).map(w => `<b>${SHORT[w.pos] || w.pos}</b> ×${w.n}`).join(' · ')}</span></div>
<div class="tabs"><span>Season</span><span class="on">Where he played</span></div>
<div class="rows"><div class="row"><div class="rl">MD 1–${half}</div>${all.slice(0, half).map(cellC).join('')}</div><div class="row"><div class="rl">MD ${half + 1}–${all.length}</div>${all.slice(half).map(cellC).join('')}</div></div>
<div class="sum"><div><h3>Every start, one pitch</h3><div class="bp">${heat}</div></div><div><h3>&nbsp;</h3><div class="leg">${Object.values(where).sort((a, b) => b.n - a.n).map(w => `<b>${role(w.pos)}</b> × ${w.n} — MD ${w.mds.join(', ')}`).join('<br>')}</div></div></div></div>
<div class="ctl"></div></body></html>`
fs.writeFileSync(path.join(ROOT, 'mockups/player-tactical-full.html'), htmlC)
console.log('mockups/player-tactical-full.html')
console.log(`mockups/player-tactical.html · ${NAME} · ${starts.length} starts · ${Object.keys(where).length} spots`)
