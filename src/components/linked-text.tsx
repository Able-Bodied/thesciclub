import { Link } from 'react-router-dom';
import { findLinks } from '@/lib/links';
import { splitMentions, useMentionedMembers } from '@/lib/mentions';

/**
 * Text somebody wrote, with its web addresses as links.
 *
 * The finding and the safety are `lib/links.ts`; this only draws. A link opens
 * in a new tab (in the installed app, the system browser) so the conversation
 * is still there to come back to. `nofollow ugc` because a member wrote it,
 * not the club; `noreferrer` because where a member read it is nobody else's
 * business.
 *
 * The colour is inherited and the underline carries it, so the same link reads
 * on a navy bubble and on paper without a second palette to keep above AA.
 * `overflow-wrap: anywhere` because a shortened label can still be one long
 * word on a 320px screen.
 *
 * An @username of a member with a profile links to it, as in a post
 * (the owner, 2026-10-31). Other @names stay words.
 */
export function LinkedText({ text }: { text: string }) {
  const members = useMentionedMembers(text);
  return (
    <>
      {findLinks(text).map((piece, index) =>
        piece.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: pieces are positional and never reorder
          <span key={index}>
            {splitMentions(piece.text).map((part, at) => {
              const member = part.kind === 'mention' ? members.get(part.username) : undefined;
              return member?.hasProfile ? (
                <Link
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
                  key={at}
                  to={`/peers/${member.id}`}
                  className="font-semibold underline decoration-1 underline-offset-2"
                >
                  {part.text}
                </Link>
              ) : (
                part.text
              );
            })}
          </span>
        ) : (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: pieces are positional and never reorder
            key={index}
            href={piece.href}
            title={piece.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="font-semibold underline decoration-1 underline-offset-2 [overflow-wrap:anywhere]"
          >
            {piece.label}
          </a>
        ),
      )}
    </>
  );
}
