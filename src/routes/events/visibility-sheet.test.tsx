import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventVisibility } from '@/lib/event-audience';
import { makeEvent } from '@/test/factory';

const state = vi.hoisted(() => ({ save: vi.fn(), announce: vi.fn() }));

vi.mock('@/lib/event-audience', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setEventVisibility: (...args: unknown[]) => state.save(...args) as Promise<unknown>,
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => state.announce }));
vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useMyThreads: () => ({ threads: [], loading: false, error: null, reload: () => undefined }),
}));
vi.mock('@/lib/mentions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadMemberChoices: () =>
    Promise.resolve([
      { id: 'dee', displayName: 'Dee Lopez', username: 'dee', photoPath: null, photoAlt: null },
    ]),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null, usePhotoUrls: () => new Map() }));

const { VisibilitySheet } = await import('@/routes/events/visibility-sheet');

const club: EventVisibility = {
  audience: 'club',
  mayChange: true,
  organizations: [],
  groups: [],
  invitees: [],
  inviteeCount: 0,
};

function open(visibility = club, onSaved = vi.fn()) {
  render(
    <VisibilitySheet
      event={makeEvent({ id: 'ride', title: 'Saturday Ride', organizationId: 'ncs' })}
      visibility={visibility}
      organizations={[{ id: 'ncs', name: 'NorCal SCI' }]}
      onCancel={() => undefined}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe('changing who can see an event', () => {
  beforeEach(() => {
    state.save.mockReset();
    state.announce.mockReset();
  });

  it('makes it invite only, and says how many were told', async () => {
    state.save.mockResolvedValue({ ok: true, value: 1 });
    const onSaved = open();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Invite only/ }));
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Who is invited'), 'dee');
    await userEvent.click(await screen.findByRole('button', { name: /Dee Lopez/ }));
    await userEvent.click(save);
    expect(state.save).toHaveBeenCalledWith('ride', {
      audience: 'people',
      groups: [],
      organizations: [],
      people: ['dee'],
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(state.announce).toHaveBeenCalledWith('Saved. 1 person was told they’re invited.');
  });

  it('reads an old event for its followers as its one organization', () => {
    open({ ...club, audience: 'followers' });
    expect(screen.getByRole('radio', { name: /Members of NorCal SCI/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says a refusal and stays open', async () => {
    state.save.mockResolvedValue({ ok: false, error: 'You cannot change who sees this event.' });
    const onSaved = open();
    await userEvent.click(screen.getByRole('radio', { name: /Members of NorCal SCI/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You cannot change who sees this event.',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});
