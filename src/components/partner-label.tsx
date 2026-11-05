import { BadgeCheck } from 'lucide-react';
import { PARTNER_ROLE_NAME, usePartnerTitles } from '@/lib/club-partners';
import { cn } from '@/lib/utils';

/**
 * "✓ Verified professional · Physical therapist, SCI-FIT" beside a verified
 * professional's name (20261029100000, 20261104160000), so members can tell a
 * professional is reading. The profession only once they have written it.
 * Nothing for anybody else, nor while the titles are being read.
 *
 * `line` sits in text on paper; `pill` sits on a photograph.
 */
export function PartnerLabel({
  memberId,
  variant = 'line',
  className,
}: {
  memberId: string | null | undefined;
  variant?: 'line' | 'pill';
  className?: string;
}) {
  const titles = usePartnerTitles();
  if (!memberId || !titles?.has(memberId)) return null;
  const title = titles.get(memberId);
  return (
    <span
      className={cn(
        variant === 'pill'
          ? 'inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2.5 py-[5px] font-bold text-[0.75rem] text-navy leading-snug'
          : 'flex items-center gap-1 font-semibold text-[0.78125rem] text-emphasis leading-snug',
        className,
      )}
    >
      <BadgeCheck className="h-[1.1em] w-[1.1em] flex-none" aria-hidden="true" />
      <span className="min-w-0">
        {PARTNER_ROLE_NAME}
        {title ? ` · ${title}` : ''}
      </span>
    </span>
  );
}
