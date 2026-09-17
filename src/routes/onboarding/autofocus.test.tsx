import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeStep, NameStep } from '@/routes/onboarding/steps';
import type { OnboardingData } from '@/routes/onboarding/types';

/** Just enough of the shape for the two steps under test. */
function data(overrides: Partial<OnboardingData> = {}): OnboardingData {
  return {
    ...({} as OnboardingData),
    phone: '(408) 555-0112',
    code: '',
    displayName: '',
    ...overrides,
  };
}

describe('a step puts the cursor in its own field', () => {
  it('focuses the code box, so six digits can be typed straight in', () => {
    // The step a member reaches holding a phone that has just buzzed. Making
    // them tap the box first is a tap that exists for no reason.
    render(<CodeStep data={data()} set={() => undefined} />);
    expect(screen.getByPlaceholderText('000000')).toHaveFocus();
  });

  it('selects an answer that is already there, so typing replaces it', () => {
    // Coming back to change something should not mean clearing it first.
    render(<NameStep data={data({ displayName: 'Alex' })} set={() => undefined} />);
    const field = screen.getByPlaceholderText<HTMLInputElement>('Alex');
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe('Alex'.length);
  });
});
