import { act, renderHook, waitFor } from '@testing-library/react';
import { Activity, createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttendeesByEvent, useEvents } from '@/lib/events';
import { pagedDatabase } from '@/test/paged-database';

const state = vi.hoisted(() => {
  const counted = {
    tables: {} as Record<string, Record<string, unknown>[]>,
    made: [] as { requests: unknown[] }[],
    /** Every table read, with the columns asked for. */
    selects: [] as [string, string][],
  };
  return { ...counted, requests: () => counted.made.reduce((n, db) => n + db.requests.length, 0) };
});
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    const db = pagedDatabase(state.tables);
    state.made.push(db);
    const from = db.from;
    return {
      ...db,
      from: (table: string) => {
        const query = from(table);
        const select = query.select;
        query.select = (...args: unknown[]) => {
          state.selects.push([table, String(args[0])]);
          return select();
        };
        return query;
      },
    };
  },
}));

beforeEach(() => {
  // Six tags and a tally on every event, embedded as the read asks for them.
  const events = Array.from({ length: 2005 }, (_, index) => ({
    id: `event-${String(index).padStart(4, '0')}`,
    title: `Event ${index}`,
    description: '',
    start_time: index < 1000 ? '2020-01-01T00:00:00Z' : '2027-01-01T00:00:00Z',
    feed_id: null,
    event_tags: Array.from({ length: 6 }, (_, tag) => ({ tag_id: `tag-${tag}` })),
    event_rsvp_counts: [{ going_count: 2, interested_count: 3 }],
  }));
  state.tables = {
    events,
    tags: [
      ...Array.from({ length: 6 }, (_, tag) => ({
        id: `tag-${tag}`,
        name: `Tag ${tag}`,
        slug: `tag-${tag}`,
        parent_id: 'parent',
      })),
      { id: 'parent', name: 'Sport', slug: 'sport', parent_id: null },
    ],
    data_feeds: [],
  };
});

describe('large calendars', () => {
  it('includes upcoming events beyond 1000 old rows, with complete tags and counts', async () => {
    const { result } = renderHook(() => useEvents({ from: '2026-10-08T00:00:00Z' }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.events).toHaveLength(1005);
    const latest = result.current.events.at(-1);
    expect(latest?.id).toBe('event-2004');
    expect(latest?.tags).toHaveLength(6);
    expect(latest?.goingCount).toBe(2);
  });
  it('reads the tags and tallies with the events, not after them', async () => {
    state.selects.length = 0;
    const { result } = renderHook(() => useEvents({ from: '2026-10-08T00:00:00Z' }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const tables = state.selects.map(([table]) => table);
    expect(tables).not.toContain('event_tags');
    expect(tables).not.toContain('event_rsvp_counts');
    const columns = state.selects.find(([table]) => table === 'events')?.[1] ?? '';
    expect(columns).toContain('event_tags(tag_id)');
    expect(columns).toContain('event_rsvp_counts(going_count, interested_count)');
  });
  it('reads a detail by ID even when it is beyond the first API page', async () => {
    const { result } = renderHook(() => useEvents({ id: 'event-2004' }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.events.map((event) => event.id)).toEqual(['event-2004']);
  });
  it('paginates history instead of silently dropping dates', async () => {
    const { result } = renderHook(() => useEvents({ to: '2026-10-08T00:00:00Z' }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.events).toHaveLength(1000);
  });
});

describe('a kept tab showing again', () => {
  // Hidden and shown, as KeptTabs does: the reads run again, and every render
  // in between still has what was drawn.
  async function hideAndShow<T>(hook: () => T, loading: (value: T) => boolean) {
    const tab = { mode: 'visible' as 'visible' | 'hidden' };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Activity, { mode: tab.mode, children });
    const seen: boolean[] = [];
    const { result, rerender } = renderHook(
      () => {
        const value = hook();
        seen.push(loading(value));
        return value;
      },
      { wrapper },
    );
    await waitFor(() => {
      expect(loading(result.current)).toBe(false);
    });
    const before = state.requests();
    seen.length = 0;
    tab.mode = 'hidden';
    rerender();
    tab.mode = 'visible';
    rerender();
    await waitFor(() => {
      expect(state.requests()).toBeGreaterThan(before);
    });
    await act(async () => {
      await Promise.resolve();
    });
    return { seen, result };
  }

  it('keeps the events drawn while they are read again', async () => {
    const { seen, result } = await hideAndShow(
      () => useEvents({ from: '2026-10-08T00:00:00Z' }),
      (value) => value.loading,
    );
    expect(seen).not.toContain(true);
    expect(result.current.events).toHaveLength(1005);
  });

  it('keeps the faces drawn while they are read again', async () => {
    state.tables = {
      ...state.tables,
      event_attendees: [{ event_id: 'event-2004', member_id: 'm1', display_name: 'Ana' }],
    };
    const { seen, result } = await hideAndShow(
      () => useAttendeesByEvent(['event-2004']),
      (value) => value.loading,
    );
    expect(seen).not.toContain(true);
    expect(result.current.byEvent.get('event-2004')).toHaveLength(1);
  });
});
