import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReportSheet } from '@/routes/chat/report-sheet';

/**
 * Focus in the report sheet: on the title when it opens, round the note and
 * its two buttons, back on Report when it closes. What a report sends is the
 * topic and thread pages' tests.
 */

function Screen({ onSend }: { onSend: (note: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Report Jan's post
      </button>
      <button type="button">Reply to Jan's post</button>
      {open ? (
        <ReportSheet
          kind="post"
          onCancel={() => {
            setOpen(false);
          }}
          onSend={async (note) => {
            const said = await onSend(note);
            if (!said) setOpen(false);
            return said;
          }}
        />
      ) : null}
    </>
  );
}

async function openSheet(onSend = vi.fn().mockResolvedValue(null)) {
  const user = userEvent.setup();
  render(<Screen onSend={onSend} />);
  await user.click(screen.getByRole('button', { name: "Report Jan's post" }));
  return user;
}

describe('ReportSheet focus', () => {
  it('is named by its title, and the title has focus when it opens', async () => {
    await openSheet();
    expect(screen.getByRole('dialog', { name: 'Report this post' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Report this post' })).toHaveFocus();
  });

  it('takes the next Tab to the note, then Cancel, then Send report', async () => {
    const user = await openSheet();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Anything to add' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveFocus();
  });

  it('goes round, never to the post behind it', async () => {
    const user = await openSheet();
    screen.getByRole('button', { name: 'Send report' }).focus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Anything to add' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveFocus();
  });

  it('leaves the backdrop out of the Tab order', async () => {
    await openSheet();
    expect(screen.getByRole('button', { name: 'Close without reporting' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('puts focus back on Report after Cancel, and after Escape', async () => {
    const user = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: "Report Jan's post" })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: "Report Jan's post" }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: "Report Jan's post" })).toHaveFocus();
  });

  it('stays open with the note when sending fails, focus still inside', async () => {
    const user = await openSheet(vi.fn().mockResolvedValue('The club is being updated.'));
    await user.type(screen.getByRole('textbox', { name: 'Anything to add' }), 'In a message to me');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The club is being updated.');
    expect(screen.getByRole('textbox', { name: 'Anything to add' })).toHaveValue(
      'In a message to me',
    );
    await user.tab();
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
  });
});
