import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import type { Renewal } from '@/routes/admin/renewals';
import { RenewalsSection, renewalSummary } from '@/routes/admin/renewals-section';

const api = vi.hoisted(() => ({ setDate: vi.fn(), add: vi.fn() }));
vi.mock('@/routes/admin/renewals', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setRenewalDate: api.setDate,
  addRenewal: api.add,
}));

const item = (o: Partial<Renewal> = {}): Renewal => ({
  id: 'r1',
  name: 'GitHub token for address lookups',
  purpose: 'Kept in the vault as `geocode_github_token`.',
  steps: ['Make a new token.', 'Run `select vault.update_secret(…);` in the SQL Editor.'],
  expires: true,
  expiresOn: '2027-10-26',
  signInProvider: null,
  ...o,
});

function renderList(renewals: Renewal[] | null, error: string | null = null) {
  const onChanged = vi.fn();
  render(
    <AnnounceProvider>
      <RenewalsSection read={{ renewals, error }} onChanged={onChanged} />
    </AnnounceProvider>,
  );
  return onChanged;
}

const card = (name: string) => {
  const heading = screen.getByRole('heading', { level: 3, name });
  const section = heading.closest('section');
  if (!section) throw new Error(`No card for ${name}`);
  return within(section);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-10-01T18:00:00Z') });
  api.setDate.mockReset();
  api.add.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the summary line', () => {
  const today = '2027-10-01';
  it('says the date and the days left, and when to renew', () => {
    expect(renewalSummary(item({ expiresOn: '2028-01-01' }), today)).toBe(
      'Runs out on January 1, 2028, in 92 days.',
    );
    expect(renewalSummary(item(), today)).toBe(
      'Runs out in 25 days, on October 26, 2027. Renew it now.',
    );
    expect(renewalSummary(item({ expiresOn: today }), today)).toBe(
      'Runs out today, October 1, 2027. Renew it now.',
    );
    expect(renewalSummary(item({ expiresOn: '2027-09-30' }), today)).toBe(
      'Ran out on September 30, 2027, 1 day ago. Renew it now.',
    );
    expect(renewalSummary(item({ expiresOn: null }), today)).toBe('Date not entered.');
    expect(renewalSummary(item({ expires: false, expiresOn: null }), today)).toBe('No expiry.');
  });
});

