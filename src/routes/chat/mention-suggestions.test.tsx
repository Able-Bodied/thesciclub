import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type * as Mentions from '@/lib/mentions';
import { Composer } from '@/routes/chat/composer';

/**
 * Typing "@" in a topic's box (20261029070000). Only the read of who to
 * suggest is stubbed; the matching and the box are the real ones.
 */
vi.mock('@/lib/mentions', async (importOriginal) => ({
  ...(await importOriginal<typeof Mentions>()),
  loadMentionCandidates: () =>
    Promise.resolve([
      {
        id: 'm1',
        displayName: 'Maya Local',
        username: 'maya.local',
        photoPath: null,
        photoAlt: null,
      },
      { id: 'm2', displayName: 'Mark Ruiz', username: 'markr', photoPath: null, photoAlt: null },
      { id: 'm3', displayName: 'Sam Lee', username: 'sam_lee', photoPath: null, photoAlt: null },
      // Enough that a bare "@" fills the list.
      ...Array.from({ length: 25 }, (_, i) => ({
        id: `z${String(i)}`,
        displayName: `Zed ${String(i)}`,
        username: `zed${String(i)}`,
        photoPath: null,
        photoAlt: null,
      })),
    ]),
}));

function renderComposer(mentions = true) {
  render(
    <Composer
      placeholder="Reply to this topic"
      sendLabel="Post this reply"
      onSend={() => Promise.resolve(null)}
      mentions={mentions}
    />,
  );
  return screen.getByRole('textbox', { name: 'Reply to this topic' });
}

describe('mentioning a member', () => {
  // The owner, 2026-10-29: the list hid the box being typed in.
  it('offers up to 20 in a list that scrolls, floating over the posts', async () => {
    const box = renderComposer();
    await userEvent.type(box, '@');
    const list = await screen.findByRole('listbox', { name: 'Members to mention' });
    expect(within(list).getAllByRole('option')).toHaveLength(20);
    expect(list).toHaveClass('overflow-y-auto');
    expect(list.parentElement).toHaveClass('absolute', 'bottom-full');
  });

  it('offers members after an "@", says how many, and chooses none yet', async () => {
    const box = renderComposer();
    await userEvent.type(box, 'Thanks @ma');
    const list = await screen.findByRole('listbox', { name: 'Members to mention' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.getAttribute('aria-label')),
    ).toEqual(['Maya Local, @maya.local', 'Mark Ruiz, @markr']);
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
    expect(box).toHaveAttribute('aria-controls', list.id);
    expect(box).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 members to mention. Up and down arrows to choose, Enter to pick.',
    );
  });

  it('chooses with the arrows and puts the @name in with Enter', async () => {
    const box = renderComposer();
    await userEvent.type(box, 'Thanks @ma');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const mark = screen.getByRole('option', { name: 'Mark Ruiz, @markr' });
    expect(mark).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', mark.id);
    await userEvent.keyboard('{Enter}');
    expect(box).toHaveValue('Thanks @markr ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Mentioned @markr.');
    // The caret is after the name, so typing carries on.
    await userEvent.type(box, 'hi');
    expect(box).toHaveValue('Thanks @markr hi');
  });

  it('leaves Enter a line break while nothing is chosen', async () => {
    const box = renderComposer();
    await userEvent.type(box, '@ma');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Enter}');
    expect(box).toHaveValue('@ma\n');
  });

  it('closes on Escape for that "@", and opens again for the next', async () => {
    const box = renderComposer();
    await userEvent.type(box, '@ma');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.type(box, 'y');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.type(box, ' @sa');
    expect(await screen.findByRole('option', { name: 'Sam Lee, @sam_lee' })).toBeInTheDocument();
  });

  it('puts the @name in when a row is pressed', async () => {
    const box = renderComposer();
    await userEvent.type(box, 'Ask @sam about it');
    // Back to just after "@sam".
    await userEvent.keyboard('{ArrowLeft>9/}');
    await userEvent.click(await screen.findByRole('option', { name: 'Sam Lee, @sam_lee' }));
    expect(box).toHaveValue('Ask @sam_lee about it');
  });

  it('suggests nobody in a conversation', async () => {
    const box = renderComposer(false);
    await userEvent.type(box, '@ma');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).not.toHaveAttribute('aria-autocomplete');
  });
});
