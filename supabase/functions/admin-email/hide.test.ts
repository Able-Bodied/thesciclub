import { describe, expect, it } from 'vitest';
import { framedHtml, hideSecrets } from './hide';

describe('hideSecrets', () => {
  it('hides sign-in codes and one-time links but keeps colours and dates', () => {
    const shown = hideSecrets(
      '<p style="color:#111111;font-size:36px">482913</p>' +
        '<a href="https://thesciclub.com/auth/confirm.html?type=email&amp;token_hash=pkce_abc123&amp;next=/">x</a>' +
        '<a href="https://thesciclub.com/join?invite=Zq9-x_7">Join</a> Nov 23, 2026',
    );
    expect(shown).not.toContain('482913');
    expect(shown).not.toContain('pkce_abc123');
    expect(shown).not.toContain('Zq9-x_7');
    expect(shown).toContain('#111111');
    expect(shown).toContain('Nov 23, 2026');
    expect(shown).toContain('type=email');
  });

  it('frames the email so nothing outside loads', () => {
    expect(framedHtml('<html><head></head><body>Hi</body></html>')).toMatch(
      /<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'/,
    );
  });
});
