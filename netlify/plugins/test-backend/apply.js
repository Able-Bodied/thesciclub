// The test site's header swap, apart from index.js: Netlify takes every
// export of a plugin's index for a build event.
const LIVE_REF = 'erijdvqnxavwezsbbojv';

/** Swaps the live ref for `ref` in place; an error message if `ref` is wrong. */
export function applyTestRef(headers, ref) {
  if (!ref) return null;
  if (!/^[a-z]{20}$/.test(ref) || ref === LIVE_REF) return `not a test project ref: ${ref}`;
  for (const rule of headers) {
    for (const [name, value] of Object.entries(rule.values ?? {})) {
      if (typeof value === 'string') rule.values[name] = value.replaceAll(LIVE_REF, ref);
    }
  }
  return null;
}
