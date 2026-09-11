/**
 * The club's own mark, from the design in docs/index.html.
 *
 * Used as the avatar for the official account. A photograph would be wrong
 * there: the account is not a person, and putting a face on it would invite
 * exactly the confusion the badge exists to prevent.
 */
export function ClubMark({ size = 88 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.5}
      viewBox="0 0 144 216"
      role="img"
      aria-label="The SCI Club"
    >
      <defs>
        <linearGradient id="club-mark-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8A6712" />
          <stop offset="0.5" stopColor="#E7C868" />
          <stop offset="1" stopColor="#8A6712" />
        </linearGradient>
        <linearGradient id="club-mark-silver" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#B9CADF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="140" height="212" rx="16" fill="#fff" />
      <rect x="8" y="8" width="128" height="200" rx="11" fill="#102A4C" />
      <rect
        x="14.5"
        y="14.5"
        width="115"
        height="187"
        rx="7"
        fill="none"
        stroke="url(#club-mark-gold)"
        strokeWidth="2.6"
      />
      <g fill="url(#club-mark-silver)" transform="translate(44 30) scale(0.62)">
        <circle cx="46" cy="14" r="11" />
        <path d="M18 46h44l-8 34h20l14 34h-14l-10-24H36a18 18 0 0 1-18-18Z" />
        <circle
          cx="44"
          cy="96"
          r="30"
          fill="none"
          stroke="url(#club-mark-silver)"
          strokeWidth="7"
        />
      </g>
      <text
        x="72"
        y="152"
        textAnchor="middle"
        fill="#fff"
        style={{ font: '800 13px Archivo, sans-serif', letterSpacing: '.10em' }}
      >
        THE SCI
      </text>
      <text
        x="72"
        y="176"
        textAnchor="middle"
        fill="#fff"
        style={{ font: '800 24px Archivo, sans-serif', letterSpacing: '.02em' }}
      >
        CLUB
      </text>
    </svg>
  );
}
