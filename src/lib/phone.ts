/**
 * Phone numbers, as typed and as stored.
 *
 * People type "(408) 555-0112", "408-555-0112", "+1 408 555 0112". Supabase
 * auth wants E.164 without the plus — "14085550112" — and the invite list keys
 * on the same shape. A number that misses on a bracket is a member locked out
 * of their own club, so the conversion happens in one place with tests.
 *
 * US-only for now, which is why the country code is a fixed +1 on the form
 * rather than a picker. That is a real limit, and it is stated here rather than
 * hidden in a regex.
 */

export const COUNTRY_CODE = '1';

/** Just the digits, country code stripped if it was typed. */
export function digitsOf(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith(COUNTRY_CODE)) return digits.slice(1);
  return digits;
}

/**
 * Progressive formatting, for an input somebody is still typing into.
 * Never adds characters the person has not earned: "408" stays "408", not
 * "(408) ", so backspace does not fight them.
 */
export function formatPhoneInput(input: string): string {
  const d = digitsOf(input).slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** The shape Supabase auth and the invite list both use: 1 + ten digits, no plus. */
export function toE164(input: string): string | null {
  const d = digitsOf(input);
  if (d.length !== 10) return null;
  return `${COUNTRY_CODE}${d}`;
}

export function isCompletePhone(input: string): boolean {
  return digitsOf(input).length === 10;
}
