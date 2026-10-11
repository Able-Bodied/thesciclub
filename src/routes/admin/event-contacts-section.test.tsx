import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EventContacts from '@/routes/admin/event-contacts';
import type { HostContact } from '@/routes/admin/event-contacts';
import { makeEvent } from '@/test/factory';
import type { ClubEvent } from '@/types/domain';

const db = vi.hoisted(() => ({
  events: [] as ClubEvent[],
  contacts: [] as HostContact[],
  asked: [] as string[],
  failure: null as string | null,
  copied: [] as string[],
}));

vi.mock('@/lib/events', () => ({
  useEvents: () => ({ events: db.events, loading: false, error: null }),
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => () => undefined }));
vi.mock('@/routes/admin/event-contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof EventContacts>()),
  fetchHostContacts: (id: string) => {
    db.asked.push(id);
    return Promise.resolve(
      db.failure
        ? { ok: false as const, error: db.failure }
        : { ok: true as const, contacts: db.contacts },
    );
  },
}));

const { EventContactsSection } = await import('@/routes/admin/event-contacts-section');

beforeEach(() => {
  db.events = [
    makeEvent({ id: 'e1', title: 'Wheelchair rugby', goingCount: 2 }),
    makeEvent({ id: 'e2', title: 'Quiet one', goingCount: 0 }),
  ];
  db.contacts = [
    { memberId: 'm1', displayName: 'Dana', email: 'dana@example.com', phone: '14085550112' },
    { memberId: 'm2', displayName: 'Sam', email: 'sam@example.com', phone: null },
  ];
  db.asked = [];
  db.failure = null;
  db.copied = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        db.copied.push(text);
        return Promise.resolve();
      },
    },
  });
});

describe('who is going', () => {
  it('lists only events somebody is going to', () => {
    render(<EventContactsSection />);
    expect(screen.getByRole('option', { name: /Wheelchair rugby/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Quiet one/ })).toBeNull();
  });

  it('shows each person’s email and phone once an event is chosen', async () => {
    render(<EventContactsSection />);
    await userEvent.selectOptions(screen.getByLabelText('Event'), 'e1');
    expect(await screen.findByText('Dana')).toBeInTheDocument();
    expect(screen.getByText(/dana@example\.com · 14085550112/)).toBeInTheDocument();
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    expect(db.asked).toEqual(['e1']);
  });

  it('copies the list as text for the host', async () => {
    render(<EventContactsSection />);
    await userEvent.selectOptions(screen.getByLabelText('Event'), 'e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Copy the list' }));
    await waitFor(() => {
      expect(db.copied).toEqual(['Dana · dana@example.com · 14085550112\nSam · sam@example.com']);
    });
  });

  it('says so, and offers no copy, when the read fails', async () => {
    db.failure = 'Not an administrator';
    render(<EventContactsSection />);
    await userEvent.selectOptions(screen.getByLabelText('Event'), 'e1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not an administrator');
    expect(screen.queryByRole('button', { name: 'Copy the list' })).toBeNull();
  });
});
