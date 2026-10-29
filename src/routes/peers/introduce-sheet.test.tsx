import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Introductions from '@/lib/introductions';
import type * as Mentions from '@/lib/mentions';

const state = vi.hoisted(() => ({ make: vi.fn(), announce: vi.fn() }));

vi.mock('@/lib/mentions', async (importOriginal) => ({
  ...(await importOriginal<typeof Mentions>()),
  loadMentionCandidates: () =>
    Promise.resolve([
      { id: 'maya', displayName: 'Maya Local', username: 'maya', photoPath: null, photoAlt: null },
      { id: 'sam', displayName: 'Sam Lee', username: 'sam', photoPath: null, photoAlt: null },
    ]),
}));
vi.mock('@/lib/introductions', async (importOriginal) => ({
  ...(await importOriginal<typeof Introductions>()),
  makeIntroduction: (...args: unknown[]) => state.make(...args) as Promise<unknown>,
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => state.announce }));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null, usePhotoUrls: () => [] }));

const { IntroduceSheet } = await import('@/routes/peers/introduce-sheet');

function open(onSent = vi.fn()) {
  render(
    <IntroduceSheet
      member={{ id: 'sam', displayName: 'Sam Lee' }}
      onCancel={() => undefined}
      onSent={onSent}
    />,
  );
  return onSent;
}

async function chooseMaya() {
  await userEvent.type(screen.getByLabelText('Introduce them to'), 'ma');
  await userEvent.click(await screen.findByRole('button', { name: /Maya Local/ }));
}

describe('introducing two members', () => {
  beforeEach(() => {
    state.make.mockReset();
    state.announce.mockReset();
  });

  it('is a dialog named for the member, and focuses its heading', async () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Introduce Sam Lee' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Introduce Sam Lee' })).toHaveFocus();
    });
  });

  it('never offers the member themselves, and sends both ids with the note', async () => {
    state.make.mockResolvedValue({ ok: true, value: 'i1' });
    const onSent = open();
    const send = screen.getByRole('button', { name: 'Send introduction' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Introduce them to'), 'sam');
    expect(await screen.findByText('Nobody matches that.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Introduce them to'));
    await chooseMaya();
    expect(screen.getByRole('button', { name: 'Change from Maya Local' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('A note to both of them'), 'Both C6 in San Jose.');
    expect(
      screen.getByText(/leave out health details\. 480 characters left\./),
    ).toBeInTheDocument();
    await userEvent.click(send);
    expect(state.make).toHaveBeenCalledWith('sam', 'maya', 'Both C6 in San Jose.');
    await waitFor(() => {
      expect(onSent).toHaveBeenCalled();
    });
    expect(state.announce).toHaveBeenCalledWith(
      'Introduction sent. Sam Lee and Maya Local will each be asked.',
    );
  });

  it('says the database refusal aloud and stays open', async () => {
    state.make.mockResolvedValue({
      ok: false,
      error: 'One of those members cannot be introduced.',
    });
    const onSent = open();
    await chooseMaya();
    await userEvent.type(screen.getByLabelText('A note to both of them'), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: 'Send introduction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'One of those members cannot be introduced.',
    );
    expect(onSent).not.toHaveBeenCalled();
  });

  it('will not send a note over 500 characters', async () => {
    open();
    await chooseMaya();
    const note = screen.getByLabelText('A note to both of them');
    await userEvent.click(note);
    await userEvent.paste('x'.repeat(501));
    expect(screen.getByText(/1 characters over\./)).toBeInTheDocument();
    expect(note).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Send introduction' })).toBeDisabled();
  });
});
