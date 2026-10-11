import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { AnnounceProvider } from '@/lib/announce';
import type * as DetailsApi from '@/routes/profile/details-api';
import type { MemberDetails } from '@/routes/profile/details-api';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const api = vi.hoisted(() => ({
  details: null as MemberDetails | null,
  saves: [] as { details: MemberDetails; levelRange: string }[],
  declineSaves: [] as string[][],
  failWith: null as string | null,
  /** What each photograph chosen returns, in turn; saved when the list runs out. */
  photoResults: [] as ({ ok: true; path: string } | { ok: false; error: string })[],
  removeFails: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
// Partial. `DECLINABLE_DETAILS`, `detailIsFilled`, `missingDetails` and the
// rest are pure and the page should be running the real ones — and a whole
// module replacement here reported "10 passed" while throwing seven unhandled
// errors, because the page reached for an export the mock did not have. The
// summary line said nothing; only the exit code did.
vi.mock('@/routes/profile/details-api', async (importOriginal) => ({
  ...(await importOriginal<typeof DetailsApi>()),
  loadDetails: () =>
    Promise.resolve(
      api.details
        ? { ok: true as const, details: api.details }
        : { ok: false as const, error: 'Your profile could not be found.' },
    ),
  saveDetails: (_id: string, details: MemberDetails, levelRange: string) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.saves.push({ details, levelRange });
    return Promise.resolve({ ok: true });
  },
  savePhoto: () =>
    Promise.resolve(api.photoResults.shift() ?? { ok: true as const, path: 'u1/profile.jpg' }),
  removePhoto: () =>
    Promise.resolve(api.removeFails ? { ok: false, error: api.removeFails } : { ok: true }),
}));

vi.mock('@/routes/profile/profile-api', () => ({
  saveDeclined: (_id: string, declined: ReadonlySet<string>) => {
    api.declineSaves.push([...declined]);
    return Promise.resolve({ ok: true });
  },
}));

const { default: ProfileDetailsPage } = await import('@/routes/profile/details');

const details = (o: Partial<MemberDetails> = {}): MemberDetails => ({
  displayName: 'Nicole',
  birthDate: '1998-04-02',
  exactLevel: 'C6',
  completeness: 'Incomplete',
  injuryDate: '2016-01-01',
  injuryDatePrecision: 'year',
  city: 'Santa Clara',
  state: 'CA',
  photoPath: null,
  photoAlt: null,
  showInBrowse: true,
  declined: [],
  ...o,
});

const photoFile = () => new File(['x'], 'photo.png', { type: 'image/png' });

function choosePhoto(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No photograph input on the page.');
  return input;
}

function renderDetails() {
  return render(
    <MemoryRouter initialEntries={['/profile/details']}>
      <Routes>
        <Route path="/profile/details" element={<ProfileDetailsPage />} />
        <Route path="/me" element={<p>The Me tab</p>} />
        <Route path="/join" element={<p>Welcome screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Nicole' };
  api.details = details();
  api.saves = [];
  api.declineSaves = [];
  api.failWith = null;
  api.photoResults = [];
  api.removeFails = null;
});

describe('Your details', () => {
  it('sends a non-member away', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    renderDetails();
    expect(await screen.findByText('Welcome screen')).toBeInTheDocument();
  });

  it('loads what onboarding recorded, so a mistake can be seen', async () => {
    renderDetails();
    expect(await screen.findByLabelText('Name')).toHaveValue('Nicole');
    const birthday = within(screen.getByRole('group', { name: 'Birthday' }));
    expect(birthday.getByLabelText('Month')).toHaveValue('4');
    expect(birthday.getByLabelText('Day')).toHaveValue('2');
    expect(birthday.getByLabelText('Year')).toHaveValue('1998');
    expect(screen.getByLabelText('City or town')).toHaveValue('Santa Clara');
    expect(screen.getByLabelText('Level of injury')).toHaveValue('C6');
  });

  it('saves a corrected name', async () => {
    renderDetails();
    const name = await screen.findByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Nikki');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(api.saves[0]?.details.displayName).toBe('Nikki');
    });
  });

  it('re-derives the browse range from a changed level, so the two cannot come apart', async () => {
    renderDetails();
    await screen.findByLabelText('Level of injury');
    await userEvent.selectOptions(screen.getByLabelText('Level of injury'), 'T10');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(api.saves[0]?.levelRange).toBe('T7–T12');
    });
  });

  it('says that members see an age and not the date', async () => {
    renderDetails();
    expect(await screen.findByText(/never the date itself/)).toBeInTheDocument();
  });

  // Somebody who said "2016" is shown 2016, and saving something else on the
  // page does not turn it into a January 1st they never gave.
  it('keeps a year-only injury date to the year', async () => {
    renderDetails();
    const injury = within(await screen.findByRole('group', { name: 'When were you injured?' }));
    expect(injury.getByLabelText('Year')).toHaveValue('2016');
    expect(injury.getByLabelText('Month')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(api.saves[0]?.details.injuryDatePrecision).toBe('year');
    });
    expect(api.saves[0]?.details.injuryDate).toBe('2016-01-01');
  });

  it('records a month added to the injury date as exactly that much', async () => {
    renderDetails();
    const injury = within(await screen.findByRole('group', { name: 'When were you injured?' }));
    await userEvent.type(injury.getByLabelText('Month'), 'March');
    expect(screen.getByText('March 2016')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(api.saves[0]?.details.injuryDate).toBe('2016-03-01');
    });
    expect(api.saves[0]?.details.injuryDatePrecision).toBe('month');
  });

  it('records no injury date once the boxes are cleared', async () => {
    renderDetails();
    const injury = within(await screen.findByRole('group', { name: 'When were you injured?' }));
    await userEvent.clear(injury.getByLabelText('Year'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(api.saves[0]?.details.injuryDate).toBeNull();
    });
    expect(api.saves[0]?.details.injuryDatePrecision).toBeNull();
  });

  // Saving half a year would either keep the old date under a new one on
  // screen or wipe it; neither was asked for.
  it('holds Save while the injury year is half typed, and says what is missing', async () => {
    renderDetails();
    const injury = within(await screen.findByRole('group', { name: 'When were you injured?' }));
    await userEvent.clear(injury.getByLabelText('Year'));
    await userEvent.type(injury.getByLabelText('Year'), '20');
    expect(screen.getByText('Add the year, in four digits.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  // Mid-typing is not a mistake, so it is said quietly, not as an alert about
  // the club being 18+.
  it('holds Save while the birthday is half typed, without calling it under-age', async () => {
    renderDetails();
    const birthday = within(await screen.findByRole('group', { name: 'Birthday' }));
    await userEvent.clear(birthday.getByLabelText('Year'));
    await userEvent.type(birthday.getByLabelText('Year'), '19');
    expect(screen.getByText(/Add the month, day and year/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  // Month, day, year, as the birthday and onboarding ask it.
  it('runs the injury date month, day, year', async () => {
    renderDetails();
    const injury = within(await screen.findByRole('group', { name: 'When were you injured?' }));
    await userEvent.clear(injury.getByLabelText('Year'));
    await userEvent.type(injury.getByLabelText('Month'), '06');
    expect(injury.getByLabelText('Day')).toHaveFocus();
    await userEvent.keyboard('14');
    expect(injury.getByLabelText('Year')).toHaveFocus();
    await userEvent.keyboard('2013');
    expect(screen.getByText('June 14, 2013')).toBeInTheDocument();
  });

  it('moves a year typed into the injury Month across to Year', async () => {
    renderDetails();
    const injury = within(await screen.findByRole('group', { name: 'When were you injured?' }));
    await userEvent.clear(injury.getByLabelText('Year'));
    await userEvent.type(injury.getByLabelText('Month'), '2013');
    expect(injury.getByLabelText('Month')).toHaveValue('');
    expect(injury.getByLabelText('Year')).toHaveValue('2013');
    expect(injury.getByLabelText('Year')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  // Somebody correcting the start of a box is not done with it.
  it('stays put while a box is edited in the middle', async () => {
    renderDetails();
    const birthday = within(await screen.findByRole('group', { name: 'Birthday' }));
    const day = birthday.getByLabelText('Day');
    await userEvent.type(day, '1', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    expect(day).toHaveValue('12');
    expect(day).toHaveFocus();
  });

  it('still refuses a corrected birthday under 18', async () => {
    renderDetails();
    const birthday = within(await screen.findByRole('group', { name: 'Birthday' }));
    await userEvent.clear(birthday.getByLabelText('Year'));
    await userEvent.type(birthday.getByLabelText('Year'), String(new Date().getFullYear() - 10));
    expect(await screen.findByRole('alert')).toHaveTextContent(/The club is 18\+/);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('does not carry the deck switch, which lives on Me', async () => {
    // It was here first, four fields down and behind a Save — which is where
    // it was mistaken for part of onboarding. Being findable is a switch, not
    // a form field, so it moved to Me and this page does not offer it twice.
    renderDetails();
    await screen.findByLabelText('Name');
    expect(screen.queryByText(/visible to other members/i)).not.toBeInTheDocument();
  });

  it('surfaces a save failure rather than claiming it saved', async () => {
    api.failWith = 'permission denied';
    renderDetails();
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('permission denied')).toBeInTheDocument();
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });

  // Leaving the page is silent to somebody who cannot see it change, and the
  // page that said it is gone by the time it is read, so the region is above
  // the routes (src/lib/announce.tsx).
  it('says the details are saved, and is still saying it on Me', async () => {
    render(
      <AnnounceProvider>
        <MemoryRouter initialEntries={['/profile/details']}>
          <Routes>
            <Route path="/profile/details" element={<ProfileDetailsPage />} />
            <Route path="/me" element={<p>The Me tab</p>} />
          </Routes>
        </MemoryRouter>
      </AnnounceProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('The Me tab')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Your details are saved.');
    });
  });

  it('returns to Me once it has saved', async () => {
    renderDetails();
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('The Me tab')).toBeInTheDocument();
  });

  it('says why a photograph was refused', async () => {
    api.photoResults = [{ ok: false, error: 'The photograph was not saved. Too large.' }];
    const { container } = renderDetails();
    await screen.findByLabelText('Name');
    await userEvent.upload(choosePhoto(container), photoFile());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The photograph was not saved. Too large.',
    );
  });

  // Since 20260930040000 the photos bucket refuses a file, where before it
  // took anything. The refusal stayed on screen under the photograph that
  // replaced it, saying "not saved" about a photograph that was.
  it('takes a refusal away once a photograph saves', async () => {
    api.photoResults = [{ ok: false, error: 'The photograph was not saved. Too large.' }];
    const { container } = renderDetails();
    await screen.findByLabelText('Name');
    await userEvent.upload(choosePhoto(container), photoFile());
    await screen.findByRole('alert');
    await userEvent.upload(choosePhoto(container), photoFile());
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('names the photo control for what it does', async () => {
    renderDetails();
    expect(await screen.findByLabelText('Choose a photo')).toHaveAttribute('type', 'file');
  });

  it('removes the photo', async () => {
    api.details = details({ photoPath: 'u1/profile.jpg' });
    renderDetails();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });
  });

  it('keeps the photo, and says so, when removing it fails', async () => {
    api.details = details({ photoPath: 'u1/profile.jpg' });
    api.removeFails = 'The photograph was not removed.';
    renderDetails();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('The photograph was not removed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  describe('describing the photo', () => {
    it('is not asked without a photo to describe', async () => {
      renderDetails();
      await screen.findByLabelText('Name');
      expect(screen.queryByLabelText('Describe your photo')).not.toBeInTheDocument();
    });

    it('saves what the member wrote, with a hint that says who it is for', async () => {
      api.details = details({ photoPath: 'u1/profile.jpg' });
      renderDetails();
      const field = await screen.findByLabelText('Describe your photo');
      expect(field).toHaveAccessibleDescription(/members who use a screen reader/);
      await userEvent.type(field, 'Me at Ocean Beach');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => {
        expect(api.saves[0]?.details.photoAlt).toBe('Me at Ocean Beach');
      });
    });

    // A description belongs to one picture.
    it('empties when a new photo replaces the one it described', async () => {
      api.details = details({ photoPath: 'u1/profile.jpg', photoAlt: 'Me at Ocean Beach' });
      const { container } = renderDetails();
      expect(await screen.findByLabelText('Describe your photo')).toHaveValue('Me at Ocean Beach');
      await userEvent.upload(choosePhoto(container), photoFile());
      await waitFor(() => {
        expect(screen.getByLabelText('Describe your photo')).toHaveValue('');
      });
    });
  });

  it('stays on the page when saving fails, so the field is still there', async () => {
    api.failWith = 'permission denied';
    renderDetails();
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('permission denied');
    expect(screen.queryByText('The Me tab')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});

describe('declining a detail', () => {
  it('offers Rather not say on the five the ring counts, and on nothing else', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/details']}>
        <Routes>
          <Route path="/profile/details" element={<ProfileDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByLabelText('Name');
    // Five: photo, level, when injured, state, city. Not the name, not the
    // birthday — the database refuses a decline for either, so offering one
    // would be offering a button it would answer with a constraint violation.
    expect(screen.getAllByRole('button', { name: /Rather not say/ })).toHaveLength(5);
  });

  it('records the decline on the tap, not on Save', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/details']}>
        <Routes>
          <Route path="/profile/details" element={<ProfileDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByLabelText('City or town');
    const buttons = screen.getAllByRole('button', { name: /Rather not say/ });
    // The last of the five is the city, which is the last field on the form.
    const city = buttons[buttons.length - 1];
    if (!city) throw new Error('no decline button');
    await userEvent.click(city);
    await waitFor(() => {
      expect(api.declineSaves).toEqual([['city']]);
    });
    expect(api.saves).toEqual([]);
  });

  // The Field comment promised this before anything did it: a field holding
  // "San Jose" beside a lit "Rather not say" is the app contradicting itself
  // about what it was told.
  it('lifts the decline when the field is filled in', async () => {
    api.details = details({ city: null, declined: ['city'] });
    render(
      <MemoryRouter initialEntries={['/profile/details']}>
        <Routes>
          <Route path="/profile/details" element={<ProfileDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const city = await screen.findByLabelText('City or town');
    await userEvent.type(city, 'Aptos');
    await waitFor(() => {
      expect(api.declineSaves).toEqual([[]]);
    });
  });
});
