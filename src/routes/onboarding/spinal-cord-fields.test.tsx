import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { type SpinalCordAnswer, SpinalCordFields } from '@/routes/onboarding/spinal-cord-fields';

const EMPTY: SpinalCordAnswer = {
  injuryType: null,
  exactLevel: null,
  conditionName: '',
  completeness: 'Do not know',
};

/** The real component with real state, so a choice changes what is drawn. */
function Harness({ start = EMPTY, seen }: { start?: SpinalCordAnswer; seen: SpinalCordAnswer[] }) {
  const [answer, setAnswer] = useState(start);
  return (
    <SpinalCordFields
      answer={answer}
      onChange={(patch) => {
        setAnswer((a) => {
          const next = { ...a, ...patch };
          seen.push(next);
          return next;
        });
      }}
    />
  );
}

const optionsOf = (label: string) =>
  within(screen.getByLabelText(label))
    .getAllByRole('option')
    .map((o) => o.textContent);

describe('the disability question', () => {
  // The owner, 2026-10-15.
  it('offers quad, high para, low para, another disability and relative, and nothing else yet', () => {
    render(<Harness seen={[]} />);
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Quadriplegic (tetraplegic)',
      'High para (T1–T8)',
      'Low para (T9+)',
      'Other disability',
      'Relative/Spouse',
    ]);
    expect(screen.queryByLabelText('Level of injury')).toBeNull();
    expect(screen.queryByText('Complete or incomplete?')).toBeNull();
  });

  it('offers a high para T1 to T8, and asks complete or incomplete', async () => {
    render(<Harness seen={[]} />);
    await userEvent.click(screen.getByRole('radio', { name: /High para/ }));
    const levels = optionsOf('Level of injury');
    expect(levels[1]).toBe('T1');
    expect(levels.at(-2)).toBe('T8');
    expect(levels.at(-1)).toBe('Do not know');
    expect(screen.getByRole('group', { name: 'Complete or incomplete?' })).toBeInTheDocument();
  });

  it('offers a low para T9 down', async () => {
    render(<Harness seen={[]} />);
    await userEvent.click(screen.getByRole('radio', { name: /Low para/ }));
    const levels = optionsOf('Level of injury');
    expect(levels[1]).toBe('T9');
    expect(levels).toContain('S5');
    expect(levels).not.toContain('T8');
  });

  it('clears a level that the new kind does not have', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /High para/ }));
    await userEvent.selectOptions(screen.getByLabelText('Level of injury'), 'T6');
    await userEvent.click(screen.getByRole('radio', { name: /Quadriplegic/ }));
    expect(screen.getByLabelText('Level of injury')).toHaveValue('');
    expect(optionsOf('Level of injury')).toContain('C5/6');
    expect(seen.at(-1)?.exactLevel).toBeNull();
  });

  it('keeps "Do not know", which every injury has', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /High para/ }));
    await userEvent.selectOptions(screen.getByLabelText('Level of injury'), 'Do not know');
    await userEvent.click(screen.getByRole('radio', { name: /Low para/ }));
    expect(screen.getByLabelText('Level of injury')).toHaveValue('Do not know');
  });

  it('asks which other disability from a list, central cord syndrome among them, with no level', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Other disability/ }));
    const options = optionsOf('Which disability?');
    expect(options[0]).toBe('Choose one');
    expect(options).toContain('Central cord syndrome');
    expect(options.at(-1)).toBe('Other');
    await userEvent.selectOptions(screen.getByLabelText('Which disability?'), 'Cerebral palsy');
    expect(seen.at(-1)?.conditionName).toBe('Cerebral palsy');
    expect(screen.queryByLabelText('Level of injury')).toBeNull();
    expect(screen.queryByText('Complete or incomplete?')).toBeNull();
  });

  it('opens a box to type one that is not listed, under Other', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Other disability/ }));
    expect(screen.queryByLabelText('Which one?')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Which disability?'), 'Other');
    await userEvent.type(screen.getByLabelText('Which one?'), 'Friedreich ataxia');
    expect(seen.at(-1)?.conditionName).toBe('Friedreich ataxia');
    expect(screen.getByLabelText('Which disability?')).toHaveValue('__other');
  });

  it('shows a name typed before under Other, in its box', () => {
    render(
      <Harness
        seen={[]}
        start={{ ...EMPTY, injuryType: 'condition', conditionName: 'Friedreich ataxia' }}
      />,
    );
    expect(screen.getByLabelText('Which disability?')).toHaveValue('__other');
    expect(screen.getByLabelText('Which one?')).toHaveValue('Friedreich ataxia');
  });

  it('asks a relative nothing more', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} start={{ ...EMPTY, injuryType: 'high_para', exactLevel: 'T4' }} />);
    await userEvent.click(screen.getByRole('radio', { name: /Relative/ }));
    expect(screen.queryByLabelText('Level of injury')).toBeNull();
    expect(screen.queryByText('Complete or incomplete?')).toBeNull();
    expect(seen.at(-1)).toMatchObject({ injuryType: 'family', exactLevel: null });
  });

  it("lets go of another disability's name when the kind changes", async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Other disability/ }));
    await userEvent.selectOptions(screen.getByLabelText('Which disability?'), 'Spina bifida');
    await userEvent.click(screen.getByRole('radio', { name: /Low para/ }));
    expect(screen.queryByLabelText('Which disability?')).toBeNull();
    expect(seen.at(-1)?.conditionName).toBe('');
  });

  // Members who answered before 2026-10-15 keep what they said.
  it('keeps an answer no longer offered on the list for the member who gave it', () => {
    render(<Harness seen={[]} start={{ ...EMPTY, injuryType: 'para', exactLevel: 'T10' }} />);
    expect(screen.getByRole('radio', { name: /Paraplegia/ })).toBeChecked();
    expect(screen.getByLabelText('Level of injury')).toHaveValue('T10');
  });
});
