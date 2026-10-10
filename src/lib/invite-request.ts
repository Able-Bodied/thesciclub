import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Asking somebody you know for an invite, from the closed door (the owner,
 * 2026-10-10; 20261011000000).
 *
 * The person picks numbers from their own contacts (where the phone lets a
 * web page see them: the Contact Picker, Chrome on Android) or types one in
 * (everywhere, iPhones included: no iPhone browser or Home Screen app can read
 * contacts). `find_inviters` says which of them can add them, and nothing
 * else. The ask itself is a text from their own phone, written for them.
 */

/** The owner's consultation booking, for somebody who knows nobody in the club. */
export const CONSULTATION_URL =
  'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ1sI6kVUUM-1XCTkhRWHYJIqYmoTsXiLCYeb4bgeKKjOnKpi6tsN-SHTzs39z6B9Tpg5d8NdThx';

/** Which of these numbers belong to somebody who can add the asker. */
export async function findInviters(
  numbers: string[],
): Promise<{ ok: true; phones: string[] } | { ok: false; error: string }> {
  try {
    const { data, error } = (await getSupabase().rpc('find_inviters', { numbers })) as {
      data: { phone: string }[] | null;
      error: Failure | null;
    };
    if (error) return { ok: false, error: describeError(error, 'Could not check those numbers.') };
    return { ok: true, phones: (data ?? []).map((row) => row.phone) };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Could not check those numbers.') };
  }
}

/** The digits a number is compared by, as the database normalizes it. */
export function normalizedDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `1${digits}` : digits;
}

export interface PickedContact {
  name: string;
  numbers: string[];
}

interface ContactsManager {
  select: (
    properties: ('name' | 'tel')[],
    options: { multiple: boolean },
  ) => Promise<{ name?: string[]; tel?: string[] }[]>;
}

/** Whether this browser lets the person choose contacts to share with the page. */
export function canPickContacts(): boolean {
  return 'contacts' in navigator && 'ContactsManager' in window;
}

/** The person chooses; the page sees only what they chose. */
export async function pickContacts(): Promise<PickedContact[]> {
  const contacts = (navigator as Navigator & { contacts: ContactsManager }).contacts;
  const chosen = await contacts.select(['name', 'tel'], { multiple: true });
  return chosen
    .map((contact) => {
      const name = contact.name?.[0]?.trim() ?? '';
      return {
        name: name === '' ? 'A contact' : name,
        numbers: (contact.tel ?? []).filter((tel) => tel.trim() !== ''),
      };
    })
    .filter((contact) => contact.numbers.length > 0);
}

/** What the text says, from the person asking. */
export function inviteRequestText(ownPhone: string): string {
  return `Hi, I'm trying to join The SCI Club (thesciclub.com), and a member has to add my number before I can. Could you add ${ownPhone}? Thank you!`;
}

/**
 * A link that opens the phone's messages app with the text written. `?&body=`
 * is the form both iPhones and Android read.
 */
export function smsHref(phone: string, body: string): string {
  return `sms:+${normalizedDigits(phone)}?&body=${encodeURIComponent(body)}`;
}

/**
 * A member's own "people who have my number can ask me" switch (on unless
 * they turn it off). Read and written on its own, as the visibility switch is:
 * it is a switch, not part of a form.
 */
export function useFindableForInvites(userId: string | null): {
  findable: boolean | null;
  saving: boolean;
  error: string | null;
  set: (next: boolean) => void;
} {
  const [findable, setFindable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (
      getSupabase()
        .from('members')
        .select('findable_for_invites')
        .eq('id', userId)
        .maybeSingle() as unknown as Promise<{
        data: { findable_for_invites: boolean } | null;
        error: Failure | null;
      }>
    )
      .then(({ data }) => {
        if (!cancelled && data) setFindable(data.findable_for_invites);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const set = useCallback(
    (next: boolean) => {
      if (!userId) return;
      setFindable(next);
      setSaving(true);
      setError(null);
      void (
        getSupabase()
          .from('members')
          .update({ findable_for_invites: next })
          .eq('id', userId) as unknown as Promise<{ error: Failure | null }>
      )
        .then(({ error: failure }) => {
          if (failure) {
            setFindable(!next);
            setError(describeError(failure, 'That was not changed.'));
          }
        })
        .catch((e: unknown) => {
          setFindable(!next);
          setError(describeThrown(e, 'That was not changed.'));
        })
        .finally(() => {
          setSaving(false);
        });
    },
    [userId],
  );

  return { findable, saving, error, set };
}
