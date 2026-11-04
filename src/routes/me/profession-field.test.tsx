import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Card =
  | { ok: true; value: { title: string; heading: null; body: null } | null }
  | { ok: false; error: string };

const state = vi.hoisted(() => ({
  card: null as Card | null,
  save: vi.fn(),
  announce: vi.fn(),
}));

vi.mock('@/lib/partner-hub', () => ({
  fetchMyPartnerCard: () => Promise.resolve(state.card),
  setMyProfessionalTitle: (title: string) => state.save(title) as Promise<unknown>,
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => state.announce }));

const { ProfessionField } = await import('@/routes/me/profession-field');

beforeEach(() => {
  state.card = { ok: true, value: { title: 'Physical therapist', heading: null, body: null } };
  state.save
    .mockReset()
    .mockImplementation((title: string) => Promise.resolve({ ok: true, value: title.trim() }));
  state.announce.mockReset();
});

// The owner, 2026-11-04: a professional writes their own profession on Me.
describe('your profession', () => {
  it('shows what is beside their name, and saves a new one, trimmed', async () => {
    render(<ProfessionField />);
    const field = await screen.findByLabelText('Your profession');
    expect(field).toHaveValue('Physical therapist');
    expect(
      screen.getByText('Shown beside your name as “Professional · Physical therapist”.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await userEvent.clear(field);
    await userEvent.type(field, ' Occupational therapist, SCI-FIT ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.save).toHaveBeenCalledWith('Occupational therapist, SCI-FIT');
    await waitFor(() => {
      expect(state.announce).toHaveBeenCalledWith('Your profession is saved.');
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('will not save one shorter than two letters', async () => {
    render(<ProfessionField />);
    const field = await screen.findByLabelText('Your profession');
    await userEvent.clear(field);
    await userEvent.type(field, 'x');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says a refusal and keeps what was typed', async () => {
    state.save.mockResolvedValue({ ok: false, error: 'Your profession was not saved.' });
    render(<ProfessionField />);
    const field = await screen.findByLabelText('Your profession');
    await userEvent.type(field, ', SCI-FIT');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your profession was not saved.');
    expect(field).toHaveValue('Physical therapist, SCI-FIT');
  });

  it('shows nothing to somebody who is not a professional', async () => {
    state.card = { ok: true, value: null };
    const { container } = render(<ProfessionField />);
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
