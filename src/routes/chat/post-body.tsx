import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { markdownToHtml } from '@/lib/markdown';
import { useMentionedMembers } from '@/lib/mentions';
import { sanitizeHtml } from '@/routes/events/rich-text';

/**
 * A post's words, formatted as an event's description is (lib/markdown.ts,
 * through the same allowlist), with each @username of a member who has a
 * profile as a link to it (20261029070000). Other @names stay words.
 */
export function PostBody({ text, className }: { text: string; className?: string }) {
  const navigate = useNavigate();
  const members = useMentionedMembers(text);
  const html = markdownToHtml(text, (username) => {
    const member = members.get(username);
    return member?.hasProfile ? `/peers/${member.id}` : null;
  });

  // A profile opens in the app, not as a new page load.
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest('a');
    const href = link?.getAttribute('href') ?? '';
    if (!href.startsWith('/peers/') || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    void navigate(href);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the links inside take the keys; Enter on one is a click.
    // biome-ignore lint/a11y/noStaticElementInteractions: only clicks on a profile link inside are handled.
    <div
      className={className}
      onClick={follow}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitizeHtml rebuilds the string from an allowlist
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html, { peers: true }) }}
    />
  );
}
