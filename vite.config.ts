import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built site works both from a GitHub Pages sub-path
// (user.github.io/<repo>/) and from any static host (Railway `serve -s dist`).
export default defineConfig({
  plugins: [react()],
  base: './',
  // three pages: the Season Tower app, the top-scorers film and the team-card film
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', scorers: 'scorers.html', teams: 'teams.html' } } },
})
