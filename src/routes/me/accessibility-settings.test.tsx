import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccessibilityProvider } from '@/lib/accessibility';
import { DisplayControls } from '@/routes/me/accessibility-settings';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-appearance');
});

function renderAll() {
  render(
    <AccessibilityProvider>
      <DisplayControls />
    </AccessibilityProvider>,
  );
}

function renderSettings() {
  render(
    <AccessibilityProvider>
      <DisplayControls />
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

describe('the settings added 2026-10-20', () => {
  it.each([
    ['Higher contrast', 'highContrast'],
    ['Easier-to-read text', 'readableText'],
    ['Underline links', 'underlineLinks'],
  ])('%s starts Off and turns on at once', async (title, attribute) => {
    renderAll();
    const row = within(screen.getByRole('group', { name: title }));
    expect(row.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(row.getByRole('button', { name: 'On' }));
    expect(row.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset[attribute]).toBe('on');
  });

  it('Reduce motion starts on Match my device and can be turned on', async () => {
    renderAll();
    const row = within(screen.getByRole('group', { name: 'Reduce motion' }));
    expect(row.getByRole('button', { name: 'Match my device' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(row.getByRole('button', { name: 'On' }));
    expect(document.documentElement.dataset.reduceMotion).toBe('on');
  });

  it('reads a row’s hint with its name', () => {
    renderAll();
    expect(screen.getByRole('group', { name: 'Higher contrast' })).toHaveAccessibleDescription(
      'Darker words and clearer edges.',
    );
  });

  it('Reset turns them all off again', async () => {
    renderAll();
    const row = within(screen.getByRole('group', { name: 'Underline links' }));
    await userEvent.click(row.getByRole('button', { name: 'On' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset to my device settings' }));
    expect(document.documentElement.dataset.underlineLinks).toBe('off');
  });
});
