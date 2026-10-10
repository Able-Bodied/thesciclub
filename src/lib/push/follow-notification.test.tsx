import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowNotification } from '@/lib/push/follow-notification';
import { NAVIGATE, PENDING } from '@/lib/push/payload';

/**
 * jsdom has no service worker, so a small one stands in: it records what the
 * app posts to it, and lets the test deliver a message as the worker would.
 */
let listeners: ((event: MessageEvent) => void)[] = [];
let posted: unknown[] = [];

beforeEach(() => {
  listeners = [];
  posted = [];
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: (_: string, fn: (event: MessageEvent) => void) => {
        listeners.push(fn);
      },
      removeEventListener: (_: string, fn: (event: MessageEvent) => void) => {
        listeners = listeners.filter((l) => l !== fn);
      },
      startMessages: () => undefined,
      ready: Promise.resolve({
        active: {
          postMessage: (message: unknown) => {
            posted.push(message);
          },
        },
      }),
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

function Where() {
  const location = useLocation();
  return <p>at {`${location.pathname}${location.search}`}</p>;
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <FollowNotification />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

function deliver(data: unknown, port?: { postMessage: (m: unknown) => void }) {
  act(() => {
    for (const listener of listeners) {
      listener({ data, ports: port ? [port] : [] } as unknown as MessageEvent);
    }
  });
}

describe('following a pressed notification', () => {
  it('asks the worker, once it is ready, whether a press is waiting', async () => {
    renderApp();
    await act(() => Promise.resolve());
    expect(posted).toEqual([{ type: PENDING }]);
  });

  it('opens the address the worker sends, and says it did', () => {
    const answered: unknown[] = [];
    renderApp();
    deliver(
      { type: NAVIGATE, path: '/chat/t/abc?message=m1' },
      {
        postMessage: (m) => answered.push(m),
      },
    );
    expect(screen.getByText('at /chat/t/abc?message=m1')).toBeInTheDocument();
    expect(answered).toEqual([{ ok: true }]);
  });

  it('ignores a message that is not a request to open somewhere', () => {
    renderApp();
    deliver({ type: 'something-else', path: '/admin' });
    expect(screen.getByText('at /home')).toBeInTheDocument();
  });

  it('stays inside the club whatever address arrives', () => {
    renderApp();
    deliver({ type: NAVIGATE, path: 'https://elsewhere.example/phish' });
    // Turned into the club's own front page, never the other site.
    expect(screen.queryByText(/elsewhere|phish/)).toBeNull();
    expect(screen.getByText(/^at \//)).toBeInTheDocument();
  });

  it('does nothing at all where there is no service worker', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp();
    expect(screen.getByText('at /home')).toBeInTheDocument();
  });
});
