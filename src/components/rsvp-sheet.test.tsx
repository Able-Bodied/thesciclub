import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import type * as EventPhone from '@/lib/event-phone';
import { makeEvent } from '@/test/factory';
import type { RsvpStatus } from '@/types/domain';

const phone = vi.hoisted(() => ({
  current: null as string | null,
  readFails: false,
  saved: [] as (string | null)[],
  saveError: null as string | null,
}));

vi.mock('@/lib/event-phone', async (importOriginal) => ({
  ...(await importOriginal<typeof EventPhone>()),
  loadOwnPhone: () =>
    Promise.resolve(
      phone.readFails ? { ok: false, error: 'offline' } : { ok: true, phone: phone.current },
    ),
  saveOwnPhone: (_id: string, typed: string | null) => {
    phone.saved.push(typed);
    return Promise.resolve(phone.saveError ? { ok: false, error: phone.saveError } : { ok: true });
  },
}));

const { useRsvpSheet } = await import('@/components/rsvp-sheet');

const event = makeEvent({ id: 'swim', title: 'Friday swim', startTime: '2026-11-06T02:00:00Z' });
const changed: RsvpStatus[] = [];

function Harness() {
  const { saved, sheet } = useRsvpSheet('u1');
  const change = (next: RsvpStatus) => {
    changed.push(next);
    saved(event, next, change);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          saved(event, 'going', change);
        }}
      >
        Going
      </button>
      <button
        type="button"
        onClick={() => {
          saved(event, 'interested', change);
        }}
      >
        Interested
      </button>
      {sheet}
    </>
  );
}

function renderIt() {
  return render(
    <AnnounceProvider>
      <Harness />
    </AnnounceProvider>,
  );
}

beforeEach(() => {
  phone.current = null;
  phone.readFails = false;
  phone.saved = [];
  phone.saveError = null;
  changed.length = 0;
  window.sessionStorage.clear();
});

describe('the RSVP sheet', () => {
  it('says what Going shares, and offers Interested instead', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    const sheet = await screen.findByRole('dialog', { name: 'You’re going' });
    expect(sheet).toHaveTextContent('Friday swim');
    expect(sheet).toHaveTextContent(
      'We share your email with the host, and your phone number if you’ve added one, for this event only.',
    );
    await userEvent.click(screen.getByRole('button', { name: /Change to Interested/ }));
    expect(changed).toEqual(['interested']);
    expect(await screen.findByRole('dialog', { name: 'You’re interested' })).toHaveTextContent(
      'Interested shares nothing with the host.',
    );
  });

  it('offers the event for a calendar', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Interested' }));
    const google = await screen.findByRole('link', { name: /Google Calendar/ });
    expect(google.getAttribute('href')).toMatch(
      /^https:\/\/calendar\.google\.com\/calendar\/render\?/,
    );
    expect(google).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: /Apple or Outlook/ })).toBeInTheDocument();
  });

  it('asks for a phone number with Going when there is none on file', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    expect(await screen.findByLabelText('Phone number (optional)')).toBeInTheDocument();
  });

  it('never asks with Interested', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Interested' }));
    await screen.findByRole('dialog');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
  });

  it('does not ask when a number is on file, or could not be read', async () => {
    phone.current = '14085550112';
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await screen.findByRole('dialog');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();

    phone.current = null;
    phone.readFails = true;
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await screen.findByRole('dialog');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
  });

  it('saves the number and keeps the sheet open for the calendar', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await userEvent.type(await screen.findByLabelText('Phone number (optional)'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
    });
    expect(phone.saved).toEqual(['(408) 555-0112']);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('says so when the save fails', async () => {
    phone.saveError = 'Your number was not saved.';
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await userEvent.type(await screen.findByLabelText('Phone number (optional)'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are still going.');
  });

  it('closing without a number is a skip, and it is not asked again this session', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await screen.findByLabelText('Phone number (optional)');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await screen.findByRole('dialog');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
  });

  it('closes with Escape', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
