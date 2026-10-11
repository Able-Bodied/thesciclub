import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contactsAsText, fetchHostContacts } from '@/routes/admin/event-contacts';

const db = vi.hoisted(() => ({
  calls: [] as [string, Record<string, unknown>][],
  answer: { data: [] as unknown, error: null as null | { message: string; code?: string } },
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      db.calls.push([name, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

beforeEach(() => {
  db.calls = [];
  db.answer = { data: [], error: null };
});

describe('who is going, for the host', () => {
  it('asks event_host_contacts for that event and maps the rows', async () => {
    db.answer = {
      data: [
        { member_id: 'm1', display_name: 'Dana', email: 'dana@example.com', phone: '14085550112' },
        { member_id: 'm2', display_name: 'Sam', email: 'sam@example.com', phone: null },
      ],
      error: null,
    };
    const result = await fetchHostContacts('e1');
    expect(db.calls).toEqual([['event_host_contacts', { event_id: 'e1' }]]);
    expect(result).toEqual({
      ok: true,
      contacts: [
        { memberId: 'm1', displayName: 'Dana', email: 'dana@example.com', phone: '14085550112' },
        { memberId: 'm2', displayName: 'Sam', email: 'sam@example.com', phone: null },
      ],
    });
  });

  it('gives the database’s refusal to a non-administrator in words', async () => {
    db.answer = { data: null, error: { message: 'Not an administrator' } };
    const result = await fetchHostContacts('e1');
    expect(result).toEqual({ ok: false, error: 'Not an administrator' });
  });

  // One line a person, name then email then phone: the shape a host reads and
  // pastes. A member whose account has no email yet is said so, not skipped.
  it('copies as one line a person, with the phone only when there is one', () => {
    expect(
      contactsAsText([
        { memberId: 'm1', displayName: 'Dana', email: 'dana@example.com', phone: '14085550112' },
        { memberId: 'm2', displayName: 'Sam', email: null, phone: null },
      ]),
    ).toBe('Dana · dana@example.com · 14085550112\nSam · (no email)');
  });
});
