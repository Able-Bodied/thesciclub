import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEvents } from '@/lib/events';
import { pagedDatabase } from '@/test/paged-database';

const state = vi.hoisted(() => ({ tables: {} }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => pagedDatabase(state.tables) }));

beforeEach(() => {
  const events = Array.from({ length: 2005 }, (_, index) => ({
    id: `event-${String(index).padStart(4, '0')}`,
    title: `Event ${index}`,
    description: '',
    start_time: index < 1000 ? '2020-01-01T00:00:00Z' : '2027-01-01T00:00:00Z',
    feed_id: null,
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
    event_tags: events.flatMap(({ id }) =>
      Array.from({ length: 6 }, (_, tag) => ({ event_id: id, tag_id: `tag-${tag}` })),
    ),
    event_rsvp_counts: events.map(({ id }) => ({
      event_id: id,
      going_count: 2,
      interested_count: 3,
    })),
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
