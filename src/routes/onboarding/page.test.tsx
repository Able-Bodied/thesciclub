import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The order of the first three screens is the security property worth testing:
 * the number is verified before the club says whether it is on the list, so a
 * caller can only learn about a number they control.
 */

const calls = vi.hoisted(() => ({
  order: [] as string[],
  otpError: null as string | null,
  verifyError: null as string | null,
  invited: true,
  claimableId: null as string | null,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'signed-out', userId: null, isAdmin: false, displayName: null }),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithOtp: () => {
        calls.order.push('signInWithOtp');
        return Promise.resolve({ error: calls.otpError ? { message: calls.otpError } : null });
      },
      verifyOtp: () => {
        calls.order.push('verifyOtp');
        return Promise.resolve({
          error: calls.verifyError ? { message: calls.verifyError } : null,
        });
      },
    },
    rpc: () => {
      calls.order.push('my_invite_status');
      return {
        single: () =>
          Promise.resolve({
            data: { invited: calls.invited, claimable_member_id: calls.claimableId },
            error: null,
          }),
      };
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  }),
}));

const { default: OnboardingPage } = await import('@/routes/onboarding/page');

function renderJoin() {
  return render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
}

async function reachCodeStep() {
  renderJoin();
  await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
  await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  calls.order = [];
  calls.otpError = null;
  calls.verifyError = null;
  calls.invited = true;
  calls.claimableId = null;
});

describe('joining', () => {
  it('starts on the welcome screen, not on a form', () => {
    renderJoin();
    expect(screen.getByRole('button', { name: 'Join the club' })).toBeInTheDocument();
    // The logo carries "MEMBERS ONLY" too, so match the footer line whole.
    expect(
      screen.getByText(/Members only\. Nothing inside the club is public\./),
    ).toBeInTheDocument();
  });

  it('will not send a code until there are ten digits', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '408555');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '0112');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('never asks about the invite list before the number is verified', async () => {
    await reachCodeStep();
    // The code has been sent; the list has not been consulted.
    expect(calls.order).toEqual(['signInWithOtp']);
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(calls.order).toEqual(['signInWithOtp', 'verifyOtp', 'my_invite_status']);
  });

  it('shows the closed door when the verified number is not on the list', async () => {
    calls.invited = false;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/isn't on the list/i)).toBeInTheDocument();
    // And it says who can open it, rather than being a dead end.
    expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
  });

  it('lets somebody turned away try a different number', async () => {
    calls.invited = false;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try another number' }));
    expect(screen.getByPlaceholderText('(408) 555-0112')).toBeInTheDocument();
  });

  it('goes on to the questions when the number is on the list', async () => {
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/What should people call you/i)).toBeInTheDocument();
  });

  it('surfaces a verification failure instead of advancing', async () => {
    calls.verifyError = 'Token has expired or is invalid';
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Token has expired or is invalid')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('does not consult the invite list when the code itself fails', async () => {
    calls.verifyError = 'bad code';
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(calls.order).not.toContain('my_invite_status');
  });
});

describe('the welcome screen', () => {
  it('shows the club mark', () => {
    renderJoin();
    expect(screen.getByRole('img', { name: 'The SCI Club' })).toBeInTheDocument();
  });
});
