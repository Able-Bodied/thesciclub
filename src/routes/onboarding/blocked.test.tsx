import { render as renderBare, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const requests = vi.hoisted(() => ({ sent: [] as unknown[] }));
// To one person at the club (20261102050000).
vi.mock('@/lib/invite-requests', () => ({
  requestClubInvite: (request: unknown) => {
    requests.sent.push(request);
    return Promise.resolve({ ok: true, value: null });
  },
}));

const proof = vi.hoisted(() => ({
  asked: [] as string[],
  askOk: true,
  answer: 'proved',
}));
vi.mock('@/lib/invite-proof', () => ({
  askForInviteCode: (email: string) => {
    proof.asked.push(email);
    return Promise.resolve(proof.askOk);
  },
  proveInviteCode: () => Promise.resolve(proof.answer),
}));

const { BlockedScreen } = await import('@/routes/onboarding/blocked');

function render(screenToShow: ReactElement) {
  return renderBare(
    <MemoryRouter initialEntries={['/join']}>
      <Routes>
        <Route path="/join" element={screenToShow} />
      </Routes>
    </MemoryRouter>,
  );
}

const noop = vi.fn();

describe('invited at a different email', () => {
  const open = (onProved = vi.fn()) => {
    proof.asked = [];
    proof.askOk = true;
    proof.answer = 'proved';
    render(
      <BlockedScreen onTryAnother={noop} email="abc@privaterelay.example" onProved={onProved} />,
    );
    return onProved;
  };

  const sendTo = async (address: string) => {
    await userEvent.type(screen.getByLabelText('Invited at a different email?'), address);
    await userEvent.click(screen.getByRole('button', { name: 'Send a code' }));
  };

  it('needs a session, so it is not offered at sign-up', () => {
    render(<BlockedScreen onTryAnother={noop} email="a@b.co" signedIn={false} onProved={noop} />);
    expect(screen.queryByLabelText(/different email/)).toBeNull();
  });

  it('never says whether the address is on the list', async () => {
    open();
    await sendTo('dana@example.com');
    expect(proof.asked).toEqual(['dana@example.com']);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /If dana@example.com has an invitation/,
    );
  });

  it('goes on by itself once the code is right', async () => {
    const onProved = open();
    await sendTo('dana@example.com');
    await userEvent.type(await screen.findByLabelText('Code from the email'), '123456');
    expect(onProved).toHaveBeenCalledOnce();
  });

  it('says so when the code is wrong, and clears it', async () => {
    const onProved = open();
    proof.answer = 'refused';
    await sendTo('dana@example.com');
    const box = await screen.findByLabelText('Code from the email');
    await userEvent.type(box, '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code did not work');
    expect(box).toHaveValue('');
    expect(onProved).not.toHaveBeenCalled();
  });

  it('holds a new code back for a minute', async () => {
    open();
    await sendTo('dana@example.com');
    expect(await screen.findByRole('button', { name: /Send a new code in 60s/ })).toBeDisabled();
  });

  it('says when the request itself failed', async () => {
    open();
    proof.askOk = false;
    await sendTo('dana@example.com');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send that');
  });
});

describe('asking for an invite', () => {
  // The owner, 2026-11-02: no list of organizations, the request goes to one person.
  it('opens the form from the main button, with the refused address filled in', async () => {
    requests.sent = [];
    render(
      <BlockedScreen onTryAnother={noop} email="dana@example.com" name="Dana" onProved={noop} />,
    );
    expect(screen.queryByLabelText('Your name')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Request an invite' }));
    expect(screen.queryByRole('button', { name: 'Request an invite' })).toBeNull();
    expect(screen.queryByLabelText('Invited at a different email?')).toBeNull();
    expect(screen.getByText('Joining The SCI Club is by invitation only.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('dana@example.com');
    expect(screen.getByLabelText('Your name')).toHaveValue('Dana');
    await userEvent.type(screen.getByLabelText('Your name'), ' Ruiz');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(requests.sent).toEqual([{ name: 'Dana Ruiz', email: 'dana@example.com', note: '' }]);
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
  });
});

describe('the way out', () => {
  it('names the address that was refused', () => {
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    expect(screen.getByText('dana@example.com')).toBeInTheDocument();
    expect(screen.getByText(/isn't on the list/)).toBeInTheDocument();
  });

  // Nothing that looks through a phone's contacts (the owner, 2026-10-10), and
  // no consultation call for now (2026-10-25).
  it('offers no consultation call and no “ask somebody you know”', () => {
    render(<BlockedScreen onTryAnother={noop} email={null} />);
    expect(screen.queryByRole('link', { name: /Book a call/ })).toBeNull();
    expect(screen.queryByText(/Ask somebody/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /contacts/i })).toBeNull();
    expect(screen.queryByLabelText(/number of somebody/i)).toBeNull();
  });

  // A small link now, under "Request an invite" (the owner, 2026-11-02).
  it('signs out', async () => {
    const onTryAnother = vi.fn();
    render(<BlockedScreen onTryAnother={onTryAnother} email="dana@example.com" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onTryAnother).toHaveBeenCalledOnce();
  });

  // Refused at the join form (20261012040000): there is no account yet.
  it('refused at sign-up: no signing out, and points at the invited address or the link', async () => {
    const onTryAnother = vi.fn();
    render(<BlockedScreen onTryAnother={onTryAnother} email="dana@example.com" signedIn={false} />);
    expect(screen.getByText(/use the address your invitation was sent to/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try another email' }));
    expect(onTryAnother).toHaveBeenCalledOnce();
  });
});
