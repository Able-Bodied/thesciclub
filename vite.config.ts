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
      manifest: {
        name: 'The SCI Club',
        short_name: 'SCI Club',
        description: 'A private community for people living with spinal cord injury.',
        // Matches --navy / --canvas in src/index.css.
        theme_color: '#102A4C',
        background_color: '#F4F6F9',
        display: 'standalone',
        start_url: '/',
        // The glyph fills the square edge to edge, so it survives the circular
        // and squircle masks Android and iOS apply — which is exactly why the
        // full lockup was the wrong choice here. 'any maskable' rather than a
        // separate padded icon, for the same reason.
        icons: [
          {
            src: '/favicon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/favicon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
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
