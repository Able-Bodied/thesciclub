import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { MENTOR_ALLOWANCE } from '@/routes/invites/mentor-invites';
import { type Answers, SCREENS, screensThatApply } from '@/routes/profile/questions';

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

/** Where a screen is in the survey, by its title, so a test reads which
 *  screen it means and survives the order changing. */
function at(title: string): number {
  const index = SCREENS.findIndex((s) => s.title === title);
  if (index < 0) throw new Error(`no screen called ${title}`);
  return index;
}

/** Advance one screen without answering. Skip rather than Continue, because
 *  both are on screen and only one of them is unambiguous. */
async function skip(times = 1) {
  for (let i = 0; i < times; i++) {
    await userEvent.click(screen.getByRole('button', { name: 'Skip this one' }));
  }
}

/** The screens a member with nothing answered is shown — "The specifics"
 *  is not one of them. */
const SHOWN = screensThatApply({});

/** From the first screen, skip forward to the one with this title. Counts
 *  only the screens that are shown, since Skip steps over the rest. */
async function skipTo(title: string) {
  const steps = SHOWN.indexOf(at(title));
  if (steps < 0) throw new Error(`${title} is not shown to a blank member`);
  await skip(steps);
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Nicole' };
  api.answers = {};
  api.saves = [];
  api.declined = new Set();
  api.declineSaves = [];
  api.failWith = null;
});

