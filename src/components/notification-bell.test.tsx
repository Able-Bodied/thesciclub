import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '@/components/notification-bell';
import type * as NotificationsModule from '@/lib/notifications';

const unseen = vi.hoisted(() => ({ count: 0, loaded: false }));
vi.mock('@/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationsModule>()),
  useUnseenNotifications: () => ({ ...unseen, refresh: () => undefined }),
}));

function draw() {
  return (
    <MemoryRouter>
      <NotificationBell variant="round" />
    </MemoryRouter>
  );
}

describe('NotificationBell', () => {
  it('swings only when a notification arrives, not when the count first loads', () => {
    const { container, rerender } = render(draw());
    const bell = () => container.querySelector('svg');

    Object.assign(unseen, { count: 3, loaded: true });
    rerender(draw());
    expect(bell()).not.toHaveClass('bell-ring');

    Object.assign(unseen, { count: 4 });
    rerender(draw());
    expect(bell()).toHaveClass('bell-ring');
  });
});
