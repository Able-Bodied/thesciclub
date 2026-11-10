// tests.thesciclub.com talks to its own Supabase project. netlify.toml's
// Content-Security-Policy names the live one, so on a site with
// TEST_SUPABASE_REF set, the live ref in every header becomes that one.
// Without the variable (the live site) nothing changes.
import { applyTestRef } from './apply.js';

export const onPreBuild = ({ netlifyConfig, utils }) => {
  const ref = process.env.TEST_SUPABASE_REF;
  const error = applyTestRef(netlifyConfig.headers, ref);
  if (error) utils.build.failBuild(`TEST_SUPABASE_REF is ${error}`);
  else if (ref) console.log(`Headers name the test project ${ref}, not the live one.`);
};
