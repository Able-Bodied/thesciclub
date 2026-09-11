import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';

const account = vi.hoisted(() => ({ current: null as Account | null }));
vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));

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
  account.current = { status: 'member', userId: 'u1' };
});

describe('RequireMember', () => {
  it('lets a member in', () => {
    renderGuarded();
    expect(screen.getByText('Inside the club')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the welcome screen', () => {
    account.current = { status: 'signed-out', userId: null };
    renderGuarded();
    expect(screen.getByText('Welcome screen')).toBeInTheDocument();
    expect(screen.queryByText('Inside the club')).not.toBeInTheDocument();
  });

  it('sends somebody who abandoned signup back to finish it', () => {
    account.current = { status: 'signed-up', userId: 'u1' };
    renderGuarded();
    expect(screen.getByText('Welcome screen')).toBeInTheDocument();
  });

  it('renders nothing of the club while it is still deciding', () => {
    account.current = { status: 'loading', userId: null };
    renderGuarded();
    expect(screen.queryByText('Inside the club')).not.toBeInTheDocument();
    expect(screen.queryByText('Welcome screen')).not.toBeInTheDocument();
  });
});
