import { describe, expect, it } from 'vitest';
import { STATIC_PAGES, withPage } from '@/routes/legal/static';
import { PHONE_BUTTON, SIGN_IN_CONSENT, SMS_CONSENT } from '@/routes/onboarding/steps';
import shell from '../../../index.html?raw';

/**
 * What a program that does not run JavaScript gets from /privacy and /terms:
 * the real index.html with the page written into it. Twilio's pre-check is
 * one, and it looks for the title, the SMS sentence and the brand.
 */

const privacy = STATIC_PAGES.find((p) => p.file === 'privacy.html');
const terms = STATIC_PAGES.find((p) => p.file === 'terms.html');
const join = STATIC_PAGES.find((p) => p.file === 'join.html');
if (!privacy || !terms || !join) throw new Error('a static page is missing');

describe('the static Privacy Policy', () => {
  const html = withPage(shell, privacy.title, privacy.Page);

  it('is titled Privacy Policy', () => {
    expect(html).toContain('<title>Privacy Policy · The SCI Club</title>');
    expect(html).not.toContain('<title>The SCI Club</title>');
  });

  it('carries the SMS sentence and the brand in the HTML itself', () => {
    expect(html).toContain(
      'We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.',
    );
    expect(html).toContain('Able Bodied Inc.');
    expect(html).toContain(
      'No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.',
    );
    expect(html).toContain(
      'We do not share, sell, or provide your mobile phone number or messaging consent data to third parties or affiliates for marketing or promotional purposes.',
    );
    expect(html).toContain('Message and data rates may apply.');
  });

  it('is not marked noindex, and still starts the app', () => {
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('<script type="module"');
  });
});

describe('the static Terms of Service', () => {
  const html = withPage(shell, terms.title, terms.Page);

  it('is titled Terms of Service and carries the text-message terms', () => {
    expect(html).toContain('<title>Terms of Service · The SCI Club</title>');
    expect(html).toContain('Carriers are not liable for delayed or undelivered messages');
    expect(html).toContain('<b>Text STOP</b>');
  });
});

/**
 * The opt-in page the registration names. Rejected a second time on
 * 2026-10-09 while it was an empty shell: a reviewer that did not run the app
 * found no Privacy Policy linked from it.
 */
describe('the static join page', () => {
  const html = withPage(shell, join.title, join.Page, join.indexed);
  const escaped = (s: string) => s.replaceAll('&', '&amp;').replaceAll("'", '&#x27;');

  it('links the Privacy Policy and the Terms from the first screen', () => {
    const welcome = html.slice(0, html.indexOf('<noscript>'));
    expect(welcome).toContain('Join the club');
    expect(welcome).toContain('href="/privacy"');
    expect(welcome).toContain('href="/terms"');
  });

  it('carries the join door and the sign-in line as registered, with the boxes unticked', () => {
    const form = html.slice(html.indexOf('<noscript>'));
    expect(form).toContain(escaped(SMS_CONSENT));
    expect(form).toContain(escaped(SIGN_IN_CONSENT));
    expect(form).toContain(PHONE_BUTTON);
    expect(form).toContain('id="sms-consent"');
    expect(form).toContain('id="terms-agreed"');
    expect(form).not.toMatch(/checked/);
  });

  it('keeps its noindex and still starts the app', () => {
    expect(html).toContain('name="robots"');
    expect(html).toContain('<script type="module"');
  });
});

describe('a shell that has changed shape', () => {
  it('stops the build rather than writing an empty page', () => {
    const changed = shell.replace('<div id="root"></div>', '<div id="app"></div>');
    expect(() => withPage(changed, privacy.title, privacy.Page)).toThrow();
  });
});

// The old Netlify address sends people to thesciclub.com from inside the page
// (index.html), and the static pages carry the same shell, so they do too.
describe('the old Netlify address', () => {
  it('moves a reader of the static privacy page to thesciclub.com', () => {
    const html = withPage(shell, privacy.title, privacy.Page);
    expect(html).toContain("location.hostname === 'thesciclub.netlify.app'");
    expect(html).toContain("'https://thesciclub.com' + location.pathname");
  });
});
