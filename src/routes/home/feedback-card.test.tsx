import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRoom } from '@/lib/chat/types';
import { appFeedbackRoom, FeedbackCard } from '@/routes/home/feedback-card';

const room = (id: string, name: string, openedAt: string | null = '2026-09-01T00:00:00Z') =>
  ({ id, name, openedAt }) as ChatRoom;

const ROOMS = [room('general', 'General'), room('app-feedback-7960', 'App Feedback')];

function renderCard(rooms: ChatRoom[] = ROOMS) {
  return render(
    <MemoryRouter>
      <ul>
        <FeedbackCard rooms={rooms} linkState={{ from: 'home' }} />
      </ul>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

// The owner, 2026-10-28: an entry for feedback below the first post on Home.
describe('the feedback card on Home', () => {
  it('opens a new topic in the App Feedback room', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: "How's the app working for you?" })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Send feedback' })).toHaveAttribute(
      'href',
      '/chat/rooms/app-feedback-7960/new',
    );
  });

  it('goes away on Not now, and stays away on this device', async () => {
    const { unmount } = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('link', { name: 'Send feedback' })).toBeNull();
    unmount();
    renderCard();
    expect(screen.queryByRole('link', { name: 'Send feedback' })).toBeNull();
  });

  // The owner, 2026-11-18: seen once today, gone until tomorrow.
  it('stays while seen, then is gone from the next visit until tomorrow', () => {
    let onScreen: (entries: { isIntersecting: boolean }[]) => void = () => undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof onScreen) {
          onScreen = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      vi.setSystemTime(new Date(2026, 10, 18, 23, 0));
      const first = renderCard();
      act(() => {
        onScreen([{ isIntersecting: true }]);
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole('link', { name: 'Send feedback' })).toBeVisible();
      first.unmount();

      const later = renderCard();
      expect(screen.queryByRole('link', { name: 'Send feedback' })).toBeNull();
      later.unmount();

      vi.setSystemTime(new Date(2026, 10, 19, 0, 30));
      renderCard();
      expect(screen.getByRole('link', { name: 'Send feedback' })).toBeVisible();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('is not drawn while there is no open App Feedback room', () => {
    renderCard([room('general', 'General'), room('app-feedback-7960', 'App Feedback', null)]);
    expect(screen.queryByRole('link', { name: 'Send feedback' })).toBeNull();
  });
});

describe('appFeedbackRoom', () => {
  it('finds the room by its name, whatever its id', () => {
    expect(appFeedbackRoom([room('x1', ' app feedback ')])?.id).toBe('x1');
    expect(appFeedbackRoom([room('x2', 'App Feedback Archive')])).toBeNull();
  });
});
