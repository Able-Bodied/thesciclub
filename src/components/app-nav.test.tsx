import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppNav, litTab } from '@/components/app-nav';

vi.mock('@/lib/chat/unread', () => ({ useUnreadThreads: () => ({ count: 0, reload: vi.fn() }) }));
vi.mock('@/lib/chat/realtime', () => ({ useRealtimeRows: vi.fn() }));

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
