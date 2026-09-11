import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent, makeTag } from '@/test/factory';
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
    dismissed: new Set<string>(),
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
    it('records going', async () => {
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: "I'm going" }));
      expect(state.setRsvp).toHaveBeenCalledWith('rugby', 'me', 'going');
    });

    it('takes it back when pressed again', async () => {
      state.rsvps = new Map([['rugby', 'going']]);
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: "You're going" }));
      expect(state.setRsvp).toHaveBeenCalledWith('rugby', 'me', null);
    });

    it('surfaces a failed write', async () => {
      state.setRsvp = vi.fn().mockResolvedValue({ ok: false, error: 'permission denied' });
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: "I'm going" }));
      expect(await screen.findByText('permission denied')).toBeInTheDocument();
    });
  });

  describe('messaging is not built, and the page says so', () => {
    it('does not offer a group chat button', () => {
      state.rsvps = new Map([['rugby', 'going']]);
      renderDetail();
      // The mock has one here. A button that does nothing gets demoed,
      // believed, and then explained.
      expect(screen.queryByRole('button', { name: /group chat/i })).not.toBeInTheDocument();
      expect(screen.getByText(/not built yet/)).toBeInTheDocument();
    });

    it('says nothing about a group chat to somebody who is not going', () => {
      renderDetail();
      expect(screen.queryByText(/not built yet/)).not.toBeInTheDocument();
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
    const organization: Organization = {
      id: 'o1',
      shortCode: 'NCS',
      name: 'NorCal SCI',
      city: 'Northern California',
      description: '',
      tags: [],
      canInvite: true,
    };

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
