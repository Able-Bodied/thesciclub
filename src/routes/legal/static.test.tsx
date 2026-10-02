import { describe, expect, it } from 'vitest';
import { STATIC_PAGES, withPage } from '@/routes/legal/static';
import shell from '../../../index.html?raw';

/**
 * What a program that does not run JavaScript gets from /privacy and /terms:
 * the real index.html with the page written into it. Twilio's pre-check is
 * one, and it looks for the title, the SMS sentence and the brand.
 */

const privacy = STATIC_PAGES.find((p) => p.file === 'privacy.html');
const terms = STATIC_PAGES.find((p) => p.file === 'terms.html');
if (!privacy || !terms) throw new Error('a static page is missing');

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

describe('a shell that has changed shape', () => {
  it('stops the build rather than writing an empty page', () => {
    const changed = shell.replace('<div id="root"></div>', '<div id="app"></div>');
    expect(() => withPage(changed, privacy.title, privacy.Page)).toThrow();
  });
});
