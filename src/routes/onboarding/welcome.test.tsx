import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WelcomeScreen } from '@/routes/onboarding/welcome';

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

  it('says nothing of it otherwise', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} />);
    expect(screen.queryByText(/on our list/)).toBeNull();
  });
});
