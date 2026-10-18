import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built site works both from a GitHub Pages sub-path
// (user.github.io/<repo>/) and from any static host (Railway `serve -s dist`).
export default defineConfig({
  plugins: [react()],
  base: './',
  // five pages: the Season Tower app and the scorer, team, match and goalkeeper card films
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', scorers: 'scorers.html', teams: 'teams.html', matches: 'matches.html', keepers: 'keepers.html', player: 'player.html' } } },
})
