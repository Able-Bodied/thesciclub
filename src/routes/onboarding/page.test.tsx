import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  claimable: null as Record<string, unknown> | null,
  existingMember: null as { id: string } | null,
  submitted: null as Record<string, unknown> | null,
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

// The insert itself is covered by submit-onboarding's own reasoning; what
// this file cares about is which answers reach it.
vi.mock('@/routes/onboarding/submit-onboarding', () => ({
  submitOnboarding: (data: Record<string, unknown>) => {
    calls.submitted = data;
    return Promise.resolve({ ok: true });
  },
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
    // Switched on the name, because the two calls answer different
    // questions. The previous mock ignored it and always resolved the
    // claimable profile to null — which is exactly what the real
    // `browse_members` did to somebody who is not a member yet, so the
    // broken behaviour was baked into the fixture and no test could see it.
    rpc: (name: string) => {
      calls.order.push(name);
      if (name === 'my_claimable_profile') {
        return { maybeSingle: () => Promise.resolve({ data: calls.claimable, error: null }) };
      }
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
        maybeSingle: () => {
          calls.order.push('members.self');
          return Promise.resolve({ data: calls.existingMember });
        },
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
  calls.claimable = null;
  calls.submitted = null;
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

describe('the keyboard', () => {
  it('advances a step on Enter, not only on the button', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    const phone = screen.getByPlaceholderText('(408) 555-0112');
    await userEvent.type(phone, '4085550112{Enter}');
    expect(await screen.findByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('does nothing on Enter when the step is not finished', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    const phone = screen.getByPlaceholderText('(408) 555-0112');
    await userEvent.type(phone, '408555{Enter}');
    // Still on the number, and no code was requested.
    expect(screen.getByPlaceholderText('(408) 555-0112')).toBeInTheDocument();
    expect(calls.order).toEqual([]);
  });

  it('does not fire twice when the button itself is used', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByPlaceholderText('000000');
    expect(calls.order.filter((c) => c === 'signInWithOtp')).toHaveLength(1);
  });
});

describe('finishing later', () => {
  async function reachInjury() {
    calls.invited = true;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(await screen.findByPlaceholderText('Alex'), 'Dana');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    fireEvent.change(input, { target: { value: '1990-04-02' } });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }

  // The club is 18+ and a row needs a name, so those two stay required. Past
  // them the schema allows every answer to be absent, and Me is where they
  // get filled in.
  it('is not offered before the birthday is answered', async () => {
    calls.invited = true;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByPlaceholderText('Alex');
    expect(screen.queryByRole('button', { name: /Finish later/ })).toBeNull();
  });

  it('is offered from the step after the birthday', async () => {
    await reachInjury();
    expect(await screen.findByRole('button', { name: /Finish later/ })).toBeInTheDocument();
  });

  it('enters the club with what was answered so far', async () => {
    await reachInjury();
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));
    await waitFor(() => {
      expect(calls.submitted?.displayName).toBe('Dana');
    });
    // Unanswered, and left that way rather than guessed at.
    expect(calls.submitted?.exactLevel).toBeNull();
    expect(calls.submitted?.state).toBe('');
  });
});

describe('claiming a seeded profile', () => {
  const ajay = {
    id: 'c85c10bf-0226-394f-8c91-2a2ffc40a147',
    display_name: 'Ajay',
    photo_path: null,
    photo_alt: null,
    city: 'San Jose',
    state: 'CA',
    level_range: 'C5–C8',
    exact_level: 'C7',
    completeness: 'Incomplete',
    affiliations: ['NorCal SCI'],
  };

  // The bug: this step never appeared. The profile was read from
  // `browse_members`, which requires the viewer to be an active member, and
  // somebody part-way through onboarding is not one — so it resolved to
  // nothing, the claim was skipped, and the seeded row was retired anyway in
  // exchange for a prompt nobody saw.
  it('asks "is this you?" before asking for a name', async () => {
    calls.invited = true;
    calls.claimableId = ajay.id;
    calls.claimable = ajay;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Is this you?')).toBeInTheDocument();
    expect(screen.getByText('Ajay')).toBeInTheDocument();
    expect(screen.getByText(/San Jose/)).toBeInTheDocument();
    expect(screen.getByText(/NorCal SCI/)).toBeInTheDocument();
  });

  // The point of claiming: the organization has already answered the name,
  // the level, the completeness and the place, so the only question left is
  // the one a claim cannot supply. Walking somebody through five screens to
  // retype their own profile is what this replaces.
  it('asks only for a birthday, then lets them in', async () => {
    calls.invited = true;
    calls.claimableId = ajay.id;
    calls.claimable = ajay;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Is this you?');

    await userEvent.click(screen.getByRole('button', { name: "Yes, that's me" }));
    expect(await screen.findByText('When is your birthday?')).toBeInTheDocument();

    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    fireEvent.change(input, { target: { value: '1990-04-02' } });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // And from the next screen they are one link away from the club, with
    // the claimed name on the row rather than one they retyped.
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));
    await waitFor(() => {
      expect(calls.submitted?.displayName).toBe('Ajay');
    });
  });

  it('declines back to the name, carrying nothing across', async () => {
    calls.invited = true;
    calls.claimableId = ajay.id;
    calls.claimable = ajay;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Is this you?');

    await userEvent.click(screen.getByRole('button', { name: 'Start fresh' }));
    expect(await screen.findByText(/name/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Ajay')).toBeNull();
  });

  // An invite with no claim on it must not stop to ask.
  it('goes straight to the name when there is nothing to claim', async () => {
    calls.invited = true;
    calls.claimableId = null;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/name/i)).toBeInTheDocument();
    expect(screen.queryByText('Is this you?')).toBeNull();
    expect(calls.order).not.toContain('my_claimable_profile');
  });
});
