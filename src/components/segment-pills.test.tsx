import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentPills } from '@/components/segment-pills';

const SEGMENTS = [
  ['everyone', 'Everyone'],
  ['near', 'Near me'],
  ['mentors', 'Mentors'],
] as const;

describe('SegmentPills', () => {
  it('marks only the current segment pressed', () => {
    render(<SegmentPills segments={SEGMENTS} value="near" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Near me' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports the segment that was tapped', async () => {
    const onChange = vi.fn();
    render(<SegmentPills segments={SEGMENTS} value="everyone" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mentors' }));

    expect(onChange).toHaveBeenCalledWith('mentors');
  });

  // The pills sit inside a form-ish header on two screens. A button without an
  // explicit type submits, and the filter search box on Peers is one Enter away
  // from finding that out.
  it('does not submit a form it is inside', () => {
    render(<SegmentPills segments={SEGMENTS} value="everyone" onChange={vi.fn()} />);

    for (const pill of screen.getAllByRole('button')) {
      expect(pill).toHaveAttribute('type', 'button');
    }
  });
});
