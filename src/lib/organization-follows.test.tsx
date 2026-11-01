import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrganizationFollows } from '@/lib/organization-follows';

const api = vi.hoisted(() => ({
  calls: [] as string[],
  answer: 'joined',
  requests: [] as { organization_id: string }[],
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me' }),
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => () => undefined }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const data = table === 'organization_join_requests' ? api.requests : [];
      const chain = {
        select: () => chain,
        eq: () => chain,
        abortSignal: () => Promise.resolve({ data, error: null }),
      };
      return chain;
    },
    rpc: (name: string) => {
      api.calls.push(name);
      return Promise.resolve({ data: api.answer, error: null });
    },
  }),
}));

beforeEach(() => {
  api.calls = [];
  api.answer = 'joined';
  api.requests = [];
});

async function ready() {
  const view = renderHook(() => useOrganizationFollows());
  await waitFor(() => {
    expect(view.result.current.loading).toBe(false);
  });
  return view;
}

describe('joining an organization', () => {
  it('makes a member of an open one', async () => {
    const { result } = await ready();
    act(() => {
      result.current.toggle('o1');
    });
    await waitFor(() => {
      expect(api.calls).toEqual(['join_organization']);
    });
    expect(result.current.following.has('o1')).toBe(true);
    expect(result.current.requested.has('o1')).toBe(false);
  });

  it('only asks of one that approves first', async () => {
    api.answer = 'requested';
    const { result } = await ready();
    act(() => {
      result.current.toggle('o1');
    });
    await waitFor(() => {
      expect(result.current.requested.has('o1')).toBe(true);
    });
    expect(result.current.following.has('o1')).toBe(false);
  });

  it('takes back a request', async () => {
    api.requests = [{ organization_id: 'o1' }];
    const { result } = await ready();
    await waitFor(() => {
      expect(result.current.requested.has('o1')).toBe(true);
    });
    act(() => {
      result.current.toggle('o1');
    });
    await waitFor(() => {
      expect(api.calls).toEqual(['leave_organization']);
    });
    expect(result.current.requested.has('o1')).toBe(false);
  });
});
