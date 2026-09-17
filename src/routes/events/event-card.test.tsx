import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventCard, type EventCardProps } from '@/routes/events/event-card';
import { makeEvent, makeOrganization, makeTag } from '@/test/factory';
import type { EventAttendee } from '@/types/domain';

function attendee(name: string, status: 'going' | 'interested' = 'going'): EventAttendee {
  return {
    memberId: name,
    status,
    displayName: name,
    photoPath: null,
    photoAlt: null,
    avatarColor: null,
    city: 'San Jose',
    levelRange: 'T1–T6',
    exactLevel: null,
    type: 'peer',
  };
}

function renderCard(overrides: Partial<EventCardProps> = {}) {
  const props: EventCardProps = {
    event: makeEvent(),
    status: null,
    attendees: [],
    organization: null,
    onOpen: vi.fn(),
    onRsvp: vi.fn(),
    ...overrides,
  };
  render(<EventCard {...props} />);
  return props;
}

describe('EventCard', () => {
  it('shows the date in the event’s zone, not the machine’s', () => {
    // 03:00 UTC on the 6th is still the evening of the 5th in California.
    renderCard({ event: makeEvent({ startTime: '2026-09-06T03:00:00Z' }) });
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('SEP')).toBeInTheDocument();
  });

  describe('the two-button row', () => {
    it('reports Interested when it was not set', async () => {
      const props = renderCard({ status: null });
      await userEvent.click(screen.getByRole('button', { name: 'Interested' }));
      expect(props.onRsvp).toHaveBeenCalledWith('interested');
    });

    it('takes the RSVP back when the same button is pressed again', async () => {
      // The only way to undo an RSVP from the list, so it has to work.
      const props = renderCard({ status: 'going' });
      await userEvent.click(screen.getByRole('button', { name: 'Going ✓' }));
      expect(props.onRsvp).toHaveBeenCalledWith(null);
    });

    it('switches from interested to going in one tap, not two', async () => {
      const props = renderCard({ status: 'interested' });
      await userEvent.click(screen.getByRole('button', { name: 'Going' }));
      expect(props.onRsvp).toHaveBeenCalledWith('going');
    });

    it('tells assistive technology which one is set', () => {
      renderCard({ status: 'going' });
      expect(screen.getByRole('button', { name: 'Going ✓' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Interested' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('who is going', () => {
    it('names people rather than counting them', () => {
      renderCard({ attendees: [attendee('Nicole'), attendee('Jake')] });
      expect(screen.getByText(/Nicole and Jake are going/)).toBeInTheDocument();
    });

    it('uses "is" for one person', () => {
      renderCard({ attendees: [attendee('Nicole')] });
      expect(screen.getByText(/Nicole is going/)).toBeInTheDocument();
    });

    it('lets the overflow take the "and" slot rather than stacking two', () => {
      renderCard({
        attendees: [attendee('Nicole'), attendee('Jake'), attendee('Bob'), attendee('Jan')],
      });
      expect(screen.getByText(/Nicole, Jake and 2 others are going/)).toBeInTheDocument();
    });

    it('leaves out members who are only interested', () => {
      // The row says "are going". Somebody who said Interested has not.
      renderCard({ attendees: [attendee('Kerry', 'interested')] });
      expect(screen.queryByText(/Kerry/)).not.toBeInTheDocument();
    });

    it('says nothing at all when the viewer recognises nobody', () => {
      renderCard({ attendees: [] });
      expect(screen.queryByText(/going$/)).not.toBeInTheDocument();
    });
  });

  describe('who is hosting', () => {
    it('prefers a club organization', () => {
      const organization = makeOrganization();
      renderCard({ organization, event: makeEvent({ hostName: 'Somebody else' }) });
      expect(screen.getByText(/NorCal SCI/)).toBeInTheDocument();
      expect(screen.queryByText(/Somebody else/)).not.toBeInTheDocument();
    });

    it('falls back to the name the feed gave', () => {
      renderCard({ event: makeEvent({ hostName: 'BORP' }) });
      expect(screen.getByText(/BORP/)).toBeInTheDocument();
    });

    it('does not render a lonely separator when there is neither', () => {
      renderCard({ event: makeEvent({ hostName: null, city: null }) });
      expect(screen.queryByText(/^ · /)).not.toBeInTheDocument();
    });
  });

  it('marks a hybrid event as attendable online', () => {
    renderCard({ event: makeEvent({ format: 'hybrid' }) });
    expect(screen.getByText('Hybrid')).toBeInTheDocument();
  });

  it('shows an event’s tags as chips', () => {
    renderCard({ event: makeEvent({ tags: [makeTag('wheelchair-rugby')] }) });
    expect(screen.getByText('wheelchair-rugby')).toBeInTheDocument();
  });

  it('omits the tally entirely when nobody has said anything', () => {
    renderCard({ event: makeEvent({ goingCount: 0, interestedCount: 0 }) });
    expect(screen.queryByText(/interested$/)).not.toBeInTheDocument();
  });

  it('opens the event when the body is tapped', async () => {
    const props = renderCard({ event: makeEvent({ title: 'Rugby practice' }) });
    await userEvent.click(screen.getByText('Rugby practice'));
    expect(props.onOpen).toHaveBeenCalled();
  });
});

describe('an event that is over', () => {
  it('offers no Interested or Going, because there is nothing left to decide', () => {
    renderCard({ past: true });
    expect(screen.queryByRole('button', { name: /interested/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^going/i })).not.toBeInTheDocument();
  });

  it('still opens the event, which is where the description is', () => {
    const props = renderCard({ past: true });
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('keeps what a member reads it for: when, what, and whose', () => {
    renderCard({
      past: true,
      event: makeEvent({ title: 'Friday Happy Hour', hostName: 'NorCal SCI' }),
    });
    expect(screen.getByText('Friday Happy Hour')).toBeInTheDocument();
    expect(screen.getByText(/NorCal SCI/)).toBeInTheDocument();
  });

  it('drops what only helps somebody decide whether to go', () => {
    renderCard({
      past: true,
      event: makeEvent({ tags: [makeTag('wheelchair-rugby')] }),
      attendees: [attendee('Nicole')],
    });
    // Tags, the going counter and the faces are all there to answer "should I
    // go"; none of them is a live question afterwards.
    expect(screen.queryByText('wheelchair-rugby')).not.toBeInTheDocument();
    expect(screen.queryByText(/going ·/i)).not.toBeInTheDocument();
  });

  it('still offers both buttons while the event is ahead', () => {
    renderCard({ past: false });
    expect(screen.getByRole('button', { name: /interested/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^going/i })).toBeInTheDocument();
  });
});

describe('one more date of a series', () => {
  it('carries only what differs between occurrences', () => {
    // The title, host and mark are on the card above, identical every time.
    // Four rows repeating a truncated title spend the line on what the reader
    // already knows.
    renderCard({
      occurrence: true,
      event: makeEvent({
        title: 'The Lionheart Community’s Weekly Wednesdays',
        hostName: 'NorCal SCI',
        startTime: '2026-09-23T22:00:00Z',
      }),
    });
    expect(screen.queryByText(/Weekly Wednesdays/)).not.toBeInTheDocument();
    expect(screen.queryByText('NorCal SCI')).not.toBeInTheDocument();
    expect(screen.getByText(/Wed/)).toBeInTheDocument();
  });

  it('offers no RSVP of its own, and still opens its own page', () => {
    const props = renderCard({ occurrence: true });
    expect(screen.queryByRole('button', { name: /interested/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('writes the weekday as prose, not as the tile’s small caps', () => {
    renderCard({ occurrence: true, event: makeEvent({ startTime: '2026-09-23T22:00:00Z' }) });
    expect(screen.queryByText(/WED ·/)).not.toBeInTheDocument();
  });
});
