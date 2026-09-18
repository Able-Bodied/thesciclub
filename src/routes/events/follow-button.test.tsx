import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FollowButton } from '@/routes/events/follow-button';

describe('the follow button', () => {
  it('shows the state, and says the action to a screen reader', () => {
    // The visible label is "Following" rather than "Unfollow", because a list
    // of these read as a column of things to undo. That puts the burden on
    // aria-label, which is the mechanism for exactly this — so it is asserted
    // rather than assumed.
    const noop = vi.fn();
    const { rerender } = render(<FollowButton following={false} onToggle={noop} />);
    expect(screen.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false');

    rerender(<FollowButton following onToggle={noop} />);
    const on = screen.getByRole('button', { name: 'Following. Press to unfollow.' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(on).toHaveTextContent('Following');
  });

  it('reports a press either way round', async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<FollowButton following={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button'));
    rerender(<FollowButton following onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
