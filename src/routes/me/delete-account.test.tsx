import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';

const api = vi.hoisted(() => ({
  calls: [] as string[],
  result: { ok: true, error: undefined as string | undefined },
}));

vi.mock('@/routes/me/delete-account-api', () => ({
  deleteMyAccount: (userId: string) => {
    api.calls.push(userId);
    return Promise.resolve(api.result);
  },
}));

const { DeleteAccount } = await import('@/routes/me/delete-account');

function renderIt(isAdmin = false) {
  render(
    <AnnounceProvider>
      <DeleteAccount userId="u1" isAdmin={isAdmin} />
    </AnnounceProvider>,
  );
}

beforeEach(() => {
  api.calls = [];
  api.result = { ok: true, error: undefined };
});

describe('Delete my account', () => {
  it('asks first, says what goes and what stays, and moves focus to the question', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByRole('heading', { name: 'Delete your account?' })).toHaveFocus();
    expect(screen.getByText(/erases your name, phone number, photo/)).toBeInTheDocument();
    expect(screen.getByText(/say “Deleted user” instead of your name/)).toBeInTheDocument();
    expect(api.calls).toEqual([]);
  });

  it('does nothing on Keep my account, and puts focus back', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(api.calls).toEqual([]);
    expect(screen.getByRole('button', { name: 'Delete my account' })).toHaveFocus();
  });

  it('deletes on the second press, and says so', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(api.calls).toEqual(['u1']);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Your account is deleted.');
    });
  });

  it('says why, and stays, when it fails', async () => {
    api.result = { ok: false, error: 'Your account was not deleted. Try again in a minute.' };
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account was not deleted.');
    expect(screen.getByRole('button', { name: 'Keep my account' })).toBeInTheDocument();
  });

  // The database refuses an administrator, so no button is offered.
  it('offers an administrator a sentence, not a button', () => {
    renderIt(true);
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();
    expect(screen.getByText(/cannot be deleted from the app/)).toBeInTheDocument();
  });
});
