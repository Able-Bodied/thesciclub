import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatGroups from '@/lib/chat/groups';
import type * as Threads from '@/lib/chat/threads';
import type * as EventAudience from '@/lib/event-audience';
import type * as EventPhone from '@/lib/event-phone';
import type * as Events from '@/lib/events';
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
  /** The number on file for the member: null for none. */
  phone: null as string | null,
}));

// What the RSVP sheet reads; the sheet itself is tested in
// src/components/rsvp-sheet.test.tsx. Here it is whether the page opens it.
vi.mock('@/lib/event-phone', async (importOriginal) => ({
  ...(await importOriginal<typeof EventPhone>()),
  loadOwnPhone: () => Promise.resolve({ ok: true, phone: state.phone }),
}));

vi.mock('@/lib/events', async (importOriginal) => ({
  rsvpSaved: (await importOriginal<typeof Events>()).rsvpSaved,
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

// Who an event is for, for a member outside its audience (20261022180000).
const audience = vi.hoisted(() => ({
  hint: null as null | {
    audience: 'followers' | 'groups';
    organization: { id: string; name: string; shortCode: string; logoPath: null } | null;
  },
}));
vi.mock('@/lib/event-audience', async (importOriginal) => ({
  ...(await importOriginal<typeof EventAudience>()),
  fetchAudienceHint: () => Promise.resolve(audience.hint),
}));
vi.mock('@/lib/organization-follows', () => ({
  useOrganizationFollows: () => ({ following: new Set<string>(), toggle: () => undefined }),
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
    injuryType: null,
    conditionName: null,
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
  state.phone = null;
  window.sessionStorage.clear();
});

describe('EventDetailPage', () => {
  it('shows the event in its own timezone', () => {
    renderDetail();
    // 03:00 UTC on the 6th is the evening of the 5th in California.
    expect(screen.getByText('Sat 5 Sep · 8:00pm')).toBeInTheDocument();
  });

  it('links the place to Google Maps, with the city it lacks', () => {
    renderDetail();
    const link = screen.getByRole('link', { name: /in Google Maps/ });
    expect(link).toHaveTextContent('Independence Sports Complex, San Jose');
    expect(new URL(link.getAttribute('href') ?? '').searchParams.get('query')).toBe(
      'Independence Sports Complex, San Jose',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('links a place that is only a city, as most imported events are', () => {
    state.events = [makeEvent({ id: 'rugby', location: '', city: 'Oakland', state: 'CA' })];
    renderDetail();
    const link = screen.getByRole('link', { name: /in Google Maps/ });
    expect(link).toHaveTextContent('Oakland');
    expect(new URL(link.getAttribute('href') ?? '').searchParams.get('query')).toBe('Oakland, CA');
  });

  it('renders the organization’s own formatting', () => {
    renderDetail();
    expect(screen.getByText('nothing')).toBeInTheDocument();
  });

  it('says plainly that an unknown event is not there, rather than erroring', async () => {
    audience.hint = null;
    renderDetail('does-not-exist');
    expect(await screen.findByText(/not on the calendar/)).toBeInTheDocument();
  });

  // The owner, 2026-10-22: a member outside an event's audience who has its
  // link is told who it is for, and nothing more.
  it('tells a member outside a followers event whose followers it is for', async () => {
    audience.hint = {
      audience: 'followers',
      organization: { id: 'ncs', name: 'NorCal SCI', shortCode: 'NCS', logoPath: null },
    };
    renderDetail('for-followers');
    expect(await screen.findByText("For NorCal SCI's followers")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Follow/ })).toBeInTheDocument();
    audience.hint = null;
  });

  it('never names the group of a groups event', async () => {
    audience.hint = { audience: 'groups', organization: null };
    renderDetail('for-a-group');
    expect(await screen.findByText("For a group you're not in")).toBeInTheDocument();
    audience.hint = null;
  });

  it('says who can see it, and gives a public event a link to share', () => {
    state.events = [makeEvent({ id: 'picnic', audience: 'public' })];
    renderDetail('picnic');
    expect(screen.getByText('Anyone with the link')).toBeInTheDocument();
    expect(screen.getByText('https://thesciclub.com/e/picnic')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  describe('RSVP', () => {
    // Dated ahead for this block. The fixture's own start time is in the past
    // now, and an event that is over offers no buttons to press — which is the
    // subject of the block below this one.
    beforeEach(() => {
      state.events = [makeEvent({ id: 'rugby', startTime: aheadByDays(21) })];
    });

    // The owner, 2026-10-27: below the details, under a heading of their own.
    it('puts the details under a heading, and the answers after them', () => {
      state.events = [
        makeEvent({
          id: 'rugby',
          startTime: aheadByDays(21),
          descriptionHtml: '<p>Bring <strong>nothing</strong>.</p>',
        }),
      ];
      renderDetail();
      const heading = screen.getByRole('heading', { name: 'Details' });
      const going = screen.getByRole('button', { name: 'Going' });
      expect(heading.compareDocumentPosition(screen.getByText('nothing'))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(screen.getByText('nothing').compareDocumentPosition(going)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(screen.queryByText(/host gets your email/)).not.toBeInTheDocument();
    });

    // The owner, 2026-10-27: Register stands for Going when the host has a
    // sign-up of its own, and the host's page is the details' last line.
    it('offers Register instead of Going, which marks them going and opens the sign-up', async () => {
      state.events = [
        makeEvent({
          id: 'rugby',
          startTime: aheadByDays(21),
          url: 'https://norcalsci.org/events/rugby',
          registrationUrl: 'https://norcalsci.org/register/rugby',
        }),
      ];
      renderDetail();
      expect(screen.getByRole('link', { name: /More details at norcalsci\.org/ })).toHaveAttribute(
        'href',
        'https://norcalsci.org/events/rugby',
      );
      expect(screen.queryByRole('button', { name: 'Going' })).not.toBeInTheDocument();
      const register = screen.getByRole('link', { name: 'Register' });
      expect(register).toHaveAttribute('href', 'https://norcalsci.org/register/rugby');
      expect(register).toHaveAttribute('target', '_blank');
      expect(register).toHaveAccessibleDescription(/own sign-up and marks you as going here/);
      await userEvent.click(register);
      expect(state.setRsvp).toHaveBeenCalledWith('rugby', 'me', 'going');
    });

    it('once going, keeps Going ✓ to take it back, and the sign-up as a link', () => {
      state.events = [
        makeEvent({
          id: 'rugby',
          startTime: aheadByDays(21),
          registrationUrl: 'https://norcalsci.org/register/rugby',
        }),
      ];
      state.rsvps = new Map([['rugby', 'going']]);
      renderDetail();
      expect(screen.getByRole('button', { name: 'Going ✓' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^Register with / })).toHaveAttribute(
        'href',
        'https://norcalsci.org/register/rugby',
      );
    });

    it('reminds about the host’s sign-up in the sheet', async () => {
      state.events = [
        makeEvent({
          id: 'rugby',
          startTime: aheadByDays(21),
          registrationUrl: 'https://norcalsci.org/register/rugby',
        }),
      ];
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Interested' }));
      const sheet = await screen.findByRole('dialog');
      expect(sheet).toHaveTextContent('The host has its own sign-up.');
    });

    it('offers Join online beside Going for an online event', () => {
      state.events = [
        makeEvent({
          id: 'rugby',
          startTime: aheadByDays(21),
          format: 'online',
          url: 'https://us02web.zoom.us/j/123',
        }),
      ];
      renderDetail();
      expect(screen.getByRole('link', { name: /Join online/ })).toHaveAttribute(
        'href',
        'https://us02web.zoom.us/j/123',
      );
    });

    it('records going, then says what it shares and offers the calendar', async () => {
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Going' }));
      expect(state.setRsvp).toHaveBeenCalledWith('rugby', 'me', 'going');
      const sheet = await screen.findByRole('dialog', { name: 'You’re going' });
      expect(sheet).toHaveTextContent('The host gets your email');
      expect(screen.getByRole('link', { name: /Google Calendar/ })).toBeInTheDocument();
    });

    it('opens the sheet for Interested too, which shares nothing', async () => {
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Interested' }));
      expect(state.setRsvp).toHaveBeenCalledWith('rugby', 'me', 'interested');
      expect(await screen.findByRole('dialog', { name: 'You’re interested' })).toHaveTextContent(
        'Interested shares nothing with the host.',
      );
      expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
    });

    it('changes Going to Interested from the sheet', async () => {
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Going' }));
      await userEvent.click(await screen.findByRole('button', { name: /Change to Interested/ }));
      expect(state.setRsvp).toHaveBeenLastCalledWith('rugby', 'me', 'interested');
      expect(await screen.findByRole('dialog', { name: 'You’re interested' })).toBeInTheDocument();
    });

    it('asks for a number with Going when there is none on file', async () => {
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Going' }));
      expect(await screen.findByLabelText('Phone number (optional)')).toBeInTheDocument();
    });

    it('does not ask when there is a number on file', async () => {
      state.phone = '14085550112';
      renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Going' }));
      await screen.findByRole('dialog');
      // The read is async: give the page its chance to add the field.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
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

    // The owner, 2026-10-22: going is not needed to join (20261022210000).
    it('lets somebody who is not going join the chat too', () => {
      renderDetail();
      expect(screen.getByRole('button', { name: 'Join the group chat' })).toBeInTheDocument();
      expect(screen.getByText(/going or not/)).toBeInTheDocument();
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

      // The owner, 2026-10-22: somebody who missed it may want to ask about it.
      it('still takes new joins', () => {
        renderDetail();
        expect(screen.getByRole('button', { name: 'Join the group chat' })).toBeInTheDocument();
      });

      it('still opens for somebody who was in it', () => {
        state.threads = [{ id: 'th-ev', eventId: 'rugby' }];
        renderDetail();
        expect(screen.getByRole('button', { name: 'Open group chat' })).toBeInTheDocument();
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
      state.events = [
        makeEvent({
          id: 'rugby',
          startTime: aheadByDays(3),
          registrationUrl: 'https://example.org/signup',
        }),
      ];
      renderDetail();
      expect(screen.getByRole('link', { name: /Register/ })).toHaveAttribute(
        'href',
        'https://example.org/signup',
      );
    });

    it('falls back to the event page when there is no registration link', () => {
      state.events = [makeEvent({ id: 'rugby', url: 'https://example.org/event' })];
      renderDetail();
      expect(
        screen.getByRole('link', { name: /More details at example\.org/ }),
      ).toBeInTheDocument();
    });

    it('drops a registration link that is not a web address, and uses the event page', () => {
      state.events = [
        makeEvent({
          id: 'rugby',
          registrationUrl: 'javascript:alert(1)',
          url: 'https://example.org/event',
        }),
      ];
      renderDetail();
      expect(screen.queryByRole('link', { name: /Register/ })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /More details at example\.org/ })).toHaveAttribute(
        'href',
        'https://example.org/event',
      );
    });

    it('offers no link when neither address is a web address', () => {
      state.events = [
        makeEvent({ id: 'rugby', registrationUrl: 'data:text/html,hi', url: 'javascript:void 0' }),
      ];
      renderDetail();
      expect(screen.queryByRole('link', { name: /Register|More details/ })).not.toBeInTheDocument();
    });

    it('opens an outbound link safely', () => {
      state.events = [
        makeEvent({
          id: 'rugby',
          startTime: aheadByDays(3),
          registrationUrl: 'https://example.org/signup',
        }),
      ];
      renderDetail();
      expect(screen.getByRole('link', { name: /Register/ })).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      );
    });
  });
});

describe('an event\u2019s link', () => {
  it('is "Join online" for a meeting, with the service in its name', () => {
    state.events = [
      makeEvent({
        id: 'call',
        url: 'https://meet.google.com/abc-defg-hij',
        startTime: aheadByDays(3),
        format: 'online',
      }),
    ];
    renderDetail('call');
    const join = screen.getByRole('link', { name: 'Join online, opens Google Meet' });
    expect(join).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
    expect(join).toHaveAttribute('target', '_blank');
    expect(screen.queryByText(/More details at/)).toBeNull();
  });

  it('says "More details at" the site for any other address', () => {
    state.events = [
      makeEvent({ id: 'page', url: 'https://norcalsci.org/happy-hour', startTime: aheadByDays(3) }),
    ];
    renderDetail('page');
    expect(screen.getByRole('link', { name: /More details at norcalsci\.org/ })).toHaveAttribute(
      'href',
      'https://norcalsci.org/happy-hour',
    );
    expect(screen.queryByText('Join online')).toBeNull();
  });

  it('offers Join online from the description, and More details at the site, for an ordinary link', () => {
    state.events = [
      makeEvent({
        id: 'norcal',
        url: 'https://norcalsci.org/happy-hour',
        descriptionHtml:
          '<p>To join this Zoom meeting, <a href="https://us02web.zoom.us/j/86004299187">CLICK HERE</a></p>',
        startTime: aheadByDays(3),
        format: 'online',
      }),
    ];
    renderDetail('norcal');
    expect(screen.getByRole('link', { name: 'Join online, opens Zoom' })).toHaveAttribute(
      'href',
      'https://us02web.zoom.us/j/86004299187',
    );
    expect(screen.getByRole('link', { name: /More details at norcalsci\.org/ })).toHaveAttribute(
      'href',
      'https://norcalsci.org/happy-hour',
    );
  });

  it('offers the registration beside a meeting, and Join online only once', () => {
    state.events = [
      makeEvent({
        id: 'both',
        url: 'https://zoom.us/j/1',
        registrationUrl: 'https://norcalsci.org/register',
        startTime: aheadByDays(3),
      }),
    ];
    renderDetail('both');
    expect(screen.getAllByRole('link', { name: /Join online/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Register/ })).toHaveAttribute(
      'href',
      'https://norcalsci.org/register',
    );
  });

  it('does not offer a meeting once the event is over', () => {
    state.events = [makeEvent({ id: 'old', url: 'https://zoom.us/j/1' })];
    renderDetail('old');
    expect(screen.queryByText('Join online')).toBeNull();
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

describe('View on the map, on the event page', () => {
  it('opens the Events map on this event', async () => {
    state.events = [makeEvent({ id: 'rugby', title: 'Rugby', startTime: aheadByDays(3) })];
    renderDetail();
    expect(await screen.findByRole('link', { name: 'View Rugby on the map' })).toHaveAttribute(
      'href',
      '/events?view=map&show=rugby',
    );
  });

  it('is not offered for an event only online, or one over', async () => {
    state.events = [
      makeEvent({ id: 'rugby', title: 'Rugby', format: 'online', startTime: aheadByDays(3) }),
    ];
    const { unmount } = renderDetail();
    expect(await screen.findByRole('heading', { name: 'Rugby' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /on the map/ })).toBeNull();
    unmount();
    state.events = [makeEvent({ id: 'rugby', title: 'Rugby', startTime: '2020-03-04T18:00:00Z' })];
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'Rugby' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /on the map/ })).toBeNull();
  });
});
