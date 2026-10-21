// The standard card-film chrome, shared by scorers.html and teams.html (same bars and keys as the NBA / NHL films):
// prev / next / play / restart, the counter that opens search, the "+" app list, help, fullscreen, swipe + scroll-snap,
// and "a reload lands where you were" (#N in the URL, else the last card seen). Each page renders its own cards first.
type Opts = {
  count: number
  key: string                                   // localStorage key for the last card seen
  onPaint: (i: number) => void                  // page-specific: context line, top-bar marks, social meta
  jumpHTML: (q: string) => string               // page-specific search results: rows are .jrow[data-i]
  self: string                                  // this page's file, left out of the app list
  label?: (i: number) => string                 // a name beside the counter (fixed width, so the bar's buttons never move)
}
const APPS: [string, string, string, string][] = [
  ['Season Tower', 'This app · the top-5 leagues, a whole season on one screen', '#0B8A3D', './#ALL/2026-27'],
  ['Team cards', 'This app · one card per club, in table order', '#2f9e58', './teams.html'],
  ['Match cards', 'This app · one card per match, line-ups to shots', '#177a41', './matches.html'],
  ['Top Scorers', 'This app · one card per goalscorer', '#F4C400', './scorers.html'],
  ['Goalkeepers', 'This app · one card per keeper, every save on one goal', '#2563eb', './keepers.html'],
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
    $('counter').innerHTML = `<b>${cur + 1}</b> / ${o.count}${o.label ? `<span class="cn">${o.label(cur).replace(/[&<>"]/g, '')}</span>` : ''}`
    $('counter').classList.toggle('named', !!o.label)
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
  addEventListener('hashchange', () => { const n = +location.hash.slice(1); if (n >= 1 && n - 1 !== cur) go(n - 1, false) })
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

// a match card that follows the hovered / tapped element (sel); render(el) returns its HTML ('' = nothing to show).
// It opens above the element (below when there is no room), takes the card's club colour, closes on leave / scroll.
// anchor(el): the element the card is placed against (default: el itself)
export function initTip(film: HTMLElement, sel: string, render: (el: HTMLElement) => string, anchor?: (el: HTMLElement) => HTMLElement) {
  // one card element for the page, shared when a film has more than one kind of hover card
  const tip = document.getElementById('mtip') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'mtip' }))
  let cur: HTMLElement | null = null
  const show = (el: HTMLElement) => {
    const card = el.closest<HTMLElement>('.card'); const html = card ? render(el) : ''; if (!html) return hide()
    cur = el; tip.innerHTML = html; tip.style.setProperty('--c', getComputedStyle(card!).getPropertyValue('--c')); tip.classList.add('on')
    const r = (anchor?.(el) || el).getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'
    tip.style.top = (r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10) + 'px'
  }
  const hide = () => { cur = null; tip.classList.remove('on') }
  film.addEventListener('mouseover', e => { const el = (e.target as HTMLElement).closest<HTMLElement>(sel); if (el) { if (el !== cur) show(el) } else if (cur) hide() })
  film.addEventListener('mouseleave', hide)
  film.addEventListener('click', e => { const el = (e.target as HTMLElement).closest<HTMLElement>(sel); if (el) show(el); else hide() })
  film.addEventListener('scroll', hide, { passive: true })
}

// a box carrying data-href opens that page (the match card of a game): one click with a mouse (⌘/ctrl-click: a new tab);
// on a touch screen the first tap shows the box's hover card, a second tap on the same box opens it
export function initLinks(film: HTMLElement) {
  const touch = matchMedia('(hover: none)').matches
  let armed: Element | null = null, pressed: HTMLElement | null = null
  // overlapping links (two goals on one spot): the press can land on one and the release on the other, and the click
  // then goes to their container — follow the link that was pressed
  film.addEventListener('pointerdown', (e) => { pressed = (e.target as HTMLElement).closest<HTMLElement>('[data-href]') })
  film.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, el = t.closest<HTMLElement>('[data-href]') || (pressed && t.contains(pressed) ? pressed : null)
    if (!el) { armed = null; return }
    if (touch && armed !== el) { armed = el; return }
    if (e.metaKey || e.ctrlKey) window.open(el.dataset.href, '_blank'); else location.href = el.dataset.href!
  })
}

