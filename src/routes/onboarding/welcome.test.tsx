import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WelcomeScreen } from '@/routes/onboarding/welcome';

const noop = () => undefined;

describe('the welcome screen after registering for an event', () => {
  // The owner, 2026-10-22. The same words for everybody who registered: the
  // page must never say whether an address is a member's.
  it('asks to sign in or join, and offers both', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} registered />);
    expect(screen.getByRole('status')).toHaveTextContent(
      "You're registered.Sign in or join to complete your registration and see who is coming to the event.",
    );
    expect(screen.getByRole('button', { name: 'Join the club' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeInTheDocument();
  });

  it('says nothing of it otherwise', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} />);
    expect(screen.queryByText(/You're registered/)).toBeNull();
  });
});
