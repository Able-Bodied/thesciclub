import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import { type AppleHealth, appleHealth } from '@/routes/admin/sign-in-health';
import { SignInSection } from '@/routes/admin/sign-in-section';

// Each read on its own (apple-notices.test.tsx, renewals-section.test.tsx); here they stand in.
vi.mock('@/routes/admin/apple-notices', () => ({
  AppleNotices: () => <p>Apple's notices</p>,
}));
vi.mock('@/routes/admin/renewals-section', () => ({
  RenewalsSection: () => <p>The renewals</p>,
}));

function renderSection(health: AppleHealth | null = appleHealth(true, '2027-04-09', '2027-03-20')) {
  render(
    <AnnounceProvider>
      <SignInSection
        health={health}
        renewals={{ renewals: [], error: null }}
        onRenewed={() => undefined}
      />
    </AnnounceProvider>,
  );
}

describe('the Keys & renewals tab', () => {
  it('says first that Apple needs renewing, and where the steps are', () => {
    renderSection();
    expect(
      screen.getByText(/runs out in 20 days, on April 9, 2027\. Renew it now\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/How to renew it is under Renewals, below\./)).toBeInTheDocument();
    expect(screen.getByText('The renewals')).toBeInTheDocument();
    expect(screen.getByText("Apple's notices")).toBeInTheDocument();
  });

  it('shows the renewals while Apple is still being checked', () => {
    renderSection(null);
    expect(screen.getByText('Checking Apple sign-in…')).toBeInTheDocument();
    expect(screen.getByText('The renewals')).toBeInTheDocument();
  });
});
