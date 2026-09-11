/**
 * Rendering an event description that came from somebody else's website.
 *
 * The ingest job already sanitizes: jobs/event-ingest/scrapers/rich-text.js
 * rebuilds the markup from an allowlist rather than stripping tags out of it,
 * escapes every text node, and drops any href that is not http(s), mailto or
 * tel. That is the right construction, and it is why `description_html` is
 * storable at all.
 *
 * This sanitizes again anyway, and the reason is not that the job is
 * untrustworthy. It is that the job is a *different program*: it runs on a
 * schedule, in CI, over markup written by people outside the club, and nothing
 * about editing it tells you that a mistake there becomes script execution in
 * a member's browser. A second allowlist here makes the rendering layer's
 * safety a property of the rendering layer.
 *
 * The parse happens in an inert document (`DOMParser`), so nothing in the
 * input loads, executes or fires while it is being inspected.
 */

/** Mirrors ALLOWED_TAGS in the ingest job's rich-text.js. */
const ALLOWED_TAGS = new Set([
  'A',
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
]);

/** Everything up to and including the first colon. */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** The only attribute that survives, and only on an anchor. */
export function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Matched against a list of good schemes rather than searched for bad ones,
  // which is what makes the evasions unnecessary to enumerate. "javascript:"
  // with a tab in it ("java\tscript:") defeats a substring test, but it does
  // not parse as a scheme here, so it falls out with everything else that is
  // not exactly http, https, mailto or tel.
  const scheme = SCHEME.exec(trimmed);
  // No scheme at all is a relative URL. Somewhere inside this app is not where
  // an organization's description should point, so it is dropped rather than
  // resolved.
  if (!scheme) return null;
  return ['http', 'https', 'mailto', 'tel'].includes((scheme[1] ?? '').toLowerCase())
    ? trimmed
    : null;
}

/**
 * Rebuild `source` as a tree of allowed elements.
 *
 * An element not on the list is replaced by its own children, so an unknown
 * wrapper loses the tag and keeps the words. Dropping the subtree instead
 * would silently delete an event's description, and a blank description looks
 * like a broken app rather than a blocked attack.
 */
function sanitizeInto(source: Node, target: Node, doc: Document): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(doc.createTextNode(child.textContent ?? ''));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    if (!ALLOWED_TAGS.has(element.tagName)) {
      // Not unwrapped as text: the children of these two are code, and keeping
      // the words would paste that code into the page as visible prose.
      if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;
      sanitizeInto(element, target, doc);
      continue;
    }

    const clean = doc.createElement(element.tagName.toLowerCase());
    if (clean instanceof HTMLAnchorElement) {
      const href = safeHref(element.getAttribute('href'));
      if (href) {
        clean.setAttribute('href', href);
        clean.setAttribute('target', '_blank');
        // noopener is the security half; noreferrer keeps the club out of the
        // destination's analytics, which matters when the destination is a
        // hospital's registration page.
        clean.setAttribute('rel', 'noopener noreferrer');
      }
    }
    sanitizeInto(element, clean, doc);
    target.appendChild(clean);
  }
}

export function sanitizeHtml(html: string): string {
  // An inert document: scripts do not run, images do not load, and no handler
  // fires while this is walked.
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const out = document.implementation.createHTMLDocument('');
  const root = out.createElement('div');
  sanitizeInto(parsed.body, root, out);
  return root.innerHTML;
}

/**
 * The description, as the organization wrote it.
 *
 * Falls back to the plain-text column when there is no HTML — an event from a
 * scraper that only produced text still has a description worth showing.
 */
export function EventDescription({
  html,
  text,
  className,
}: {
  html: string;
  text: string;
  className?: string;
}) {
  const trimmed = html.trim();
  if (!trimmed) return <p className={className}>{text}</p>;
  return (
    <div
      className={className}
      // Rendering an organization's own formatting and links, rather than
      // flattening them, is the point of this module — and the string below is
      // rebuilt from an allowlist inside an inert document immediately before
      // it gets here.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitizeHtml rebuilds the string from an allowlist
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(trimmed) }}
    />
  );
}
