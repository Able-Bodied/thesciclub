import { Video } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Join online", for an event whose link is a meeting (src/lib/meeting-link.ts).
 * The name says where it goes. The link is a plain `_blank` anchor, so the
 * store app opens it in the in-app browser (native-shell.ts).
 */
export function MeetingLinkButton({
  href,
  service,
  tone,
  className,
}: {
  href: string;
  service: string;
  /** `plate` on the navy hero, `page` on the paper page. */
  tone: 'plate' | 'page';
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex min-h-[44px] items-center justify-center gap-2 rounded-[13px] font-bold font-head text-[0.9375rem] text-emphasis transition-colors',
        tone === 'plate'
          ? 'bg-tint hover:bg-line'
          : 'border-[1.6px] border-emphasis bg-paper hover:bg-tint',
        className,
      )}
    >
      <Video className="h-[18px] w-[18px]" aria-hidden="true" />
      Join online
      <span className="sr-only">{`, opens ${service}`}</span>
    </a>
  );
}
