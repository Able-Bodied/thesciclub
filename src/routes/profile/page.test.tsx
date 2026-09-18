import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type { Answers } from '@/routes/profile/questions';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const api = vi.hoisted(() => ({
  answers: {},
  saves: [] as { keys: string[]; answers: Answers }[],
  declined: new Set<string>(),
  declineSaves: [] as string[][],
  failWith: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
vi.mock('@/routes/profile/profile-api', () => ({
  loadAnswers: () =>
    Promise.resolve({ ok: true as const, answers: api.answers, declined: api.declined }),
  saveDeclined: (_userId: string, declined: ReadonlySet<string>) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.declined = new Set(declined);
    api.declineSaves.push([...api.declined]);
    return Promise.resolve({ ok: true });
  },
  saveAnswers: (_userId: string, keys: string[], answers: Answers) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.saves.push({ keys, answers });
    return Promise.resolve({ ok: true });
  },
}));

const { default: ProfileSurveyPage } = await import('@/routes/profile/page');

function renderSurvey() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfileSurveyPage />} />
        <Route path="/me" element={<p>The Me tab</p>} />
        <Route path="/join" element={<p>Welcome screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Advance one screen without answering. Skip rather than Continue, because
 *  both are on screen and only one of them is unambiguous. */
async function skip(times = 1) {
  for (let i = 0; i < times; i++) {
    await userEvent.click(screen.getByRole('button', { name: 'Skip this one' }));
  }
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Nicole' };
  api.answers = {};
  api.saves = [];
  api.declined = new Set();
  api.declineSaves = [];
  api.failWith = null;
});

