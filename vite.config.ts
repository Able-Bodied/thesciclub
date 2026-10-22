import { readFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';
import { nativeCsp, webCsp } from './native-csp.ts';

/** The policy as a <meta> right after the charset, before the inline scripts it allows. */
function nativeCspPlugin(): Plugin {
  const charset = '<meta charset="UTF-8" />';
  return {
    name: 'native-csp',
    transformIndexHtml(html) {
      const policy = nativeCsp(webCsp(readFileSync('netlify.toml', 'utf8')));
      if (!policy || !html.includes(charset)) throw new Error('native-csp: nothing to write');
      return html.replace(
        charset,
        `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

// https://vite.dev/config/
// `--mode native` builds the store app's copy (capacitor.config.ts): no
// service worker, its own folder, and the policy native-csp.ts writes.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'native' ? [nativeCspPlugin()] : []),
    VitePWA({
      disable: mode === 'native',
      registerType: 'autoUpdate',
      // Registered from src/main.tsx once the first screen has had its turn:
      // the generated script registered on `load`, when Home's reads start,
      // and the first install's precache (the whole app) took the phone's
      // connection from them.
      injectRegister: false,
      // Ours rather than generated, so it can receive a push. src/sw.ts keeps
      // everything the generated one did; its header lists what and why.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Browser shortcut icons, as well as the manifest's install icons, work offline.
      // Named rather than globbed: favicon-180x180.png and
      // apple-touch-icon-precomposed.png are byte-for-byte apple-touch-icon.png,
      // and a phone only fetches them by convention, never offline, so they
      // stay on the site and out of the first install (2026-10-14).
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-192x192.png',
        'favicon-512x512.png',
        'apple-touch-icon.png',
      ],
      // A classic script, not a module: iOS came late to module workers.
      // The default precaches js, css and html only. The fonts and the logo
      // files are in public/, not imported, so they are named here — without
      // them an installed app opened offline draws in the fallback face.
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,woff2,svg}'],
        // A domain-ownership file for a checker, not a page: never opened in
        // the app, so not downloaded by every first install.
        globIgnores: ['**/node_modules/**', 'sw.js', '351f1d05184f1216b6844862231b8fbc.html'],
      },
      manifest: {
        // Launchers can choose either name; both must be the owner's install name.
        name: 'The Sci Club',
        short_name: 'The Sci Club',
        description: 'A private community for people living with spinal cord injury.',
        // Matches --navy / --canvas in src/index.css.
        theme_color: '#102A4C',
        background_color: '#F4F6F9',
        display: 'standalone',
        start_url: '/',
        // "Share to The SCI Club" in the phone's share menu (2026-10-10).
        // Android's installed app only: no iPhone browser lets a web app
        // receive a share. A POST, because photographs come as files; the
        // service worker keeps them a moment and opens /share (src/sw.ts).
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'photos',
                accept: [
                  'image/jpeg',
                  'image/png',
                  'image/webp',
                  'image/gif',
                  'image/heic',
                  'image/heif',
                ],
              },
            ],
          },
        },
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
  build: {
    ...(mode === 'native' ? { outDir: 'dist-native' } : {}),
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Everything the first screen needs in one file. Left to itself the
          // bundler split the code the lazy screens share with it into a dozen
          // files of a few hundred bytes, each a request before first paint
          // (2026-10-14: first paint 2.3 s to 2.5 s on a slow phone).
          groups: [{ name: 'app', tags: ['$initial'] }],
          // And no slivers among the screens' own shared code either.
          minSize: 20_000,
        },
      },
    },
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
    exclude: [...configDefaults.exclude, '.claude/**', 'dist-native/**', 'ios/**', 'android/**'],
  },
}));
