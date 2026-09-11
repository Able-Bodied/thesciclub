/**
 * Dependency-free IANA timezone conversion, built on `Intl.DateTimeFormat`
 * (Node's ICU data covers every zone, so no `luxon`/`date-fns-tz` needed for
 * what this job uses it for: reinterpreting an instant as if it had been
 * computed in a different zone — see norcalsci-events-json.js's `toIso()`).
 */

/** Wall-clock date/time parts `date` represents when displayed in `timeZone`. */
function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** `timeZone`'s offset from UTC, in milliseconds, at the given instant. */
function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/**
 * The UTC instant at which `timeZone` reads the given wall-clock date/time.
 * Standard two-pass fixed-point resolution: an offset guess from a first UTC
 * approximation is accurate to within a DST transition, and a second pass
 * converges on any real zone.
 */
function zonedPartsToUtc(parts, timeZone) {
  const naiveUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let guess = naiveUtc - offsetMs(new Date(naiveUtc), timeZone);
  guess = naiveUtc - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/**
 * Reinterprets `date` as if the wall-clock time it represents in `fromZone`
 * had actually been meant as a wall-clock time in `toZone`. Used to correct a
 * timestamp that was computed with the wrong account timezone: the wall-clock
 * digits are what a human actually entered, so recovering them in the zone
 * the computation wrongly used, then reapplying them in the zone it should
 * have used, produces what they meant.
 */
export function reinterpretInstant(date, fromZone, toZone) {
  return zonedPartsToUtc(zonedParts(date, fromZone), toZone);
}

export { offsetMs, zonedParts, zonedPartsToUtc };
