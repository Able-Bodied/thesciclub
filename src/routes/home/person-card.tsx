import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { summaryLine } from '@/routes/peers/member-card';
import { canonicalTopicsOf } from '@/routes/peers/topics';
import type { BrowseMember } from '@/types/domain';

/**
 * A member worth meeting, from the mock's `peerSuggest`.
 *
 * Who they are in one line, what they do, and up to three things they are
 * happy to talk about, grouped the way the Peers filter groups them so
 * "Bowel programme" and "Bladder management" read as one subject. The card
 * opens their profile, where Message is.
 *
 * Like the topic card, the link is on the name and stretched over the card:
 * the whole card is the target, and the name alone is what a screen reader
 * reads as the link.
 */
export function PersonCard({ member, linkState }: { member: BrowseMember; linkState: unknown }) {
  const topics = canonicalTopicsOf(member.topics).slice(0, 3);

  return (
    <article className="relative rounded-[17px] border border-line bg-paper p-3.5">
      <p className="flex items-center gap-1.5 font-bold text-[0.71875rem] text-emphasis uppercase tracking-[0.07em]">
        <Sparkles aria-hidden="true" className="h-[1.1em] w-[1.1em]" />
        Worth meeting
      </p>

      <div className="mt-2.5 flex items-start gap-3">
        <span aria-hidden="true" className="flex-none">
          <MemberAvatar
            id={member.id}
            displayName={member.displayName}
            photoPath={member.photoPath}
            photoAlt={member.photoAlt}
            // In em off its own initials, so the tile grows with the text size.
            className="h-[2.75em] w-[2.75em] rounded-[0.85em] text-[1.1875rem]"
          />
        </span>
        <span className="min-w-0 flex-1">
          <Link
            to={`/peers/${member.id}`}
            state={linkState}
            className="block font-extrabold font-head text-[1rem] text-ink leading-[1.2] after:absolute after:inset-0 after:rounded-[17px]"
          >
            {member.displayName}
          </Link>
          <span className="mt-[3px] block text-[0.8125rem] text-ink2 leading-[1.42]">
            {summaryLine(member)}
          </span>
          {member.fieldOfWork ? (
            <span className="mt-[3px] block text-[0.78125rem] text-grey leading-[1.42]">
              {member.fieldOfWork}
            </span>
          ) : null}
        </span>
      </div>

      {topics.length > 0 ? (
        <ul aria-label="Happy to talk about" className="mt-2.5 flex flex-wrap gap-1.5">
          {topics.map((topic) => (
            <li
              key={topic}
              className="rounded-full bg-tint px-2.5 py-[5px] font-semibold text-[0.75rem] text-emphasis leading-[1.25]"
            >
              {topic}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
