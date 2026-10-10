import { findLinks } from '@/lib/links';

/**
 * A small Markdown, for an event's "About it" (the owner, 2026-10-10).
 *
 * The form's toolbar writes it — bold, italic, a heading, bulleted and
 * numbered lists, a link — and somebody who already knows Markdown can type
 * it. Nothing else is recognised: no images, no tables, no raw HTML, no code
 * blocks. A converter for exactly the toolbar is a page of code; a library
 * for all of Markdown is a dependency and a much larger surface to sanitize.
 *
 * The output is HTML for `EventDescription`, which passes it through the same
 * allowlist a scraped description gets (`sanitizeHtml` in
 * src/routes/events/rich-text.tsx). So this escapes every character of text it
 * emits, and the sanitizer is still the thing that makes it safe: an href this
 * writes is checked there by `safeHref` like any other.
 *
 * Text written before this existed — plain lines, blank lines between
 * paragraphs, bare web addresses — reads as it did: paragraphs, line breaks,
 * and addresses as links, as LinkedText drew them.
 */

const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^\s*[-*•]\s+(.+)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.+)$/;

export function markdownToHtml(text: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  // Asserted rather than annotated: the closures below reset it, which
  // TypeScript's narrowing of a `let` cannot see.
  let list = null as { tag: 'ul' | 'ol'; items: string[] } | null;

  const closeParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) {
      out.push(
        `<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`,
      );
    }
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading?.[2]) {
      closeParagraph();
      closeList();
      out.push(`<h3>${inline(heading[2])}</h3>`);
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet?.[1] ?? numbered?.[1];
    if (item) {
      const tag = bullet ? 'ul' : 'ol';
      closeParagraph();
      if (list?.tag !== tag) closeList();
      list ??= { tag, items: [] };
      list.items.push(item);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  closeParagraph();
  closeList();
  return out.join('');
}

/**
 * Bold (**…**), italic (*…* or _…_) and links ([words](address)), with bare
 * addresses found as Chat finds them. Markers must hug their words, so
 * "2 * 3 * 4" and snake_case_words stay as typed.
 */
const INLINE =
  /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(?=\S)(.+?)(?<=\S)\*\*|(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/g;

function inline(text: string): string {
  let html = '';
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    html += plain(text.slice(at, match.index));
    const [whole, linkText, href, bold, starItalic, underscoreItalic] = match;
    if (linkText !== undefined && href !== undefined) {
      html += `<a href="${escapeHtml(href)}">${inline(linkText)}</a>`;
    } else if (bold !== undefined) {
      html += `<strong>${inline(bold)}</strong>`;
    } else {
      html += `<em>${inline(starItalic ?? underscoreItalic ?? '')}</em>`;
    }
    at = match.index + whole.length;
  }
  return html + plain(text.slice(at));
}

/** Text with its bare web addresses as links. */
function plain(text: string): string {
  return findLinks(text)
    .map((piece) =>
      piece.kind === 'text'
        ? escapeHtml(piece.text)
        : `<a href="${escapeHtml(piece.href)}">${escapeHtml(piece.label)}</a>`,
    )
    .join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
