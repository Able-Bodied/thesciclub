import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReactionsState } from '@/lib/chat/reactions';
import { ReactionBar } from '@/routes/chat/reaction-bar';

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () =>
    new Map([
      ['other', { displayName: 'Sam' }],
      ['me', { displayName: 'Alex' }],
    ]),
}));
const state = (extra: Partial<ReactionsState> = {}): ReactionsState => ({
  rows: [],
  loading: false,
  pending: new Set(),
  error: null,
  failure: null,
  choose: vi.fn(() => Promise.resolve(true)),
  reload: vi.fn(),
  ...extra,
});
describe('reaction controls', () => {
  it('shows React and Reply directly while keeping Edit in the menu', async () => {
    const data = state({ rows: [{ target_id: 'm1', member_id: 'other', emoji: '❤️' }] });
    render(
      <ReactionBar
        compact
        target="m1"
        what="the message"
        readerId="me"
        state={data}
        reply={<button type="button">Reply</button>}
        actions={<button type="button">Edit</button>}
      />,
    );
    expect(screen.getByRole('button', { name: /Love: 1 reaction/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'React to the message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'React to the message' }));
    const picker = screen.getByRole('dialog', { name: 'React to the message' });
    await user.click(within(picker).getByRole('button', { name: 'Love' }));
    expect(data.choose).toHaveBeenCalledWith('m1', '❤️');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the picker open after a failed save so the choice can be retried', async () => {
    const data = state({
      choose: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    });
    render(<ReactionBar compact target="m1" what="the message" readerId="me" state={data} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'React to the message' }));
    await user.click(screen.getByRole('button', { name: 'Love' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Love' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(data.choose).toHaveBeenCalledTimes(2);
  });
  it('marks your choice in the picker and lets you remove it directly', async () => {
    const data = state({ rows: [{ target_id: 'm1', member_id: 'me', emoji: '❤️' }] });
    render(<ReactionBar compact target="m1" what="the message" readerId="me" state={data} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'React to the message' }));
    const choice = within(screen.getByRole('dialog')).getByRole('button', { name: 'Love' });
    expect(choice).toHaveAttribute('aria-pressed', 'true');
    await user.click(choice);
    expect(data.choose).toHaveBeenCalledWith('m1', null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('performs an existing action and closes the menu', async () => {
    const edit = vi.fn();
    render(
      <ReactionBar
        compact
        target="m1"
        what="the message"
        readerId="me"
        state={state()}
        actions={
          <button type="button" onClick={edit}>
            Edit
          </button>
        }
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Actions for the message' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(edit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('replies directly without opening the actions menu', async () => {
    const onReply = vi.fn();
    render(
      <ReactionBar
        compact
        target="m1"
        what="the message"
        readerId="me"
        state={state()}
        reply={
          <button type="button" onClick={onReply}>
            Reply
          </button>
        }
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reply' }));
    expect(onReply).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('restores keyboard focus to the actions button after closing the menu', async () => {
    render(<ReactionBar compact target="m1" what="the message" readerId="me" state={state()} />);
    const user = userEvent.setup();
    const opener = screen.getByRole('button', { name: 'Actions for the message' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
  it('opens a keyboard accessible picker, shows names and saves a choice', async () => {
    const data = state({ rows: [{ target_id: 'p1', member_id: 'other', emoji: '❤️' }] });
    render(<ReactionBar target="p1" what="the question" readerId="me" state={data} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'React to the question' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Sam/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Celebrate' }));
    expect(data.choose).toHaveBeenCalledWith('p1', '🎉');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('removes your reaction from its count chip', async () => {
    const data = state({ rows: [{ target_id: 'm1', member_id: 'me', emoji: '👍' }] });
    render(<ReactionBar target="m1" what="the message" readerId="me" state={data} />);
    const chip = screen.getByRole('button', { name: /Thumbs up: 1 reaction/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(chip);
    expect(data.choose).toHaveBeenCalledWith('m1', null);
  });
  it('keeps the picker open if saving fails and closes with Escape', async () => {
    const data = state({ choose: vi.fn(() => Promise.resolve(false)) });
    render(<ReactionBar target="p1" what="the reply" readerId="me" state={data} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'React to the reply' }));
    await user.click(screen.getByRole('button', { name: 'Love' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'React to the reply' })).toHaveFocus();
  });
  it('does not show stale counts after a read failure', () => {
    const data = state({
      rows: [{ target_id: 'p1', member_id: 'me', emoji: '👍' }],
      error: 'Offline',
    });
    render(<ReactionBar target="p1" what="the reply" readerId="me" state={data} />);
    expect(screen.queryByRole('button', { name: /Thumbs up/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry reactions' })).toBeInTheDocument();
  });
});
