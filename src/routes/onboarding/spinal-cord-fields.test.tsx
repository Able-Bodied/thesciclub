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
  it('asks the kind first, and nothing else until it is chosen', () => {
    render(<Harness seen={[]} />);
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      expect.stringContaining('Paraplegia'),
      expect.stringContaining('Quadriplegia'),
      expect.stringContaining('Central cord syndrome'),
      expect.stringContaining('Another spinal cord condition'),
    ]);
    expect(screen.queryByLabelText('Level of injury')).toBeNull();
    expect(screen.queryByText('Complete or incomplete?')).toBeNull();
  });

  it('offers a para the levels from T1 down, and asks complete or incomplete', async () => {
    render(<Harness seen={[]} />);
    await userEvent.click(screen.getByRole('radio', { name: /Paraplegia/ }));
    const levels = optionsOf('Level of injury');
    expect(levels[1]).toBe('T1');
    expect(levels).not.toContain('C5');
    expect(screen.getByRole('group', { name: 'Complete or incomplete?' })).toBeInTheDocument();
  });

  it('clears a level that the new kind does not have', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Paraplegia/ }));
    await userEvent.selectOptions(screen.getByLabelText('Level of injury'), 'T6');
    await userEvent.click(screen.getByRole('radio', { name: /Quadriplegia/ }));
    expect(screen.getByLabelText('Level of injury')).toHaveValue('');
    expect(optionsOf('Level of injury')).toContain('C5/6');
    expect(seen.at(-1)?.exactLevel).toBeNull();
  });

  it('keeps a level the new kind also has', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Quadriplegia/ }));
    await userEvent.selectOptions(screen.getByLabelText('Level of injury'), 'C5');
    await userEvent.click(screen.getByRole('radio', { name: /Central cord/ }));
    expect(screen.getByLabelText('Level of injury')).toHaveValue('C5');
    // Incomplete by definition: set, and not asked.
    expect(seen.at(-1)?.completeness).toBe('Incomplete');
    expect(screen.queryByText('Complete or incomplete?')).toBeNull();
  });

  it('asks which condition, with suggestions, and a level only if they know one', async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Another spinal cord condition/ }));
    const name = screen.getByLabelText('Which condition?');
    const list = document.getElementById(name.getAttribute('list') ?? '');
    expect(list?.querySelectorAll('option').length).toBeGreaterThan(10);
    await userEvent.type(name, 'Transverse myelitis');
    expect(seen.at(-1)?.conditionName).toBe('Transverse myelitis');
    expect(screen.getByLabelText('Level, if you know it')).toHaveValue('');
    expect(optionsOf('Level, if you know it')[0]).toBe('No level');
    expect(screen.queryByText('Complete or incomplete?')).toBeNull();
  });

  it("lets go of a condition's name when the kind changes", async () => {
    const seen: SpinalCordAnswer[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Another spinal cord condition/ }));
    await userEvent.type(screen.getByLabelText('Which condition?'), 'Spina bifida');
    await userEvent.click(screen.getByRole('radio', { name: /Paraplegia/ }));
    expect(screen.queryByLabelText('Which condition?')).toBeNull();
    expect(seen.at(-1)?.conditionName).toBe('');
  });
});
