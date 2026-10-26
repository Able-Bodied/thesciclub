import { ChevronRight } from 'lucide-react';
import { MemberAvatar } from '@/components/member-avatar';
import { summaryLine } from '@/routes/peers/member-card';
import type { BrowseMember } from '@/types/domain';

/**
 * A member in a map sheet: face, name, and level and age on one line, about
 * eight to a phone screen (the owner, 2026-10-25). The city only where the
 * list spans several.
 */
export function MemberRow({
  member,
  withCity = false,
  onOpen,
}: {
  member: BrowseMember;
  withCity?: boolean;
  onOpen: () => void;
}) {
  const line = summaryLine({ ...member, city: withCity ? member.city : null });
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={line ? `${member.displayName}, ${line}` : member.displayName}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-tint"
      >
        <span aria-hidden="true" className="contents">
          <MemberAvatar
            id={member.id}
            displayName={member.displayName}
            photoPath={member.photoPath}
            photoAlt={member.photoAlt}
            className="h-9 w-9"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-bold font-head text-[0.9375rem] text-ink">
            {member.displayName}
          </span>
          {line ? <span className="block text-[0.8125rem] text-ink2">{line}</span> : null}
        </span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 flex-none text-grey" />
      </button>
    </li>
  );
}
