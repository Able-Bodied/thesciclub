import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  address: null as string | null,
  send: vi.fn(),
  confirm: vi.fn(),
  announce: vi.fn(),
}));

vi.mock('@/lib/email-proof', () => ({
  useUnprovenEmail: () => state.address,
  sendEmailCode: () => state.send() as Promise<string>,
  confirmEmailCode: (code: string) => state.confirm(code) as Promise<string>,
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => state.announce }));

const { ConfirmEmailBanner } = await import('@/routes/me/confirm-email-banner');

beforeEach(() => {
  state.address = 'sam@example.com';
  state.send.mockReset().mockResolvedValue('sent');
  state.confirm.mockReset().mockResolvedValue('proved');
  state.announce.mockReset();
});

// The owner, 2026-11-04: in now, confirm the email from Me.
describe('confirm your email', () => {
  it('emails a code, then confirms with it', async () => {
    render(<ConfirmEmailBanner />);
    expect(screen.getByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument();
    expect(screen.getByText(/sam@example\.com is yours/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.announce).toHaveBeenCalledWith('We emailed a code to sam@example.com.');
    await userEvent.type(screen.getByLabelText('Code'), '012 345');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(state.confirm).toHaveBeenCalledWith('012345');
    expect(state.announce).toHaveBeenCalledWith('Your email is confirmed.');
  });

  it('asks for six digits before trying', async () => {
    render(<ConfirmEmailBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await userEvent.type(screen.getByLabelText('Code'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(state.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the 6-digit code');
  });

  it('says a wrong code, and to wait before another', async () => {
    state.confirm.mockResolvedValue('refused');
    state.send.mockResolvedValueOnce('sent').mockResolvedValueOnce('wait');
    render(<ConfirmEmailBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await userEvent.type(screen.getByLabelText('Code'), '999999');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('expired or is not right');
    await userEvent.click(screen.getByRole('button', { name: 'Send another code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait a minute');
  });

  it('shows nothing with nothing to confirm', () => {
    state.address = null;
    const { container } = render(<ConfirmEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
