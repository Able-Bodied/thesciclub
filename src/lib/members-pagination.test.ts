import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrowseMembers } from '@/lib/members';
import { pagedDatabase } from '@/test/paged-database';

const state = vi.hoisted((): { tables: Record<string, Record<string, unknown>[]> } => ({
  tables: {},
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    ...pagedDatabase(state.tables),
    auth: { getSession: () => Promise.resolve({ data: { session: { user: {} } } }) },
  }),
}));

beforeEach(() => {
  // Everybody shares a name, so only `id` keeps the pages from overlapping.
  state.tables = {
    browse_members: Array.from({ length: 1203 }, (_, index) => ({
      id: `member-${String(index).padStart(4, '0')}`,
      type: 'peer',
      display_name: 'Sam',
      state: 'CA',
    })),
  };
});

describe('a large directory', () => {
  it('lists every member past the API row cap, each once', async () => {
    const { result } = renderHook(() => useBrowseMembers());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    const ids = result.current.members.map((member) => member.id);
    expect(ids).toHaveLength(1203);
    expect(new Set(ids).size).toBe(1203);
  });
});
