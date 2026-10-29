import { describe, expect, it } from 'vitest';
import { markdownToHtml, markdownToPlain } from '@/lib/markdown';
import { sanitizeHtml } from '@/routes/events/rich-text';

/** What a member's browser gets: converted, then through the allowlist. */
const shown = (text: string) => sanitizeHtml(markdownToHtml(text));

describe('markdownToHtml', () => {
  it('reads plain text as it always read: paragraphs and line breaks', () => {
    expect(markdownToHtml('First line\nsecond line\n\nNew paragraph')).toBe(
      '<p>First line<br>second line</p><p>New paragraph</p>',
    );
  });

  it('draws what the toolbar writes', () => {
    expect(markdownToHtml('**Bring** a *friend* and _water_')).toBe(
      '<p><strong>Bring</strong> a <em>friend</em> and <em>water</em></p>',
    );
    expect(markdownToHtml('## What to bring')).toBe('<h3>What to bring</h3>');
    expect(markdownToHtml('- Water\n- Gloves')).toBe('<ul><li>Water</li><li>Gloves</li></ul>');
    expect(markdownToHtml('1. Park\n2. Roll in')).toBe('<ol><li>Park</li><li>Roll in</li></ol>');
    expect(markdownToHtml('[Sign up](https://norcalsci.org/signup)')).toBe(
      '<p><a href="https://norcalsci.org/signup">Sign up</a></p>',
    );
  });

  it('nests bold and a link, and ends a list at a paragraph', () => {
    expect(markdownToHtml('**[Map](https://maps.example.org)**')).toBe(
      '<p><strong><a href="https://maps.example.org">Map</a></strong></p>',
    );
    expect(markdownToHtml('- One\nAfter')).toBe('<ul><li>One</li></ul><p>After</p>');
    expect(markdownToHtml('- One\n1. Two')).toBe('<ul><li>One</li></ul><ol><li>Two</li></ol>');
  });

  it('keeps arithmetic and snake_case as typed', () => {
    expect(markdownToHtml('2 * 3 * 4 and room_one_two')).toBe('<p>2 * 3 * 4 and room_one_two</p>');
  });

  it('links bare addresses, as Chat does', () => {
    expect(markdownToHtml('Details at https://norcalsci.org/picnic')).toContain(
      '<a href="https://norcalsci.org/picnic">',
    );
  });
});

describe('what is shown, after the allowlist', () => {
  it('escapes HTML that was typed rather than running it', () => {
    const html = shown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops a link that is not a web address', () => {
    const html = shown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('cannot break out of an href with a quote', () => {
    const html = shown('[x](https://a.org/"onmouseover="alert(1))');
    const link = new DOMParser().parseFromString(html, 'text/html').querySelector('a');
    // The quote stays inside the address, escaped; it never becomes an attribute.
    expect(link?.getAttributeNames().sort()).toEqual(['href', 'rel', 'target']);
  });

  it('opens links in a new tab, without the club as referrer', () => {
    expect(shown('[Sign up](https://norcalsci.org)')).toContain('rel="noopener noreferrer"');
  });
});

// A post's @mentions (20261029070000): a profile link where the caller has one.
describe('markdownToHtml with mentions', () => {
  const ID = '0b6c7a3e-1d2f-4c5b-8a9e-0f1e2d3c4b5a';
  const post = (text: string) =>
    sanitizeHtml(
      markdownToHtml(text, (name) => (name === 'ana.r' ? `/peers/${ID}` : null)),
      { peers: true },
    );

  it('links a known @name in the app, and leaves the rest as words', () => {
    expect(post('Ask @Ana.R. or @bo')).toBe(`<p>Ask <a href="/peers/${ID}">@Ana.R</a>. or @bo</p>`);
  });

  it('links inside bold and lists, but not inside a link or an address', () => {
    expect(post('**@ana.r**')).toBe(`<p><strong><a href="/peers/${ID}">@ana.r</a></strong></p>`);
    expect(post('- @ana.r')).toContain(`<li><a href="/peers/${ID}">@ana.r</a></li>`);
    expect(post('[@ana.r](https://a.org)')).not.toContain('/peers/');
    expect(post('mail me at x@ana.r')).not.toContain('/peers/');
  });

  it('keeps a profile link only when asked, and nothing else inside the app', () => {
    const html = markdownToHtml('@ana.r', () => `/peers/${ID}`);
    expect(sanitizeHtml(html)).toBe('<p><a>@ana.r</a></p>');
    expect(
      sanitizeHtml('<a href="/admin">x</a><a href="/peers/../admin">y</a>', { peers: true }),
    ).toBe('<a>x</a><a>y</a>');
  });
});

describe('markdownToPlain', () => {
  it('takes the marks out and keeps the words and the lines', () => {
    expect(
      markdownToPlain('## What to bring\n- **Water**\n- A *friend*\n[Sign up](https://a.org)'),
    ).toBe('What to bring\nWater\nA friend\nSign up');
  });

  it('leaves plain text, arithmetic and snake_case alone', () => {
    expect(markdownToPlain('2 * 3 * 4 and room_one_two\nhttps://norcalsci.org')).toBe(
      '2 * 3 * 4 and room_one_two\nhttps://norcalsci.org',
    );
  });
});
