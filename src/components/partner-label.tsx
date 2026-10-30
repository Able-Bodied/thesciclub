import { PARTNER_ROLE_NAME, usePartnerTitles } from '@/lib/club-partners';
import { cn } from '@/lib/utils';

/**
 * "Trusted partner · Physical therapist, SCI-FIT" beside a trusted partner's name
 * (20261029100000), so members can tell a professional is reading. Nothing
 * for anybody else, nor while the titles are being read.
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
  const title = memberId ? titles?.get(memberId) : undefined;
  if (!title) return null;
  return (
    <span
      className={cn(
        variant === 'pill'
          ? 'inline-block max-w-full rounded-full bg-white px-2.5 py-[5px] font-bold text-[0.75rem] text-navy leading-snug'
          : 'block font-semibold text-[0.78125rem] text-emphasis leading-snug',
        className,
      )}
    >
      {PARTNER_ROLE_NAME} · {title}
    </span>
  );
}
