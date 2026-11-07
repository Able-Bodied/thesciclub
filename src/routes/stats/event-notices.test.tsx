import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import type { EventNotices, OrganizationPerson, PersonAnswer } from '@/lib/event-notices';

/** The people and the notices on Stats & controls (20261103000000). */
const state = vi.hoisted(() => ({
  people: [] as OrganizationPerson[],
  events: [] as EventNotices[],
  answers: [] as PersonAnswer[],
  notifies: false,
  sent: [] as [string, string][],
  sentCount: 2,
  switched: [] as [string, boolean][],
}));

vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));
vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'm0', isAdmin: false, displayName: 'Me' }),
}));
const mentors = vi.hoisted(() => ({
  grant: vi.fn(),
  revoke: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/lib/organization-mentors', () => ({
  grantMentor: (...args: unknown[]) => mentors.grant(...args) as Promise<{ ok: boolean }>,
  revokeMentor: (...args: unknown[]) => mentors.revoke(...args) as Promise<{ ok: boolean }>,
  removeOrganizationPerson: (...args: unknown[]) =>
    mentors.remove(...args) as Promise<{ ok: boolean }>,
}));
vi.mock('@/lib/event-notices', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchOrganizationPeople: () => Promise.resolve({ ok: true, value: state.people }),
  fetchEventNotices: () => Promise.resolve({ ok: true, value: state.events }),
  fetchPeopleAnswers: () => Promise.resolve({ ok: true, value: state.answers }),
  fetchNotifiesMembers: () => Promise.resolve({ ok: true, value: state.notifies }),
  notifyMembers: (eventId: string, who: string) => {
    state.sent.push([eventId, who]);
    return Promise.resolve({ ok: true, value: state.sentCount });
  },
  setNotifiesMembers: (id: string, on: boolean) => {
    state.switched.push([id, on]);
    return Promise.resolve({ ok: true, value: null });
  },
}));

const visibility = vi.hoisted(() => ({
  mayChange: true,
  saved: [] as [string, unknown][],
}));
vi.mock('@/lib/event-audience', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchEventVisibility: () =>
    Promise.resolve({
      ok: true,
      value: {
        audience: 'club',
        mayChange: visibility.mayChange,
        organizations: [],
        groups: [],
        invitees: [],
        inviteeCount: 0,
      },
    }),
  setEventVisibility: (id: string, choice: unknown) => {
    visibility.saved.push([id, choice]);
    return Promise.resolve({ ok: true, value: 0 });
  },
}));
vi.mock('@/lib/chat/threads', () => ({
  useMyThreads: () => ({ threads: [], loading: false, error: null, reload: () => undefined }),
}));
vi.mock('@/lib/mentions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadMemberChoices: () => Promise.resolve([]),
}));

const { OrganizationPeople } = await import('@/routes/stats/organization-people');
const { EventNoticesPanel } = await import('@/routes/stats/event-notices');

const person = (i: number, over: Partial<OrganizationPerson> = {}): OrganizationPerson => ({
  id: `m${String(i)}`,
  name: `Person ${String(i)}`,
  photoPath: null,
  avatarColor: null,
  isOrgAdmin: false,
  isMentor: false,
  ...over,
});

const event = (over: Partial<EventNotices> = {}): EventNotices => ({
  eventId: 'e1',
  title: 'Handcycling',
  startTime: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  timezone: 'America/Los_Angeles',
  allDay: false,
  notified: 5,
  opened: 3,
  going: 1,
  interested: 1,
  notOpened: 2,
  noAnswer: 3,
  canReach: 4,
  lastSentAt: null,
  peopleGoing: 2,
  peopleInterested: 1,
  audience: 'club',
  seriesId: null,
  ...over,
});

const PANEL = {
  organizationId: 'o1',
  organizationName: 'NorCal SCI',
  organizations: [{ id: 'o1', name: 'NorCal SCI', open: true }],
};

function show(ui: React.ReactNode) {
  render(
    <MemoryRouter>
      <AnnounceProvider>{ui}</AnnounceProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mentors.grant.mockReset().mockResolvedValue({ ok: true });
  mentors.revoke.mockReset().mockResolvedValue({ ok: true });
  mentors.remove.mockReset().mockResolvedValue({ ok: true });
  state.people = [];
  state.events = [];
  state.answers = [];
  state.notifies = false;
  state.sent = [];
  state.sentCount = 2;
  state.switched = [];
});

