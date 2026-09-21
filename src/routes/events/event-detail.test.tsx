import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatGroups from '@/lib/chat/groups';
import type * as Threads from '@/lib/chat/threads';
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
  threads: [] as { id: string; eventId: string | null }[],
  joinEventGroup: vi.fn(),
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

// The group-chat card reads the viewer's own conversations to know whether they
// are already in the group — three of the five things it can say depend on it.
// Narrowly mocked: `threads.ts` also exports the pure `threadTitle`, and a
// whole-module stub of it is exactly the shape that lets a test assert its own
// wording.
vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  useMyThreads: () => ({ threads: state.threads, loading: false, error: null, reload: vi.fn() }),
}));

vi.mock('@/lib/chat/groups', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatGroups>()),
  joinEventGroup: (...args: unknown[]) => state.joinEventGroup(...args) as unknown,
}));

const { default: EventDetailPage } = await import('@/routes/events/event-detail');

function renderDetail(id = 'rugby') {
  return render(
    <MemoryRouter initialEntries={[`/events/${id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function attendee(name: string, status: RsvpStatus = 'going'): EventAttendee {
  return {
    memberId: name,
    status,
    displayName: name,
    photoPath: null,
    photoAlt: null,
    avatarColor: null,
    city: 'San Jose',
    levelRange: 'T1–T6',
    exactLevel: 'T4',
    type: 'peer',
  };
}

/** An ISO start time `days` ahead of now, for cases that must not read as past. */
function aheadByDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

beforeEach(() => {
  state.events = [
    makeEvent({
      id: 'rugby',
      title: 'Wheelchair rugby',
      description: 'Bring nothing.',
      descriptionHtml: '<p>Bring <strong>nothing</strong>.</p>',
      startTime: '2026-09-06T03:00:00Z',
      location: 'Independence Sports Complex',
      city: 'San Jose',
      tags: [makeTag('wheelchair-rugby', 'sport')],
      goingCount: 2,
      interestedCount: 0,
    }),
  ];
  state.rsvps = new Map();
  state.attendees = new Map();
  state.organizations = [];
  state.loading = false;
  state.error = null;
  state.setRsvp = vi.fn().mockResolvedValue({ ok: true });
  state.reload = vi.fn();
  state.threads = [];
  state.joinEventGroup = vi.fn().mockResolvedValue({ ok: true, value: 'th-ev' });
});

describe('EventDetailPage', () => {
  it('shows the event in its own timezone', () => {
    renderDetail();
    // 03:00 UTC on the 6th is the evening of the 5th in California.
    expect(screen.getByText('Sat 5 Sep · 8:00pm')).toBeInTheDocument();
  });

  it('renders the organization’s own formatting', () => {
    renderDetail();
    expect(screen.getByText('nothing')).toBeInTheDocument();
  });

  it('says plainly that an unknown event is not there, rather than erroring', () => {
    renderDetail('does-not-exist');
    expect(screen.getByText(/not on the calendar/)).toBeInTheDocument();
  });

  describe('RSVP', () => {
    // Dated ahead for this block. The fixture's own start time is in the past
    // now, and an event that is over offers no buttons to press — which is the
    // subject of the block below this one.
    beforeEach(() => {
      state.events = [makeEvent({ id: 'rugby', startTime: aheadByDays(21) })];
    });

    it('records going', async () => {
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Going' }));
      expect(state.setRsvp).toHaveBeenCalledWith('rugby', 'me', 'going');
    });

    it('takes it back when pressed again', async () => {
      state.rsvps = new Map([['rugby', 'going']]);
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Going ✓' }));
      expect(state.setRsvp).toHaveBeenCalledWith('rugby', 'me', null);
    });

    it('surfaces a failed write', async () => {
      state.setRsvp = vi.fn().mockResolvedValue({ ok: false, error: 'permission denied' });
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Going' }));
      expect(await screen.findByText('permission denied')).toBeInTheDocument();
    });
  });

  describe('the group chat', () => {
    // Upcoming, so the RSVP is still a live question. The fixture's own start
    // time is in the past.
    beforeEach(() => {
      state.events = [makeEvent({ id: 'rugby', startTime: aheadByDays(21) })];
      state.threads = [];
      state.joinEventGroup = vi.fn().mockResolvedValue({ ok: true, value: 'th-ev' });
    });

    it('lets somebody going join it', async () => {
      state.rsvps = new Map([['rugby', 'going']]);
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Join the group chat' }));
      expect(state.joinEventGroup).toHaveBeenCalledWith('rugby');
    });

    it('says Open, not Join, once they are in it', () => {
      state.rsvps = new Map([['rugby', 'going']]);
      state.threads = [{ id: 'th-ev', eventId: 'rugby' }];
      renderDetail();
      expect(screen.getByRole('button', { name: 'Open group chat' })).toBeInTheDocument();
    });

    it('tells somebody who is not going what going would get them', () => {
      renderDetail();
      expect(screen.queryByRole('button', { name: /group chat/i })).not.toBeInTheDocument();
      expect(screen.getByText(/There is a group chat for everyone who is/)).toBeInTheDocument();
    });

    it('surfaces a refusal instead of navigating', async () => {
      state.rsvps = new Map([['rugby', 'going']]);
      state.joinEventGroup = vi
        .fn()
        .mockResolvedValue({ ok: false, error: 'The group chat is for everybody going.' });
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Join the group chat' }));
      expect(await screen.findByText('The group chat is for everybody going.')).toBeInTheDocument();
    });

    describe('once the event is over', () => {
      beforeEach(() => {
        state.events = [makeEvent({ id: 'rugby', startTime: '2020-03-04T18:00:00Z' })];
      });

      it('takes no new joins, and says why rather than offering a button', () => {
        state.rsvps = new Map([['rugby', 'going']]);
        renderDetail();
        expect(screen.queryByRole('button', { name: /group chat/i })).not.toBeInTheDocument();
        expect(screen.getByText(/stays open to whoever was already in it/)).toBeInTheDocument();
      });

      it('still opens for somebody who was in it', () => {
        state.threads = [{ id: 'th-ev', eventId: 'rugby' }];
        renderDetail();
        expect(screen.getByRole('button', { name: 'Open group chat' })).toBeInTheDocument();
      });

      it('says nothing at all to somebody who was never in it', () => {
        // No action and no fact worth the space, on a page somebody is reading
        // for the description.
        renderDetail();
        expect(screen.queryByText(/group chat/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('who is going', () => {
    it('lists the members it is allowed to name', () => {
      state.attendees = new Map([['rugby', [attendee('Nicole'), attendee('Jake')]]]);
      renderDetail();
      expect(screen.getByText('Nicole')).toBeInTheDocument();
      expect(screen.getByText('Jake')).toBeInTheDocument();
    });

    it('explains the gap when the tally is higher than the names', () => {
      // The difference is members who opted out of being browsed. Leaving it
      // unexplained makes the count look broken.
      state.attendees = new Map([['rugby', [attendee('Nicole')]]]);
      renderDetail();
      expect(screen.getByText('Going · 2')).toBeInTheDocument();
      expect(screen.getByText(/1 more who is not shown by choice/)).toBeInTheDocument();
    });

    it('handles a roster where nobody can be named', () => {
      state.attendees = new Map();
      renderDetail();
      expect(screen.getByText(/2 members, not shown by choice/)).toBeInTheDocument();
    });

    it('renders no heading at all when nobody has said yes', () => {
      state.events = [makeEvent({ id: 'rugby', goingCount: 0, interestedCount: 0 })];
      renderDetail();
      // An empty "Going" heading reads as a failure to load, not as a zero.
      expect(screen.queryByText(/^Going · /)).not.toBeInTheDocument();
    });
  });

  describe('who is hosting', () => {
    const organization = makeOrganization({ id: 'o1' });

    it('links to a club organization', () => {
      state.organizations = [organization];
      state.events = [makeEvent({ id: 'rugby', organizationId: 'o1' })];
      renderDetail();
      expect(screen.getByRole('button', { name: /NorCal SCI/ })).toBeInTheDocument();
    });

    it('does not link a host the club has no page for', () => {
      state.events = [makeEvent({ id: 'rugby', hostName: 'BORP', organizationId: null })];
      renderDetail();
      expect(screen.getByText('BORP')).toBeInTheDocument();
      // A chevron on a dead end is worse than no chevron.
      expect(screen.queryByRole('button', { name: /BORP/ })).not.toBeInTheDocument();
    });
  });

  describe('links out', () => {
    it('says Register when there is a registration link', () => {
      state.events = [makeEvent({ id: 'rugby', registrationUrl: 'https://example.org/signup' })];
      renderDetail();
      expect(screen.getByRole('link', { name: /Register/ })).toHaveAttribute(
        'href',
        'https://example.org/signup',
      );
    });

    it('falls back to the event page when there is no registration link', () => {
      state.events = [makeEvent({ id: 'rugby', url: 'https://example.org/event' })];
      renderDetail();
      expect(screen.getByRole('link', { name: /their site/ })).toBeInTheDocument();
    });

    it('opens an outbound link safely', () => {
      state.events = [makeEvent({ id: 'rugby', registrationUrl: 'https://example.org/signup' })];
      renderDetail();
      expect(screen.getByRole('link', { name: /Register/ })).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      );
    });
  });
});

describe('an event that is over', () => {
  it('offers no RSVP, the way the list stopped offering one', () => {
    // The same finished evening used to answer two different ways depending on
    // whether you met it in the list or on its own page.
    state.events = [makeEvent({ id: 'rugby', startTime: '2026-09-06T03:00:00Z' })];
    renderDetail();
    expect(screen.queryByRole('button', { name: /^Going/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Interested/ })).not.toBeInTheDocument();
    expect(screen.getByText(/already happened/i)).toBeInTheDocument();
  });

  it('still says what you had said about it', () => {
    state.events = [makeEvent({ id: 'rugby', startTime: '2026-09-06T03:00:00Z' })];
    state.rsvps = new Map([['rugby', 'going']]);
    renderDetail();
    expect(screen.getByText(/you said you were going/i)).toBeInTheDocument();
  });
});
