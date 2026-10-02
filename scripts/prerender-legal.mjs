/**
 * After `vite build`: write dist/privacy.html and dist/terms.html, the two
 * pages with their words in the HTML. Why, in src/routes/legal/static.tsx.
 *
 * Loaded through Vite so the page components resolve exactly as the app's
 * do (the `@/` paths, TSX). Netlify serves dist/privacy.html for /privacy
 * ahead of the SPA rewrite in netlify.toml, which only applies where no file
 * exists.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { STATIC_PAGES, withPage } = await vite.ssrLoadModule('/src/routes/legal/static.tsx');
  const shell = await readFile('dist/index.html', 'utf8');
  for (const { file, title, Page } of STATIC_PAGES) {
    await writeFile(`dist/${file}`, withPage(shell, title, Page));
    console.log(`  dist/${file}`);
  }
} finally {
  await vite.close();
}
