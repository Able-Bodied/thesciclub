import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent, makeOrganization, makeTag } from '@/test/factory';
import type { ClubEvent, EventAttendee, Organization, RsvpStatus } from '@/types/domain';

const state = vi.hoisted(() => ({
  events: [] as ClubEvent[],
  rsvps: new Map<string, RsvpStatus>(),
  attendees: new Map<string, EventAttendee[]>(),
  organizations: [] as Organization[],
  loading: false,
  error: null as string | null,
  setRsvp: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('@/lib/events', () => ({
  useEvents: () => ({ events: state.events, loading: state.loading, error: state.error }),
  useAttendeesByEvent: () => ({ byEvent: state.attendees, loading: false, error: null }),
  useViewerEvents: () => ({
    rsvps: state.rsvps,
    loading: false,
    error: null,
    reload: state.reload,
  }),
  setRsvp: (...args: unknown[]): Promise<{ ok: boolean; error?: string }> =>
    state.setRsvp(...args) as Promise<{ ok: boolean; error?: string }>,
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations: state.organizations,
    byId: new Map(state.organizations.map((o) => [o.id, o])),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({ status: 'signed-in', userId: 'me' }),
}));

const { default: EventsPage } = await import('@/routes/events/page');

function renderPage() {
  return render(
    <MemoryRouter>
      <EventsPage />
    </MemoryRouter>,
  );
}

/** Far enough out to sit outside "this week" but inside "this month" is fragile
 *  near a month boundary, so tests that care about windows set `when` instead. */
function soon(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

beforeEach(() => {
  state.events = [
    makeEvent({
      id: 'rugby',
      title: 'Wheelchair rugby',
      startTime: soon(1),
      tags: [makeTag('wheelchair-rugby', 'sport')],
    }),
    makeEvent({
      id: 'coffee',
      title: 'Newly injured coffee',
      startTime: soon(2),
      tags: [makeTag('peer-support', 'support')],
    }),
    makeEvent({ id: 'zoom', title: 'Driving Q&A', startTime: soon(3), format: 'online', tags: [] }),
  ];
  state.rsvps = new Map();
  state.attendees = new Map();
  state.organizations = [];
  state.loading = false;
  state.error = null;
  state.setRsvp = vi.fn().mockResolvedValue({ ok: true });
  state.reload = vi.fn();
});

describe('EventsPage', () => {
  it('lists what is on the calendar', () => {
    renderPage();
    expect(screen.getByText('Wheelchair rugby')).toBeInTheDocument();
    expect(screen.getByText('Driving Q&A')).toBeInTheDocument();
  });

  describe('segments', () => {
    it('"Adaptive sport" narrows to the sport category', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Adaptive sport' }));
      expect(screen.getByText('Wheelchair rugby')).toBeInTheDocument();
      expect(screen.queryByText('Newly injured coffee')).not.toBeInTheDocument();
    });

    it('"Online" narrows to what can be attended remotely', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Online' }));
      expect(screen.getByText('Driving Q&A')).toBeInTheDocument();
      expect(screen.queryByText('Wheelchair rugby')).not.toBeInTheDocument();
    });

    it('"I\'m going" shows only what the member said yes to', async () => {
      state.rsvps = new Map([['coffee', 'going']]);
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: "I'm going" }));
      expect(screen.getByText('Newly injured coffee')).toBeInTheDocument();
      expect(screen.queryByText('Wheelchair rugby')).not.toBeInTheDocument();
    });

    it('swaps the body for the directory under Organizations', async () => {
      state.organizations = [makeOrganization({ id: 'o1' })];
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Organizations' }));
      expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
      // Not a narrowed list — no events at all.
      expect(screen.queryByText('Wheelchair rugby')).not.toBeInTheDocument();
    });

    it('hides the filter button under Organizations, which it cannot filter', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Organizations' }));
      expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument();
    });
  });

  describe('empty states say which emptiness it is', () => {
    it('tells somebody with no RSVPs that they have not said yes yet', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: "I'm going" }));
      expect(screen.getByText(/have not said you are going/)).toBeInTheDocument();
      // Telling them to widen filters they never set is how an app teaches
      // people to distrust it.
      expect(screen.queryByText(/fewer filters/)).not.toBeInTheDocument();
    });

    it('tells somebody with a narrow filter to widen it', () => {
      state.events = [];
      renderPage();
      expect(screen.getByText(/fewer filters/)).toBeInTheDocument();
    });
  });

  describe('RSVP', () => {
    /** The first card's Going button. Throws rather than asserting non-null, so
     *  a missing button fails as itself instead of as a null dereference. */
    function firstGoingButton(): HTMLElement {
      const [button] = screen.getAllByRole('button', { name: 'Going' });
      if (!button) throw new Error('no Going button rendered');
      return button;
    }

    it('writes the member’s own id, never the event’s', async () => {
      renderPage();
      await userEvent.click(firstGoingButton());
      expect(state.setRsvp).toHaveBeenCalledWith('rugby', 'me', 'going');
    });

    it('re-reads after a write rather than patching the tally locally', async () => {
      renderPage();
      await userEvent.click(firstGoingButton());
      await waitFor(() => {
        expect(state.reload).toHaveBeenCalled();
      });
    });

    it('surfaces a failed write instead of silently doing nothing', async () => {
      state.setRsvp = vi.fn().mockResolvedValue({ ok: false, error: 'permission denied' });
      renderPage();
      await userEvent.click(firstGoingButton());
      expect(await screen.findByText('permission denied')).toBeInTheDocument();
    });
  });

  describe('the filter sheet', () => {
    it('only offers tags that are on the events in view', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Adaptive sport' }));
      await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
      // peer-support is on an event the segment already removed, so offering it
      // would be offering a way to empty the screen.
      expect(screen.queryByRole('button', { name: 'peer-support' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'wheelchair-rugby' })).toBeInTheDocument();
    });

    it('keeps offering the other cities after one is picked', async () => {
      // The sheet's options ignore the filters the sheet itself sets. Otherwise
      // picking "San Jose" would make every other city vanish from the list you
      // picked it from, and there would be no way back without Clear.
      state.events = [
        makeEvent({ id: 'a', startTime: soon(1), city: 'San Jose' }),
        makeEvent({ id: 'b', startTime: soon(2), city: 'Santa Cruz' }),
      ];
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
      await userEvent.click(screen.getByRole('button', { name: 'San Jose' }));
      expect(screen.getByRole('button', { name: 'Santa Cruz' })).toBeInTheDocument();
    });

    it('only offers a city that has an event in the chosen window', async () => {
      state.events = [
        makeEvent({ id: 'a', startTime: soon(1), city: 'San Jose' }),
        makeEvent({ id: 'b', startTime: soon(200), city: 'Truckee' }),
      ];
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
      // Truckee's only event is 200 days out, well past the default month.
      expect(screen.queryByRole('button', { name: 'Truckee' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Any time' }));
      expect(screen.getByRole('button', { name: 'Truckee' })).toBeInTheDocument();
    });

    it('narrows the list when a tag is picked', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
      await userEvent.click(screen.getByRole('button', { name: 'wheelchair-rugby' }));
      await userEvent.click(screen.getByRole('button', { name: /^Show \d/ }));
      expect(screen.getByText('Wheelchair rugby')).toBeInTheDocument();
      expect(screen.queryByText('Newly injured coffee')).not.toBeInTheDocument();
    });

    it('marks the filter button when something is on', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
      await userEvent.click(screen.getByRole('button', { name: 'wheelchair-rugby' }));
      await userEvent.click(screen.getByRole('button', { name: /^Show \d/ }));
      expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument();
    });
  });

  it('shows the database’s own sentence when the load fails', () => {
    state.error = 'relation "events" does not exist';
    renderPage();
    expect(screen.getByText('relation "events" does not exist')).toBeInTheDocument();
  });
});

