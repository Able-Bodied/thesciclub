import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Introductions from '@/lib/introductions';
import type * as Mentions from '@/lib/mentions';

const state = vi.hoisted(() => ({ make: vi.fn(), announce: vi.fn(), groups: vi.fn() }));

vi.mock('@/lib/mentions', async (importOriginal) => ({
  ...(await importOriginal<typeof Mentions>()),
  loadMentionCandidates: () =>
    Promise.resolve([
      { id: 'maya', displayName: 'Maya Local', username: 'maya', photoPath: null, photoAlt: null },
      { id: 'sam', displayName: 'Sam Lee', username: 'sam', photoPath: null, photoAlt: null },
      { id: 'cy', displayName: 'Cy Park', username: 'cy', photoPath: null, photoAlt: null },
    ]),
}));
vi.mock('@/lib/introductions', async (importOriginal) => ({
  ...(await importOriginal<typeof Introductions>()),
  connectMembers: (...args: unknown[]) => state.make(...args) as Promise<unknown>,
  fetchConnectionGroups: () => state.groups() as Promise<unknown>,
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
  await userEvent.type(screen.getByLabelText('Who are you introducing?'), 'ma');
  await userEvent.click(await screen.findByRole('button', { name: /Maya Local/ }));
}

describe('introducing two members', () => {
  beforeEach(() => {
    state.make.mockReset();
    state.announce.mockReset();
    state.groups.mockResolvedValue({ ok: true, value: [] });
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
    const send = screen.getByRole('button', { name: 'Connect them' });
    expect(send).toBeDisabled();
    // The member is chosen already, and cannot be taken off.
    expect(screen.queryByRole('button', { name: 'Remove Sam Lee' })).toBeNull();
    await userEvent.type(screen.getByLabelText('Who are you introducing?'), 'sam');
    expect(await screen.findByText('Nobody matches that.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Who are you introducing?'));
    await chooseMaya();
    expect(screen.getByRole('button', { name: 'Remove Maya Local' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('A note to both of them'), 'Both C6 in San Jose.');
    expect(
      // Long notes are welcome: no count until it is nearly full.
      screen.getByText(/leave out health details\.$/),
    ).toBeInTheDocument();
    // The partner stays out of it unless they tick the box (the owner, 2026-10-29).
    expect(
      screen.getByRole('checkbox', { name: 'Join the conversation yourself' }),
    ).not.toBeChecked();
    expect(screen.getByText(/Only they will be in it/)).toBeInTheDocument();
    await userEvent.click(send);
    expect(state.make).toHaveBeenCalledWith({
      people: ['sam', 'maya'],
      note: 'Both C6 in San Jose.',
      join: false,
      groupId: null,
      name: '',
    });
    await waitFor(() => {
      expect(onSent).toHaveBeenCalled();
    });
    expect(state.announce).toHaveBeenCalledWith(
      'Sam Lee and Maya Local are connected in “Sam & Maya”.',
    );
  });

  it('puts the partner in the conversation when they tick the box', async () => {
    state.make.mockResolvedValue({ ok: true, value: 'i1' });
    open();
    await chooseMaya();
    await userEvent.type(screen.getByLabelText('A note to both of them'), 'Both C6.');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Join the conversation yourself' }));
    expect(screen.getByText(/You will be in it too\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect them' }));
    expect(state.make).toHaveBeenCalledWith(expect.objectContaining({ join: true }));
  });

  it('introduces the member to a group the partner started', async () => {
    state.make.mockResolvedValue({ ok: true, value: 'g1' });
    state.groups.mockResolvedValue({
      ok: true,
      value: [{ id: 'g1', name: 'Saturday riders', members: 3, mine: false, started: true }],
    });
    open();
    await userEvent.click(screen.getByRole('radio', { name: /Existing group/ }));
    await userEvent.click(await screen.findByRole('radio', { name: /Saturday riders/ }));
    expect(screen.getByText(/3 members · You started it/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('A note to everyone'), 'Sam rides too.');
    await userEvent.click(screen.getByRole('button', { name: 'Add to the group' }));
    expect(state.make).toHaveBeenCalledWith(
      expect.objectContaining({ people: ['sam'], groupId: 'g1', join: false }),
    );
    await waitFor(() => {
      expect(state.announce).toHaveBeenCalledWith('Sam Lee was added to “Saturday riders”.');
    });
  });

  it('says the database refusal aloud and stays open', async () => {
    state.make.mockResolvedValue({
      ok: false,
      error: 'One of those members cannot be introduced.',
    });
    const onSent = open();
    await chooseMaya();
    await userEvent.type(screen.getByLabelText('A note to both of them'), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: 'Connect them' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'One of those members cannot be introduced.',
    );
    expect(onSent).not.toHaveBeenCalled();
  });

  // The owner, 2026-11-06: no 500 limit; as long as a chat message.
  it('takes a long note, counts down near 4,000, and will not send one over', async () => {
    state.make.mockResolvedValue({ ok: true, value: 'g1' });
    open();
    await chooseMaya();
    const note = screen.getByLabelText('A note to both of them');
    await userEvent.click(note);
    await userEvent.paste('x'.repeat(1200));
    expect(screen.queryByText(/characters left/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Connect them' })).toBeEnabled();
    await userEvent.paste('x'.repeat(2700));
    expect(screen.getByText(/100 characters left\./)).toBeInTheDocument();
    await userEvent.paste('x'.repeat(101));
    expect(screen.getByText(/1 characters over\./)).toBeInTheDocument();
    expect(note).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Connect them' })).toBeDisabled();
  });
});
