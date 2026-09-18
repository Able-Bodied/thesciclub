import { getSupabase } from '@/lib/supabase';
import type { Completeness, DatePrecision, ExactLevel } from '@/types/domain';

/**
 * The answers onboarding collected, and the ability to correct them.
 *
 * These were asked once, quickly, often by somebody in a difficult moment. A
 * mistyped name or a level chosen in a hurry should not be permanent, and
 * without this the only way to fix one is to ask an administrator to delete the
 * account.
 *
 * The photo is handled here too rather than through the survey, because it
 * writes to storage as well as to the row.
 */

export interface MemberDetails {
  displayName: string;
  birthDate: string;
  exactLevel: ExactLevel | null;
  completeness: Completeness;
  injuryDate: string | null;
  injuryDatePrecision: DatePrecision | null;
  city: string | null;
  state: string;
  photoPath: string | null;
  showInBrowse: boolean;
  /**
   * Things this member has said they would rather not give — see
   * 20260917030000. Shared with the survey, which writes the same column, so
   * this is the whole set and not only the five below.
   */
  declined: string[];
}

/**
 * The five details the ring counts, and the key each is declined under.
 *
 * A list rather than five `if`s so the labels the screen shows, the keys the
 * database stores and the things `missingDetails` counts are one thing. They
 * disagreed once already — `state` became nullable for onboarding and nothing
 * told Me about it.
 *
 * The name and the birthday are deliberately absent. They are not counted as
 * missing (a row cannot exist without them) and they cannot be declined, so
 * there is nothing for them to be doing in this list.
 */
export const DECLINABLE_DETAILS = [
  { key: 'photo', label: 'a photo' },
  { key: 'exactLevel', label: 'your injury level' },
  { key: 'injuryDate', label: 'when you were injured' },
  { key: 'city', label: 'your city' },
  { key: 'state', label: 'your state' },
] as const;

export type DetailKey = (typeof DECLINABLE_DETAILS)[number]['key'];

/** Whether the details form has an answer for one of the five. */
export function detailIsFilled(details: MemberDetails, key: DetailKey): boolean {
  if (key === 'photo') return Boolean(details.photoPath);
  if (key === 'exactLevel') return Boolean(details.exactLevel);
  if (key === 'injuryDate') return Boolean(details.injuryDate);
  if (key === 'city') return Boolean(details.city);
  return Boolean(details.state);
}

const COLUMNS =
  'display_name, birth_date, exact_level, completeness, injury_date, injury_date_precision, city, state, photo_path, show_in_browse, declined';

/* The client types individually selected columns as `any`, so each one is
 * narrowed on the way out rather than cast wholesale. A column that comes back
 * in an unexpected shape reads as empty instead of putting "[object Object]"
 * into somebody's name field. */
const asText = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNullableText = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * What is still blank on somebody's details, in the words the screen uses.
 *
 * Onboarding can be finished early — name and birthday, then the door — so
 * these fields are routinely empty for a while rather than exceptional, and
 * Me needs to say how many are left without the person having to open the
 * editor to find out.
 *
 * Only genuine blanks. `completeness` is not counted: 'Do not know' is a real
 * answer a lot of people will give honestly, and nagging them to replace it
 * would be counting a fact as a gap. Name and birthday are not counted
 * either — a row cannot exist without them.
 *
 * A declined detail is not counted for the same reason 'Do not know' is not.
 * "I would rather not say where I live" is a decision, and a screen that keeps
 * listing it as missing is arguing with somebody who has already answered.
 *
 * Returns the labels rather than a number so that the count and the sentence
 * naming what is missing can never disagree.
 */
export function missingDetails(details: MemberDetails): string[] {
  const declined = new Set(details.declined);
  return DECLINABLE_DETAILS.filter(
    ({ key }) => !declined.has(key) && !detailIsFilled(details, key),
  ).map(({ label }) => label);
}

/**
 * How much of the details form is dealt with, as a percentage.
 *
 * The same arithmetic progressOf() does over the survey, over the five above:
 * filled or declined counts, blank does not. Me showed a count of what was
 * left, which answers "how much is missing" and not "how far along am I" — and
 * a count cannot say "finished" without also saying zero, which reads like a
 * broken badge rather than a finished profile.
 */
