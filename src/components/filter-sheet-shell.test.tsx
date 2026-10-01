import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';

/**
 * Focus in the sheet every filter screen uses: on the title when it opens,
 * round its own buttons while it is open, back on the opener when it closes.
 */

function Screen({ clearCount = 0 }: { clearCount?: number }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);
  return (
    <>
      <button type="button">Before</button>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Filters
      </button>
      <button type="button">After</button>
      {open ? (
        <FilterSheetShell
          title="Filter your feed"
          summary="3 of 9 match"
          onClose={() => {
            setOpen(false);
          }}
          onClear={() => undefined}
          clearCount={clearCount}
          applyLabel="Show 3"
        >
          <FilterGroup title="Rooms">
            <FilterChip
              label="Bowel management"
              on={on}
              onClick={() => {
                setOn(!on);
              }}
            />
            <FilterChip label="Adaptive sport" on={false} onClick={() => undefined} />
          </FilterGroup>
        </FilterSheetShell>
      ) : null}
    </>
  );
}

async function openSheet(clearCount = 0) {
  const user = userEvent.setup();
  render(<Screen clearCount={clearCount} />);
  await user.click(screen.getByRole('button', { name: 'Filters' }));
  return user;
}

describe('FilterSheetShell focus', () => {
  it('is named by its title, and the title has focus when it opens', async () => {
    await openSheet();
    const dialog = screen.getByRole('dialog', { name: 'Filter your feed' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filter your feed' })).toHaveFocus();
  });

  it('takes the next Tab to the first chip, not the page behind', async () => {
    const user = await openSheet();
    await user.tab();
    // The panel's Close comes first in the sheet; jsdom draws it, as a wide
    // screen does.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Bowel management' })).toHaveFocus();
  });

  it('goes round: Tab from Show comes back to the top of the sheet', async () => {
    const user = await openSheet(1);
    screen.getByRole('button', { name: 'Show 3' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('goes round backwards: Shift+Tab from the title is Show', async () => {
    const user = await openSheet();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Show 3' })).toHaveFocus();
  });

  it('skips Clear while there is nothing to clear', async () => {
    const user = await openSheet(0);
    screen.getByRole('button', { name: 'Adaptive sport' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show 3' })).toHaveFocus();
  });

  it('leaves the backdrop out of the Tab order', async () => {
    await openSheet();
    expect(screen.getByRole('button', { name: 'Close filters' })).toHaveAttribute('tabindex', '-1');
  });

  it('puts focus back on the button that opened it, by Show, Close or Escape', async () => {
    const user = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Show 3' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus();
  });

  it('keeps focus where it is while a chip is pressed', async () => {
    const user = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Bowel management' }));
    expect(screen.getByRole('button', { name: 'Bowel management' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Bowel management' })).toHaveFocus();
  });
});
