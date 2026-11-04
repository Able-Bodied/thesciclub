import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppNav, litTab } from '@/components/app-nav';
import type * as BadgesModule from '@/lib/badges';
import type * as NotificationsModule from '@/lib/notifications';

const unseen = vi.hoisted(() => ({ count: 0 }));

// The bell reads its number from the database; stubbed so this test reads nothing.
vi.mock('@/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationsModule>()),
  useUnseenNotifications: () => ({ count: unseen.count, refresh: () => undefined }),
}));
vi.mock('@/lib/chat/unread', () => ({ useUnreadThreads: () => ({ count: 0, reload: vi.fn() }) }));
vi.mock('@/lib/chat/realtime', () => ({ useRealtimeRows: vi.fn() }));
vi.mock('@/lib/icon-badge', () => ({ useIconBadge: vi.fn() }));
vi.mock('@/lib/badges', async (importOriginal) => ({
  ...(await importOriginal<typeof BadgesModule>()),
  useBadgeRealtime: vi.fn(),
}));

describe('litTab', () => {
  it('lights a tab on its own path and beneath it', () => {
    expect(litTab('/chat', null)).toBe('/chat');
    expect(litTab('/chat/rooms/bowel/topics/t', null)).toBe('/chat');
    expect(litTab('/events/abc', undefined)).toBe('/events');
  });

  it('does not light a tab whose name only starts the path', () => {
    expect(litTab('/meetings', null)).toBeNull();
  });

  // Every card on Home hands what it opens `{ from: 'home', segment }`.
  it('lights Home for a screen opened from Home', () => {
    expect(litTab('/chat/rooms/bowel/topics/t', { from: 'home', segment: 'topics' })).toBe('/home');
    expect(litTab('/chat/rooms/bowel/new', { from: 'home', segment: 'everything' })).toBe('/home');
    expect(litTab('/events/abc', { from: 'home', segment: 'events' })).toBe('/home');
    expect(litTab('/peers/abc', { from: 'home' })).toBe('/home');
  });

  it('ignores state that does not say Home', () => {
    expect(litTab('/chat/rooms/bowel/topics/t', { from: 'events' })).toBe('/chat');
  });
});

describe('AppNav', () => {
  it('marks the lit tab as the current page, and only that one', () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/chat/rooms/bowel/topics/t', state: { from: 'home', segment: 'topics' } },
        ]}
      >
        <AppNav />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Chat' })).not.toHaveAttribute('aria-current');
  });
});

describe('the bar on a scroll', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function scrollOn({ coarse, wide }: { coarse: boolean; wide: boolean }) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('pointer') ? coarse : wide,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render(
      <MemoryRouter>
        <AppNav />
        <div data-testid="box" />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Main' });
    Object.defineProperty(nav, 'offsetHeight', { value: 60 });
    const box = screen.getByTestId('box');
    Object.defineProperty(box, 'scrollHeight', { value: 2000 });
    Object.defineProperty(box, 'clientHeight', { value: 600 });
    Object.defineProperty(box, 'scrollTop', { value: 300 });
    fireEvent.scroll(box);
    return nav;
  }

  it('goes on a phone', () => {
    expect(scrollOn({ coarse: true, wide: false }).style.marginBottom).toBe('-60px');
  });

  it('stays in a narrow window on a computer', () => {
    expect(scrollOn({ coarse: false, wide: false }).style.marginBottom).toBe('');
  });

  it('stays at the top of a wide screen, touch or not', () => {
    expect(scrollOn({ coarse: true, wide: true }).style.marginBottom).toBe('');
  });
});

describe('the Me tab', () => {
  const renderNav = () =>
    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

  it('says so when a notification is unseen', () => {
    unseen.count = 2;
    renderNav();
    expect(screen.getByRole('link', { name: 'Me, new notifications' })).toBeInTheDocument();
    unseen.count = 0;
  });

  it('is plain otherwise', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Me' })).toBeInTheDocument();
  });
});
