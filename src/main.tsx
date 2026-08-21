import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SeasonTower } from './SeasonTower'

// Build-time defaults. `colorMode` and the rest mirror the NFL Season Tower sibling so the two
// apps feel like one family. `season` is the only Serie A season shipped so far (2026/27).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SeasonTower
      season="2026-27"
      colorMode="result"
      pendingMode="ceiling"
      lossReverse={true}
      orientation="auto"
      scoreLabels={true}
      seed={20260822}
    />
  </StrictMode>,
)
