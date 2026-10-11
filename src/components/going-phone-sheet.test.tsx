import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import type * as EventPhone from '@/lib/event-phone';

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

const { useGoingPhoneSheet } = await import('@/components/going-phone-sheet');

function Harness() {
  const { askForPhone, sheet } = useGoingPhoneSheet('u1');
  return (
    <>
      <button type="button" onClick={askForPhone}>
        Going
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
  window.sessionStorage.clear();
});

describe('the Going phone sheet', () => {
  it('opens when Going is pressed and there is no number on file', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    expect(await screen.findByRole('dialog')).toHaveAccessibleName(
      'You are going. Add a phone number?',
    );
  });

  it('does not open when a number is already on file', async () => {
    phone.current = '14085550112';
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('does not open when the number could not be read, rather than asking blind', async () => {
    phone.readFails = true;
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('saves the number and closes', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await userEvent.type(await screen.findByLabelText('Phone number'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(phone.saved).toEqual(['(408) 555-0112']);
  });

  it('stays open and says so when the save fails', async () => {
    phone.saveError = 'Your number was not saved.';
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await userEvent.type(await screen.findByLabelText('Phone number'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are still going.');
  });

  it('can be skipped, and is not asked again this session', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(phone.saved).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes with Escape, which is a skip', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
