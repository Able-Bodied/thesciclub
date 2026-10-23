/**
 * The store app's Content-Security-Policy, made from the website's in
 * netlify.toml so the two cannot drift. Netlify's headers never reach files
 * served from inside the app, so the native build writes this into
 * index.html as a <meta> (vite.config.ts).
 */

/** The page's origin on an iPhone; Android's is https://localhost, which 'self' covers. */
export const IOS_APP_ORIGIN = 'capacitor://localhost';

// A <meta> policy ignores frame-ancestors; the app has no manifest or worker.
const DROPPED = new Set(['frame-ancestors', 'manifest-src', 'worker-src']);

// Not in the app: Google's widget, until native sign-in. YouTube's player
// stays, as on the website; if it refuses capacitor://localhost, the card's
// "Open in YouTube" link is the way.
const NOT_IN_THE_APP = ['accounts.google.com'];

export function nativeCsp(webPolicy: string): string {
  return webPolicy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .filter(([name]) => name !== undefined && name !== '' && !DROPPED.has(name))
    .map(([name, ...sources]) => {
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

/**
 * The site-wide policy from netlify.toml's text: the one under `for = "/*"`.
 * Pages with their own (the YouTube embed's) come before it, as Netlify keeps
 * the first match, so the first policy in the file is not the site's.
 */
export function webCsp(netlifyToml: string): string {
  const site = netlifyToml.slice(Math.max(0, netlifyToml.indexOf('for = "/*"')));
  return /^\s*Content-Security-Policy = "([^"]+)"$/m.exec(site)?.[1] ?? '';
}
