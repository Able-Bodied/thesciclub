import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DisplayButton, DisplaySheetProvider } from '@/components/display-sheet';
import { AccessibilityProvider } from '@/lib/accessibility';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-high-contrast');
});

function renderButton() {
  render(
    <AccessibilityProvider>
      <DisplaySheetProvider>
        <DisplayButton variant="round" />
      </DisplaySheetProvider>
    </AccessibilityProvider>,
  );
  return screen.getByRole('button', { name: 'Display settings' });
}

describe('the Display button', () => {
  it('opens the Display settings in a sheet, with its title focused', async () => {
    await userEvent.click(renderButton());
    const sheet = screen.getByRole('dialog', { name: 'Display' });
    expect(within(sheet).getByRole('heading', { name: 'Display' })).toHaveFocus();
    expect(within(sheet).getByRole('group', { name: 'Higher contrast' })).toBeInTheDocument();
  });

  it('changes a setting at once, from the sheet', async () => {
    await userEvent.click(renderButton());
    const row = within(screen.getByRole('group', { name: 'Higher contrast' }));
    await userEvent.click(row.getByRole('button', { name: 'On' }));
    expect(document.documentElement.dataset.highContrast).toBe('on');
  });

  it('closes with Done and gives focus back to the button', async () => {
    const button = renderButton();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes with Escape', async () => {
    await userEvent.click(renderButton());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
