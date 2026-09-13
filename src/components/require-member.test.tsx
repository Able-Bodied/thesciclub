import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';

const account = vi.hoisted(() => ({ current: null as Account | null }));
vi.mock('@/lib/account', () => ({
  useAccount: () => account.current,
  signOut: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/lib/members', () => ({
  useOwnMember: () => ({ member: null, invitedBy: 'NorCal SCI', loading: false, error: null }),
}));

const { RequireMember } = await import('@/components/require-member');

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/peers']}>
      <Routes>
        <Route path="/join" element={<p>Welcome screen</p>} />
        <Route
          path="/peers"
          element={
            <RequireMember>
              <p>Inside the club</p>
            </RequireMember>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Test' };
});

describe('RequireMember', () => {
  it('lets a member in', () => {
    renderGuarded();
    expect(screen.getByText('Inside the club')).toBeInTheDocument();
  });

  // Suspension did nothing a member could perceive: the row was read without
  // its status, so this branch resolved to 'member' and let them in to an
  // empty deck with no explanation anywhere.
  it('shows a suspended member why, rather than letting them in', () => {
    account.current = { status: 'suspended', userId: 'u1', isAdmin: false, displayName: 'Dana' };
    renderGuarded();
    expect(screen.getByText('Your membership is paused')).toBeInTheDocument();
    expect(screen.queryByText('Inside the club')).toBeNull();
  });

  // Not a redirect. Bouncing them to /join offers them a club they are
  // already in, and every screen inside comes back empty.
  it('keeps them where they are rather than sending them to the welcome screen', () => {
    account.current = { status: 'suspended', userId: 'u1', isAdmin: false, displayName: 'Dana' };
    renderGuarded();
    expect(screen.queryByText('Welcome screen')).toBeNull();
  });

  it('names whoever vouched for them, as the people to ask', () => {
    account.current = { status: 'suspended', userId: 'u1', isAdmin: false, displayName: 'Dana' };
    renderGuarded();
    expect(screen.getByText(/NorCal SCI/)).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the welcome screen', () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: 'Test' };
    renderGuarded();
    expect(screen.getByText('Welcome screen')).toBeInTheDocument();
    expect(screen.queryByText('Inside the club')).not.toBeInTheDocument();
  });

  it('sends somebody who abandoned signup back to finish it', () => {
    account.current = { status: 'signed-up', userId: 'u1', isAdmin: false, displayName: 'Test' };
    renderGuarded();
    expect(screen.getByText('Welcome screen')).toBeInTheDocument();
  });

  it('renders nothing of the club while it is still deciding', () => {
    account.current = { status: 'loading', userId: null, isAdmin: false, displayName: 'Test' };
    renderGuarded();
    expect(screen.queryByText('Inside the club')).not.toBeInTheDocument();
    expect(screen.queryByText('Welcome screen')).not.toBeInTheDocument();
  });
});
