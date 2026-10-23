import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WelcomeScreen } from '@/routes/onboarding/welcome';

const noop = () => undefined;

describe('the welcome screen after registering for an event', () => {
  // The same words for everybody who registered: the page must never say
  // whether an address is a member's. A registration is not an invite
  // (20261022220000), so it does not promise a way in.
  it('says who has the details, and that joining needs an invite', () => {
    render(
      <WelcomeScreen onJoin={noop} onSignIn={noop} registered={{ organizer: 'NorCal SCI' }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "You're registered.NorCal SCI has your details. Members can sign in to see who is going. Joining the club needs an invite.",
    );
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeInTheDocument();
  });

  it('names the organizer generically when no organization hosts it', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} registered={{}} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      "You're registered.The event's organizer has your details.",
    );
  });

  it('says nothing of invites while joining is open', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} registered={{}} joiningOpen />);
    expect(screen.getByRole('status')).not.toHaveTextContent(/invite/);
  });

  it('says nothing of it otherwise', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} />);
    expect(screen.queryByText(/You're registered/)).toBeNull();
  });
});