export function detailsPercent(details: MemberDetails): number {
  const declined = new Set(details.declined);
  const done = DECLINABLE_DETAILS.filter(
    ({ key }) => declined.has(key) || detailIsFilled(details, key),
  ).length;
  return Math.round((done / DECLINABLE_DETAILS.length) * 100);
}

/** "a photo, your city and your state" — an English list, not a comma dump. */
export function listInWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export async function loadDetails(): Promise<
  { ok: true; details: MemberDetails } | { ok: false; error: string }
> {
  const result = await getSupabase().from('members').select(COLUMNS).maybeSingle();
  if (result.error) return { ok: false, error: result.error.message };
  if (!result.data) return { ok: false, error: 'Your profile could not be found.' };

  const row = result.data as Record<string, unknown>;
  return {
    ok: true,
    details: {
      displayName: asText(row.display_name),
      birthDate: asText(row.birth_date),
      exactLevel: asNullableText(row.exact_level) as ExactLevel | null,
      completeness: (asNullableText(row.completeness) ?? 'Do not know') as Completeness,
      injuryDate: asNullableText(row.injury_date),
      injuryDatePrecision: asNullableText(row.injury_date_precision) as DatePrecision | null,
      city: asNullableText(row.city),
      state: asText(row.state),
      photoPath: asNullableText(row.photo_path),
      showInBrowse: row.show_in_browse !== false,
      declined: Array.isArray(row.declined)
        ? row.declined.filter((v): v is string => typeof v === 'string')
        : [],
    },
  };
}

function trimmedOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export async function saveDetails(
  userId: string,
  details: MemberDetails,
  levelRange: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase()
    .from('members')
    .update({
      display_name: details.displayName.trim(),
      birth_date: details.birthDate,
      exact_level: details.exactLevel === 'Do not know' ? null : details.exactLevel,
      // Derived from the exact level rather than edited separately, exactly as
      // onboarding does it, so the two cannot come apart.
      level_range: levelRange,
      completeness: details.completeness,
      injury_date: details.injuryDate,
      injury_date_precision: details.injuryDatePrecision,
      // An emptied city becomes null, not an empty string: "somewhere else" is
      // a real answer and should look the same in the database as never having
      // said. Spelled out rather than leaning on `||`, which reads as a typo.
      city: trimmedOrNull(details.city),
      state: details.state,
      // `show_in_browse` is deliberately not written here. It is set from Me,
      // on the tap, by `setShowInBrowse` — so a details form opened before
      // somebody hid themselves cannot put them back in the deck when they
      // press Save on a page that no longer shows the switch. It stays on
      // `MemberDetails` because Me reads it through `loadDetails`.
    })
    .eq('id', userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Turn appearing in the deck on or off, and nothing else.
 *
 * Its own writer rather than a call to `saveDetails`, because the two are
 * different kinds of thing. Your details is a form: you edit several fields and
 * press Save, and until you do nothing has happened. Being findable is a
 * switch, and a switch that needed a separate Save somewhere else would leave a
 * member unsure whether they were hidden — which is the one question this
 * control exists to answer.
 *
 * Writing only this column also means a member can hide from Me without the
 * half-finished details form they may have open elsewhere being written over
 * the top of their row.
 */
export async function setShowInBrowse(
  userId: string,
  showInBrowse: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase()
    .from('members')
    .update({ show_in_browse: showInBrowse })
    .eq('id', userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Replaces the profile photo. The file lands under the member's own id, which
 * is the only folder storage policy lets them write to.
 */
export async function savePhoto(
  userId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${userId}/profile.${ext}`;

  const upload = await supabase.storage.from('photos').upload(path, file, { upsert: true });
  if (upload.error) return { ok: false, error: upload.error.message };

  const { error } = await supabase.from('members').update({ photo_path: path }).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

export async function removePhoto(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase()
    .from('members')
    .update({ photo_path: null })
    .eq('id', userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
