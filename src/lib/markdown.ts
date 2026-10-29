import { findLinks } from '@/lib/links';
import { splitMentions } from '@/lib/mentions';

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

/** Where an @username links to, or null to leave it as words (a post's mentions). */
export type MentionHref = (username: string) => string | null;

export function markdownToHtml(text: string, mention?: MentionHref): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  // Asserted rather than annotated: the closures below reset it, which
  // TypeScript's narrowing of a `let` cannot see.
  let list = null as { tag: 'ul' | 'ol'; items: string[] } | null;

  const closeParagraph = () => {
    if (paragraph.length)
      out.push(`<p>${paragraph.map((line) => inline(line, mention)).join('<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) {
      out.push(
        `<${list.tag}>${list.items.map((i) => `<li>${inline(i, mention)}</li>`).join('')}</${list.tag}>`,
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
      out.push(`<h3>${inline(heading[2], mention)}</h3>`);
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

function inline(text: string, mention?: MentionHref): string {
  let html = '';
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    html += plain(text.slice(at, match.index), mention);
    const [whole, linkText, href, bold, starItalic, underscoreItalic] = match;
    if (linkText !== undefined && href !== undefined) {
      html += `<a href="${escapeHtml(href)}">${inline(linkText)}</a>`;
    } else if (bold !== undefined) {
      html += `<strong>${inline(bold, mention)}</strong>`;
    } else {
      html += `<em>${inline(starItalic ?? underscoreItalic ?? '', mention)}</em>`;
    }
    at = match.index + whole.length;
  }
  return html + plain(text.slice(at), mention);
}

/** Text with its bare web addresses as links, and its @names where `mention` says. */
function plain(text: string, mention?: MentionHref): string {
  return findLinks(text)
    .map((piece) =>
      piece.kind === 'text'
        ? mentions(piece.text, mention)
        : `<a href="${escapeHtml(piece.href)}">${escapeHtml(piece.label)}</a>`,
    )
    .join('');
}

function mentions(text: string, mention?: MentionHref): string {
  if (!mention) return escapeHtml(text);
  return splitMentions(text)
    .map((piece) => {
      const href = piece.kind === 'mention' ? mention(piece.username) : null;
      return href
        ? `<a href="${escapeHtml(href)}">${escapeHtml(piece.text)}</a>`
        : escapeHtml(piece.text);
    })
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

/**
 * The same text with its Markdown marks taken out, for the places that show
 * a few lines of a post rather than the post: a Home card's opening or first
 * reply, a notification's excerpt. Bold and italic become their words, a
 * heading its line, a list item its text, a link its words. Line breaks stay,
 * for the clamped previews that keep them.
 */
export function markdownToPlain(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)#{1,3}\s+/, '$1')
        .replace(/^(\s*)[-*•]\s+/, '$1')
        .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
        .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1')
        .replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '$1')
        .replace(/(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/g, '$1'),
    )
    .join('\n');
}
