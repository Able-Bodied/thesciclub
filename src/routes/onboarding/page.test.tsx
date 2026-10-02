import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
  /** What each submit answers, in turn; ok when the list runs out. */
  submitResults: [] as { ok: boolean; error?: string; photoRefused?: boolean }[],
  status: 'signed-out',
  /** Null is the club unable to send, which is the default for these tests. */
  vapidKey: null as string | null,
  notificationState: 'off',
  /** What had focus when the code was asked for: see `keyboardHold`. */
  focusedAtSend: null as Element | null,
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
    return Promise.resolve(calls.submitResults.shift() ?? { ok: true });
  },
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: calls.status, userId: null, isAdmin: false, displayName: null }),
}));

// The device and the push service are the network; the screen's own choices
// are what is tested here. See notifications-step.tsx.
vi.mock('@/lib/push/notifications', () => ({
  vapidPublicKey: () => calls.vapidKey,
  useDeviceNotifications: () => ({
    state: calls.notificationState,
    busy: false,
    error: null,
    turnOn: () => {
      calls.order.push('turnOn');
    },
    turnOff: () => undefined,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithOtp: () => {
        calls.order.push('signInWithOtp');
        calls.focusedAtSend = document.activeElement;
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

// Real routes, so a test can see where somebody lands: Home, since step 5
// of HANDOFF.md "What Home is". Until then it was Peers.
function renderJoin() {
  return render(
    <MemoryRouter initialEntries={['/join']}>
      <Routes>
        <Route path="/join" element={<OnboardingPage />} />
        <Route path="/home" element={<h1>Home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Ticks both boxes on the phone step: no code is sent without them. */
async function agree() {
  await userEvent.click(screen.getByRole('checkbox', { name: /Text me a one-time sign-in code/ }));
  await userEvent.click(screen.getByRole('checkbox', { name: /I agree to the Terms of Service/ }));
}

async function reachCodeStep() {
  renderJoin();
  await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
  await agree();
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
  calls.submitResults = [];
  calls.status = 'signed-out';
  calls.vapidKey = null;
  calls.notificationState = 'off';
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
    await agree();
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
    await waitFor(() => {
      expect(calls.order).toEqual([
        'signInWithOtp',
        'verifyOtp',
        'members.self',
        'my_invite_status',
      ]);
    });
  });

  it('shows the closed door when the verified number is not on the list', async () => {
    calls.invited = false;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
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
    expect(await screen.findByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.queryByText('Wheel with Me Foundation')).not.toBeInTheDocument();
  });

  it('lets somebody turned away try a different number', async () => {
    calls.invited = false;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.click(await screen.findByRole('button', { name: 'Try another number' }));
    expect(screen.getByPlaceholderText('(408) 555-0112')).toBeInTheDocument();
  });

  it('goes on to the questions when the number is on the list', async () => {
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    expect(await screen.findByText(/What should people call you/i)).toBeInTheDocument();
  });

  // GoTrue's wording for a wrong or stale code, verbatim. A person reads a
  // sentence about the code, not one about a token.
  it('surfaces a verification failure as a sentence instead of advancing', async () => {
    calls.verifyError = 'Token has expired or is invalid';
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    expect(
      await screen.findByText('That code is not right, or it has expired. Ask for a new one.'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('does not consult the invite list when the code itself fails', async () => {
    calls.verifyError = 'bad code';
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
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
    // The invite list is not consulted for somebody who has already joined.
    await waitFor(() => {
      expect(calls.order).not.toContain('my_invite_status');
    });
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  // A member who opens /join again, or a suspended one sent here by
  // /profile, is not asked to join a club they are in.
  it('sends somebody already in the club on to Home', async () => {
    calls.status = 'member';
    renderJoin();
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('hands the questions to somebody who signed in but never finished joining', async () => {
    calls.existingMember = null;
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    expect(await screen.findByText(/What should people call you/i)).toBeInTheDocument();
  });
});

// The opt-in the carriers' text-message registration describes: two boxes,
// both unticked, the texts apart from the terms, and no code without both.
describe('agreeing to the texts', () => {
  const smsBox = () => screen.getByRole('checkbox', { name: /Text me a one-time sign-in code/ });
  const termsBox = () => screen.getByRole('checkbox', { name: /I agree to the Terms of Service/ });

  async function openPhone() {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
  }

  it('starts with both boxes unticked', async () => {
    await openPhone();
    expect(smsBox()).not.toBeChecked();
    expect(termsBox()).not.toBeChecked();
  });

  // Word for word what the registration quotes: a change here is a change there.
  it('says what the registration says', async () => {
    await openPhone();
    expect(smsBox()).toHaveAccessibleName(
      'Text me a one-time sign-in code from The SCI Club. One text each time I ask for a code. Message and data rates may apply. Reply HELP for help, STOP to opt out.',
    );
  });

  it('sends no code until both are ticked, and says why', async () => {
    await openPhone();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    expect(screen.getByText(/Both boxes need a tick/)).toBeInTheDocument();

    await userEvent.click(smsBox());
    expect(continueButton).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '{Enter}');
    expect(calls.order).toEqual([]);

    await userEvent.click(termsBox());
    expect(continueButton).toBeEnabled();
    expect(screen.queryByText(/Both boxes need a tick/)).toBeNull();
  });

  it('does not explain before there is a number to send to', async () => {
    await openPhone();
    expect(screen.queryByText(/Both boxes need a tick/)).toBeNull();
  });

  // In a new tab, so reading them does not lose the number and the ticks.
  it('links to the Terms and the Privacy Policy in a new tab', async () => {
    await openPhone();
    const terms = screen.getByRole('link', { name: /Terms of Service/ });
    const privacy = screen.getByRole('link', { name: /Privacy Policy/ });
    expect(terms).toHaveAttribute('href', '/terms');
    expect(privacy).toHaveAttribute('href', '/privacy');
    expect(terms).toHaveAttribute('target', '_blank');
    expect(privacy).toHaveAttribute('target', '_blank');
  });

  // The owner, 2026-10-01: one line on the sign-in door, and continuing past
  // it is the agreement.
  it('tells a returning member in one line instead of two boxes', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(
      screen.getByText(/By continuing, you agree to get a one-time sign-in code by text/),
    ).toHaveTextContent(
      'By continuing, you agree to get a one-time sign-in code by text from The SCI Club (Msg & data rates may apply; reply HELP for help, STOP to opt out) and to the Terms of Service (opens in a new tab) and Privacy Policy (opens in a new tab).',
    );
    expect(screen.getByRole('link', { name: /Terms of Service/ })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: /Privacy Policy/ })).toHaveAttribute(
      'href',
      '/privacy',
    );

    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('keeps the boxes for somebody who switches from signing in to joining', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: /Don't have an account yet/ }));
    expect(smsBox()).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
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
    await agree();
    const phone = screen.getByPlaceholderText('(408) 555-0112');
    await userEvent.type(phone, '4085550112{Enter}');
    expect(await screen.findByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('does nothing on Enter when the step is not finished', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    await agree();
    const phone = screen.getByPlaceholderText('(408) 555-0112');
    await userEvent.type(phone, '408555{Enter}');
    // Still on the number, and no code was requested.
    expect(screen.getByPlaceholderText('(408) 555-0112')).toBeInTheDocument();
    expect(calls.order).toEqual([]);
  });

  it('does not fire twice when the button itself is used', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    await agree();
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
    await screen.findByPlaceholderText('Alex');
    expect(screen.queryByRole('button', { name: /Finish later/ })).toBeNull();
  });

  async function reachBirthdayStep() {
    calls.invited = true;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.type(await screen.findByPlaceholderText('Alex'), 'Dana');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('When is your birthday?');
  }

  // Name and age are the two a row cannot be written without, so the way out
  // appears the moment both are in rather than one Continue later.
  it('appears on the birthday step itself, once the date is a real one', async () => {
    await reachBirthdayStep();
    expect(screen.queryByRole('button', { name: /Finish later/ })).toBeNull();

    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    fireEvent.change(input, { target: { value: '1990-04-02' } });

    expect(await screen.findByRole('button', { name: /Finish later/ })).toBeInTheDocument();
  });

  // Skipping with an empty or under-age date would write a row the database
  // refuses, and the refusal would arrive as a sentence about a trigger.
  it('stays hidden for a birthday the club cannot accept', async () => {
    await reachBirthdayStep();
    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    fireEvent.change(input, { target: { value: '2020-01-01' } });

    expect(screen.queryByRole('button', { name: /Finish later/ })).toBeNull();
  });

  it('enters the club straight from the birthday', async () => {
    await reachBirthdayStep();
    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    fireEvent.change(input, { target: { value: '1990-04-02' } });
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));

    await waitFor(() => {
      expect(calls.submitted?.displayName).toBe('Dana');
    });
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
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });
});

describe('a photograph the club cannot hold', () => {
  const REFUSED = {
    ok: false,
    photoRefused: true,
    error: "That kind of file can't be used. Try a JPEG or PNG.",
  };

  beforeEach(() => {
    // jsdom has no object URLs; the step makes one for the preview.
    URL.createObjectURL = () => 'blob:preview';
  });

  async function reachPhoto() {
    calls.invited = true;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.type(await screen.findByPlaceholderText('Alex'), 'Dana');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const birthday = document.querySelector('#birthday');
    if (!(birthday instanceof HTMLInputElement)) throw new Error('no birthday input');
    fireEvent.change(birthday, { target: { value: '1990-04-02' } });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rather not say' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.selectOptions(await screen.findByLabelText('State'), 'CA');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Add a photo?');
  }

  async function choose(name = 'photo.heic') {
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no photograph input');
    await userEvent.upload(input, new File(['x'], name, { type: 'image/png' }));
  }

  it('names the photo control, and renames it once there is a photo', async () => {
    await reachPhoto();
    expect(screen.getByLabelText('Choose a photo')).toHaveAttribute('type', 'file');
    await choose();
    expect(screen.getByLabelText('Change the photo')).toHaveAttribute('type', 'file');
  });

  // The owner, 2026-09-30: stay on the photo step with the sentence.
  it('stays on the photo step and says why, without a preview of what was refused', async () => {
    calls.submitResults = [REFUSED];
    await reachPhoto();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Enter the club' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSED.error);
    expect(screen.getByText('Add a photo?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull();
    expect(document.querySelector('label img')).toBeNull();
  });

  it('still lets them in with Skip for now, without the photograph', async () => {
    calls.submitResults = [REFUSED];
    await reachPhoto();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Enter the club' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(calls.submitted?.photoFile).toBeNull();
  });

  // Skip used to `set` the file away and submit from the same render, which
  // still held it: the photograph it skipped went up anyway.
  it('skips a photograph that is chosen and never sent', async () => {
    await reachPhoto();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => {
      expect(calls.submitted).not.toBeNull();
    });
    expect(calls.submitted?.photoFile).toBeNull();
  });

  it('takes the sentence away when another photograph is chosen', async () => {
    calls.submitResults = [REFUSED];
    await reachPhoto();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Enter the club' }));
    await screen.findByRole('alert');
    await choose('another.png');

    expect(screen.queryByRole('alert')).toBeNull();
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
    expect(calls.submitted?.startFresh).toBe(false);
  });

  it('declines back to the name, carrying nothing across', async () => {
    calls.invited = true;
    calls.claimableId = ajay.id;
    calls.claimable = ajay;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await screen.findByText('Is this you?');

    await userEvent.click(screen.getByRole('button', { name: 'Start fresh' }));
    expect(await screen.findByText(/name/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Ajay')).toBeNull();
  });

  // The fine print says starting fresh removes the old profile. The trigger
  // copied it into the new row anyway until the insert said which button was
  // pressed (20261002000000), so the screen has to hand that on.
  it('tells the insert they started fresh, so none of the seed is copied', async () => {
    calls.invited = true;
    calls.claimableId = ajay.id;
    calls.claimable = ajay;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await screen.findByText('Is this you?');
    await userEvent.click(screen.getByRole('button', { name: 'Start fresh' }));

    await userEvent.type(await screen.findByPlaceholderText('Alex'), 'Sam');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const input = await waitFor(() => {
      const el = document.querySelector('#birthday');
      if (!(el instanceof HTMLInputElement)) throw new Error('no birthday input');
      return el;
    });
    fireEvent.change(input, { target: { value: '1990-04-02' } });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));

    await waitFor(() => {
      expect(calls.submitted?.displayName).toBe('Sam');
    });
    expect(calls.submitted?.startFresh).toBe(true);
  });

  // An invite with no claim on it must not stop to ask.
  it('goes straight to the name when there is nothing to claim', async () => {
    calls.invited = true;
    calls.claimableId = null;
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');

    expect(await screen.findByText(/name/i)).toBeInTheDocument();
    expect(screen.queryByText('Is this you?')).toBeNull();
    expect(calls.order).not.toContain('my_claimable_profile');
  });
});

// The owner, 2026-10-01: nothing that has already been answered should need a
// second press to move on.
describe('steps that move on by themselves', () => {
  async function reachInjuryStep() {
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.type(await screen.findByPlaceholderText('Alex'), 'Dana');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    fireEvent.change(input, { target: { value: '1990-04-02' } });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }

  it('verifies the code on the sixth digit, without Continue', async () => {
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '11111');
    expect(calls.order).not.toContain('verifyOtp');

    await userEvent.type(screen.getByPlaceholderText('000000'), '1');
    expect(await screen.findByText(/What should people call you/i)).toBeInTheDocument();
    expect(calls.order.filter((c) => c === 'verifyOtp')).toHaveLength(1);
  });

  it('moves on from the injury step when they would rather not say', async () => {
    await reachInjuryStep();
    await userEvent.click(await screen.findByRole('button', { name: 'Rather not say' }));
    expect(await screen.findByText('Where do you live?')).toBeInTheDocument();
  });

  it('offers rather not say for where they live, and moves on to the photograph', async () => {
    await reachInjuryStep();
    await userEvent.click(await screen.findByRole('button', { name: 'Rather not say' }));
    await screen.findByText('Where do you live?');
    await userEvent.click(screen.getByRole('button', { name: 'Rather not say' }));

    expect(await screen.findByText('Add a photo?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => {
      expect(calls.submitted?.declined).toEqual(['exactLevel', 'injuryDate', 'city', 'state']);
    });
    expect(calls.submitted?.state).toBe('');
  });
});

describe('notifications, as they enter', () => {
  async function finishLater() {
    await reachCodeStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '111111');
    await userEvent.type(await screen.findByPlaceholderText('Alex'), 'Dana');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const input = document.querySelector('#birthday');
    if (!(input instanceof HTMLInputElement)) throw new Error('no birthday input');
    fireEvent.change(input, { target: { value: '1990-04-02' } });
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));
  }

  it('asks somebody who pressed Finish later, and Not now goes to Home', async () => {
    calls.vapidKey = 'key';
    await finishLater();
    expect(await screen.findByText('Turn on notifications?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(calls.order).not.toContain('turnOn');
  });

  it('asks the device when they say yes', async () => {
    calls.vapidKey = 'key';
    await finishLater();
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(calls.order).toContain('turnOn');
  });

  it('says how on an iPhone that has not added the club to its Home Screen', async () => {
    calls.vapidKey = 'key';
    calls.notificationState = 'install';
    await finishLater();
    expect(await screen.findByText('Get notifications on your iPhone')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('does not ask a device that has already answered', async () => {
    calls.vapidKey = 'key';
    calls.notificationState = 'refused';
    await finishLater();
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText('Turn on notifications?')).toBeNull();
  });

  it('does not ask while the club cannot send', async () => {
    await finishLater();
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText('Turn on notifications?')).toBeNull();
  });
});

// iOS opens the number pad only for a focus inside a tap. The tap on Continue
// focuses a hidden numeric field before the code is asked for, and the code
// field takes focus over from it, which keeps the pad open (the owner,
// 2026-10-01). jsdom has no keyboard; what it can show is where focus is.
describe('the number pad stays open into the code', () => {
  it('holds focus in a numeric field while the code is sent, then gives it to the code box', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    await agree();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const held = calls.focusedAtSend;
    expect(held).toBeInstanceOf(HTMLInputElement);
    expect((held as HTMLInputElement).inputMode).toBe('numeric');
    expect((held as HTMLInputElement).getAttribute('aria-hidden')).toBe('true');
    expect(await screen.findByPlaceholderText('000000')).toHaveFocus();
  });

  it('gives focus back to the number when the code is not sent', async () => {
    calls.otpError = 'Error sending sms';
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    await agree();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByRole('alert');
    expect(screen.getByPlaceholderText('(408) 555-0112')).toHaveFocus();
  });
});
