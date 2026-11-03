import type { ORGANIZATION_CATEGORIES } from '@/lib/organization-categories';

/**
 * A kind of organization as a small round badge: its map colour with its icon
 * in white, as on its pin, so a type chip reads at a glance (the owner,
 * 2026-11-03).
 */
export function TypeBadge({ type }: { type: (typeof ORGANIZATION_CATEGORIES)[number] }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-none">
      <circle cx="12" cy="12" r="12" fill={type.color} />
      <path
        d={type.icon}
        transform="translate(5 5) scale(0.583)"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
