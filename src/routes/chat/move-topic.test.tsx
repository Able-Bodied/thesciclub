import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Topics from '@/lib/chat/topics';
import { MoveTopic } from '@/routes/chat/move-topic';
import { makeRoom } from '@/test/factory';

const db = vi.hoisted(() => ({
  moved: [] as [string, string][],
  failure: null as string | null,
}));

vi.mock('@/lib/chat/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof Topics>()),
  moveTopic: (topicId: string, roomId: string) => {
    db.moved.push([topicId, roomId]);
    return Promise.resolve(
      db.failure ? { ok: false, error: db.failure } : { ok: true, value: null },
    );
  },
}));

const rooms = [
  makeRoom({ id: 'general', name: 'General', category: 'General' }),
  makeRoom({ id: 'equip', name: 'Equipment & assistive tech', category: 'Kit' }),
  makeRoom({ id: 'skin', name: 'Skin & pressure sores', category: 'Body', openedAt: null }),
];

beforeEach(() => {
  db.moved = [];
  db.failure = null;
});

function renderMove(isAdmin: boolean, onMoved = vi.fn()) {
  render(
    <MoveTopic topicId="t1" roomId="general" rooms={rooms} isAdmin={isAdmin} onMoved={onMoved} />,
  );
  return onMoved;
}

describe('moving a topic', () => {
  it('is one button until asked for', () => {
    renderMove(false);
    expect(screen.getByRole('button', { name: 'Move to another room' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('offers a member the open rooms other than this one, and moves it there', async () => {
    const user = userEvent.setup();
    const onMoved = renderMove(false);
    await user.click(screen.getByRole('button', { name: 'Move to another room' }));
    const select = screen.getByRole('combobox', { name: 'Move this topic to' });
    expect(screen.queryByRole('option', { name: 'General' })).toBeNull();
    expect(screen.queryByRole('option', { name: /Skin/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move it' })).toBeDisabled();
    await user.selectOptions(select, 'equip');
    await user.click(screen.getByRole('button', { name: 'Move it' }));
    await waitFor(() => {
      expect(onMoved).toHaveBeenCalledWith('equip');
    });
    expect(db.moved).toEqual([['t1', 'equip']]);
  });

  it('offers an administrator closed rooms too, marked as closed', async () => {
    const user = userEvent.setup();
    renderMove(true);
    await user.click(screen.getByRole('button', { name: 'Move to another room' }));
    expect(
      screen.getByRole('option', { name: 'Skin & pressure sores (closed)' }),
    ).toBeInTheDocument();
  });

  it('says why when the database refuses, and stays put', async () => {
    const user = userEvent.setup();
    db.failure = 'Only an administrator or whoever started a topic can move it.';
    const onMoved = renderMove(false);
    await user.click(screen.getByRole('button', { name: 'Move to another room' }));
    await user.selectOptions(screen.getByRole('combobox'), 'equip');
    await user.click(screen.getByRole('button', { name: 'Move it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(db.failure);
    expect(onMoved).not.toHaveBeenCalled();
  });
});
