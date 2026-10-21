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

describe('the spinal cord question', () => {
  // The owner, 2026-10-15.
  it('offers quad, high para, low para, another spinal cord condition and relative, and nothing else yet', () => {
    render(<Harness seen={[]} />);
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Quadriplegic (tetraplegic)',
      'High para (T1–T8)',
      'Low para (T9+)',
      'Other spinal cord condition',
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

  // The owner, 2026-10-20: their own way, typed with suggestions.
  it('asks which condition in a box, suggesting the spinal cord conditions, with no level', async () => {
    const seen: SpinalCordAnswer[] = [];
    const { container } = render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Other spinal cord condition/ }));
    const box = screen.getByLabelText('Which condition?');
    expect(box).toHaveAttribute('placeholder', 'Start typing, or choose one');
    const suggested = [...container.querySelectorAll('datalist option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(suggested).toHaveLength(21);
    expect(suggested).toContain('Transverse myelitis');
    expect(suggested).toContain('Central cord syndrome');
    expect(suggested).not.toContain('Cerebral palsy');
    await userEvent.type(box, 'Transverse myelitis');
    expect(seen.at(-1)?.conditionName).toBe('Transverse myelitis');
    expect(screen.queryByLabelText('Level of injury')).toBeNull();
    expect(screen.queryByText('Complete or incomplete?')).toBeNull();
  });

  it('keeps a condition that is not suggested as it was typed', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Other spinal cord condition/ }));
    await userEvent.type(screen.getByLabelText('Which condition?'), 'Friedreich ataxia');
    expect(seen.at(-1)?.conditionName).toBe('Friedreich ataxia');
  });

  it('shows a name given before in the box', () => {
    render(
      <Harness
        seen={[]}
        start={{ ...EMPTY, injuryType: 'condition', conditionName: 'Cerebral palsy' }}
      />,
    );
    expect(screen.getByLabelText('Which condition?')).toHaveValue('Cerebral palsy');
  });

  it('asks a relative nothing more', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} start={{ ...EMPTY, injuryType: 'high_para', exactLevel: 'T4' }} />);
    await userEvent.click(screen.getByRole('radio', { name: /Relative/ }));
    expect(screen.queryByLabelText('Level of injury')).toBeNull();
    expect(screen.queryByText('Complete or incomplete?')).toBeNull();
    expect(seen.at(-1)).toMatchObject({ injuryType: 'family', exactLevel: null });
  });

  it("lets go of a condition's name when the kind changes", async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Other spinal cord condition/ }));
    await userEvent.type(screen.getByLabelText('Which condition?'), 'Spina bifida');
    await userEvent.click(screen.getByRole('radio', { name: /Low para/ }));
    expect(screen.queryByLabelText('Which condition?')).toBeNull();
    expect(seen.at(-1)?.conditionName).toBe('');
  });

  // Members who answered before 2026-10-15 keep what they said.
  it('keeps an answer no longer offered on the list for the member who gave it', () => {
    render(<Harness seen={[]} start={{ ...EMPTY, injuryType: 'para', exactLevel: 'T10' }} />);
    expect(screen.getByRole('radio', { name: /Paraplegia/ })).toBeChecked();
    expect(screen.getByLabelText('Level of injury')).toHaveValue('T10');
  });
});
