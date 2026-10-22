/**
 * Run after `cap sync ios`, by both iOS workflows: the sign-in plugin's
 * Package.swift must not pull in Facebook's SDK, which declares tracking.
 * capacitor.config.ts turns it off, and the plugin's own sync hook comments
 * the lines out; this proves the hook ran. Its product names count too, as
 * a binary target need not say "facebook". ios-release.yml checks the built
 * app as well.
 *
 *   node scripts/check-native-build.mjs
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const plugin = dirname(require.resolve('@capgo/capacitor-social-login/package.json'));
const manifest = readFileSync(join(plugin, 'Package.swift'), 'utf8');
const FACEBOOK = /facebook|FBSDK|FacebookCore|FacebookLogin|FBAEM/i;

const live = manifest
  .split('\n')
  .filter((line) => FACEBOOK.test(line) && !line.trim().startsWith('//'));

if (live.length > 0) {
  console.error('::error::The sign-in plugin still includes Facebook’s SDK:');
  for (const line of live) console.error(`  ${line.trim()}`);
  console.error('Check SocialLogin.providers in capacitor.config.ts, then run cap sync ios again.');
  process.exit(1);
}
if (!/GoogleSignIn-iOS/.test(manifest)) {
  console.error('::error::The sign-in plugin no longer includes Google Sign-In.');
  process.exit(1);
}
console.log('Sign-in plugin: Apple and Google only.');
