/**
 * The secret Supabase's Apple provider needs, made from Apple's `.p8` key.
 *
 *   node scripts/apple-secret.mjs <path to AuthKey_XXXXXXXXXX.p8> [key id]
 *
 * Apple's web sign-in does not take a fixed secret: it takes a JWT signed with
 * the club's private key, and Apple refuses one that lives longer than six
 * months. So this has to be run again before the last one runs out, or every
 * Apple sign-in fails with `invalid_client` and Apple gives no warning. The
 * expiry date is printed; put it in a calendar.
 *
 * Paste the output into Supabase: Authentication → Sign In / Providers →
 * Apple → Secret Key (for OAuth). The key file stays wherever it is; nothing
 * here writes it, or the secret, anywhere.
 *
 * The key id is in Apple's file name (AuthKey_<key id>.p8), so it is read from
 * there unless given.
 */

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/** Apple Developer team, beside the account name on developer.apple.com. */
const TEAM_ID = '3RZ3A2CJ9N';
/** The Services ID, which is the provider's Client ID. */
const SERVICES_ID = 'com.thesciclub.web';
/** Apple's limit is six months; a day short of it. */
const LIFETIME_DAYS = 180;

const [keyPath, givenKeyId] = process.argv.slice(2);
if (!keyPath) {
  console.error('Usage: node scripts/apple-secret.mjs <AuthKey_XXXXXXXXXX.p8> [key id]');
  process.exit(1);
}
const keyId = givenKeyId ?? /^AuthKey_([A-Z0-9]{10})\.p8$/.exec(basename(keyPath))?.[1];
if (!keyId) {
  console.error('No key id: pass it after the path, or keep Apple’s AuthKey_<key id>.p8 name.');
  process.exit(1);
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const expires = now + LIFETIME_DAYS * 86_400;

const unsigned = [
  encode({ alg: 'ES256', kid: keyId }),
  encode({
    iss: TEAM_ID,
    iat: now,
    exp: expires,
    aud: 'https://appleid.apple.com',
    sub: SERVICES_ID,
  }),
].join('.');

// ES256 in a JWT is the raw r‖s pair, not the DER Node signs by default.
const signature = sign('sha256', Buffer.from(unsigned), {
  key: createPrivateKey(readFileSync(keyPath)),
  dsaEncoding: 'ieee-p1363',
}).toString('base64url');

process.stdout.write(`${unsigned}.${signature}\n`);
console.error(
  `Expires ${new Date(expires * 1000).toISOString().slice(0, 10)}. Make a new one before then.`,
);
