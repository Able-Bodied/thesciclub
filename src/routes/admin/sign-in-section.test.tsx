import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import { appleHealth } from '@/routes/admin/sign-in-health';
import { SignInSection } from '@/routes/admin/sign-in-section';

const renew = vi.hoisted(() => vi.fn());
vi.mock('@/routes/admin/sign-in-health', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  renewAppleSecret: renew,
}));

// Read on its own (apple-notices.test.tsx); here it stands in.
vi.mock('@/routes/admin/apple-notices', () => ({
  AppleNotices: () => <p>Apple's notices</p>,
}));

function renderSection(health = appleHealth(true, '2027-04-09', '2027-03-20')) {
  const onRenewed = vi.fn();
  render(
    <AnnounceProvider>
      <SignInSection health={health} onRenewed={onRenewed} />
    </AnnounceProvider>,
  );
  return onRenewed;
}

beforeEach(() => {
  renew.mockReset();
});

describe('the Sign-in tab', () => {
  it('says first that Apple needs renewing, and how', () => {
    renderSection();
    expect(
      screen.getByText(/runs out in 20 days, on April 9, 2027\. Renew it now\./),
    ).toBeInTheDocument();
    expect(screen.getByText('node scripts/apple-secret.mjs')).toBeInTheDocument();
  });

  it('saves the new date and reads the tab again', async () => {
    renew.mockResolvedValue({ ok: true });
    const onRenewed = renderSection();
    const date = screen.getByLabelText('New secret runs out on');
    await userEvent.clear(date);
    await userEvent.type(date, '2027-09-30');
    await userEvent.click(screen.getByRole('button', { name: 'Save the new date' }));
    expect(renew).toHaveBeenCalledWith('2027-09-30');
    expect(onRenewed).toHaveBeenCalled();
  });

  it('says why a date was refused', async () => {
    renew.mockResolvedValue({ ok: false, error: 'The date should be in the next six months.' });
    const onRenewed = renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Save the new date' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('in the next six months');
    expect(onRenewed).not.toHaveBeenCalled();
  });
});
