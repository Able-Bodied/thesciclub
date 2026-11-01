import { render as renderBare, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WelcomeScreen } from '@/routes/onboarding/welcome';

// The request link is a route link (the owner, 2026-10-28).
function render(ui: ReactElement) {
  return renderBare(<MemoryRouter>{ui}</MemoryRouter>);
}

const noop = () => undefined;

describe('the welcome screen after registering for an event', () => {
  // The same words for everybody who registered: the page must never say
  // whether an address is a member's. Kept simple (the owner, 2026-10-24):
  // on the list, and why to join.
  it('says they are on the list, and why to join', () => {
    render(
      <WelcomeScreen onJoin={noop} onSignIn={noop} registered={{ organizer: 'NorCal SCI' }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "You're on our list. Join the club to see who's coming and join the group chat.",
    );
    expect(screen.getByRole('button', { name: 'Join the club' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeInTheDocument();
  });

  it('says nothing of it otherwise, and no banner at all', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} />);
    expect(screen.queryByText(/on our list/)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