// the films' shared navigation, centred in the top bar (it replaces the old "← Season Tower" pill): Season · Teams ·
// Matches · Scorers · Keepers, the current one filled in its colour; every tab keeps the league on screen
// (lg = a league code, or 'ALL') and opens its film at card 1
// a sideways-scrolling row with ‹ › buttons — <div class="hsw"><div class="hs">…</div><button class="hsc l" data-dir="-1">
// <button class="hsc r" data-dir="1"></div>: a click scrolls most of a view; each button hides at its end. Sizes come
// late (cards render lazily: content-visibility), so a ResizeObserver re-checks every row when it gets laid out
export function initHScroll(root: HTMLElement) {
  const sync = (s: HTMLElement) => { const w = s.parentElement!
    w.querySelector('.hsc.l')?.classList.toggle('off', s.scrollLeft < 4)
    w.querySelector('.hsc.r')?.classList.toggle('off', s.scrollLeft + s.clientWidth > s.scrollWidth - 4) }
  root.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.hsc'); if (!b) return
    const s = b.parentElement!.querySelector<HTMLElement>('.hs')!; s.scrollBy({ left: +b.dataset.dir! * s.clientWidth * .8, behavior: 'smooth' }) })
  root.addEventListener('scroll', e => { const s = e.target as HTMLElement; if (s.classList?.contains('hs')) sync(s) }, true)
  const ro = new ResizeObserver(es => es.forEach(e => sync(e.target as HTMLElement)))
  root.querySelectorAll<HTMLElement>('.hs').forEach(s => ro.observe(s))
}

export function initNav(self: 'teams' | 'matches' | 'scorers' | 'keepers' | 'coaches', lg: string, season = '2026-27') {
  const all = !lg || lg === 'ALL'
  const I = {
    season: '<svg viewBox="0 0 16 16" aria-hidden><rect x="1.5" y="8" width="3.2" height="6.5" rx=".6" fill="currentColor"/><rect x="6.4" y="3" width="3.2" height="11.5" rx=".6" fill="currentColor"/><rect x="11.3" y="5.5" width="3.2" height="9" rx=".6" fill="currentColor"/></svg>',
    teams: '<svg viewBox="0 0 24 26" aria-hidden><path d="M12 1.5l9 3.2v7.1c0 6-3.9 10.5-9 12.7C6.9 22.3 3 17.8 3 11.8V4.7z" fill="currentColor"/></svg>',
    matches: '<svg viewBox="0 0 18 24" aria-hidden><rect x="1" y="1" width="16" height="22" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M1 12h16" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    scorers: '<svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5l4.3 3.1-1.6 5h-5.4l-1.6-5z" fill="currentColor"/><path d="M12 7.5V2.5M16.3 10.6l4.6-1.6M14.7 15.6l2.9 4M9.3 15.6l-2.9 4M7.7 10.6L3.1 9" stroke="currentColor" stroke-width="1.6"/></svg>',
    keepers: '<svg viewBox="0 0 26 20" aria-hidden><path d="M2 19V2h22v17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="9" cy="11" r="3" fill="currentColor"/></svg>',
    coaches: '<svg viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="14" r="6.2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9 7.8h12.5v5.2H14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="9" cy="14" r="2" fill="currentColor"/></svg>',
  }
  const tabs: [keyof typeof I, string, string, string, string][] = [   // key, label, colour, ink when filled, href
    ['season', 'Season', '#0f766e', '#fff', `./#${all ? 'ALL' : lg}/${season}`],
    ['teams', 'Teams', '#0B8A3D', '#fff', `teams.html?lg=${all ? 'ALL' : lg}#1`],
    ['matches', 'Matches', '#15181d', '#fff', `matches.html?lg=${all ? 'ALL' : lg}#1`],
    ['scorers', 'Scorers', '#D9A900', '#2b2200', all ? 'scorers.html#1' : `scorers.html?lg=${lg}#1`],
    ['keepers', 'Keepers', '#2563eb', '#fff', all ? 'keepers.html#1' : `keepers.html?lg=${lg}#1`],
    ['coaches', 'Coaches', '#7c3aed', '#fff', all ? 'coaches.html#1' : `coaches.html?lg=${lg}#1`],
  ]
  const nav = document.createElement('nav'); nav.className = 'fnav'; nav.setAttribute('aria-label', 'Views')
  nav.innerHTML = tabs.map(([k, label, c, ink, href]) => `<a class="fn${k === self ? ' on' : ''}" href="${href}" title="${label}" aria-label="${label}" style="--fc:${c};--fi:${ink}"${k === self ? ' aria-current="page"' : ''}>${I[k]}<span class="lbl">${label}</span></a>`).join('')
  // the tabs at the right end of the top bar; the credit moves down to the control bar, on its right
  document.querySelector('#topbar > .pill')?.remove()
  const bar = document.getElementById('topbar')!, credit = document.getElementById('credit'), ctl = document.getElementById('ctlbar')
  if (credit && ctl) ctl.appendChild(credit)
  bar.appendChild(nav)
}

