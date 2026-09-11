import { useState } from 'react';
import { cn } from '@/lib/utils';
import { shortCodeFor } from '@/routes/peers/member-card';
import type { Organization } from '@/types/domain';

/**
 * The mark an organization is recognised by, on an event card or its own page.
 *
 * Three states, in order of preference: the organization's own logo, its short
 * code in the club's gold tile, or — for a host the club has no organization
 * for — letters derived from the name the feed gave.
 *
 * ---------------------------------------------------------------------------
 * The fallback is the point
 * ---------------------------------------------------------------------------
 * `logo_url` is hotlinked from the organization's own site, so it can break
 * without anything here changing: they redesign, the CDN path moves, the image
 * 404s. A badge that renders as a broken-image glyph reads as this app being
 * broken, so `onError` drops back to the tile and the card looks deliberate
 * either way. That is also why the tile is rendered underneath rather than
 * instead — there is no flash of nothing while the image loads.
 *
 * `referrerPolicy="no-referrer"` stops the organization's CDN learning which
 * page the request came from. Events are public, so this is not a secret, but
 * which event a person is reading is still nobody else's business.
 */

export interface OrganizationBadgeProps {
  /** The club organization, when the event links to one. */
  organization: Organization | null;
  /** The feed's own name for the host, used when there is no organization. */
  hostName?: string | null;
  size?: 'sm' | 'lg';
  className?: string;
}

export function OrganizationBadge({
  organization,
  hostName,
  size = 'sm',
  className,
}: OrganizationBadgeProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  const name = organization?.name ?? hostName ?? null;
  if (!name) return null;

  const letters = organization?.shortCode ?? shortCodeFor(name);
  const logo = organization?.logoUrl;
  const showLogo = Boolean(logo) && !logoFailed;

  const box =
    size === 'lg'
      ? 'h-[66px] w-[66px] rounded-[20px] text-[22px]'
      : 'h-[38px] w-[38px] rounded-[12px] text-[11px]';

  return (
    <span
      className={cn(
        'relative grid flex-none place-items-center overflow-hidden font-extrabold font-head text-white',
        box,
        className,
      )}
      // The gold tile sits underneath the logo rather than beside it, so a slow
      // or failed image never leaves a hole in the row.
      style={{ background: 'linear-gradient(140deg,#8A6712,#C9A227)' }}
      // Decorative throughout: every place this is used renders the
      // organization's name as text right beside it, so giving the badge a
      // label of its own would read the organization twice to a screen reader.
      aria-hidden="true"
    >
      <span>{letters}</span>
      {showLogo ? (
        <img
          src={logo ?? ''}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => {
            setLogoFailed(true);
          }}
          // White ground and padding because these are logos drawn for a white
          // page — several are dark marks that would vanish on the gold tile.
          className="absolute inset-0 h-full w-full bg-white object-contain p-1"
        />
      ) : null}
    </span>
  );
}
