// The standard card-film chrome, shared by scorers.html and teams.html (same bars and keys as the NBA / NHL films):
// prev / next / play / restart, the counter that opens search, the "+" app list, help, fullscreen, swipe + scroll-snap,
// and "a reload lands where you were" (#N in the URL, else the last card seen). Each page renders its own cards first.
type Opts = {
  count: number
  key: string                                   // localStorage key for the last card seen
  onPaint: (i: number) => void                  // page-specific: context line, top-bar marks, social meta
  jumpHTML: (q: string) => string               // page-specific search results: rows are .jrow[data-i]
  self: string                                  // this page's file, left out of the app list
}
const APPS: [string, string, string, string][] = [
  ['Season Tower', 'This app · the top-5 leagues, a whole season on one screen', '#0B8A3D', './#ALL/2026-27'],
  ['Top Scorers', 'This app · one card per goalscorer', '#F4C400', './scorers.html'],
  ['Team cards', 'This app · one card per club, in table order', '#2f9e58', './teams.html'],
  ['Formula 1', 'A season read lap by lap', '#00d7b6', 'https://f1.aguywithascarf.com/'],
  ['Tennis', 'The season, one player at a time', '#f2c14e', 'https://tennis.aguywithascarf.com/'],
  ['NFL', 'Wins up, losses down', '#4d94e0', 'https://nfl.aguywithascarf.com/'],
  ['NBA', 'Season film and towers', '#e0453f', 'https://nba.aguywithascarf.com/'],
  ['NHL', 'Season film and towers', '#2a9fd8', 'https://nhl.aguywithascarf.com/'],
  ['World Cup', 'Road to the Final', '#3fbe72', 'https://worldcupbracket.aguywithascarf.com/'],
  ['PGA TOUR', 'Season Film', '#57a34a', 'https://golf.aguywithascarf.com/'],
  ['Athletics', 'World Record Film', '#d98a3d', 'https://athletics.aguywithascarf.com/'],
]

export function initFilm(o: Opts) {
  const $ = (id: string) => document.getElementById(id)!
  const film = $('film')
  const cards = [...film.children] as HTMLElement[]
  $('applist').innerHTML = APPS.filter(a => !a[3].includes(o.self)).map(([n, k, c, u]) =>
    `<a class="approw" href="${u}"${u.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}><i style="background:${c}"></i><span>${n}<em>${k}</em></span><span>→</span></a>`).join('')

  let cur = 0, playing: number | null = null, target = -1
  function paint() {
    $('counter').innerHTML = `<b>${cur + 1}</b> / ${o.count}`
    history.replaceState(null, '', '#' + (cur + 1))
    try { localStorage.setItem(o.key, String(cur)) } catch { }
    o.onPaint(cur)
  }
  function go(i: number, smooth = true) {
    cur = Math.max(0, Math.min(o.count - 1, i)); target = cur
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
    playing = window.setInterval(() => { if (cur >= o.count - 1) return togglePlay(); step(1) }, 3200)
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>'; b.title = 'Pause'
  }
  const fs = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { })
  const closeMods = () => document.querySelectorAll('.mod.on').forEach(m => m.classList.remove('on'))
  const openMod = (id: string) => { closeMods(); $(id).classList.add('on') }

  function drawJump(q: string) {
    $('jlist').innerHTML = o.jumpHTML(q)
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
    else if (e.key === 'End') go(o.count - 1)
    else if (e.key === 'f') fs()
    else if (e.key === 'h' || e.key === '?') openMod('hmodal')
    else if (e.key === 'g' || e.key === '/') { e.preventDefault(); openJump() }
  })
  Object.assign(window, { go, step, togglePlay, fs, openMod, closeMods, openJump })

  // a reload lands where you were, never card 1: #N, else the last card seen (not in a requestAnimationFrame: a tab
  // opened in the background must still show its card + counter)
  let i = 0
  const h = location.hash.replace('#', '')
  if (/^\d+$/.test(h)) i = +h - 1
  else { try { const s = localStorage.getItem(o.key); if (s != null) i = +s } catch { } }
  go(i, false)
  addEventListener('resize', () => go(cur, false))
  return { go, step, openMod, closeMods }
}

// hover / tap → everything carrying the hovered element's key lights up in the club colour, the rest of the card dims.
// attr = the hovered element's key attribute; match = how to find its partners from that key.
export function initHighlight(film: HTMLElement, hoverSel: string, partners: (key: string) => string, keyOf: (el: HTMLElement) => string) {
  const highlight = (e: Event) => {
    const el = e.target as HTMLElement, card = el.closest('.card'); if (!card) return
    const t = el.closest<HTMLElement>(hoverSel)
    card.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'))
    card.classList.toggle('hlon', !!t)
    if (t) card.querySelectorAll(partners(keyOf(t))).forEach(x => x.classList.add('hl'))
  }
  film.addEventListener('mouseover', highlight); film.addEventListener('click', highlight)
  film.addEventListener('mouseleave', () => film.querySelectorAll('.hlon').forEach(c => { c.classList.remove('hlon'); c.querySelectorAll('.hl').forEach(x => x.classList.remove('hl')) }))
}
