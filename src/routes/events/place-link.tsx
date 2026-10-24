/**
 * The "where" after the time on an event's page: " · " and the place, a link
 * to Google Maps when there is an address to find (place.ts's `mapsUrl`).
 * Nothing at all when there is no place line, as for an online event.
 */
export function Place({
  line,
  href,
  className,
}: {
  line: string | null;
  href: string | null;
  className: string;
}) {
  if (!line) return null;
  return (
    <>
      {' · '}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          aria-label={`${line}, in Google Maps`}
        >
          {line}
        </a>
      ) : (
        line
      )}
    </>
  );
}
