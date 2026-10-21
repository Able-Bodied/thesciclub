/**
 * A US state's time zone, for sources that give a city and state but no zone
 * (2026-10-20). One zone per state, where most of its people are: a split
 * state's smaller part (west Kentucky, Florida's panhandle) reads an hour off,
 * which for an all-day event changes nothing.
 *
 * Takes "CA", "Calif.", "California", and the AP's "Nev.", "N.J.", "W.Va.".
 */

const ZONES = {
  'America/New_York': 'CT DE DC FL GA KY ME MD MA NH NJ NY NC OH PA RI SC VT VA WV',
  'America/Detroit': 'MI',
  'America/Indiana/Indianapolis': 'IN',
  'America/Chicago': 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI',
  'America/Denver': 'CO ID MT NM UT WY',
  'America/Phoenix': 'AZ',
  'America/Los_Angeles': 'CA NV OR WA',
  'America/Anchorage': 'AK',
  'Pacific/Honolulu': 'HI',
  'America/Puerto_Rico': 'PR',
};

/** Spellings, lower case, any final full stop dropped. */
const NAMES = {
  AL: ['alabama', 'ala'],
  AK: ['alaska'],
  AZ: ['arizona', 'ariz'],
  AR: ['arkansas', 'ark'],
  CA: ['california', 'calif', 'cal'],
  CO: ['colorado', 'colo'],
  CT: ['connecticut', 'conn'],
  DE: ['delaware', 'del'],
  DC: ['district of columbia', 'd.c'],
  FL: ['florida', 'fla'],
  GA: ['georgia', 'ga'],
  HI: ['hawaii'],
  ID: ['idaho'],
  IL: ['illinois', 'ill'],
  IN: ['indiana', 'ind'],
  IA: ['iowa'],
  KS: ['kansas', 'kan', 'kans'],
  KY: ['kentucky', 'ky'],
  LA: ['louisiana', 'la'],
  ME: ['maine'],
  MD: ['maryland', 'md'],
  MA: ['massachusetts', 'mass'],
  MI: ['michigan', 'mich'],
  MN: ['minnesota', 'minn'],
  MS: ['mississippi', 'miss'],
  MO: ['missouri', 'mo'],
  MT: ['montana', 'mont'],
  NE: ['nebraska', 'neb'],
  NV: ['nevada', 'nev'],
  NH: ['new hampshire', 'n.h'],
  NJ: ['new jersey', 'n.j'],
  NM: ['new mexico', 'n.m'],
  NY: ['new york', 'n.y'],
  NC: ['north carolina', 'n.c'],
  ND: ['north dakota', 'n.d'],
  OH: ['ohio'],
  OK: ['oklahoma', 'okla'],
  OR: ['oregon', 'ore'],
  PA: ['pennsylvania', 'pa'],
  RI: ['rhode island', 'r.i'],
  SC: ['south carolina', 's.c'],
  SD: ['south dakota', 's.d'],
  TN: ['tennessee', 'tenn'],
  TX: ['texas', 'tex'],
  UT: ['utah'],
  VT: ['vermont', 'vt'],
  VA: ['virginia', 'va'],
  WA: ['washington', 'wash'],
  WV: ['west virginia', 'w.va', 'w. va'],
  WI: ['wisconsin', 'wis'],
  WY: ['wyoming', 'wyo'],
  PR: ['puerto rico'],
};

const ZONE_OF = new Map();
for (const [zone, codes] of Object.entries(ZONES))
  for (const code of codes.split(' ')) ZONE_OF.set(code, zone);

/** "Nev." or "nevada" → "NV"; null when it is not a state. */
export function stateCode(text) {
  const t = (text ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!t) return null;
  if (/^[a-z]{2}$/.test(t) && ZONE_OF.has(t.toUpperCase())) return t.toUpperCase();
  for (const [code, names] of Object.entries(NAMES)) if (names.includes(t)) return code;
  return null;
}

/**
 * The state a place names in its last part: "Lawrenceville, GA 30044",
 * "Las Vegas, Nev.", "Birmingham, Alabama". Null when the place does not end
 * in a state.
 */
/** A part ending in a state's full name: "Rincon Beach California" → "CA". */
function stateByEndingName(part) {
  const lower = part.toLowerCase();
  for (const [code, names] of Object.entries(NAMES)) {
    if (names[0].length > 4 && lower.endsWith(` ${names[0]}`)) return code;
  }
  return null;
}

export function stateOfPlace(place) {
  const parts = (place ?? '')
    .split(',')
    .map((part) =>
      part
        .replace(/\b(United States|USA?)\s*$/i, '')
        .replace(/\s*\d{5}(-\d{4})?\s*$/, '')
        .trim(),
    )
    .filter(Boolean);
  // The last part, or the one before a trailing ZIP or country; a two-letter
  // code may end a part ("Lawrenceville GA"), or a state's name
  // ("Rincon Beach California").
  for (const part of parts.slice(-2).reverse()) {
    const code =
      stateCode(part) ??
      (/\s[A-Z]{2}$/.test(part) ? stateCode(part.slice(-2)) : null) ??
      stateByEndingName(part);
    if (code) return code;
  }
  // A part that is only a state, anywhere ("Birmingham, AL, 4000 Ridgeway Dr").
  for (const part of parts) {
    if (/^[A-Z]{2}$/.test(part) || /^[A-Z][a-z]+( [A-Z][a-z]+)?$/.test(part)) {
      const code = stateCode(part);
      if (code) return code;
    }
  }
  return null;
}

/** The zone for a "City, ST" place, read from its last comma part; null if unknown. */
export function zoneOfPlace(place) {
  const last = (place ?? '').split(',').pop();
  const code = stateCode(last);
  return code ? ZONE_OF.get(code) : null;
}
