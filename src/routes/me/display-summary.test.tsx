import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DisplaySheetProvider } from '@/components/display-sheet';
import { AccessibilityProvider } from '@/lib/accessibility';
import { DisplaySummary } from '@/routes/me/display-summary';

beforeEach(() => {
  localStorage.clear();
});

/** The value beside a name in the summary, not the sheet. */
const shown = (name: string) =>
  within(screen.getByRole('region', { name: 'Display' })).getByText(name).nextSibling;

function renderSummary() {
  render(
    <AccessibilityProvider>
      <DisplaySheetProvider>
        <DisplaySummary />
      </DisplaySheetProvider>
    </AccessibilityProvider>,
  );
}

// The owner, 2026-10-28: Display on Me → Settings was too long; a button opens it.
describe('Display on Me → Settings', () => {
  it('says what is set, and changes as the sheet changes it', async () => {
    const user = userEvent.setup();
    renderSummary();
    expect(shown('Text size')).toHaveTextContent('Normal');
    expect(shown('Also on')).toHaveTextContent('Nothing else');
    expect(screen.queryByRole('group', { name: 'Text size' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Change display settings' }));
    const sheet = screen.getByRole('dialog', { name: 'Display' });
    const size = within(within(sheet).getByRole('group', { name: 'Text size' }));
    await user.click(size.getByRole('button', { name: 'Larger' }));
    const contrast = within(within(sheet).getByRole('group', { name: 'Higher contrast' }));
    await user.click(contrast.getByRole('button', { name: 'On' }));

    expect(shown('Text size')).toHaveTextContent('Larger');
    expect(shown('Also on')).toHaveTextContent('Higher contrast');
  });
});
