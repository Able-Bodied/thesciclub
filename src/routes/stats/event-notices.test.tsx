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
  ...over,
});

function show(ui: React.ReactNode) {
  render(
    <MemoryRouter>
      <AnnounceProvider>{ui}</AnnounceProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
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
    show(<OrganizationPeople organizationId="o1" />);
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

  it('has no See all for ten or fewer', async () => {
    state.people = Array.from({ length: 10 }, (_, i) => person(i));
    show(<OrganizationPeople organizationId="o1" />);
    await screen.findByRole('list');
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull();
  });
});

describe('notifying', () => {
  it('says what came of the notices, and offers each send', async () => {
    state.events = [event()];
    show(<EventNoticesPanel organizationId="o1" />);
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
    show(<EventNoticesPanel organizationId="o1" />);
    await userEvent.click(await screen.findByRole('button', { name: /haven’t opened/ }));
    expect(state.sent).toEqual([['e1', 'not_opened']]);
    expect(await screen.findAllByText('Notified 2 people.')).not.toHaveLength(0);
  });

  it('says why nobody was told', async () => {
    state.events = [event()];
    state.sentCount = 0;
    show(<EventNoticesPanel organizationId="o1" />);
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
    show(<EventNoticesPanel organizationId="o1" />);
    await screen.findAllByText(/Notified 5 people/);
    expect(screen.queryByRole('button', { name: /Notify|Remind/ })).toBeNull();
  });

  it('holds reminders for 12 hours after the last notice, and says until when', async () => {
    state.events = [event({ lastSentAt: new Date(Date.now() - 3_600_000).toISOString() })];
    show(<EventNoticesPanel organizationId="o1" />);
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
    show(<EventNoticesPanel organizationId="o1" />);
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
    show(<EventNoticesPanel organizationId="o1" />);
    const title = await screen.findByRole('button', { name: /Handcycling/ });
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
    show(<EventNoticesPanel organizationId="o1" />);
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
