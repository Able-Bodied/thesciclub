import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccessibilityProvider } from '@/lib/accessibility';
import { AccessibilitySettings } from '@/routes/me/accessibility-settings';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-appearance');
});

function renderSettings() {
  render(
    <AccessibilityProvider>
      <AccessibilitySettings />
    </AccessibilityProvider>,
  );
  return within(screen.getByRole('group', { name: 'Appearance' }));
}

describe('Appearance, on Me → Display', () => {
  it('offers Match my device, Light and Dark, with Match my device chosen', () => {
    const appearance = renderSettings();
    expect(appearance.getByRole('button', { name: 'Match my device' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(appearance.getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(appearance.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('turns the club dark at once, with no Save', async () => {
    const appearance = renderSettings();
    await userEvent.click(appearance.getByRole('button', { name: 'Dark' }));
    expect(appearance.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.dataset.appearance).toBe('dark');
  });

  it('goes back to the phone’s choice with Reset to my device settings', async () => {
    const appearance = renderSettings();
    await userEvent.click(appearance.getByRole('button', { name: 'Light' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset to my device settings' }));
    expect(document.documentElement.dataset.appearance).toBe('system');
  });
});
