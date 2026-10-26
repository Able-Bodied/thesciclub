/**
 * The store app's Content-Security-Policy, made from the website's in
 * netlify.toml so the two cannot drift. Netlify's headers never reach files
 * served from inside the app, so the native build writes this into
 * index.html as a <meta> (vite.config.ts).
 */

/** The page's origin on an iPhone; Android's is https://localhost, which 'self' covers. */
export const IOS_APP_ORIGIN = 'capacitor://localhost';

// A <meta> policy ignores frame-ancestors; the app has no manifest. Without
// worker-src, the map's worker falls back to script-src, the app's own files.
const DROPPED = new Set(['frame-ancestors', 'manifest-src', 'worker-src']);

// Not in the app: Google's widget, until native sign-in.
const NOT_IN_THE_APP = ['accounts.google.com'];

/**
 * The app frames only the club's YouTube page, which frames YouTube itself:
 * YouTube refuses capacitor://localhost (public/embed/youtube.html).
 */
export const APP_FRAMES = 'https://thesciclub.com/embed/';

export function nativeCsp(webPolicy: string): string {
  return webPolicy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .filter(([name]) => name !== undefined && name !== '' && !DROPPED.has(name))
    .map(([name, ...sources]) => {
      if (name === 'frame-src') return `${name} ${APP_FRAMES}`;
      const kept = sources.filter(
        (source) => !NOT_IN_THE_APP.some((host) => source.includes(host)),
      );
      // Said outright in case WebKit does not count a custom scheme as 'self'.
      const named = kept.flatMap((source) =>
        source === "'self'" ? [source, IOS_APP_ORIGIN] : [source],
      );
      return [name, ...(named.length > 0 ? named : ["'none'"])].join(' ');
    })
    .join('; ');
}

/** The site-wide "/*" rule's policy from netlify.toml's text, wherever the rule sits. */
export function webCsp(netlifyToml: string): string {
  const site = netlifyToml
    .split('[[headers]]')
    .slice(1)
    .find((rule) => /^\s*for = "\/\*"$/m.test(rule));
  return /^\s*Content-Security-Policy = "([^"]+)"$/m.exec(site ?? '')?.[1] ?? '';
}
