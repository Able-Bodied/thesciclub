import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebugPanel } from '@/components/debug-panel';
import {
  debugCards,
  debugRequest,
  debugScreen,
  debugState,
  resetDebugLog,
  summarize,
} from '@/lib/debug-log';

const account = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/lib/account', () => ({ useAccount: () => ({ isAdmin: account.isAdmin }) }));

/** Home, reached by a tap: the ranking, then the posts once it has answered. */
function aVisit() {
  debugScreen('/home', 1000, false);
  debugRequest('rpc:home_topics_ranked', '', 1040, 600, true, 2100);
  debugRequest('table:chat_topics', 'select=id,title', 1650, 300, true, null);
  debugRequest('table:events', 'select=*', 1045, 250, false, null);
  debugCards('/home', 1000);
}

beforeEach(() => {
  account.isAdmin = true;
  resetDebugLog(true);
});

describe('debug mode', () => {
  // The owner, 2026-11-18: how long each request takes, to see why Home is slow.
  it('lists a screen’s requests with when each started and how long it took', async () => {
    aVisit();
    render(<DebugPanel />);
    await userEvent.click(screen.getByRole('button', { name: /^Debug/ }));
    const [waited, list] = screen.getAllByRole('list');
    if (!waited || !list) throw new Error('no lists');
    // In the order they were asked, each timed from reaching the screen.
    expect([...list.querySelectorAll('li')].map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^rpc:home_topics_ranked\+40 ms600 ms/),
      expect.stringMatching(/^✕ table:events\+45 ms250 ms/),
      expect.stringMatching(/^table:chat_topics\+650 ms300 ms/),
    ]);
    expect(screen.getByText('1.00 s')).toBeInTheDocument();
    // Why it took that long: the posts were asked for only once the ranking
    // had answered, and the events' read ran beside them.
    expect([...waited.querySelectorAll('li')].map((row) => row.textContent)).toEqual([
      '1. rpc:home_topics_ranked600 ms',
      '2. table:chat_topics300 ms',
      'then, until the cards were drawn50 ms',
    ]);

    const [visit] = debugState().screens;
    if (!visit) throw new Error('no screen');
    // The last reply is the posts': asked only once the ranking had answered.
    expect(summarize(visit)).toMatchObject({
      count: 3,
      failed: 1,
      lastReplyMs: 950,
      addedMs: 1150,
    });
  });

  it('keeps nothing while it is off', () => {
    resetDebugLog(false);
    aVisit();
    expect(debugState().screens).toEqual([]);
  });

  // An administrator's tool: nobody else is shown it, whatever their browser holds.
  it('draws nothing for a member who is not an administrator', () => {
    account.isAdmin = false;
    aVisit();
    const { container } = render(<DebugPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});
