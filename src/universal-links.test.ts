import { describe, expect, it } from 'vitest';
import ENTITLEMENTS from '../ios/App/App/App.entitlements?raw';
import NETLIFY from '../netlify.toml?raw';
import FILE from '../public/.well-known/apple-app-site-association?raw';
import APPLE_SECRET from '../scripts/apple-secret.mjs?raw';
import CONFIRMATION from '../supabase/templates/confirmation.html?raw';
import EMAIL_CHANGE from '../supabase/templates/email_change.html?raw';
import RECOVERY from '../supabase/templates/recovery.html?raw';

/**
 * Which links open the store app (public/.well-known/apple-app-site-association).
 *
 * The rule: a link opens the app only where it succeeds there. Emailed links
 * carry a token_hash, which signs in wherever it is opened, so they may. A
 * sign-in that returns to the website (Google's and Apple's redirects to
 * /join?google= or ?apple=, /me?…=linked, the Home Screen app's
 * /app-sign-in) must never be pulled into the app: its session is the
 * browser's. This reads the file as Apple does, for the cases that matter.
 */

interface Component {
  '/': string;
  '?'?: Record<string, string>;
  exclude?: boolean;
}
const file = JSON.parse(FILE) as {
  applinks: { details: { appIDs: string[]; components: Component[] }[] };
};
const detail = file.applinks.details[0];

/** Apple's pattern: `*` any run, `?` one character. */
function matches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(value);
}

function opensTheApp(href: string): boolean {
  const url = new URL(href);
  for (const component of detail?.components ?? []) {
    if (!matches(component['/'], url.pathname)) continue;
    const query = component['?'] ?? {};
    const fits = Object.entries(query).every(([key, pattern]) =>
      matches(pattern, url.searchParams.get(key) ?? ''),
    );
    if (fits) return !component.exclude;
  }
  return false;
}

describe('the links that open the store app', () => {
  it('name the store app, by Team ID and bundle ID', () => {
    expect(file.applinks.details).toHaveLength(1);
    expect(detail?.appIDs).toEqual(['3RZ3A2CJ9N.com.thesciclub.app']);
    // The same Team ID as Apple's web sign-in secret.
    expect(APPLE_SECRET).toContain("TEAM_ID = '3RZ3A2CJ9N'");
  });

  it('include invites, QR codes and every emailed link', () => {
    expect(opensTheApp('https://thesciclub.com/join?invite=tok-1')).toBe(true);
    expect(opensTheApp('https://thesciclub.com/join?qr=abc')).toBe(true);
    expect(
      opensTheApp('https://thesciclub.com/auth/confirm.html?type=recovery&token_hash=h&next=x'),
    ).toBe(true);
    for (const template of [CONFIRMATION, RECOVERY, EMAIL_CHANGE]) {
      expect(template).toContain('{{ .SiteURL }}/auth/confirm.html?type=');
    }
  });

  it('include the pages members pass on', () => {
    for (const page of [
      '/home',
      '/events',
      '/events/7',
      '/peers/a1',
      '/chat/t/x',
      '/notifications',
    ])
      expect(opensTheApp(`https://thesciclub.com${page}`)).toBe(true);
  });

  it('never take a sign-in that belongs to the browser', () => {
    for (const href of [
      'https://thesciclub.com/join',
      'https://thesciclub.com/join?google=signin&next=%2Fhome',
      'https://thesciclub.com/join?apple=signin',
      'https://thesciclub.com/join?confirmed=1',
      'https://thesciclub.com/me?google=linked',
      'https://thesciclub.com/me?apple=linked',
      'https://thesciclub.com/app-sign-in?pairing=p',
      'https://thesciclub.com/reset-password',
      'https://thesciclub.com/auth/confirm.html',
      'https://thesciclub.com/',
    ])
      expect(opensTheApp(href), href).toBe(false);
  });

  it('are served as JSON by Netlify', () => {
    const block = NETLIFY.slice(NETLIFY.indexOf('for = "/.well-known/apple-app-site-association"'));
    expect(block).toMatch(
      /^for = "[^"]+"\s+\[headers\.values\]\s+Content-Type = "application\/json"/,
    );
  });

  it('match the app’s entitlement', () => {
    expect(ENTITLEMENTS).toContain('<string>applinks:thesciclub.com</string>');
  });
});
