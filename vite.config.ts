import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Ours rather than generated, so it can receive a push. src/sw.ts keeps
      // everything the generated one did; its header lists what and why.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // A classic script, not a module: iOS came late to module workers.
      // The default precaches js, css and html only. The fonts and the logo
      // files are in public/, not imported, so they are named here — without
      // them an installed app opened offline draws in the fallback face.
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,woff2,ttf,svg}'],
      },
      manifest: {
        name: 'The SCI Club',
        short_name: 'SCI Club',
        description: 'A private community for people living with spinal cord injury.',
        // Matches --navy / --canvas in src/index.css.
        theme_color: '#102A4C',
        background_color: '#F4F6F9',
        display: 'standalone',
        start_url: '/',
        // Two sets since the 2026-09-28 rebrand. The owner's mark is a
        // rounded navy plate with transparent corners, which is right as a
        // plain icon and wrong under a mask: Android fills the corners and
        // crops the gold keyline. The maskable pair is the same mark on navy
        // to every edge, scaled to 68% so the keyline's corners sit inside the
        // 80% safe circle. Rendered from sci-club-logo/svg/sci-club-mark.svg.
        icons: [
          { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    /*
     * Hostnames the dev server will answer to.
     *
     * Vite refuses a request whose Host header it does not recognise, and that
     * check is not noise: without it a page anywhere can point a hostname at
     * 127.0.0.1, have the browser send it to this server, and read back
     * whatever it serves — source, .env values inlined into modules, the lot.
     *
     * A tunnel arrives under a hostname Vite has never seen, so the tunnel's
     * domain has to be named. The leading dot matches any subdomain, which is
     * what makes this usable: an ngrok free URL is a new random subdomain every
     * time the agent restarts.
     *
     * Dev only. `vite build` does not read this, and nothing here reaches
     * production — Netlify serves static files and has no host check to relax.
     */
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.trycloudflare.com'],

    /*
     * Hot reload through a tunnel, when TUNNEL=1 is set.
     *
     * The browser loads the page from https://…/ on 443, but the HMR client
     * connects back on `server.port` by default, and a tunnel does not expose
     * 5173 — so the socket fails and the page stops updating while looking
     * like it works. Behind the flag because setting it unconditionally breaks
     * the ordinary localhost case, which has no 443 to reach.
     *
     *   TUNNEL=1 pnpm dev
     */
    ...(process.env.TUNNEL ? { hmr: { protocol: 'wss', clientPort: 443 } } : {}),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
