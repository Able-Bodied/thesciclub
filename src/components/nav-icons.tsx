/**
 * The five bottom-bar glyphs, traced from the mock in docs/index.html so the
 * nav reads identically. Stroked, not filled: the bar sets `stroke-width` on
 * the active tab, which only works if the shape is a stroke.
 */

interface IconProps {
  className?: string;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.6 10.4 12 3.5l8.4 6.9V20a1.4 1.4 0 0 1-1.4 1.4H5a1.4 1.4 0 0 1-1.4-1.4Z" />
      <path d="M9.4 21.4v-6.6h5.2v6.6" />
    </svg>
  );
}

export function PeersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.6 19.4a6.4 6.4 0 0 1 12.8 0" />
      <path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6" />
      <path d="M18 14.4a6.4 6.4 0 0 1 3.4 5" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M20.5 11.6a7.6 7.6 0 0 1-10.8 6.9l-4.9 1.4 1.4-4.4A7.6 7.6 0 1 1 20.5 11.6Z" />
      <path d="M8.6 11.5h.01M12 11.5h.01M15.4 11.5h.01" />
    </svg>
  );
}

export function EventsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function MeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9.5" cy="10.5" r="2.4" />
      <path d="M5.8 17a4.2 4.2 0 0 1 7.4 0M15 9.5h4M15 13h3" />
    </svg>
  );
}
