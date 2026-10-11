import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Who pressed Going, for passing to the host.
 *
 * The app does not hand the details over itself (CONTEXT.md, "Contact details
 * stay inside the club"); an administrator does, by hand, and this is the list
 * they do it from. `event_host_contacts` answers only an administrator and
 * reads each address from the account, so a member's email is not stored a
 * second time anywhere a client can read.
 */
export interface HostContact {
  memberId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

interface HostContactRow {
  member_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
}

export async function fetchHostContacts(
  eventId: string,
): Promise<{ ok: true; contacts: HostContact[] } | { ok: false; error: string }> {
  // Not destructured: the client types rpc data as `any`.
  const result = await getSupabase().rpc('event_host_contacts', { event_id: eventId });
  if (result.error)
    return { ok: false, error: describeError(result.error, 'Could not load who is going.') };
  const rows: unknown = result.data;
  return {
    ok: true,
    contacts: (rows as HostContactRow[]).map((row) => ({
      memberId: row.member_id,
      displayName: row.display_name,
      email: row.email,
      phone: row.phone,
    })),
  };
}

/** One line a person, in the order a host reads them: name, email, then the phone if there is one. */
export function contactsAsText(contacts: HostContact[]): string {
  return contacts
    .map((c) => [c.displayName, c.email ?? '(no email)', c.phone].filter(Boolean).join(' · '))
    .join('\n');
}
