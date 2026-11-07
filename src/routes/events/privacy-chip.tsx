import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventAudience } from '@/types/domain';

/**
 * Said on an event that not everyone can see (the owner, 2026-11-06): on its
 * card and at the top of its page, to whoever can see it. Null for the club.
 */
export function privacyLabel(audience: EventAudience): string | null {
  switch (audience) {
    case 'people':
      return 'Invite only';
    case 'followers':
    case 'organizations':
      return 'Members only';
    case 'groups':
      return 'Groups only';
    default:
      return null;
  }
}

export function PrivacyChip({
  audience,
  onNavy = false,
  className,
}: {
  audience: EventAudience;
  /** On the event page's navy header. */
  onNavy?: boolean;
  className?: string;
}) {
  const label = privacyLabel(audience);
  if (!label) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-[5px] font-semibold text-[0.7375rem] leading-[1.25]',
        // Navy, which stays navy in the dark theme; ink turns light there and
        // made it light on white (the owner, 2026-11-06).
        onNavy ? 'bg-white text-navy' : 'bg-navy text-white',
        className,
      )}
    >
      <Lock aria-hidden="true" className="h-[11px] w-[11px]" strokeWidth={2.6} />
      {label}
    </span>
  );
}
