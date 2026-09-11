import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const auth = vi.hoisted(() => ({ signedOut: 0, failWith: null as string | null }));

vi.mock('@/lib/account', () => ({
  useAccount: () => account.current,
  signOut: () => {
    if (auth.failWith) return Promise.resolve({ ok: false, error: auth.failWith });
    auth.signedOut += 1;
    return Promise.resolve({ ok: true });
  },
}));

const { default: MePage } = await import('@/routes/me/page');

function renderMe() {
  return render(
    <MemoryRouter>
      <MePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Nicole' };
  auth.signedOut = 0;
  auth.failWith = null;
});

describe('MePage', () => {
  it('says which account you are signed in as, so switching is unambiguous', () => {
    renderMe();
    expect(screen.getByText('Signed in as')).toBeInTheDocument();
    expect(screen.getByText('Nicole')).toBeInTheDocument();
  });

  it('signs out', async () => {
    renderMe();
    await userEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    await waitFor(() => {
      expect(auth.signedOut).toBe(1);
    });
  });

  it('says what signing out does and does not do', () => {
    renderMe();
    expect(screen.getByText(/Your profile stays/)).toBeInTheDocument();
  });

  it('surfaces a failure rather than pretending it worked', async () => {
    auth.failWith = 'network is unreachable';
    renderMe();
    await userEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    expect(await screen.findByText('network is unreachable')).toBeInTheDocument();
  });

  it('marks an administrator, and links to the tools', () => {
    account.current = { status: 'member', userId: 'u1', isAdmin: true, displayName: 'admin' };
    renderMe();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('shows no admin link to an ordinary member', () => {
    renderMe();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });
});
