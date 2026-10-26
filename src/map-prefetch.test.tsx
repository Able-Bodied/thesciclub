import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The map is warmed at app open, after the other tabs, and only for a member
 * (the owner, 2026-10-25). prefetchMap's own test covers Data Saver and 2G.
 */

const tabs = vi.hoisted(() => ({ loaded: [] as string[], whenMapWarmed: [] as string[] }));
const prefetchMap = vi.fn(() => {
  tabs.whenMapWarmed = [...tabs.loaded].sort();
});
vi.mock('@/lib/map', () => ({ prefetchMap }));

const account = vi.hoisted((): { status: string; userId: string | null } => ({
  status: 'member',
  userId: 'u1',
}));
vi.mock('@/lib/account', () => {
  const read = () => ({ ...account, isAdmin: false, displayName: 'Test' });
  return {
    useAccount: read,
    useOwnAccount: read,
    AccountProvider: ({ children }: { children: React.ReactNode }) => children,
    signOut: () => Promise.resolve({ ok: true }),
  };
});
vi.mock('@/lib/members', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOwnMember: () => ({ member: null, invitedBy: null, loading: false, error: null }),
}));
vi.mock('@/components/app-nav', () => ({ AppNav: () => null }));
vi.mock('@/routes/home/page', () => ({ default: () => <h1>Home</h1> }));
vi.mock('@/routes/onboarding/page', () => ({ default: () => <h1>Join</h1> }));
vi.mock('@/routes/peers/page', () => {
  tabs.loaded.push('peers');
  return { default: () => null };
});
vi.mock('@/routes/chat/page', () => {
  tabs.loaded.push('chat');
  return { default: () => null };
});
vi.mock('@/routes/events/page', () => {
  tabs.loaded.push('events');
  return { default: () => null };
});
vi.mock('@/routes/me/page', () => {
  tabs.loaded.push('me');
  return { default: () => null };
});

const { default: App } = await import('@/App');

// Idle at once, so the test sees the order and not the clock. Left for the
// whole file: unmounting after a test still cancels through these.
vi.stubGlobal('requestIdleCallback', (task: () => void) => window.setTimeout(task, 0));
vi.stubGlobal('cancelIdleCallback', (id: number) => {
  window.clearTimeout(id);
});

beforeEach(() => {
  prefetchMap.mockClear();
});

describe('warming the map', () => {
  it('starts for a member once the four tabs are in', async () => {
    account.status = 'member';
    account.userId = 'u1';
    render(
      <MemoryRouter initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(prefetchMap).toHaveBeenCalledTimes(1);
    });
    expect(tabs.whenMapWarmed).toEqual(['chat', 'events', 'me', 'peers']);
  });

  it('never starts for somebody signed out', async () => {
    account.status = 'signed-out';
    account.userId = null;
    render(
      <MemoryRouter initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Join' })).toBeInTheDocument();
    await new Promise((done) => setTimeout(done, 50));
    expect(prefetchMap).not.toHaveBeenCalled();
  });
});
