// tests.thesciclub.com talks to its own Supabase project. netlify.toml's
// Content-Security-Policy names the live one, so on a site with
// TEST_SUPABASE_REF set, the live ref in every header becomes that one.
// Without the variable (the live site) nothing changes.
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

export const onPreBuild = ({ netlifyConfig, utils }) => {
  const ref = process.env.TEST_SUPABASE_REF;
  const error = applyTestRef(netlifyConfig.headers, ref);
  if (error) utils.build.failBuild(`TEST_SUPABASE_REF is ${error}`);
  else if (ref) console.log(`Headers name the test project ${ref}, not the live one.`);
};