describe('the people', () => {
  it('shows ten with their part, then everybody on See all', async () => {
    state.people = [
      person(0, { isOrgAdmin: true }),
      person(1, { isMentor: true }),
      ...Array.from({ length: 10 }, (_, i) => person(i + 2)),
    ];
    show(<OrganizationPeople organizationId="o1" organizationName="Probe Org" />);
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(within(list).getByText('Org admin')).toBeInTheDocument();
    expect(within(list).getByText('Mentor')).toBeInTheDocument();
    expect(screen.getByText('12 people · 1 org admin · 1 mentor')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'See all 12' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('offers a ••• on each but the org admins and themself', async () => {
    state.people = [
      person(0, { isOrgAdmin: true }),
      person(1, { isOrgAdmin: true }),
      person(2, { isMentor: true }),
      person(3),
    ];
    show(<OrganizationPeople organizationId="o1" organizationName="Probe Org" />);
    await screen.findByRole('list');
    expect(screen.queryByRole('button', { name: 'Actions for Person 0' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for Person 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Actions for Person 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Person 3' })).toBeInTheDocument();
  });

  it('makes a member a mentor, and stops a mentor', async () => {
    state.people = [person(2, { isMentor: true }), person(3)];
    show(<OrganizationPeople organizationId="o1" organizationName="Probe Org" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Person 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make mentor' }));
    expect(mentors.grant).toHaveBeenCalledWith('o1', 'm3');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Person 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove as mentor' }));
    expect(mentors.revoke).toHaveBeenCalledWith('o1', 'm2');
  });

  it('removes someone only once it is confirmed', async () => {
    state.people = [person(3)];
    show(<OrganizationPeople organizationId="o1" organizationName="Probe Org" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Person 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from Probe Org' }));
    expect(mentors.remove).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Remove Person 3 from Probe Org? They leave its group chat. They are not told.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mentors.remove).toHaveBeenCalledWith('o1', 'm3');
  });

  it('has no See all for ten or fewer', async () => {
    state.people = Array.from({ length: 10 }, (_, i) => person(i));
    show(<OrganizationPeople organizationId="o1" organizationName="Probe Org" />);
    await screen.findByRole('list');
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull();
  });
});

describe('notifying', () => {
  it('says what came of the notices, and offers each send', async () => {
    state.events = [event()];
    show(<EventNoticesPanel {...PANEL} />);
    expect(
      await screen.findByText('Notified 5 people · 3 opened · 3 no answer'),
    ).toBeInTheDocument();
    expect(screen.getByText('Your people: 2 going · 1 interested')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Notify 4 people not yet notified' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remind 2 who haven’t opened it' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remind 3 who haven’t answered' }),
    ).toBeInTheDocument();
  });

  it('sends to those who have not opened it, and says how many', async () => {
    state.events = [event()];
    show(<EventNoticesPanel {...PANEL} />);
    await userEvent.click(await screen.findByRole('button', { name: /haven’t opened/ }));
    expect(state.sent).toEqual([['e1', 'not_opened']]);
    expect(await screen.findAllByText('Notified 2 people.')).not.toHaveLength(0);
  });

  it('says why nobody was told', async () => {
    state.events = [event()];
    state.sentCount = 0;
    show(<EventNoticesPanel {...PANEL} />);
    await userEvent.click(await screen.findByRole('button', { name: /haven’t answered/ }));
    expect(
      await screen.findAllByText(
        'Nobody to notify right now. Each person can be notified once every 12 hours.',
      ),
    ).not.toHaveLength(0);
  });

  it('offers nothing to send for an event that has started, or nobody left to tell', async () => {
    state.events = [
      event({ eventId: 'past', startTime: new Date(Date.now() - 3_600_000).toISOString() }),
      event({ eventId: 'done', notOpened: 0, noAnswer: 0, canReach: 0 }),
    ];
    show(<EventNoticesPanel {...PANEL} />);
    await screen.findAllByText(/Notified 5 people/);
    expect(screen.queryByRole('button', { name: /Notify|Remind/ })).toBeNull();
  });

  it('holds reminders for 12 hours after the last notice, and says until when', async () => {
    state.events = [event({ lastSentAt: new Date(Date.now() - 3_600_000).toISOString() })];
    show(<EventNoticesPanel {...PANEL} />);
    expect(
      await screen.findByText(/^You can remind those who haven’t answered from /),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remind/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Notify 4 people not yet notified' }),
    ).toBeInTheDocument();
  });

  it('before anyone is notified, says who answered and who the button skips', async () => {
    state.events = [
      event({ eventId: 'a', notified: 0, opened: 0, notOpened: 0, noAnswer: 0 }),
      event({
        eventId: 'b',
        notified: 0,
        opened: 0,
        notOpened: 0,
        noAnswer: 0,
        canReach: 1,
        peopleGoing: 0,
        peopleInterested: 0,
      }),
    ];
    show(<EventNoticesPanel {...PANEL} />);
    expect(await screen.findAllByText('Not notified yet.')).toHaveLength(2);
    expect(screen.getByText('Your people: 2 going · 1 interested')).toBeInTheDocument();
    expect(screen.getByText('None of your people have answered yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Notify 4 people who haven’t answered' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Notify 1 person who hasn’t answered' }),
    ).toBeInTheDocument();
  });

  it('tapping the event lists each of its people and what they did', async () => {
    state.events = [event({ notified: 0 })];
    const answer = (over: Partial<PersonAnswer>): PersonAnswer => ({
      id: 'x',
      name: 'X',
      isOrgAdmin: false,
      isMentor: false,
      rsvp: null,
      sends: 0,
      openedAt: null,
      seesEvent: true,
      ...over,
    });
    state.answers = [
      answer({ id: 'c', name: 'Cy', isOrgAdmin: true, rsvp: 'going' }),
      answer({ id: 'i', name: 'Ida', rsvp: 'interested', sends: 1 }),
      answer({ id: 'b', name: 'Bo', isMentor: true, sends: 1, openedAt: '2026-11-02T11:00:00Z' }),
      answer({ id: 'a', name: 'Ana', sends: 2 }),
      answer({ id: 'd', name: 'Dee' }),
      answer({ id: 'e', name: 'Eli', seesEvent: false }),
    ];
    show(<EventNoticesPanel {...PANEL} />);
    const title = await screen.findByRole('button', { name: /^Handcycling/ });
    expect(title).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Going')).toBeInTheDocument();
    expect(screen.getByText('Interested')).toBeInTheDocument();
    expect(screen.getByText('Opened, no answer')).toBeInTheDocument();
    expect(screen.getByText('Not opened · notified 2 times')).toBeInTheDocument();
    expect(screen.getByText('Not notified')).toBeInTheDocument();
    expect(screen.getByText('Can’t see this event')).toBeInTheDocument();
    expect(screen.getByText(/· Mentor/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the event' })).toHaveAttribute(
      'href',
      '/events/e1',
    );
  });

  it('turns on notifying of every new event', async () => {
    show(<EventNoticesPanel {...PANEL} />);
    const toggle = await screen.findByRole('switch', { name: 'Notify them of every new event' });
    await vi.waitFor(() => {
      expect(toggle).toBeEnabled();
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(state.switched).toEqual([['o1', true]]);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

// The owner, 2026-11-06: who can see each event, changed from here too.
describe('who can see each event', () => {
  beforeEach(() => {
    visibility.mayChange = true;
    visibility.saved = [];
  });

  it('says who can see it, and that a private one is private', async () => {
    state.events = [event(), event({ eventId: 'e2', title: 'Members dinner', audience: 'people' })];
    show(<EventNoticesPanel {...PANEL} />);
    expect(await screen.findByText('Who can see it: Everyone in the club')).toBeInTheDocument();
    expect(screen.getByText('Who can see it: Invite only (private)')).toBeInTheDocument();
  });

  it('changes it in the same sheet as the event’s page', async () => {
    state.events = [event()];
    show(<EventNoticesPanel {...PANEL} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change who can see Handcycling' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Who can see it' });
    await userEvent.click(within(sheet).getByRole('radio', { name: /Members of NorCal SCI/ }));
    expect(
      within(sheet).getByText(/^Anyone can join NorCal SCI, so anyone who joins will see this/),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(visibility.saved).toEqual([
      ['e1', { audience: 'organizations', groups: [], organizations: ['o1'], people: [] }],
    ]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says so when they may not change it', async () => {
    visibility.mayChange = false;
    state.events = [event()];
    show(<EventNoticesPanel {...PANEL} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change who can see Handcycling' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can’t change who sees this event.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers no change once it has started', async () => {
    state.events = [event({ startTime: new Date(Date.now() - 3_600_000).toISOString() })];
    show(<EventNoticesPanel {...PANEL} />);
    expect(await screen.findByText('Who can see it: Everyone in the club')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change who can see/ })).toBeNull();
  });
});
