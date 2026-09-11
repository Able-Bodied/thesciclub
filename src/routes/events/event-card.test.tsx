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
    onDismiss: vi.fn(),
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

  it('names the event in the dismiss button, so a list of them is distinguishable', () => {
    // Twelve buttons all called "Not interested" is a screen reader's problem,
    // not a design one.
    renderCard({ event: makeEvent({ title: 'Handcycle ride' }) });
    expect(
      screen.getByRole('button', { name: 'Not interested in Handcycle ride' }),
    ).toBeInTheDocument();
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
