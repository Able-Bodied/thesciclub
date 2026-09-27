import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MuteTarget } from '@/lib/chat/mutes';
import { MuteButton } from '@/routes/chat/mute-button';

const mute = vi.hoisted(() => ({
  muted: null as boolean | null,
  busy: false,
  error: null as string | null,
  toggled: 0,
  target: null as MuteTarget | null,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ userId: 'u1' }),
}));

vi.mock('@/lib/chat/mutes', () => ({
  useMute: (target: MuteTarget) => {
    mute.target = target;
    return {
      muted: mute.muted,
      busy: mute.busy,
      error: mute.error,
      toggle: () => {
        mute.toggled++;
      },
    };
  },
}));

beforeEach(() => {
  mute.muted = null;
  mute.busy = false;
  mute.error = null;
  mute.toggled = 0;
});

const thread = { kind: 'thread', id: 't1' } as const;

describe('MuteButton', () => {
  // Null is "notifications are off in this build" as well as "still reading".
  it('draws nothing until it knows', () => {
    const { container } = render(<MuteButton target={thread} what="this conversation" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to mute, named for what pressing does', async () => {
    mute.muted = false;
    render(<MuteButton target={thread} what="this conversation" />);
    const button = screen.getByRole('button', {
      name: 'Mute notifications from this conversation',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('Mute');
    await userEvent.click(button);
    expect(mute.toggled).toBe(1);
    expect(mute.target).toEqual(thread);
  });

  it('says it is muted, and that pressing unmutes', () => {
    mute.muted = true;
    render(<MuteButton target={thread} what="this conversation" />);
    const button = screen.getByRole('button', {
      name: 'Notifications from this conversation are muted. Press to unmute.',
    });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('Muted');
  });

  it('cannot be pressed twice while it works', () => {
    mute.muted = false;
    mute.busy = true;
    render(<MuteButton target={thread} what="this conversation" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows a failure as an alert', () => {
    mute.muted = false;
    mute.error = 'It was not muted.';
    render(<MuteButton target={thread} what="this conversation" />);
    expect(screen.getByRole('alert')).toHaveTextContent('It was not muted.');
  });
});
