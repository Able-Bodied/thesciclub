import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDraftPayload } from '@/lib/events';

const calls = vi.hoisted(() => ({ rpc: [] as [string, Record<string, unknown>][] }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.rpc.push([name, args]);
      return Promise.resolve({ data: 'e1', error: null });
    },
  }),
}));

const { saveEvent, saveEventSeries } = await import('@/lib/events');

const payload: Omit<EventDraftPayload, 'id'> = {
  organizationId: 'org',
  hostName: '',
  title: 'Sit-ski day',
  description: '',
  startTime: '2026-12-01T17:00:00.000Z',
  endTime: null,
  format: 'in_person',
  location: '1 Mountain Rd',
  city: 'Truckee',
  state: 'CA',
  url: '',
  registrationUrl: '',
};

beforeEach(() => {
  calls.rpc = [];
});

describe('saving an event by hand', () => {
  it("sends the event's own state with one date and with a series", async () => {
    await saveEvent({ id: null, ...payload, state: 'NV' });
    await saveEventSeries(payload, { unit: 'week', every: 1, endsOn: null, endsAfter: 4 });
    expect(calls.rpc.map(([name, args]) => [name, args.state])).toEqual([
      ['save_event', 'NV'],
      ['save_event_series', 'CA'],
    ]);
  });

  it('sends null to keep the saved state', async () => {
    await saveEvent({ id: 'e1', ...payload, state: null });
    expect(calls.rpc[0]?.[1]).toHaveProperty('state', null);
  });
});
