import { ExternalLink } from 'lucide-react';
import { safeHref } from '@/routes/events/rich-text';
import type { OrganizationPlace } from '@/types/domain';

/**
 * Who to contact at one of an organization's places, and its own page
 * (20261103030000): a chapter's directions, as its website gives them.
 */
export function PlaceContact({ place, heading }: { place: OrganizationPlace; heading?: boolean }) {
  const href = safeHref(place.url ?? null);
  if (!place.note && !href) return null;
  const name = place.label ?? `${place.city}, ${place.state}`;
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-2.5">
      {heading === false ? null : <p className="font-bold text-[0.875rem] text-ink">{name}</p>}
      {place.note
        ? place.note.split(/\n+/).map((line, index) => (
            // The note's own lines, in order; never edited here.
            // biome-ignore lint/suspicious/noArrayIndexKey: lines have no other identity.
            <p key={index} className="mt-1 break-words text-[0.875rem] text-ink2 leading-[1.45]">
              {line}
            </p>
          ))
        : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-[0.875rem] text-emphasis underline underline-offset-2"
        >
          Open {name}’s page
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}
