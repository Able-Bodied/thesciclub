import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WelcomeScreen } from '@/routes/onboarding/welcome';

const noop = () => undefined;

describe('the welcome screen after registering for an event', () => {
  // The same words for everybody who registered: the page must never say
  // whether an address is a member's. A registration is not an invite
  // (20261022230000), so it does not promise a way in.
  // Many hosts are not in the club (the owner, 2026-10-24), so it never
  // claims the host has the details, and points back to the event.
  it('says their own registration may be needed, and that joining needs an invite', () => {
    render(
      <MemoryRouter>
        <WelcomeScreen
          onJoin={noop}
          onSignIn={noop}
          registered={{ organizer: 'Kelly Brush Foundation', eventId: 'ev1' }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "You're on our list.You may also need to register with Kelly Brush Foundation, so check the event details. Members can sign in to see who is going. Joining the club needs an invite.",
    );
    expect(screen.getByRole('link', { name: 'event details' })).toHaveAttribute('href', '/e/ev1');
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeInTheDocument();
  });

  it('says nothing of another registration when the club hosts it', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} registered={{}} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      "You're on our list.Members can sign in to see who is going.",
    );
  });

  it('says nothing of invites while joining is open', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} registered={{}} joiningOpen />);
    expect(screen.getByRole('status')).not.toHaveTextContent(/invite/);
  });

  it('says nothing of it otherwise', () => {
    render(<WelcomeScreen onJoin={noop} onSignIn={noop} />);
    expect(screen.queryByText(/You're on our list/)).toBeNull();
  });
});