describe('opened from Your answers', () => {
  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile" element={<ProfileSurveyPage />} />
          <Route path="/profile/answers" element={<p>Your answers page</p>} />
          <Route path="/me" element={<p>The Me tab</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('starts on the screen it was sent to', async () => {
    renderAt(`/profile?screen=${at('Family')}`);
    expect(await screen.findByRole('heading', { name: 'Family' })).toBeInTheDocument();
    expect(
      screen.getByText(`${SHOWN.indexOf(at('Family')) + 1} of ${SHOWN.length}`, { exact: false }),
    ).toBeInTheDocument();
  });

  it('saves and goes back to the answers, not to Me', async () => {
    renderAt(`/profile?screen=${at('Family')}`);
    await screen.findByRole('heading', { name: 'Family' });
    await userEvent.click(screen.getByRole('button', { name: /Back to your answers/ }));
    expect(await screen.findByText('Your answers page')).toBeInTheDocument();
    expect(api.saves[0]?.keys).toEqual(['maritalStatus', 'hasChildren', 'childrenWhen']);
  });

  it('starts at the beginning for a screen that is not there', async () => {
    renderAt('/profile?screen=99');
    expect(await screen.findByRole('heading', { name: 'About you' })).toBeInTheDocument();
  });

  it('still says Finish later, and goes to Me, when not opened from there', async () => {
    renderAt('/profile');
    await screen.findByRole('heading', { name: 'About you' });
    await userEvent.click(screen.getByRole('button', { name: /Finish later/ }));
    expect(await screen.findByText('The Me tab')).toBeInTheDocument();
  });
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
    expect(screen.getByText(`1 of ${SHOWN.length}`, { exact: false })).toBeInTheDocument();
  });

  describe('the specifics', () => {
    it('follows self-care when one of its three answers is chosen, and Back returns', async () => {
      renderSurvey();
      await screen.findByText('About you');
      await skipTo('Self-care devices');
      await userEvent.click(await screen.findByRole('button', { name: 'Dictation software' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByRole('heading', { name: 'The specifics' })).toBeInTheDocument();
      // One more screen than a blank member is shown.
      expect(screen.getByText(`of ${SHOWN.length + 1}`, { exact: false })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(await screen.findByRole('heading', { name: 'Self-care devices' })).toBeInTheDocument();
    });

    it('is stepped over otherwise, forward and back', async () => {
      renderSurvey();
      await screen.findByText('About you');
      await skipTo('Self-care devices');
      await userEvent.click(await screen.findByRole('button', { name: 'Standing frame' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(
        await screen.findByRole('heading', { name: 'Do you own any adaptive sports equipment?' }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(await screen.findByRole('heading', { name: 'Self-care devices' })).toBeInTheDocument();
    });
  });

  describe('equipment and grants', () => {
    it('asks for equipment in words, with an example', async () => {
      renderSurvey();
      await screen.findByText('About you');
      await skipTo('Do you own any adaptive sports equipment?');
      expect(
        await screen.findByPlaceholderText(
          'Top End Force 3 handcycle, Freewheel, and HOC Glide ski',
        ),
      ).toBeInTheDocument();
    });

    it('asks for grants in words, and saves them as they were typed', async () => {
      renderSurvey();
      await screen.findByText('About you');
      await skipTo('Did you receive any grants?');
      const box = await screen.findByPlaceholderText(/Kelly Brush grant and High Fives grant/);
      await userEvent.type(box, 'High Fives, for a handcycle');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => {
        expect(api.saves.at(-1)?.keys).toEqual(['grants']);
      });
    });
  });

  // A yes/no on its own still shows its words: Yes and No under "Mentoring"
  // are not a question.
  it('shows the question on a screen that is only a yes or no', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skipTo('Mentoring');
    expect(await screen.findByText('Do you want to be a peer mentor?')).toBeInTheDocument();
  });

  it('says why to mentor, and what it means, before asking', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skipTo('Mentoring');
    expect(await screen.findByText(/very rewarding/)).toBeInTheDocument();
    const details = screen.getByRole('heading', { name: 'As a mentor' });
    // The allowance is the invites screen's, which mirrors the database's.
    expect(
      screen.getByText(`You can invite up to ${MENTOR_ALLOWANCE} people to the club.`),
    ).toBeInTheDocument();
    expect(
      details.compareDocumentPosition(screen.getByText('Do you want to be a peer mentor?')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    expect(await screen.findByText('Brief bio')).toBeInTheDocument();
  });

  it('advances a single-choice-only screen by itself once it is answered', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skipTo('Education');
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
    await screen.findByText('Brief bio');
    await userEvent.type(screen.getByRole('textbox'), 'Avid handcyclist');
    // Still here: a person is not finished with prose until they say so.
    expect(screen.getByText('Brief bio')).toBeInTheDocument();
  });

  it('stops at three interests rather than silently dropping one', async () => {
    api.answers = { interests: ['Travel', 'Cooking', 'Reading'] };
    renderSurvey();
    await screen.findByText('About you');
    await skipTo('Interests');
    expect(await screen.findByText('Interests')).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 chosen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Climbing' })).toBeDisabled();
  });

  it('asks when children arrived only once it knows there are any', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skipTo('Family');
    expect(await screen.findByText('Family')).toBeInTheDocument();
    expect(screen.queryByText('Before or after your injury?')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(await screen.findByText('Before or after your injury?')).toBeInTheDocument();
  });

  it('does not eject you from a screen that was already answered when you arrived', async () => {
    api.answers = { education: 'Some college', educationWhen: 'After' };
    renderSurvey();
    await screen.findByText('About you');
    await skipTo('Education');
    expect(await screen.findByText('Education')).toBeInTheDocument();
    // Both answers are already there. Without the arrival guard this screen
    // advances immediately and the answer can never be revised.
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByText('Education')).toBeInTheDocument();
  });

  it('lets you go back and change a single-choice answer', async () => {
    renderSurvey();
    await screen.findByText('About you');
    await skipTo('Education');
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
    await skipTo('Mentoring');
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
    /** Topics has to be walked to; where it is depends on the order. */
    async function goToTopics() {
      renderSurvey();
      await screen.findByRole('button', { name: 'Skip this one' });
      await skipTo('Topics you are happy to talk about');
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

    /** Self-care is well into the survey, so it has to be walked to. */
    async function goToSelfCare() {
      renderSurvey();
      await screen.findByRole('button', { name: 'Skip this one' });
      await skipTo('Self-care devices');
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
