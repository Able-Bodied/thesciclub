import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireMember } from '@/components/require-member';

const state = vi.hoisted(() => ({
  error: null as { message: string } | null,
  onChange: null as ((event: string, session: { user: { id: string } } | null) => void) | null,
  lookup: vi.fn(),
  reject: false,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'me' } } }, error: null }),
      onAuthStateChange: (
        callback: (event: string, session: { user: { id: string } } | null) => void,
      ) => {
        state.onChange = callback;
        return { data: { sub: null, subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        abortSignal: () => query,
        maybeSingle: () => {
          state.lookup();
          if (state.reject) return Promise.reject(new Error('Offline'));
          return Promise.resolve({
            data: state.error ? null : { id: 'me', status: 'active', display_name: 'Member' },
            error: state.error,
          });
        },
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  state.error = { message: 'Backend unavailable' };
  state.reject = false;
  state.lookup.mockClear();
});

describe('membership outages', () => {
  it.each([false, true])(
    'retains the protected destination and lets an existing member retry (rejected=%s)',
    async (reject) => {
      state.reject = reject;
      render(
        <MemoryRouter initialEntries={['/chat/t/saved-link']}>
          <Routes>
            <Route
              path="/chat/t/saved-link"
              element={
                <RequireMember>
                  <p>Original conversation</p>
                </RequireMember>
              }
            />
            <Route path="/join" element={<p>Join screen</p>} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByRole('button', { name: 'Try again' });
      expect(screen.queryByText('Join screen')).toBeNull();
      state.error = null;
      state.reject = false;
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await screen.findByText('Original conversation');
      expect(state.lookup).toHaveBeenCalledTimes(2);
    },
  );
  it('still redirects after a real sign-out', async () => {
    state.error = null;
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <RequireMember>
                <p>Home</p>
              </RequireMember>
            }
          />
          <Route path="/join" element={<p>Join screen</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Home');
    // A later sign-out is authoritative, even after a successful member read.
    await act(async () => {
      state.onChange?.('SIGNED_OUT', null);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Join screen')).toBeInTheDocument());
  });
});
