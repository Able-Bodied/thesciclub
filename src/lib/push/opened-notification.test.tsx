import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ calls: [] as unknown[][], changed: 0 }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (...args: unknown[]) => {
      db.calls.push(args);
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { OpenedNotification } = await import('@/lib/push/opened-notification');
const { NOTIFICATIONS_CHANGED } = await import('@/lib/notifications');

function Where() {
  const location = useLocation();
  return <p>{`${location.pathname}${location.search}${location.hash}`}</p>;
}

function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <OpenedNotification />
      <Where />
    </MemoryRouter>,
  );
}

window.addEventListener(NOTIFICATIONS_CHANGED, () => {
  db.changed++;
});

beforeEach(() => {
  db.calls = [];
  db.changed = 0;
});

describe('OpenedNotification', () => {
  it('clears the pressed one by its tag, and takes the tag out of the address', async () => {
    at('/admin?tab=reports&n=blocks%3A2026-10-26#blocks');
    expect(await screen.findByText('/admin?tab=reports#blocks')).toBeInTheDocument();
    expect(db.calls).toEqual([
      ['notifications_mark_read_by_tag', { notification_tag: 'blocks:2026-10-26' }],
    ]);
    // So the icon and the bell read their numbers again at once.
    await vi.waitFor(() => {
      expect(db.changed).toBe(1);
    });
  });

  it('keeps what the screen reads from the address', async () => {
    at('/chat/t/t1?message=m1&n=thread%3At1');
    expect(await screen.findByText('/chat/t/t1?message=m1')).toBeInTheDocument();
    expect(db.calls).toEqual([
      ['notifications_mark_read_by_tag', { notification_tag: 'thread:t1' }],
    ]);
  });

  it('does nothing for an address no notification opened', () => {
    at('/events/e1');
    expect(screen.getByText('/events/e1')).toBeInTheDocument();
    expect(db.calls).toEqual([]);
  });
});
