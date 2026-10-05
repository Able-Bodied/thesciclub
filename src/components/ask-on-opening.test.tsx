import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AskOnOpening } from '@/components/ask-on-opening';
import { AccessibilityProvider } from '@/lib/accessibility';
import type * as Notifications from '@/lib/push/notifications';

/**
 * What the device says is stubbed (jsdom has no Notification and is never an
 * installed app); `askOnOpening`, the screen, and remembering the answer in
 * localStorage are the real ones.
 */
interface Db {
  facts: Notifications.OpeningFacts;
  state: string | null;
  turnedOn: number;
}
const db = vi.hoisted(
  (): Db => ({
    facts: { enabled: true, standalone: true, permission: 'default', askedHere: false },
    state: 'off',
    turnedOn: 0,
  }),
);

vi.mock('@/lib/push/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof Notifications>()),
  openingFacts: () => ({ ...db.facts }),
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

function renderOpening() {
  return render(
    <AccessibilityProvider>
      <AskOnOpening>
        <h1>Home</h1>
      </AskOnOpening>
    </AccessibilityProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  db.facts = { enabled: true, standalone: true, permission: 'default', askedHere: false };
  db.state = 'off';
  db.turnedOn = 0;
});

describe('the first time the installed app opens', () => {
  it('asks before the club, and Turn on asks the phone', async () => {
    renderOpening();
    expect(screen.getByText('Turn on notifications?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(db.turnedOn).toBe(1);
  });

  it('goes on to the club once the phone said yes, and remembers', () => {
    db.state = 'on';
    renderOpening();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(localStorage.getItem('thesciclub.notificationsAsked')).not.toBeNull();
  });

  it('Not now goes on to the club and remembers', async () => {
    renderOpening();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(localStorage.getItem('thesciclub.notificationsAsked')).not.toBeNull();
  });

  it('is drawn in light, as it is at the end of signing up', () => {
    renderOpening();
    expect(document.documentElement.dataset.forceLight).toBe('');
  });
});

describe('every other opening', () => {
  it.each<[string, Partial<Notifications.OpeningFacts>]>([
    ['in a browser tab', { standalone: false }],
    ['after Not now on this phone', { askedHere: true }],
    ['when the phone already said yes', { permission: 'granted' }],
    ['when the phone said no', { permission: 'denied' }],
    ['while the club cannot send', { enabled: false }],
  ])('goes straight to the club %s', (_, over) => {
    db.facts = { ...db.facts, ...over };
    renderOpening();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText('Turn on notifications?')).toBeNull();
    // Out of light, too: nothing of the question was ever drawn.
    expect(document.documentElement.dataset.forceLight).toBeUndefined();
  });
});
