import { getSupabase } from '@/lib/supabase';

/**
 * @usernames: 3 to 20 characters of lowercase letters, digits, "." and "_".
 *
 * The database is the judge of what is free or reserved (`username_available`);
 * this is the shape the field can check before asking, and the same shape the
 * `members_username_shape` check enforces.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** What the box holds: lowercase, no "@", no spaces. */
export function normalizeUsername(typed: string): string {
  return typed.toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
}

export function isValidUsername(name: string): boolean {
  return /^[a-z0-9._]{3,20}$/.test(name) && !/^[._]|[._]$|\.\./.test(name);
}

/** Up to five free names built from the person's name, best first. Empty if the call fails. */
export async function suggestUsernames(fullName: string): Promise<string[]> {
  const name = fullName.trim();
  if (!name) return [];
  const result = await getSupabase().rpc('suggest_usernames', { full_name: name });
  const names = result.data as unknown;
  if (result.error || !Array.isArray(names)) return [];
  return (names as string[]).slice(0, 5);
}

/** True / false from the database; null when it could not be asked. */
export async function usernameAvailable(name: string): Promise<boolean | null> {
  const result = await getSupabase().rpc('username_available', { name });
  const free = result.data as unknown;
  if (result.error || typeof free !== 'boolean') return null;
  return free;
}