describe('the Renewals list', () => {
  it('writes out every step, with commands as code, and the date step last', () => {
    renderList([item()]);
    const token = card('GitHub token for address lookups');
    expect(
      token.getByText('Runs out in 25 days, on October 26, 2027. Renew it now.'),
    ).toBeVisible();
    expect(token.getByText('geocode_github_token').tagName).toBe('CODE');
    expect(token.getByText('select vault.update_secret(…);').tagName).toBe('CODE');
    expect(token.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Make a new token.',
      'Run select vault.update_secret(…); in the SQL Editor.',
      'Enter the date it now runs out below, and save.',
    ]);
  });

  it('marks a renewal due soon, or gone, in the Apple card’s colours', () => {
    renderList([
      item({ id: 'a', name: 'Due soon' }),
      item({ id: 'b', name: 'Gone', expiresOn: '2027-09-01' }),
      item({ id: 'c', name: 'Fine', expiresOn: '2028-09-01' }),
    ]);
    const box = (name: string) => screen.getByRole('heading', { name }).closest('section');
    expect(box('Due soon')).toHaveClass('bg-gold-lt');
    expect(box('Gone')).toHaveClass('bg-destructive/5');
    expect(box('Fine')).toHaveClass('bg-paper');
  });

  it('offers no date for what never runs out, and calls its steps replacing it', () => {
    renderList([item({ name: 'Apple push notification key', expires: false, expiresOn: null })]);
    const key = card('Apple push notification key');
    expect(key.getByText('No expiry.')).toBeVisible();
    expect(key.getByRole('heading', { name: 'Replacing it' })).toBeVisible();
    expect(key.queryByRole('button', { name: 'Save the date' })).toBeNull();
  });

  it('saves a new date and reads the list again', async () => {
    api.setDate.mockResolvedValue({ ok: true });
    const onChanged = renderList([item()]);
    const user = userEvent.setup();
    const token = card('GitHub token for address lookups');
    const group = token.getByRole('group', { name: 'New date it runs out' });
    await user.type(within(group).getByLabelText('Month'), '10');
    await user.type(within(group).getByLabelText('Day'), '20');
    await user.type(within(group).getByLabelText('Year'), '2028');
    await user.click(token.getByRole('button', { name: 'Save the date' }));
    expect(api.setDate).toHaveBeenCalledWith('r1', '2028-10-20');
    expect(onChanged).toHaveBeenCalled();
  });

  it('starts the Apple secret at the date a secret made today runs out', () => {
    renderList([
      item({ name: 'Sign in with Apple secret', signInProvider: 'apple', expiresOn: '2027-04-09' }),
    ]);
    const apple = card('Sign in with Apple secret');
    const group = apple.getByRole('group', { name: 'New secret runs out on' });
    expect(within(group).getByLabelText('Year')).toHaveValue('2028');
    expect(within(group).getByLabelText('Month')).toHaveValue('3');
    expect(within(group).getByLabelText('Day')).toHaveValue('29');
    expect(apple.getByText('Enter the date the script printed below, and save.')).toBeVisible();
  });

  it('says why a date was refused, and keeps the list as it was', async () => {
    api.setDate.mockResolvedValue({ ok: false, error: 'The date should be after today.' });
    const onChanged = renderList([item({ expiresOn: null })]);
    const user = userEvent.setup();
    const token = card('GitHub token for address lookups');
    await user.click(token.getByRole('button', { name: 'Save the date' }));
    expect(token.getByRole('alert')).toHaveTextContent('Add the month, day and year');
    expect(api.setDate).not.toHaveBeenCalled();
    await user.type(token.getByLabelText('Month'), '1');
    await user.type(token.getByLabelText('Day'), '2');
    await user.type(token.getByLabelText('Year'), '2028');
    await user.click(token.getByRole('button', { name: 'Save the date' }));
    expect(await token.findByRole('alert')).toHaveTextContent('after today');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('says so when the list cannot be read', () => {
    renderList(null, 'Could not read the renewals.');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read the renewals.');
  });
});

describe('adding one', () => {
  it('sends the name, what it is for, a step a line, and the date', async () => {
    api.add.mockResolvedValue({ ok: true });
    const onChanged = renderList([]);
    const user = userEvent.setup();
    const form = within(screen.getByRole('region', { name: 'Add something to renew' }));
    await user.type(form.getByLabelText('Name'), 'Zoho mail plan');
    await user.type(form.getByLabelText('What it is for'), 'The club’s email.');
    await user.type(form.getByLabelText(/How to renew it/), 'Sign in to Zoho.{Enter}{Enter}Pay.');
    await user.type(form.getByLabelText('Month'), '6');
    await user.type(form.getByLabelText('Day'), '1');
    await user.type(form.getByLabelText('Year'), '2028');
    await user.click(form.getByRole('button', { name: 'Add it' }));
    expect(api.add).toHaveBeenCalledWith({
      name: 'Zoho mail plan',
      purpose: 'The club’s email.',
      steps: ['Sign in to Zoho.', 'Pay.'],
      expires: true,
      expiresOn: '2028-06-01',
    });
    expect(onChanged).toHaveBeenCalled();
    expect(form.getByLabelText('Name')).toHaveValue('');
  });

  it('takes one that never runs out, with no date', async () => {
    api.add.mockResolvedValue({ ok: true });
    renderList([]);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Spare key');
    await user.click(screen.getByRole('checkbox', { name: 'It never runs out' }));
    expect(screen.queryByLabelText('Year')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add it' }));
    expect(api.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Spare key', expires: false, expiresOn: null }),
    );
  });

  it('asks for a name first, and says the database’s refusal', async () => {
    api.add.mockResolvedValue({ ok: false, error: 'There is already one called that.' });
    renderList([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add it' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give it a name.');
    expect(api.add).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Name'), 'Spare key');
    await user.click(screen.getByRole('button', { name: 'Add it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already one called that');
  });
});
