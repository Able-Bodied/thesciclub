import { render, screen, waitFor } from '@testing-library/react';
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
  existingMember: null as { id: string } | null,
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations: [
      {
        id: 'ncs',
        shortCode: 'NCS',
        name: 'NorCal SCI',
        city: 'Northern California',
        description: 'Peer mentoring, support groups and a regional events calendar.',
        tags: [],
        canInvite: true,
        logoPath: null,
      },
      {
        id: 'wwm',
        shortCode: 'WWM',
        name: 'Wheel with Me Foundation',
        city: 'East Bay',
        description: 'Grants and adaptive sport programming.',
        tags: [],
        canInvite: false,
        logoPath: null,
      },
    ],
    byId: new Map(),
    loading: false,
    error: null,
  }),
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
      select: () => ({
        // Used two ways: without a filter to ask "do I already have a profile",
        // and with .eq(id) to read a claimable one.
        maybeSingle: () => {
          calls.order.push('members.self');
          return Promise.resolve({ data: calls.existingMember });
        },
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
      }),
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
  calls.existingMember = null;
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
    expect(calls.order).toEqual(['signInWithOtp', 'verifyOtp', 'members.self', 'my_invite_status']);
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

  it('names only the organizations that can actually add a number', async () => {
    // This screen used to hardcode three. Naming a body that cannot add
    // somebody sends a newly injured person to the wrong place, at the worst
    // possible moment to be sent to the wrong place.
    calls.invited = false;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.queryByText('Wheel with Me Foundation')).not.toBeInTheDocument();
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

  it('offers both doors', () => {
    renderJoin();
    expect(screen.getByRole('button', { name: 'Join the club' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeInTheDocument();
  });
});

describe('the two doors', () => {
  const openSignIn = async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
  };

  it('greets a returning member differently', async () => {
    await openSignIn();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.queryByText(/vouched for/)).not.toBeInTheDocument();
  });

  it('lets somebody who picked the wrong door switch without starting over', async () => {
    await openSignIn();
    await userEvent.click(screen.getByRole('button', { name: /Don't have an account yet/ }));
    expect(screen.getByText("What's your number?")).toBeInTheDocument();
    // And back again.
    await userEvent.click(screen.getByRole('button', { name: /Already a member/ }));
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('keeps the number typed when switching doors', async () => {
    await openSignIn();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: /Don't have an account yet/ }));
    expect(screen.getByPlaceholderText('(408) 555-0112')).toHaveValue('(408) 555-0112');
  });

  it('lets an existing member straight in, even through the Join door', async () => {
    calls.existingMember = { id: 'u1' };
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // The invite list is not consulted for somebody who has already joined.
    await waitFor(() => {
      expect(calls.order).not.toContain('my_invite_status');
    });
  });

  it('hands the questions to somebody who signed in but never finished joining', async () => {
    calls.existingMember = null;
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/What should people call you/i)).toBeInTheDocument();
  });
});

describe('the club is adults only', () => {
  const yearsAgo = (n: number) => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString().slice(0, 10);
  };

  async function reachBirthday() {
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/What should people call you/i);
    await userEvent.type(screen.getByPlaceholderText('Alex'), 'Sam');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('When is your birthday?');
  }

  it('says up front that the club is 18+', async () => {
    await reachBirthday();
    expect(screen.getByText(/The club is 18\+/)).toBeInTheDocument();
  });

  it('explains rather than just disabling, when the date is under 18', async () => {
    await reachBirthday();
    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    await userEvent.clear(input);
    await userEvent.type(input, yearsAgo(15));
    expect(await screen.findByText(/The SCI Club is for adults/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('lets an adult through, and shows the age it will publish', async () => {
    await reachBirthday();
    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    await userEvent.clear(input);
    await userEvent.type(input, yearsAgo(30));
    expect(await screen.findByText(/never your birthday/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });
});
