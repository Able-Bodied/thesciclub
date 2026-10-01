import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReportControl } from '@/routes/chat/report-control';

/** Report, then "Reported", and where focus is when one becomes the other. */

const props = {
  label: "Report Jan's post",
  buttonClassName: '',
  noteClassName: '',
};

describe('ReportControl', () => {
  it('is a button named for what it reports, until it is reported', async () => {
    const onReport = vi.fn();
    render(<ReportControl {...props} reported={false} onReport={onReport} />);
    await userEvent.click(screen.getByRole('button', { name: "Report Jan's post" }));
    expect(onReport).toHaveBeenCalledOnce();
  });

  it('says Reported, as words and not a disabled button', () => {
    render(<ReportControl {...props} reported onReport={vi.fn()} />);
    expect(screen.getByText('Reported').tagName).toBe('P');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts focus on Reported when it replaces a Report pressed here', async () => {
    const { rerender } = render(<ReportControl {...props} reported={false} onReport={vi.fn()} />);
    const report = screen.getByRole('button', { name: "Report Jan's post" });
    await userEvent.click(report);
    // The sheet has closed and given focus back to Report; the reports are
    // read again and Report comes off the page.
    report.focus();
    rerender(<ReportControl {...props} reported onReport={vi.fn()} />);
    expect(screen.getByText('Reported')).toHaveFocus();
  });

  it('does not take focus when a screen opens on something already reported', () => {
    const { rerender } = render(<ReportControl {...props} reported={false} onReport={vi.fn()} />);
    // The reports arrive after the posts: false, then true, nobody pressed it.
    rerender(<ReportControl {...props} reported onReport={vi.fn()} />);
    expect(screen.getByText('Reported')).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('does not take focus from somewhere the member has moved it to', async () => {
    const { rerender } = render(
      <>
        <ReportControl {...props} reported={false} onReport={vi.fn()} />
        <button type="button">Reply to Bo's post</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: "Report Jan's post" }));
    screen.getByRole('button', { name: "Reply to Bo's post" }).focus();
    rerender(
      <>
        <ReportControl {...props} reported onReport={vi.fn()} />
        <button type="button">Reply to Bo's post</button>
      </>,
    );
    expect(screen.getByRole('button', { name: "Reply to Bo's post" })).toHaveFocus();
  });
});
