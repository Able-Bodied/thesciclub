import { findLinks } from '@/lib/links';

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
 */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {findLinks(text).map((piece, index) =>
        piece.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: pieces are positional and never reorder
          <span key={index}>{piece.text}</span>
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