describe('a repeating event is one row until you open it', () => {
  const weekly = () => [
    makeEvent({ id: 'w1', title: 'Weekly Wednesdays', startTime: soon(1), seriesId: 'wed' }),
    makeEvent({ id: 'w2', title: 'Weekly Wednesdays', startTime: soon(8), seriesId: 'wed' }),
    makeEvent({ id: 'w3', title: 'Weekly Wednesdays', startTime: soon(15), seriesId: 'wed' }),
    makeEvent({ id: 'solo', title: 'Handcycle ride', startTime: soon(2) }),
  ];

  it('shows the next occurrence and says how many more there are', () => {
    state.events = weekly();
    renderPage();
    expect(screen.getAllByText('Weekly Wednesdays')).toHaveLength(1);
    expect(screen.getByText(/2 more dates/)).toBeInTheDocument();
  });

  it('counts only what the current filters would show', () => {
    // The whole point of counting from the filtered list: "2 more dates" has to
    // mean two rows that opening it actually produces.
    state.events = weekly();
    renderPage();
    expect(screen.queryByText(/more dates through/)).toBeInTheDocument();
    expect(screen.queryByText(/3 more dates/)).not.toBeInTheDocument();
  });

  it('opens the other dates in place', async () => {
    state.events = weekly();
    renderPage();
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
  });

  it('leaves a one-off alone', () => {
    state.events = weekly();
    renderPage();
    expect(screen.getByText('Handcycle ride')).toBeInTheDocument();
  });

  it('does not collapse the dates a member chose for themselves', async () => {
    // "I'm going" is a list of particular dates. Collapsing the three Fridays
    // somebody said yes to would hide the answer they came for.
    state.events = weekly();
    state.rsvps = new Map([
      ['w1', 'going'],
      ['w2', 'going'],
    ]);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: "I'm going" }));
    expect(screen.getAllByText('Weekly Wednesdays')).toHaveLength(2);
    expect(screen.queryByText(/more dates/)).not.toBeInTheDocument();
  });
});
