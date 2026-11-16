import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AskAfterSending } from '@/components/ask-after-sending';
import { AccessibilityProvider } from '@/lib/accessibility';
import type * as Notifications from '@/lib/push/notifications';
import { noteSent } from '@/lib/push/notifications';

/**
 * What the device says is stubbed (jsdom has no Notification and is never an
 * installed app); `mayAskForNotifications`, the screen, and remembering the answer in
 * localStorage are the real ones.
 */
interface Db {
  facts: Notifications.OpeningFacts;
  state: string | null;
  turnedOn: number;
  /** The iPhone app, whose facts come from iOS asynchronously. */
  app: boolean;
}
const db = vi.hoisted(
  (): Db => ({
    facts: { enabled: true, standalone: true, permission: 'default', askedRecently: false },
    state: 'off',
    turnedOn: 0,
    app: false,
  }),
);

vi.mock('@/lib/push/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof Notifications>()),
  openingFacts: () => ({ ...db.facts }),
  isAppPush: () => db.app,
  appOpeningFacts: () => Promise.resolve({ ...db.facts }),
  useDeviceNotifications: () => ({
    state: db.state,
    busy: false,
    error: null,
    turnOn: () => {
      db.turnedOn += 1;
    },
    turnOff: () => undefined,
  }),
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Dana' }),
}));

function renderClub() {
  return render(
    <AccessibilityProvider>
      <AskAfterSending>
        <h1>Home</h1>
      </AskAfterSending>
    </AccessibilityProvider>,
  );
}

/** As the composer, a new topic or Home's ask box does once something is sent. */
async function send() {
  await act(async () => {
    noteSent();
    await Promise.resolve();
  });
}

const QUESTION = 'Get notified when they reply?';

beforeEach(() => {
  localStorage.clear();
  db.facts = { enabled: true, standalone: true, permission: 'default', askedRecently: false };
  db.state = 'off';
  db.turnedOn = 0;
  db.app = false;
});

// The owner, 2026-11-15: not on opening, but once something has been sent.
describe('after the first message, reply or topic', () => {
  it('does not ask on opening, and asks once something is sent; Turn on asks the phone', async () => {
    renderClub();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText(QUESTION)).toBeNull();
    await send();
    expect(await screen.findByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText(/as soon as somebody responds/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(db.turnedOn).toBe(1);
  });

  it('Not now goes back to the club and remembers', async () => {
    renderClub();
    await send();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(localStorage.getItem('thesciclub.notificationsAsked')).not.toBeNull();
  });

  it.each<[string, Partial<Notifications.OpeningFacts>]>([
    ['in a browser tab', { standalone: false }],
    ['within five days of Not now on this phone', { askedRecently: true }],
    ['when the phone already said yes', { permission: 'granted' }],
    ['when the phone said no', { permission: 'denied' }],
    ['while the club cannot send', { enabled: false }],
  ])('does not ask %s', async (_, over) => {
    db.facts = { ...db.facts, ...over };
    renderClub();
    await send();
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(document.documentElement.dataset.forceLight).toBeUndefined();
  });

  it('asks for a reminder when they tap Going on an event', async () => {
    renderClub();
    await act(async () => {
      noteSent('going');
      await Promise.resolve();
    });
    expect(await screen.findByText('Get a reminder before it starts?')).toBeInTheDocument();
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it('asks in the iPhone app once iOS has answered', async () => {
    db.app = true;
    renderClub();
    await send();
    expect(await screen.findByText(QUESTION)).toBeInTheDocument();
  });
});