describe('the profile survey', () => {
  it('sends a non-member to the welcome screen', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    renderSurvey();
    expect(await screen.findByText('Welcome screen')).toBeInTheDocument();
  });

  it('starts on the first screen and says where you are', async () => {
    renderSurvey();
    expect(await screen.findByText('About you')).toBeInTheDocument();
    expect(screen.getByText(/1 of 12/)).toBeInTheDocument();
  });

  it('resumes from what is already answered rather than starting blank', async () => {
    api.answers = { gender: 'Female', languages: ['English', 'Spanish'] };
    renderSurvey();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Female' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(screen.getByRole('button', { name: /Spanish/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves the screen as it is left, not everything at the end', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await userEvent.click(screen.getByRole('button', { name: 'Male' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(api.saves).toHaveLength(1);
    });
    expect(api.saves[0]?.keys).toEqual(['gender', 'languages']);
  });

  it('lets any question be skipped', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skip();
    expect(await screen.findByText('How it happened')).toBeInTheDocument();
  });

  it('advances a single-choice-only screen by itself once it is answered', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skip(6);
    // Education is two single-choice questions and nothing else.
    expect(await screen.findByText('Education')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Some college' }));
    await userEvent.click(screen.getByRole('button', { name: 'After' }));
    // No Continue tapped — the screen moves on by itself.
    expect(await screen.findByText('Work')).toBeInTheDocument();
  });

  it('does not advance a screen with a text answer on it', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skip();
    await screen.findByText('How it happened');
    await userEvent.type(screen.getByRole('textbox'), 'Car accident');
    // Still here: a person is not finished with prose until they say so.
    expect(screen.getByText('How it happened')).toBeInTheDocument();
  });

  it('stops at three interests rather than silently dropping one', async () => {
    api.answers = { interests: ['Travel', 'Cooking', 'Reading'] };
    renderSurvey();
    await screen.findByText('About you');
    await skip(8);
    expect(await screen.findByText('Interests')).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 chosen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Climbing' })).toBeDisabled();
  });

  it('asks when children arrived only once it knows there are any', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skip(4);
    expect(await screen.findByText('Family')).toBeInTheDocument();
    expect(screen.queryByText('Before or after your injury?')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(await screen.findByText('Before or after your injury?')).toBeInTheDocument();
  });

  it('does not eject you from a screen that was already answered when you arrived', async () => {
    api.answers = { education: 'Some college', educationWhen: 'After' };
    renderSurvey();
    await screen.findByText('About you');
    await skip(6);
    expect(await screen.findByText('Education')).toBeInTheDocument();
    // Both answers are already there. Without the arrival guard this screen
    // advances immediately and the answer can never be revised.
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByText('Education')).toBeInTheDocument();
  });

  it('lets you go back and change a single-choice answer', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skip(6);
    await screen.findByText('Education');
    await userEvent.click(screen.getByRole('button', { name: 'Some college' }));
    await userEvent.click(screen.getByRole('button', { name: 'After' }));
    await screen.findByText('Work');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Education')).toBeInTheDocument();
    // Still here after the auto-advance delay would have fired.
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByText('Education')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Bachelor's degree" }));
    expect(screen.getByRole('button', { name: "Bachelor's degree" })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('asks the mentoring question rather than treating an unset flag as a no', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skip(11);
    expect(await screen.findByText('Mentoring')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    // Still on it: nothing has been answered, so there is nothing to advance from.
    expect(screen.getByText('Mentoring')).toBeInTheDocument();
  });

  it('surfaces a save failure instead of pretending it moved on', async () => {
    api.failWith = 'permission denied';
    renderSurvey();
    await screen.findByText('About you');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('permission denied')).toBeInTheDocument();
    expect(screen.getByText('About you')).toBeInTheDocument();
  });

  describe('answering in your own words', () => {
    /** Topics is the fourth screen; three skips lands on it. */
    async function goToTopics() {
      renderSurvey();
      await screen.findByRole('button', { name: 'Skip this one' });
      await skip(3);
      await screen.findByText(/happy to talk about/i);
    }

    it('adds a topic the list does not offer', async () => {
      // Every option came off a real directory, so the list is a sample of an
      // open set. The club's own seed data has "Being a mom in a wheelchair",
      // which no fixed list would have guessed.
      await goToTopics();
      await userEvent.click(screen.getByRole('button', { name: 'Add your own' }));
      await userEvent.type(
        screen.getByLabelText(/your own answer/i),
        'Being a mom in a wheelchair',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      const added = await screen.findByRole('button', { name: /being a mom in a wheelchair/i });
      expect(added).toHaveAttribute('aria-pressed', 'true');
    });

    it('lets a member take their own answer back off, and it goes', async () => {
      // It would otherwise be saved and then invisible, with no way to undo it.
      // Tapping it off removes the chip rather than leaving it unselected: an
      // offered option is always there to pick up again, but one of your own
      // exists because you chose it, and an unchosen one is just gone.
      await goToTopics();
      await userEvent.click(screen.getByRole('button', { name: 'Add your own' }));
      await userEvent.type(screen.getByLabelText(/your own answer/i), 'Neural implant');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      await userEvent.click(await screen.findByRole('button', { name: /neural implant/i }));
      expect(screen.queryByRole('button', { name: /neural implant/i })).not.toBeInTheDocument();
    });

    it('does not add a second chip for a different capitalisation', async () => {
      await goToTopics();
      await userEvent.click(screen.getByRole('button', { name: 'Add your own' }));
      await userEvent.type(screen.getByLabelText(/your own answer/i), 'pain management');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(await screen.findAllByRole('button', { name: /pain management/i })).toHaveLength(1);
    });

    it('takes a language by name, where "Other" used to be', async () => {
      // Seven languages in a state that speaks more than two hundred. "Other"
      // recorded only "not one of these", which nobody can be found by.
      renderSurvey();
      await screen.findByRole('button', { name: 'Skip this one' });
      await screen.findByText(/what languages do you speak/i);

      expect(screen.queryByRole('button', { name: 'Other' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Add your own' }));
      await userEvent.type(screen.getByLabelText(/your own answer/i), 'Punjabi');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(await screen.findByRole('button', { name: /punjabi/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('keeps an answer that is no longer on the list', async () => {
      // "Other" was removed from LANGUAGES. Anybody who had already picked it
      // still has it saved, and a saved answer missing from the options renders
      // as one of their own rather than vanishing.
      api.answers = { languages: ['English', 'Other'] };
      renderSurvey();
      await screen.findByRole('button', { name: 'Skip this one' });

      expect(await screen.findByRole('button', { name: 'Other' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    /** Self-care is the tenth screen, so it has to be walked to. */
    async function goToSelfCare() {
      renderSurvey();
      await screen.findByRole('button', { name: 'Skip this one' });
      await skip(9);
      await screen.findByText(/self-care devices/i);
    }

    // The same removal, for the same reason, on the list members search
    // hardest. "Add your own" takes the words; "Something else" recorded only
    // that there were some.
    it('offers no "Something else" on self-care, where Add your own already is', async () => {
      await goToSelfCare();
      expect(screen.queryByRole('button', { name: 'Something else' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add your own' })).toBeInTheDocument();
    });

    it('keeps a self-care answer that is no longer on the list', async () => {
      // Nobody had this saved when it was removed — checked against the live
      // project and the local stack — but the guarantee is the thing being
      // tested, not the count on the day.
      api.answers = { selfCare: ['Colostomy', 'Something else'] };
      await goToSelfCare();

      expect(await screen.findByRole('button', { name: 'Something else' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('suggests a language rather than "in your own words"', async () => {
      renderSurvey();
      await screen.findByRole('button', { name: 'Skip this one' });
      await userEvent.click(screen.getByRole('button', { name: 'Add your own' }));

      expect(screen.getByLabelText(/your own answer/i)).toHaveAttribute(
        'placeholder',
        'Punjabi, Hmong, Farsi…',
      );
    });

    it('ignores an empty entry', async () => {
      await goToTopics();
      await userEvent.click(screen.getByRole('button', { name: 'Add your own' }));
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });
  });
});
