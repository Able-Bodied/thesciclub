import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationState } from '@/lib/push/notifications';
import { NotificationSettings } from '@/routes/me/notification-settings';

const hook = vi.hoisted(() => ({
  state: null as NotificationState | null,
  error: null as string | null,
  busy: false,
  turnedOn: 0,
  turnedOff: 0,
}));

vi.mock('@/lib/push/notifications', () => ({
  useDeviceNotifications: () => ({
    state: hook.state,
    error: hook.error,
    busy: hook.busy,
    turnOn: () => {
      hook.turnedOn++;
    },
    turnOff: () => {
      hook.turnedOff++;
    },
  }),
}));

beforeEach(() => {
  hook.state = null;
  hook.error = null;
  hook.busy = false;
  hook.turnedOn = 0;
  hook.turnedOff = 0;
});

describe('NotificationSettings', () => {
  // Null is both "the club cannot send yet" and "still reading". Neither may
  // draw a control: the first would do nothing, the second is about to change.
  it('draws nothing while there is no state', () => {
    const { container } = render(<NotificationSettings userId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says how to add the club to the Home Screen, and offers no button', () => {
    hook.state = 'install';
    render(<NotificationSettings userId="u1" />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says which iOS is needed when the installed app still cannot', () => {
    hook.state = 'unsupported';
    render(<NotificationSettings userId="u1" />);
    expect(screen.getByText(/iOS 16\.4 or later/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('turns on from off', async () => {
    hook.state = 'off';
    render(<NotificationSettings userId="u1" />);
    expect(screen.getByText('Off on this device.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(hook.turnedOn).toBe(1);
  });

  it('turns off from on', async () => {
    hook.state = 'on';
    render(<NotificationSettings userId="u1" />);
    expect(screen.getByText('On for this device.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(hook.turnedOff).toBe(1);
  });

  // The system will not ask again, so a button would do nothing.
  it('says where in Settings a refusal is changed, and offers no button', () => {
    hook.state = 'refused';
    render(<NotificationSettings userId="u1" />);
    expect(screen.getByText(/open Settings, then Notifications/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // The state sentence is what answers the button, so it must be announced.
  it('speaks a change of state', () => {
    hook.state = 'on';
    render(<NotificationSettings userId="u1" />);
    expect(screen.getByText('On for this device.')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a failure as an alert', () => {
    hook.state = 'off';
    hook.error = 'Notifications were not turned on.';
    render(<NotificationSettings userId="u1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Notifications were not turned on.');
  });

  it('cannot be pressed twice while it works', () => {
    hook.state = 'off';
    hook.busy = true;
    render(<NotificationSettings userId="u1" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
