import { markdownToHtml } from '@/lib/markdown';
import { meetingService } from '@/lib/meeting-link';
import { safeHref, sanitizeHtml } from '@/routes/events/rich-text';

/**
 * The call to join for an event: its own link when that is a meeting, else the
 * first meeting link written in its description (an imported event's `url` is
 * the organization's page; the Zoom address is often only in the text).
 * Shared by the members' page and the public one so they agree.
 */
export function eventMeetingLink(event: {
  url: string | null;
  description: string;
  descriptionHtml: string;
}): { href: string; service: string; inUrl: boolean } | null {
  const own = safeHref(event.url);
  const ownService = meetingService(own);
  if (own && ownService) return { href: own, service: ownService, inUrl: true };

  for (const candidate of descriptionLinks(event)) {
    const href = safeHref(candidate);
    const service = meetingService(href);
    if (href && service) return { href, service, inUrl: false };
  }
  return null;
}

/** Anchors and bare addresses in the description, in reading order. */
function descriptionLinks(event: { description: string; descriptionHtml: string }): string[] {
  // The same text the page shows: the HTML, else the plain text as Markdown.
  const html = event.descriptionHtml.trim() || markdownToHtml(event.description);
  const root = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html').body;
  const found: string[] = [];
  const walk = (node: Node) => {
    if (node instanceof HTMLAnchorElement) {
      const href = node.getAttribute('href');
      if (href) found.push(href);
    } else if (node.nodeType === Node.TEXT_NODE) {
      found.push(...bareUrls(node.textContent ?? ''));
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(root);
  return [...found, ...bareUrls(event.description)];
}

function bareUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>"]+/gi) ?? []).map((u) => u.replace(/[.,;:!?)\]}'"]+$/, ''));
}
