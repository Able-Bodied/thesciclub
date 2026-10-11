import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NameStep, PhoneForEventsStep } from '@/routes/onboarding/steps';
import type { OnboardingData } from '@/routes/onboarding/types';

/** Just enough of the shape for the steps under test. */
function data(overrides: Partial<OnboardingData> = {}): OnboardingData {
  return {
    ...({} as OnboardingData),
    phone: '',
    displayName: '',
    ...overrides,
  };
}

describe('a step puts the cursor in its own field', () => {
  it('focuses the phone box, so a number can be typed straight in', () => {
    // Making somebody tap the box first is a tap that exists for no reason,
    // and costs most to anybody driving this with a head pointer.
    render(<PhoneForEventsStep data={data()} set={() => undefined} />);
    expect(screen.getByPlaceholderText('(408) 555-0112')).toHaveFocus();
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
