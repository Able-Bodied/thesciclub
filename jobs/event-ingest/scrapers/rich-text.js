/**
 * Rich text extraction helpers.
 *
 * Scraped descriptions used to come from `og:description`, which Squarespace
 * truncates mid-sentence, double-escapes entities into (`&nbsp;`), and strips
 * anchors from. Instead we take the raw HTML of the event body and convert it
 * here, producing two representations:
 *
 *   - `html` — sanitized HTML, allow-listed tags, absolute hrefs
 *   - `text` — the same content flattened to plain text for cards and search
 *
 * Kept in Node (rather than inside page.evaluate) so it can be unit tested
 * against saved HTML without launching a browser.
 */

import * as cheerio from 'cheerio';

const ALLOWED_TAGS = new Set([
  'a',
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
]);

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
]);

const DROPPED_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'button', 'form', 'iframe']);

/**
 * Squarespace's editor rewrites pasted links through Google's redirector
 * (google.com/url?q=<real url>). Unwrap those so we store the destination.
 */
function unwrapRedirect(href, baseUrl) {
  let url;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname === '/url') {
    const target = url.searchParams.get('q') || url.searchParams.get('url');
    if (target) return unwrapRedirect(target, baseUrl);
  }
  return url.href;
}

/**
 * Absolutize and validate an href. Returns null for anything we won't emit:
 * empty, fragment-only, or a non-http(s) scheme such as `javascript:`.
 */
export function cleanHref(raw, baseUrl) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^(mailto|tel):/i.test(trimmed)) return trimmed;
  const resolved = unwrapRedirect(trimmed, baseUrl);
  return resolved && /^https?:/i.test(resolved) ? resolved : null;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Normalize characters that survive entity decoding: non-breaking spaces,
 * zero-width joiners, and the line/paragraph separators Squarespace inserts.
 */
export function normalizeChars(value) {
  if (!value) return value;

  let result = value;

  // Normalize whitespace to single spaces using character codes
  // U+00A0 (non-breaking space), U+2000-U+200B (various unicode spaces)
  result = result
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      // Replace common whitespace characters with regular space
      if (
        code === 0x00a0 || // non-breaking space
        (code >= 0x2000 && code <= 0x200b) || // unicode spaces
        code === 0x3000
      ) {
        // ideographic space
        return ' ';
      }
      // Remove zero-width and directional marks
      if (
        code === 0x200c || // zero-width non-joiner
        code === 0x200d || // zero-width joiner
        code === 0x200e || // left-to-right mark
        code === 0x200f || // right-to-left mark
        code === 0xfeff
      ) {
        // zero-width no-break space
        return '';
      }
      // Replace line and paragraph separators with newline
      if (code === 0x2028 || code === 0x2029) {
        return '\n';
      }
      return ch;
    })
    .join('');

  return result;
}

/** Recursively serialize a node into sanitized HTML. */
function toHtml($, node, baseUrl) {
  if (node.type === 'text') {
    // Source blocks carry `white-space: pre-wrap`, which we strip along with
    // every other style attribute — so collapse the runs it was preserving.
    return escapeHtml(normalizeChars(node.data || '').replace(/[ \t]{2,}/g, ' '));
  }
  if (node.type !== 'tag') return '';

  const tag = node.name.toLowerCase();
  if (DROPPED_TAGS.has(tag)) return '';
  if (tag === 'br') return '<br>';

  const inner = (node.children || []).map((child) => toHtml($, child, baseUrl)).join('');

  if (tag === 'a') {
    const href = cleanHref($(node).attr('href'), baseUrl);
    if (!href) return inner;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  if (!ALLOWED_TAGS.has(tag)) {
    // Unknown wrapper (Squarespace nests many styling divs): keep the content
    // but drop the element. Add a paragraph break only when the content is
    // inline, otherwise we'd nest <p> inside <p> and produce invalid markup.
    const needsBreak =
      BLOCK_TAGS.has(tag) && inner.trim() && !/<(?:p|ul|ol|li|h[1-6]|blockquote)\b/.test(inner);
    return needsBreak ? `<p>${inner}</p>` : inner;
  }
  // Whitespace-only inline tags still carry a meaningful space (e.g. the
  // `<strong>&nbsp;</strong>` Squarespace leaves between a label and a link).
  if (!inner.trim()) return BLOCK_TAGS.has(tag) ? '' : inner;
  return `<${tag}>${inner}</${tag}>`;
}

/**
 * Recursively serialize a node to plain text. Anchors whose text differs from
 * their href render as "text (href)" so the destination is never lost.
 */
function toText($, node, baseUrl) {
  if (node.type === 'text') return normalizeChars(node.data || '');
  if (node.type !== 'tag') return '';

  const tag = node.name.toLowerCase();
  if (DROPPED_TAGS.has(tag)) return '';
  if (tag === 'br') return '\n';

  const inner = (node.children || []).map((child) => toText($, child, baseUrl)).join('');

  if (tag === 'a') {
    const href = cleanHref($(node).attr('href'), baseUrl);
    const label = inner.trim();
    if (!href) return inner;
    if (!label) return href;
    const bare = href.replace(/^(mailto|tel):/i, '');
    // Don't duplicate when the anchor text already is the URL or address.
    if (label === href || label === bare) return label;
    return `${label} (${bare})`;
  }
  return BLOCK_TAGS.has(tag) ? `\n${inner}\n` : inner;
}

function tidyHtml(html) {
  return html
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/(?:<br>\s*){3,}/g, '<br><br>')
    .replace(/^(?:<br>)+|(?:<br>)+$/g, '')
    .trim();
}

function tidyText(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert a fragment of source HTML into `{ html, text }`.
 * `baseUrl` resolves relative hrefs; pass the page the fragment came from.
 */
export function convertRichText(sourceHtml, baseUrl) {
  if (!sourceHtml?.trim()) return { html: '', text: '' };

  const $ = cheerio.load(sourceHtml, null, false);
  const roots = $.root().children().toArray();

  return {
    html: tidyHtml(roots.map((node) => toHtml($, node, baseUrl)).join('')),
    text: tidyText(roots.map((node) => toText($, node, baseUrl)).join('\n')),
  };
}

export default convertRichText;
