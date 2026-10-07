import { describe, expect, it } from 'vitest';
import { findLinks } from '../../../src/lib/links.ts';
import { decodeEntities, firstLink, mayFetch, readMeta, youtubeId } from './extract.ts';

describe('firstLink', () => {
  it.each([
    'A cushion: https://www.amazon.com/ROHO/dp/B00?ref=x. Worth it.',
    'see www.reeve.org/resources today',
    '(see https://example.com)',
    'https://en.wikipedia.org/wiki/Spinal_cord_(anatomy) is long',
    'two: https://one.example/a and https://two.example/b',
    'nothing here, e.g. T6.Complete',
    'javascript:alert(1) and http://localhost',
  ])('agrees with what the app draws as a link: %s', (body) => {
    const drawn = findLinks(body).flatMap((piece) => (piece.kind === 'link' ? [piece.href] : []));
    expect(firstLink(body)).toBe(drawn[0] ?? null);
  });
});

describe('youtubeId', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
  ])('finds the video in %s', (href) => {
    expect(youtubeId(href)).toBe('dQw4w9WgXcQ');
  });

  it.each([
    'https://www.youtube.com/@RickAstleyYT',
    'https://www.youtube.com/watch?v=short',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/playlist?list=PL123',
  ])('is not fooled by %s', (href) => {
    expect(youtubeId(href)).toBeNull();
  });
});

describe('mayFetch', () => {
  it.each([
    'https://www.reeve.org/',
    'http://example.com/page',
    'https://www.instagram.com/p/abc/',
    'https://93.184.216.34/',
  ])('fetches a public page: %s', (href) => {
    expect(mayFetch(href)).toBe(true);
  });

  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://10.0.0.5/admin',
    'http://172.20.1.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://db.internal/',
    'http://printer.local/',
    'https://example.com:5432/',
    'https://user:pass@example.com/',
    'ftp://example.com/',
    'file:///etc/passwd',
    'http://intranet/',
  ])('refuses %s', (href) => {
    expect(mayFetch(href)).toBe(false);
  });
});

describe('readMeta', () => {
  it('prefers Open Graph, resolves the picture, and decodes entities', () => {
    const html = `<html><head><title>Plain title</title>
      <meta property="og:title" content="The Christopher &amp; Dana Reeve Foundation">
      <meta content="Curing spinal cord injury &#8212; and living well." property="og:description" />
      <meta property='og:site_name' content='Reeve'>
      <meta property="og:image" content="/img/share.jpg">
      </head></html>`;
    expect(readMeta(html, 'https://www.reeve.org/about')).toEqual({
      title: 'The Christopher & Dana Reeve Foundation',
      description: 'Curing spinal cord injury — and living well.',
      siteName: 'Reeve',
      image: 'https://www.reeve.org/img/share.jpg',
    });
  });

  it('falls back to Twitter tags, then the plain title and description', () => {
    const html = `<title>  A  page
      title </title><meta name="description" content="Plain words">
      <meta name="twitter:image" content="https://cdn.example/x.png">`;
    expect(readMeta(html, 'https://example.com/')).toEqual({
      title: 'A page title',
      description: 'Plain words',
      siteName: null,
      image: 'https://cdn.example/x.png',
    });
  });

  it('takes no picture a browser would run', () => {
    const html = '<meta property="og:image" content="javascript:alert(1)">';
    expect(readMeta(html, 'https://example.com/').image).toBeNull();
  });

  it('cuts a long title with an ellipsis', () => {
    const html = `<meta property="og:title" content="${'word '.repeat(80)}">`;
    const title = readMeta(html, 'https://example.com/').title ?? '';
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith('…')).toBe(true);
  });

  it('reads what Instagram actually sends', () => {
    const html =
      '<meta property="og:title" content="National Geographic (&#064;natgeo) &#x2022; Instagram photos and videos" />';
    expect(readMeta(html, 'https://www.instagram.com/natgeo/').title).toBe(
      'National Geographic (@natgeo) • Instagram photos and videos',
    );
  });
});

describe('decodeEntities', () => {
  it('leaves what it does not know alone', () => {
    expect(decodeEntities('a &madeup; b &#0; c')).toBe('a &madeup; b &#0; c');
  });
});
