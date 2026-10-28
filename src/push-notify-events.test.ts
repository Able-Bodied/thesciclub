import { describe, expect, it } from 'vitest';
import { EVENTS } from '../supabase/functions/push-notify/events.ts';

const MIGRATIONS = import.meta.glob<string>('../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// push-notify refused grant_open and profile_reminder with 400 for a day
// (061dfb2): every event the database sends has to be one it takes.
describe('push-notify takes every event the database sends', () => {
  const sent = new Set(
    Object.values(MIGRATIONS).flatMap((sql) =>
      [...sql.matchAll(/push_notify_send\('([a-z_]+)'/g)].map((m) => m[1] ?? ''),
    ),
  );

  it('finds the events in the migrations', () => {
    expect(sent).toContain('message');
    expect(sent).toContain('reaction');
  });

  it.each([...sent])('takes %s', (event) => {
    expect(EVENTS.has(event)).toBe(true);
  });
});
